/**
 * Live proof for specs/2026-09-24-p613-delivery-areas-ranges-fees-refusals/ R34 (#613, #890, #889).
 *
 *   npx tsx scripts/verify-delivery-areas.ts
 *
 * DEV DATABASE ONLY. It writes and then restores Aheed's delivery areas, and writes and deletes one
 * refusal-count row. It refuses to run unless DATABASE_URL points at the dev endpoint named below.
 *
 * Why a script and not only unit tests: `createMany` and `updateMany` crash unconditionally through
 * the HTTP adapter (#382), and a mocked client cannot reveal which adapter a call really reaches.
 * This drives the repository functions through the SAME two adapters the Worker uses —
 * `PrismaNeon` (WebSocket) for the bulk insert and the charges update, `PrismaNeonHttp` for reads
 * and the refusal upsert — against real Postgres.
 *
 * Committed rather than scratch, matching scripts/verify-repository-injection.ts; it lives under
 * scripts/ so a type error in it cannot fail `next build`.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon, PrismaNeonHttp } from "@prisma/adapter-neon";
import {
  createDeliveryAreasForVendor,
  listDeliveryAreasForVendor,
  updateDeliveryAreaChargesForVendor,
  type DeliveryAreaRow,
} from "../lib/repositories/delivery-areas";
import { recordDeliveryRefusal } from "../lib/repositories/delivery-refusals";
import { resolveDeliveryRules } from "../lib/delivery-pricing";

const DEV_ENDPOINT = "ep-dry-morning-zab7dx08";
const AHEED_SLUG = "aheed-food-centre";
const SRIMART_SLUG = "srimart";
const RANGE = Array.from({ length: 10 }, (_, i) => `MK${i + 1}`);
const TEST_DISTRICT = "ZZ99"; // not a real district, so it can never collide with a real count

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures += 1;
}

function snapshot(rows: DeliveryAreaRow[]): string {
  return JSON.stringify(
    rows
      .map((r) => [r.prefix, r.deliveryFeePence, r.minimumOrderPence, r.freeDeliveryThresholdPence])
      .sort(),
  );
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes(DEV_ENDPOINT)) {
    console.error(`Refusing to run: DATABASE_URL is not the dev endpoint (${DEV_ENDPOINT}).`);
    process.exit(2);
  }

  // Structurally the same clients lib/db.ts builds on a Worker, from the Node-loadable specifier.
  const http = new PrismaClient({ adapter: new PrismaNeonHttp(url, {}) }) as never;
  const ws = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });

  const vendors = await ws.vendor.findMany({
    where: { slug: { in: [AHEED_SLUG, SRIMART_SLUG] } },
    select: {
      id: true,
      slug: true,
      config: {
        select: {
          deliveryFeePence: true,
          minimumOrderPence: true,
          freeDeliveryThresholdPence: true,
        },
      },
    },
  });
  const aheed = vendors.find((v) => v.slug === AHEED_SLUG);
  const srimart = vendors.find((v) => v.slug === SRIMART_SLUG);
  if (!aheed || !srimart) throw new Error("Aheed or SriMart vendor not found in dev.");

  const aheedBefore = await listDeliveryAreasForVendor(http, aheed.id);
  const srimartBefore = await listDeliveryAreasForVendor(http, srimart.id);
  console.log(`Aheed before:   ${snapshot(aheedBefore)}`);
  console.log(`SriMart before: ${snapshot(srimartBefore)}`);

  try {
    // 1. Bulk insert through the WebSocket adapter, then again — idempotent.
    const first = await createDeliveryAreasForVendor(ws as never, aheed.id, RANGE);
    console.log(`first bulk insert: added=${first.added} alreadyListed=${first.alreadyListed}`);
    check("first bulk insert accounts for all 10", first.added + first.alreadyListed === 10);
    const second = await createDeliveryAreasForVendor(ws as never, aheed.id, RANGE);
    check("second bulk insert adds nothing", second.added === 0, `added=${second.added}`);

    // 2. Charges update on MK10 through the WebSocket adapter, read back over HTTP.
    const rows = await listDeliveryAreasForVendor(http, aheed.id);
    const mk10 = rows.find((r) => r.prefix === "MK10");
    check("MK10 exists after the range", Boolean(mk10));
    if (mk10) {
      const updated = await updateDeliveryAreaChargesForVendor(ws as never, aheed.id, mk10.id, {
        deliveryFeePence: 599,
        minimumOrderPence: 3000,
        freeDeliveryThresholdPence: 0,
      });
      check("charges update succeeds", updated.ok);
      const other = await updateDeliveryAreaChargesForVendor(ws as never, srimart.id, mk10.id, {
        deliveryFeePence: 1,
        minimumOrderPence: 1,
        freeDeliveryThresholdPence: 1,
      });
      check("another vendor's id updates nothing", !other.ok);
    }

    // 3. Pricing resolved over the rows as stored.
    const stored = await listDeliveryAreasForVendor(http, aheed.id);
    const defaults = {
      deliveryFeePence: aheed.config?.deliveryFeePence ?? 349,
      minimumOrderPence: aheed.config?.minimumOrderPence ?? 0,
      freeDeliveryThresholdPence: aheed.config?.freeDeliveryThresholdPence ?? null,
    };
    const mk10Rules = resolveDeliveryRules(defaults, stored, "MK10 1AA", "DELIVERY");
    check(
      "MK10 1AA resolves to the MK10 overrides",
      mk10Rules.areaPrefix === "MK10" &&
        mk10Rules.deliveryFeePence === 599 &&
        mk10Rules.minimumOrderPence === 3000 &&
        mk10Rules.freeDeliveryThresholdPence === 0,
      JSON.stringify(mk10Rules),
    );
    const mk9Rules = resolveDeliveryRules(defaults, stored, "MK9 2EA", "DELIVERY");
    check(
      "MK9 2EA resolves to the defaults",
      mk9Rules.deliveryFeePence === defaults.deliveryFeePence &&
        mk9Rules.minimumOrderPence === defaults.minimumOrderPence,
      JSON.stringify(mk9Rules),
    );
    const mk17Rules = resolveDeliveryRules(
      defaults,
      stored.filter((r) => r.prefix !== "MK"),
      "MK17 8NL",
      "DELIVERY",
    );
    check("MK17 8NL is not covered by MK1-MK10", mk17Rules.areaPrefix === null);

    // 4. Refusal upsert over HTTP, twice.
    const day = new Date(Date.UTC(2000, 0, 1));
    await recordDeliveryRefusal(http, aheed.id, TEST_DISTRICT, day, "HEADER");
    await recordDeliveryRefusal(http, aheed.id, TEST_DISTRICT, day, "HEADER");
    const counted = await ws.deliveryRefusalCount.findUnique({
      where: {
        vendorId_district_day_source: {
          vendorId: aheed.id,
          district: TEST_DISTRICT,
          day,
          source: "HEADER",
        },
      },
    });
    check("two refusals upsert to count 2", counted?.count === 2, `count=${counted?.count}`);
  } finally {
    // 5. Restore: delete the test refusal row and put Aheed's areas back exactly.
    await ws.deliveryRefusalCount.deleteMany({
      where: { vendorId: aheed.id, district: TEST_DISTRICT },
    });

    const beforePrefixes = new Set(aheedBefore.map((r) => r.prefix));
    await ws.vendorDeliveryArea.deleteMany({
      where: { vendorId: aheed.id, prefix: { notIn: [...beforePrefixes] } },
    });
    for (const row of aheedBefore) {
      await ws.vendorDeliveryArea.updateMany({
        where: { vendorId: aheed.id, prefix: row.prefix },
        data: {
          deliveryFeePence: row.deliveryFeePence,
          minimumOrderPence: row.minimumOrderPence,
          freeDeliveryThresholdPence: row.freeDeliveryThresholdPence,
        },
      });
    }

    const aheedAfter = await listDeliveryAreasForVendor(http, aheed.id);
    const srimartAfter = await listDeliveryAreasForVendor(http, srimart.id);
    check(
      "Aheed restored to its snapshot",
      snapshot(aheedAfter) === snapshot(aheedBefore),
      snapshot(aheedAfter),
    );
    check("SriMart untouched", snapshot(srimartAfter) === snapshot(srimartBefore));
    await ws.$disconnect();
  }

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
