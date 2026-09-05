/**
 * Proves, against a real database, that every repository export cleared by #409
 * can be exercised from a plain Node script.
 *
 *   npx tsx scripts/verify-repository-injection.ts
 *
 * WHY THIS SCRIPT EXISTS RATHER THAN A UNIT TEST
 *
 * `tests/repository-client-injection.test.ts` proves the exports take a client.
 * It cannot prove the thing that actually matters — that injecting a Node-native
 * client makes them RUN — because that needs a database and a real Prisma
 * client, neither of which belongs in the unit suite.
 *
 * The property is not obvious and was wrong for two years while FOUR separate
 * docstrings asserted it. `lib/db.ts` builds its client from
 * `@prisma/client/wasm`, mandatory on Workers, whose query compiler Node cannot
 * load; so an export that resolves its own client fails here with
 * `ERR_UNKNOWN_FILE_EXTENSION` no matter how it is called. Building the client
 * from the BARE `@prisma/client` specifier — exactly as `prisma/seed.ts` does,
 * because it too runs in real Node — is what makes these functions reachable.
 *
 * NOT READ-ONLY (changed in #411/#412). Slice 1's version only ever read, plus
 * throwaway OrderLookupAttempt rows. The exports added here are mostly WRITES,
 * and a read-only script cannot demonstrate a write path, so this one creates a
 * category, a loyalty tier, a product and a product image, and removes each
 * before exiting. Every created row is named with a `__verify-` prefix and a
 * timestamp.
 *
 * BECAUSE it writes, it REFUSES to run against staging or production rather
 * than printing the host and trusting a human to read it — CLAUDE.md records
 * `.env` and `.dev.vars` drifting into agreement on production once while every
 * surrounding value looked like staging. The guard runs before any client is
 * constructed. There is deliberately no override flag.
 *
 * The adapter here is `PrismaNeon` (WebSocket), not `PrismaNeonHttp`, so the one
 * client below can serve both the `getPrisma()` and `getPrismaWs()` roles —
 * interactive transactions included (#382).
 */

import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { listCustomersForAdmin } from "@/lib/repositories/customers";
import { getCatalogueHealth, getLoyaltyLiability } from "@/lib/repositories/reports";
import { checkOrderLookupRateLimit } from "@/lib/repositories/order-lookup-rate-limit";
import { listCodes } from "@/lib/repositories/discounts";
import {
  createCategoryForVendor,
  getCategoryForAdmin,
  listCategoriesForAdmin,
  updateCategoryForVendor,
} from "@/lib/repositories/categories";
import { createLoyaltyTier, deleteLoyaltyTier, getTiers } from "@/lib/repositories/loyalty";
import {
  fetchVendorProfile,
  getVendorBranding,
  getVendorConfig,
  updateVendorLogoKey,
} from "@/lib/repositories/vendor";
import {
  addProductImage,
  createProductForVendor,
  getProductsWithoutImages,
  getProductForAdmin,
  listInventoryForStaff,
  listProductsForAdmin,
  quickUpdateInventory,
  setPrimaryProductImage,
} from "@/lib/repositories/products";

let failures = 0;
const STAMP = Date.now();

async function check(label: string, fn: () => Promise<string>) {
  try {
    console.log(`PASS  ${label}\n        ${await fn()}`);
  } catch (error) {
    failures += 1;
    const e = error as Error & { code?: string };
    console.log(`FAIL  ${label}\n        ${e.name} (${e.code ?? "-"}): ${e.message.trim()}`);
  }
}

/** Host only, lowercased, with Neon's `-pooler` suffix stripped so the pooled
 *  and direct URLs for one project compare equal. */
function normalizeHost(url: string): string | null {
  const match = /@([^:/?]+)/.exec(url);
  if (!match) return null;
  return match[1].toLowerCase().replace(/-pooler\./, ".");
}

