import "dotenv/config"; // load .env in THIS process, regardless of how it's launched
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon, PrismaNeonHttp } from "@prisma/adapter-neon";
import { checkDestructiveTarget } from "@/lib/db-target-guard";
import { CheckoutError, cancelUnpaidOrder, placeOrder } from "@/lib/repositories/orders";
import { quickUpdateInventory, updateProductForVendor } from "@/lib/repositories/products";
import {
  applyBulkAction,
  clearRestrictionAndEnable,
  setProductRestriction,
} from "@/lib/repositories/product-restrictions";
import { BULK_SKIP_LABELS } from "@/lib/product-restriction";
import type { ProductRestriction, StockMode } from "@/lib/cart-rules";

/**
 * #1211 — proves the restriction and stock-state rules against the DEV database, through the real
 * repository functions and BOTH real Neon adapters. Rows R4, R10, R11, R15, R18, R19, R26 and R27
 * of specs/2026-10-22-catalogue-restrictions-stock-states/validation.md are checks in here.
 *
 *   npx tsx scripts/verify-restrictions-stock-states.ts [--leave-storefront-fixtures]
 *
 * FIXTURES ARE PERSISTENT, NOT DELETED. ProductRestrictionAuditLog is append-only by construction
 * (R28 forbids deleting a row anywhere, scripts included), and its productId FK is Restrict, so a
 * fixture product that has ever been audited cannot be deleted either. Instead every fixture is an
 * idempotent `zz-1211-*` product under the first vendor, RESET to a known state at the start of
 * each run; audit assertions count only rows created during this run; and every fixture is left
 * HIDDEN at the end (unless --leave-storefront-fixtures, which leaves the three R12 fixtures
 * active for the storefront check). Orders placed here are cancelled before the script exits.
 *
 * ADAPTERS. Each check names the client it ran on. Repository writes that the app runs on
 * `getPrismaWs()` run here on PrismaNeon (WebSocket); the CHECK constraint is probed on BOTH,
 * because the two adapters report the same Postgres error under different codes (CLAUDE.md, #232).
 *
 * PAYMENTS. STRIPE_SECRET_KEY is removed from this process before placeOrder runs, so the stub
 * payment adapter is used and nothing reaches Stripe.
 */

delete process.env.STRIPE_SECRET_KEY;

const LEAVE_STOREFRONT = process.argv.includes("--leave-storefront-fixtures");
const RUN_STARTED = new Date();

function readVar(path: string, key: string): string | undefined {
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
  for (const line of contents.split(/\r?\n/)) {
    // Tolerates BOTH `KEY="value"` and the spaced `KEY = value` form (#505).
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"#]*)"?/);
    if (match && match[1] === key) return match[2].trim();
  }
  return undefined;
}