/** Every host named by secrets/staging.vars and secrets/production.vars. */
function protectedHosts(): { hosts: Set<string>; readFiles: string[] } {
  const hosts = new Set<string>();
  const readFiles: string[] = [];
  for (const file of ["secrets/staging.vars", "secrets/production.vars"]) {
    let contents: string;
    try {
      contents = readFileSync(file, "utf8");
    } catch {
      continue; // absent — handled by the caller, never silently ignored
    }
    readFiles.push(file);
    for (const line of contents.split(/\r?\n/)) {
      const m = /^\s*(?:DATABASE_URL|DIRECT_URL)\s*=\s*"?([^"\s]+)"?/.exec(line);
      const host = m && normalizeHost(m[1]);
      if (host) hosts.add(host);
    }
  }
  return { hosts, readFiles };
}

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DIRECT_URL/DATABASE_URL is empty — check .env is present and loading.");
  }

  const host = normalizeHost(connectionString);
  console.log("database:", host ?? "(unparseable)", "\n");

  // ---- guard, before any client is constructed -----------------------------
  const { hosts, readFiles } = protectedHosts();
  if (readFiles.length === 0) {
    throw new Error(
      "Neither secrets/staging.vars nor secrets/production.vars could be read, so this " +
        "script cannot confirm it is NOT pointed at a deployed database. It writes rows, " +
        "so it refuses rather than guessing. Restore those files and re-run.",
    );
  }
  if (host && hosts.has(host)) {
    throw new Error(
      `REFUSING TO RUN: ${host} is a host named in ${readFiles.join(" / ")}, i.e. staging or ` +
        `production. This script creates and deletes real rows and is only for a dev database.`,
    );
  }
  console.log(`host is not staging/production (checked against ${readFiles.join(", ")})\n`);

  // The client a Workers request would never build: bare specifier, real Node.
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });

  const vendor = await prisma.vendor.findFirst({ select: { id: true } });
  if (!vendor) throw new Error("no Vendor rows — seed the database before running this.");
  console.log(`vendor under test: ${vendor.id}\n`);

  /* --- slice 1's exports, unchanged --------------------------------------- */

  await check("customers.ts  listCustomersForAdmin(prisma, vendorId, opts)", async () => {
    const page = await listCustomersForAdmin(prisma as never, vendor.id, { take: 3, page: 0 });
    return `${page.items.length} customer row(s), hasMore=${page.hasMore}`;
  });

  await check("reports.ts  getCatalogueHealth(prisma, vendorId)", async () => {
    const h = await getCatalogueHealth(prisma as never, vendor.id);
    return JSON.stringify(h);
  });

  await check("reports.ts  getLoyaltyLiability(prisma, vendorId)", async () => {
    const l = await getLoyaltyLiability(prisma as never, vendor.id);
    return JSON.stringify(l);
  });

  await check("discounts.ts  listCodes(prisma, vendorId)", async () => {
    const codes = await listCodes(prisma as never, vendor.id);
    return `${codes.length} discount code(s)`;
  });

  await check(
    "order-lookup-rate-limit.ts  checkOrderLookupRateLimit(prisma, vendorId, ip)",
    async () => {
      const ip = `verify-${STAMP}`; // unique, so a real caller's window is untouched
      const first = await checkOrderLookupRateLimit(prisma as never, vendor.id, ip);
      if (!first.allowed) throw new Error("first attempt in a fresh window was refused");
      let last = first;
      for (let i = 0; i < 5; i += 1) {
        last = await checkOrderLookupRateLimit(prisma as never, vendor.id, ip);
      }
      if (last.allowed) throw new Error("throttle never refused after 6 attempts in one window");
      return "allowed on attempt 1, refused past the 5-per-minute threshold";
    },
  );

  /* --- categories.ts (#411): read + write --------------------------------- */

  await check("categories.ts  listCategoriesForAdmin(prisma, vendorId)", async () => {
    const rows = await listCategoriesForAdmin(prisma as never, vendor.id);
    return `${rows.length} category row(s)`;
  });

  let createdCategoryId: string | null = null;
  await check(
    "categories.ts  createCategoryForVendor + getCategoryForAdmin + updateCategoryForVendor",
    async () => {
      const result = await createCategoryForVendor(prisma as never, vendor.id, {
        name: `__verify ${STAMP}`,
        slug: `__verify-${STAMP}`,
        parentId: null,
        sortOrder: 9999,
        isActive: false,
      });
      if (!result.ok) throw new Error(`create refused: ${result.error}`);
      createdCategoryId = result.id;

      const read = await getCategoryForAdmin(prisma as never, vendor.id, result.id);
      if (!read) throw new Error("created category did not read back");

      const updated = await updateCategoryForVendor(prisma as never, vendor.id, result.id, {
        name: `__verify ${STAMP} (renamed)`,
        slug: `__verify-${STAMP}`,
        parentId: null,
        sortOrder: 9999,
        isActive: false,
      });
      if (!updated.ok) throw new Error(`update refused: ${updated.error}`);
      return `created ${result.id}, read back, renamed`;
    },
  );

  /* --- loyalty.ts (#411): read + write ------------------------------------ */

  await check("loyalty.ts  getTiers(prisma, vendorId)", async () => {
    const tiers = await getTiers(prisma as never, vendor.id);
    return `${tiers.length} tier(s)`;
  });

  await check(
    "loyalty.ts  createLoyaltyTier + deleteLoyaltyTier(prisma, vendorId, key)",
    async () => {
      const key = `__VERIFY_${STAMP}`;
      const created = await createLoyaltyTier(prisma as never, vendor.id, {
        key,
        name: `__verify ${STAMP}`,
        thresholdPence: 999_999_99,
        multiplierBps: 10_000,
      });
      if (!created.ok) throw new Error(`create refused: ${created.reason}`);
      const removed = await deleteLoyaltyTier(prisma as never, vendor.id, key);
      if (removed.count !== 1)
        throw new Error(`expected to delete 1 tier, deleted ${removed.count}`);
      return "tier created and deleted (the delete is also this check's cleanup)";
    },
  );

  /* --- vendor.ts (#411): read + write ------------------------------------- */

  await check("vendor.ts  fetchVendorProfile / getVendorConfig / getVendorBranding", async () => {
    const profile = await fetchVendorProfile(prisma as never, vendor.id);
    const config = await getVendorConfig(prisma as never, vendor.id);
    const branding = await getVendorBranding(prisma as never, vendor.id);
    return `profile=${profile.name}, config=${config ? "row" : "null"}, branding=${
      branding ? "row" : "null"
    }`;
  });

  await check("vendor.ts  updateVendorLogoKey(prisma, vendorId, key) [restored]", async () => {
    const before = await getVendorBranding(prisma as never, vendor.id);
    if (!before) return "skipped — this vendor has no VendorBranding row to update";
    const original = before.logoStorageKey;
    await updateVendorLogoKey(prisma as never, vendor.id, `__verify-${STAMP}.webp`);
    const during = await getVendorBranding(prisma as never, vendor.id);
    if (during?.logoStorageKey !== `__verify-${STAMP}.webp`) throw new Error("write did not land");
    await updateVendorLogoKey(prisma as never, vendor.id, original ?? "");
    const after = await getVendorBranding(prisma as never, vendor.id);
    if (after?.logoStorageKey !== (original ?? "")) throw new Error("restore failed");
    return "logo key written and restored to its original value";
  });

  /* --- products.ts (#412): read + write, incl. a transaction path ---------- */

  await check("products.ts  listProductsForAdmin / listInventoryForStaff", async () => {
    const page = await listProductsForAdmin(prisma as never, vendor.id, { take: 3 });
    const inv = await listInventoryForStaff(prisma as never, vendor.id, { take: 3 });
    return `${page.items.length} admin product row(s), ${inv.items.length} inventory row(s)`;
  });

  let createdProductId: string | null = null;
  await check(
    "products.ts  createProductForVendor + addProductImage + setPrimaryProductImage + quickUpdateInventory",
    async () => {
      const category = await prisma.category.findFirst({
        where: { vendorId: vendor.id },
        select: { id: true },
      });
      if (!category) throw new Error("no Category rows for this vendor — seed first");

      const created = await createProductForVendor(prisma as never, vendor.id, {
        name: `__verify ${STAMP}`,
        slug: `__verify-${STAMP}`,
        description: "Temporary row written by scripts/verify-repository-injection.ts",
        categoryId: category.id,
        basePrice: 123,
        originalPrice: null,
        unitLabel: "each",
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
        isActive: false,
        quantity: 1,
        lowStockThreshold: 1,
        tier: null,
      });
      if (!created.ok) throw new Error(`create refused: ${created.error}`);
      createdProductId = created.id;

      // The WebSocket transaction path — the half that getPrisma() cannot run.
      const primary = await setPrimaryProductImage(
        prisma as never,
        vendor.id,
        created.id,
        `products/__verify-${STAMP}/main.webp`,
        "verify",
      );
      if (!primary.ok) throw new Error(`setPrimaryProductImage refused: ${primary.error}`);

      const second = await addProductImage(
        prisma as never,
        vendor.id,
        created.id,
        `products/__verify-${STAMP}/second.webp`,
        "verify second",
      );
      if (!second.ok) throw new Error(`addProductImage refused: ${second.error}`);

      const stocked = await quickUpdateInventory(prisma as never, vendor.id, created.id, {
        quantity: 7,
      });
      if (!stocked.ok) throw new Error(`quickUpdateInventory refused: ${stocked.error}`);

      const readBack = await getProductForAdmin(prisma as never, vendor.id, created.id);
      if (readBack?.quantity !== 7) throw new Error("inventory write did not read back as 7");
      return `product ${created.id} created, 2 images via $transaction, stock set to 7`;
    },
  );

  /*
   * #502 — which products the "Auto-fill Missing Images" job acts on.
   *
   * Belongs in THIS script rather than the unit suite for the reason the file's
   * header gives: the rule is half a Prisma `where` clause, and a hand-built
   * mock would prove whatever its author assumed rather than what Postgres
   * actually returns for `images: { every: ... }` on a product with no images
   * at all. The predicate it replaced (`images: { none: {} }`) type-checked,
   * read plausibly, and matched zero rows in production data for two vendors.
   *
   * Three rows, one per case, all newer than anything seeded — which is why
   * getProductsWithoutImages orders newest-first.
   */
  const backfillIds: string[] = [];
  await check("products.ts  getProductsWithoutImages(prisma, vendorId, limit)", async () => {
    const category = await prisma.category.findFirst({
      where: { vendorId: vendor.id },
      select: { id: true },
    });
    if (!category) throw new Error("no Category rows for this vendor — seed first");

    // Captured before the closure: TypeScript's narrowing of `vendor` and
    // `category` from the guards above does not survive into a nested function.
    const vendorId = vendor.id;
    const categoryId = category.id;

    async function makeProduct(suffix: string, storageKey: string | null): Promise<string> {
      const row = await prisma.product.create({
        data: {
          vendorId,
          name: `__verify ${STAMP} ${suffix}`,
          slug: `__verify-${STAMP}-${suffix}`,
          description: "Temporary row written by scripts/verify-repository-injection.ts",
          categoryId,
          basePrice: 100,
          unitLabel: "each",
          isActive: false,
        },
        select: { id: true },
      });
      backfillIds.push(row.id);
      if (storageKey) {
        await prisma.productImage.create({
          data: { productId: row.id, storageKey, alt: "temp", isPrimary: true },
        });
      }
      return row.id;
    }

    const noImages = await makeProduct("noimg", null);
    const placeholderOnly = await makeProduct(
      "placeholder",
      `products/__verify-${STAMP}-placeholder/main.svg`,
    );
    const realImage = await makeProduct(
      "real",
      `products/__verify-${STAMP}-real/0f9c1d2e-0000-4000-a000-000000000001.webp`,
    );

    // The three rows above are the newest for this vendor, so a batch of 3 is
    // exactly them — which is what makes the negative case assertable.
    const found = await getProductsWithoutImages(prisma as never, vendor.id, 3);
    const ids = new Set(found.map((p) => p.id));

    if (!ids.has(noImages)) throw new Error("a product with NO images was not selected");
    if (!ids.has(placeholderOnly)) {
      throw new Error("a product whose only image is a placeholder was not selected");
    }
    if (ids.has(realImage)) {
      throw new Error("a product with a real primary image was wrongly selected");
    }

    return `selected the no-image and placeholder-only rows, skipped the real-image row`;
  });

  /* --- cleanup, then prove it worked -------------------------------------- */

  if (createdProductId) {
    await prisma.productImage.deleteMany({ where: { productId: createdProductId } });
    await prisma.inventory.deleteMany({ where: { productId: createdProductId } });
    await prisma.product.delete({ where: { id: createdProductId } });
  }
  for (const id of backfillIds) {
    await prisma.productImage.deleteMany({ where: { productId: id } });
    await prisma.product.delete({ where: { id } });
  }
  if (createdCategoryId) {
    await prisma.category.delete({ where: { id: createdCategoryId } });
  }

  await check("cleanup  every row this run created is gone", async () => {
    const [products, categories, tiers, images] = await Promise.all([
      prisma.product.count({ where: { slug: { startsWith: `__verify-${STAMP}` } } }),
      prisma.category.count({ where: { slug: `__verify-${STAMP}` } }),
      prisma.vendorLoyaltyTier.count({ where: { key: `__VERIFY_${STAMP}` } }),
      prisma.productImage.count({ where: { storageKey: { contains: `__verify-${STAMP}` } } }),
    ]);
    const leftovers = { products, categories, tiers, images };
    const total = products + categories + tiers + images;
    if (total !== 0) throw new Error(`rows left behind: ${JSON.stringify(leftovers)}`);
    return "0 products, 0 categories, 0 tiers, 0 images remaining";
  });
}

main()
  .then(() => {
    console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) FAILED`);
    process.exitCode = failures === 0 ? 0 : 1;
  })
  .catch((error) => {
    console.error("\nscript crashed:", error);
    process.exitCode = 1;
  });