let failures = 0;
function check(id: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${id}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

type Ws = PrismaClient;
type Http = PrismaClient;

interface FixtureSpec {
  key: string;
  isActive: boolean;
  restriction: ProductRestriction | null;
  /** null = no Inventory row at all. */
  stock: { stockMode: StockMode; quantity: number; lowStockThreshold?: number } | null;
}

async function main() {
  const targetUrl = process.env.DIRECT_URL;
  const verdict = checkDestructiveTarget(targetUrl, [
    { label: "the STAGING database", url: readVar("secrets/staging.vars", "DIRECT_URL") },
    {
      label: "the STAGING database (pooled)",
      url: readVar("secrets/staging.vars", "DATABASE_URL"),
    },
    { label: "the PRODUCTION database", url: readVar("secrets/production.vars", "DIRECT_URL") },
    {
      label: "the PRODUCTION database (pooled)",
      url: readVar("secrets/production.vars", "DATABASE_URL"),
    },
  ]);
  if (!verdict.allowed) {
    console.error(`REFUSED: ${verdict.reason}`);
    console.error("This script writes, so it only ever runs against the dev Neon branch.");
    process.exit(1);
  }
  if (!targetUrl) throw new Error("unreachable: the guard refuses a missing URL");
  console.log(`Target endpoint: ${verdict.endpoint}\n`);

  const ws: Ws = new PrismaClient({ adapter: new PrismaNeon({ connectionString: targetUrl }) });
  const http: Http = new PrismaClient({ adapter: new PrismaNeonHttp(targetUrl, {}) });
  // The repository parameter types are the app's clients; these are the same adapters built in Node.
  const asWs = ws as never;

  const orderNumbers: string[] = [];
  const fixtureIds = new Map<string, string>();

  try {
    const vendor = await ws.vendor.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true, slug: true },
    });
    if (!vendor) throw new Error("No vendor — seed the dev database first.");
    const vendorId = vendor.id;
    const category = await ws.category.findFirst({
      where: { vendorId, isActive: true, parentId: { not: null } },
      select: { id: true },
    });
    if (!category) throw new Error("No active subcategory for the first vendor.");
    const admin =
      (await ws.vendorMembership.findFirst({
        where: { vendorId, role: "ADMIN" },
        select: { userId: true },
      })) ?? null;
    const anyUser = await ws.user.findFirst({ select: { id: true } });
    const adminUserId = admin?.userId ?? anyUser?.id;
    if (!adminUserId) throw new Error("No user to act as the admin.");
    console.log(`Vendor ${vendor.slug}; admin actor ${adminUserId}\n`);

    /** Create-or-reset one fixture to exactly `spec`. Dev-only fixture reset, not an app path. */
    async function fixture(spec: FixtureSpec): Promise<string> {
      const slug = `zz-1211-${spec.key}`;
      const product = await ws.product.upsert({
        where: { vendorId_slug: { vendorId, slug } },
        create: {
          vendorId,
          slug,
          name: `ZZ 1211 ${spec.key}`,
          description: "Fixture for scripts/verify-restrictions-stock-states.ts (#1211).",
          categoryId: category!.id,
          basePrice: 150,
          unitLabel: "each",
          isActive: false,
        },
        // Hide first and set the restriction in the same write: never active + restricted.
        update: { isActive: false, restriction: spec.restriction },
        select: { id: true },
      });
      await ws.product.update({
        where: { id: product.id },
        data: { isActive: false, restriction: spec.restriction },
      });
      if (spec.isActive) {
        await ws.product.update({ where: { id: product.id }, data: { isActive: true } });
      }
      if (spec.stock === null) {
        await ws.inventory.deleteMany({ where: { productId: product.id } });
      } else {
        await ws.inventory.upsert({
          where: { productId: product.id },
          create: {
            vendorId,
            productId: product.id,
            quantity: spec.stock.quantity,
            stockMode: spec.stock.stockMode,
            lowStockThreshold: spec.stock.lowStockThreshold ?? 3,
          },
          update: {
            quantity: spec.stock.quantity,
            stockMode: spec.stock.stockMode,
            lowStockThreshold: spec.stock.lowStockThreshold ?? 3,
          },
        });
      }
      fixtureIds.set(spec.key, product.id);
      return product.id;
    }

    async function auditRowsSince(productId: string) {
      return ws.productRestrictionAuditLog.findMany({
        where: { productId, createdAt: { gte: RUN_STARTED } },
        orderBy: { createdAt: "asc" },
      });
    }

    async function guestCartWith(productId: string, quantity: number): Promise<string> {
      const guestToken = `zz-1211-${productId}`;
      const cart = await ws.cart.upsert({
        where: { vendorId_guestToken: { vendorId, guestToken } },
        create: { vendorId, guestToken },
        update: {},
        select: { id: true },
      });
      await ws.cartItem.deleteMany({ where: { cartId: cart.id } });
      await ws.cartItem.create({ data: { cartId: cart.id, vendorId, productId, quantity } });
      return cart.id;
    }

    async function checkout(productId: string, quantity: number) {
      const cartId = await guestCartWith(productId, quantity);
      return placeOrder(asWs, vendorId, {
        cartId,
        userId: null,
        guestEmail: "zz-1211-fixture@example.invalid",
        address: {
          recipientName: "Fixture",
          phone: "07000000000",
          line1: "1 Fixture Road",
          line2: null,
          city: "Testville",
          county: null,
          postcode: "MK1 1AA",
          notes: null,
        },
        rules: { deliveryFeePence: 0, freeDeliveryThresholdPence: null, minimumOrderPence: 0 },
        vendorSlug: vendor!.slug,
        returnOrigin: "http://localhost:8787",
        fulfilmentMethod: "DELIVERY",
      });
    }

    /* ---------------------------------------------------------------- R4 */
    {
      const id = await fixture({ key: "r4", isActive: false, restriction: null, stock: null });
      await ws.inventory.create({ data: { vendorId, productId: id, quantity: 5 } });
      const row = await ws.inventory.findUnique({ where: { productId: id } });
      check("R4b", row?.stockMode === "UNKNOWN", `new row without a mode got ${row?.stockMode}`);

      await fixture({ key: "r4", isActive: false, restriction: "NEEDS_REVIEW", stock: null });
      for (const [label, client] of [
        ["R4c-http", http],
        ["R4c-ws", ws],
      ] as const) {
        let code: unknown = "none";
        let rejected = false;
        try {
          await client.product.update({ where: { id }, data: { isActive: true } });
        } catch (error) {
          rejected = true;
          code = (error as { code?: unknown }).code ?? (error as Error).message.slice(0, 80);
        }
        const after = await ws.product.findUnique({ where: { id }, select: { isActive: true } });
        check(
          label,
          rejected && after?.isActive === false,
          `${label === "R4c-http" ? "PrismaNeonHttp" : "PrismaNeon"} rejected=${rejected}, observed code=${String(code)}`,
        );
      }
    }

    /* ------------------------------------------------------ R10 / R11 */
    {
      const unknownId = await fixture({
        key: "unknown",
        isActive: true,
        restriction: null,
        stock: { stockMode: "UNKNOWN", quantity: 10 },
      });
      const restrictedId = await fixture({
        key: "restricted",
        isActive: false,
        restriction: "NEEDS_REVIEW",
        stock: { stockMode: "TRACKED", quantity: 10 },
      });
      const outcomes: string[] = [];
      for (const id of [unknownId, restrictedId]) {
        try {
          const placed = await checkout(id, 1);
          orderNumbers.push(placed.orderNumber);
          outcomes.push("PLACED");
        } catch (error) {
          outcomes.push(error instanceof CheckoutError ? error.code : String(error));
        }
      }
      check(
        "R10a",
        outcomes.every((o) => o === "LINE_UNAVAILABLE"),
        `PrismaNeon; UNKNOWN → ${outcomes[0]}, restricted → ${outcomes[1]}`,
      );

      const trackedId = await fixture({
        key: "tracked",
        isActive: true,
        restriction: null,
        stock: { stockMode: "TRACKED", quantity: 1 },
      });
      const tracked = await checkout(trackedId, 1);
      orderNumbers.push(tracked.orderNumber);
      const trackedAfter = await ws.inventory.findUnique({ where: { productId: trackedId } });
      check(
        "R10b",
        trackedAfter?.quantity === 0,
        `PrismaNeon; TRACKED 1 → ${trackedAfter?.quantity}`,
      );

      const untrackedId = await fixture({
        key: "untracked",
        isActive: true,
        restriction: null,
        stock: { stockMode: "UNTRACKED", quantity: 0 },
      });
      const before = await ws.inventory.findUnique({ where: { productId: untrackedId } });
      const untracked = await checkout(untrackedId, 3);
      orderNumbers.push(untracked.orderNumber);
      const after = await ws.inventory.findUnique({ where: { productId: untrackedId } });
      check(
        "R10c",
        after?.quantity === before?.quantity &&
          after?.updatedAt.getTime() === before?.updatedAt.getTime(),
        `PrismaNeon; order ${untracked.orderNumber}, quantity ${before?.quantity} → ${after?.quantity}, updatedAt unchanged=${after?.updatedAt.getTime() === before?.updatedAt.getTime()}`,
      );

      const cancelled = await cancelUnpaidOrder(asWs, vendorId, untracked.orderNumber, "zz-1211");
      const afterCancel = await ws.inventory.findUnique({ where: { productId: untrackedId } });
      check(
        "R11",
        cancelled && afterCancel?.quantity === before?.quantity,
        `PrismaNeon; cancelled=${cancelled}, UNTRACKED quantity ${before?.quantity} → ${afterCancel?.quantity}`,
      );
      // Sanity: the TRACKED order's cancel still restores its stock.
      const trackedCancelled = await cancelUnpaidOrder(
        asWs,
        vendorId,
        tracked.orderNumber,
        "zz-1211",
      );
      const trackedRestored = await ws.inventory.findUnique({ where: { productId: trackedId } });
      check(
        "R11-tracked-restore",
        trackedCancelled && trackedRestored?.quantity === 1,
        `TRACKED quantity restored to ${trackedRestored?.quantity}`,
      );
    }

    /* ----------------------------------------------------------- R15 */
    {
      const id = await fixture({ key: "r15", isActive: false, restriction: null, stock: null });
      const result = await quickUpdateInventory(asWs, vendorId, id, { quantity: 6 });
      const row = await ws.inventory.findUnique({ where: { productId: id } });
      check(
        "R15",
        result.ok && row?.stockMode === "TRACKED" && row.quantity === 6,
        `PrismaNeon; created ${row?.stockMode} ${row?.quantity}`,
      );
    }

    /* ----------------------------------------------------------- R18 */
    {
      const setId = await fixture({
        key: "r18-set",
        isActive: true,
        restriction: null,
        stock: { stockMode: "TRACKED", quantity: 3 },
      });
      const set = await setProductRestriction(
        asWs,
        vendorId,
        setId,
        "NOT_DELIVERABLE",
        adminUserId,
        "verify",
        "PRODUCT_FORM",
      );
      const setRow = await ws.product.findUnique({ where: { id: setId } });
      const setAudit = await auditRowsSince(setId);
      check(
        "R18-set",
        set.ok &&
          setRow?.restriction === "NOT_DELIVERABLE" &&
          setRow.isActive === false &&
          setAudit.length === 1 &&
          setAudit[0].action === "RESTRICTION_SET",
        `PrismaNeon; ${setRow?.restriction}, active=${setRow?.isActive}, audit rows=${setAudit.length}`,
      );

      const clearId = await fixture({
        key: "r18-clear",
        isActive: false,
        restriction: "NEEDS_REVIEW",
        stock: { stockMode: "TRACKED", quantity: 3 },
      });
      const cleared = await clearRestrictionAndEnable(
        asWs,
        vendorId,
        clearId,
        "NEEDS_REVIEW",
        adminUserId,
        "Reviewed by verify",
        "PRODUCT_FORM",
      );
      const clearRow = await ws.product.findUnique({ where: { id: clearId } });
      const clearAudit = await auditRowsSince(clearId);
      check(
        "R18-clear",
        cleared.ok &&
          clearRow?.restriction === null &&
          clearRow.isActive === true &&
          clearAudit.length === 1 &&
          clearAudit[0].action === "RESTRICTION_CLEARED" &&
          clearAudit[0].reason === "Reviewed by verify" &&
          clearAudit[0].actorUserId === adminUserId,
        `PrismaNeon; active=${clearRow?.isActive}, audit rows=${clearAudit.length}`,
      );

      const hardId = await fixture({
        key: "r18-hard",
        isActive: false,
        restriction: "AGE_RESTRICTED",
        stock: { stockMode: "TRACKED", quantity: 3 },
      });
      const hard = await clearRestrictionAndEnable(
        asWs,
        vendorId,
        hardId,
        "AGE_RESTRICTED",
        adminUserId,
        "Trying",
        "PRODUCT_FORM",
      );
      const hardRow = await ws.product.findUnique({ where: { id: hardId } });
      check(
        "R18-hard",
        !hard.ok &&
          hardRow?.restriction === "AGE_RESTRICTED" &&
          hardRow.isActive === false &&
          (await auditRowsSince(hardId)).length === 0,
        `PrismaNeon; refused=${!hard.ok}`,
      );

      const staleId = await fixture({
        key: "r18-stale",
        isActive: false,
        restriction: "NOT_DELIVERABLE",
        stock: { stockMode: "TRACKED", quantity: 3 },
      });
      const stale = await clearRestrictionAndEnable(
        asWs,
        vendorId,
        staleId,
        "NEEDS_REVIEW",
        adminUserId,
        "Stale",
        "PRODUCT_FORM",
      );
      const staleRow = await ws.product.findUnique({ where: { id: staleId } });
      check(
        "R18-stale",
        !stale.ok &&
          stale.kind === "CHANGED" &&
          staleRow?.restriction === "NOT_DELIVERABLE" &&
          staleRow.isActive === false &&
          (await auditRowsSince(staleId)).length === 0,
        `PrismaNeon; result=${stale.ok ? "ok" : stale.kind}`,
      );
    }

    /* ----------------------------------------------------------- R19 */
    {
      const id = await fixture({
        key: "r19",
        isActive: false,
        restriction: "NEEDS_REVIEW",
        stock: { stockMode: "TRACKED", quantity: 3 },
      });
      const before = JSON.stringify(await ws.product.findUnique({ where: { id } }));
      const form = await updateProductForVendor(asWs, vendorId, id, {
        name: "ZZ 1211 r19 renamed",
        slug: "zz-1211-r19",
        description: "changed",
        categoryId: category.id,
        basePrice: 999,
        originalPrice: null,
        unitLabel: "each",
        netContentAmount: null,
        netContentUnit: null,
        origin: null,
        isVegetarian: false,
        isGlutenFree: false,
        isHmcCertified: false,
        hmcReference: null,
        hmcVerifiedAt: null,
        brandId: null,
        isHalal: false,
        isFresh: false,
        isOrganic: false,
        isFeatured: false,
        isActive: true,
        quantity: 50,
        stockMode: "TRACKED",
        lowStockThreshold: 3,
        expectedRestockDay: null,
        tier: null,
        attributeValues: [],
      });
      const afterForm = JSON.stringify(await ws.product.findUnique({ where: { id } }));
      check(
        "R19-form",
        !form.ok && form.error.includes("Needs review") && before === afterForm,
        `PrismaNeon; ${form.ok ? "accepted!" : form.error}`,
      );

      const quick = await quickUpdateInventory(asWs, vendorId, id, {
        isActive: true,
        quantity: 99,
      });
      const afterQuick = JSON.stringify(await ws.product.findUnique({ where: { id } }));
      const inv = await ws.inventory.findUnique({ where: { productId: id } });
      check(
        "R19-quick",
        !quick.ok && before === afterQuick && inv?.quantity === 3,
        `PrismaNeon; ${quick.ok ? "accepted!" : quick.error}; quantity ${inv?.quantity}`,
      );
    }

    /* ----------------------------------------------------------- R26 */
    for (const actor of ["ADMIN", "STAFF"] as const) {
      const specs: FixtureSpec[] = [
        { key: `r26-${actor}-clean`, isActive: false, restriction: null, stock: null },
        { key: `r26-${actor}-review`, isActive: false, restriction: "NEEDS_REVIEW", stock: null },
        {
          key: `r26-${actor}-nodeliver`,
          isActive: false,
          restriction: "NOT_DELIVERABLE",
          stock: null,
        },
        { key: `r26-${actor}-age`, isActive: false, restriction: "AGE_RESTRICTED", stock: null },
        { key: `r26-${actor}-prohibited`, isActive: false, restriction: "PROHIBITED", stock: null },
        { key: `r26-${actor}-active`, isActive: true, restriction: null, stock: null },
      ];
      const ids: string[] = [];
      for (const spec of specs) ids.push(await fixture(spec));

      const result = await applyBulkAction(
        asWs,
        vendorId,
        "ENABLE",
        ids,
        actor,
        adminUserId,
        { confirmed: true, reason: "Bulk verify" },
        (entry) => (entry.outcome.kind === "SKIPPED" ? BULK_SKIP_LABELS[entry.outcome.reason] : ""),
      );
      const rows = await ws.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, isActive: true, restriction: true },
      });
      const state = new Map(rows.map((r) => [r.id, r]));
      const [clean, review, nodeliver, age, prohibited, active] = ids.map((id) => state.get(id)!);
      const audits = (await Promise.all(ids.map((id) => auditRowsSince(id)))).flat();

      if (actor === "ADMIN") {
        const ok =
          clean.isActive &&
          review.isActive &&
          review.restriction === null &&
          nodeliver.isActive &&
          nodeliver.restriction === null &&
          !age.isActive &&
          age.restriction === "AGE_RESTRICTED" &&
          !prohibited.isActive &&
          prohibited.restriction === "PROHIBITED" &&
          active.isActive &&
          result.failed.length === 0 &&
          result.skipped.some((s) => s.productId === ids[3]) &&
          result.skipped.some((s) => s.productId === ids[4]) &&
          audits.length === 2 &&
          audits.every(
            (a) =>
              a.action === "RESTRICTION_CLEARED" &&
              a.source === "BULK_ACTION" &&
              a.actorUserId === adminUserId &&
              a.reason === "Bulk verify",
          );
        check(
          "R26-admin",
          ok,
          `PrismaNeon; updated ${result.updated.length}, skipped ${result.skipped.length}, failed ${result.failed.length}, audit rows ${audits.length}`,
        );
      } else {
        const ok =
          clean.isActive &&
          !review.isActive &&
          review.restriction === "NEEDS_REVIEW" &&
          !nodeliver.isActive &&
          !age.isActive &&
          !prohibited.isActive &&
          active.isActive &&
          audits.length === 0;
        check(
          "R26-staff",
          ok,
          `PrismaNeon; updated ${result.updated.length}, skipped ${result.skipped.length}, audit rows ${audits.length}`,
        );
      }
    }

    /* ----------------------------------------------------------- R27 */
    {
      const ids = [
        await fixture({
          key: "r27-norow",
          isActive: false,
          restriction: "NEEDS_REVIEW",
          stock: null,
        }),
        await fixture({
          key: "r27-tracked",
          isActive: true,
          restriction: null,
          stock: { stockMode: "TRACKED", quantity: 4 },
        }),
        await fixture({
          key: "r27-unknown",
          isActive: false,
          restriction: null,
          stock: { stockMode: "UNKNOWN", quantity: 0 },
        }),
      ];
      const before = await ws.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, isActive: true, restriction: true },
        orderBy: { id: "asc" },
      });
      await applyBulkAction(
        asWs,
        vendorId,
        "MARK_UNTRACKED",
        ids,
        "STAFF",
        adminUserId,
        { confirmed: false, reason: null },
        () => "",
      );
      const after = await ws.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, isActive: true, restriction: true },
        orderBy: { id: "asc" },
      });
      const modes = await ws.inventory.findMany({
        where: { productId: { in: ids } },
        select: { stockMode: true },
      });
      check(
        "R27",
        modes.length === 3 &&
          modes.every((m) => m.stockMode === "UNTRACKED") &&
          JSON.stringify(before) === JSON.stringify(after),
        `PrismaNeon; modes ${modes.map((m) => m.stockMode).join(",")}`,
      );
    }

    /* ------------------------------------- R29 fixture: one IMPORT audit row */
    {
      const id = await fixture({
        key: "r29-import",
        isActive: false,
        restriction: "NOT_DELIVERABLE",
        stock: null,
      });
      const existing = await ws.productRestrictionAuditLog.count({
        where: { productId: id, source: "IMPORT" },
      });
      if (existing === 0) {
        await ws.productRestrictionAuditLog.create({
          data: {
            vendorId,
            productId: id,
            action: "RESTRICTION_SET",
            fromRestriction: null,
            toRestriction: "NOT_DELIVERABLE",
            actorUserId: null,
            source: "IMPORT",
            reason: "Department STAMPS (fixture)",
          },
        });
      }
      console.log(`INFO R29 fixture /staff/products/${id} carries an IMPORT audit row`);
    }

    /* --------------------------------------------- R12 storefront fixtures */
    if (LEAVE_STOREFRONT) {
      await fixture({
        key: "store-untracked",
        isActive: true,
        restriction: null,
        stock: { stockMode: "UNTRACKED", quantity: 0 },
      });
      await fixture({
        key: "store-unknown",
        isActive: true,
        restriction: null,
        stock: { stockMode: "UNKNOWN", quantity: 9 },
      });
      await fixture({
        key: "store-tracked",
        isActive: true,
        restriction: null,
        stock: { stockMode: "TRACKED", quantity: 2, lowStockThreshold: 3 },
      });
      console.log(
        "INFO R12 fixtures left ACTIVE: /products/zz-1211-store-untracked, -store-unknown, -store-tracked",
      );
    }
  } finally {
    // Cancel anything still pending, then hide every fixture this run touched.
    for (const orderNumber of orderNumbers) {
      const vendorRow = await ws.order.findFirst({
        where: { orderNumber },
        select: { vendorId: true, status: true },
      });
      if (vendorRow?.status === "PENDING_PAYMENT") {
        await cancelUnpaidOrder(asWs, vendorRow.vendorId, orderNumber, "zz-1211 cleanup");
      }
    }
    const keep = LEAVE_STOREFRONT
      ? new Set(["store-untracked", "store-unknown", "store-tracked"])
      : new Set<string>();
    const hide = [...fixtureIds.entries()].filter(([key]) => !keep.has(key)).map(([, id]) => id);
    if (hide.length > 0) {
      await ws.product.updateMany({ where: { id: { in: hide } }, data: { isActive: false } });
    }
    await ws.$disconnect();
    await http.$disconnect();
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
