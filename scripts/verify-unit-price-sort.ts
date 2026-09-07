/**
 * #398 (derivation half, P9.3), R37 — proves `Product.unitPricePencePerBaseUnit` (the derived
 * sort key, R30) is genuinely queryable in a real database by running
 * `lib/repositories/products.ts`'s `listProductsByUnitPrice` against it, and prints the ordering.
 *
 *   npx tsx scripts/verify-unit-price-sort.ts
 *
 * Also re-confirms the three hand-authored pg_trgm indexes from
 * 20260820143949_p7_5de_order_search_trigram survived this slice's migration
 * (20260907184752_p9_3_unit_pricing) with no DROP INDEX — CLAUDE.md's GAP-011 trap.
 *
 * Same guard and cleanup posture as scripts/verify-repository-injection.ts: refuses to run
 * against a host named in secrets/staging.vars or secrets/production.vars, writes only
 * `__verify-`-prefixed rows, and deletes every one of them before exiting. The client is built
 * from the BARE `@prisma/client` specifier (real Node), not `lib/db.ts`'s `/wasm` build, for the
 * same reason verify-repository-injection.ts's header explains.
 */

import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { createProductForVendor, listProductsByUnitPrice } from "@/lib/repositories/products";

const STAMP = Date.now();

function normalizeHost(url: string): string | null {
  const match = /@([^:/?]+)/.exec(url);
  if (!match) return null;
  return match[1].toLowerCase().replace(/-pooler\./, ".");
}

function protectedHosts(): { hosts: Set<string>; readFiles: string[] } {
  const hosts = new Set<string>();
  const readFiles: string[] = [];
  for (const file of ["secrets/staging.vars", "secrets/production.vars"]) {
    let contents: string;
    try {
      contents = readFileSync(file, "utf8");
    } catch {
      continue;
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

  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
  const createdIds: string[] = [];

  try {
    // ---- GAP-011 re-check: the migration's hand edit must have kept these three ----
    const trgmIndexes = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
      `SELECT indexname::text AS indexname FROM pg_indexes WHERE indexname IN
       ('Order_guestEmail_trgm_idx', 'Order_orderNumber_trgm_idx', 'User_email_trgm_idx')`,
    );
    const found = new Set(trgmIndexes.map((r) => r.indexname));
    for (const name of [
      "Order_guestEmail_trgm_idx",
      "Order_orderNumber_trgm_idx",
      "User_email_trgm_idx",
    ]) {
      if (!found.has(name)) throw new Error(`GAP-011: trigram index ${name} is MISSING`);
    }
    console.log("PASS  all three pg_trgm indexes from 20260820143949_p7_5de survived\n");

    const vendor = await prisma.vendor.findFirst({ select: { id: true } });
    if (!vendor) throw new Error("no Vendor rows — seed the database before running this.");
    const category = await prisma.category.findFirst({
      where: { vendorId: vendor.id },
      select: { id: true },
    });
    if (!category) throw new Error("no Category rows for this vendor — seed first.");

    // Three products, three different derived unit prices — expensive, mid, cheap per kg.
    const fixtures = [
      {
        label: "expensive",
        basePrice: 900,
        netContentAmount: 200,
        netContentUnit: "GRAM" as const,
      }, // £45.00/kg
      { label: "mid", basePrice: 300, netContentAmount: 500, netContentUnit: "GRAM" as const }, // £6.00/kg
      { label: "cheap", basePrice: 100, netContentAmount: 1000, netContentUnit: "GRAM" as const }, // £1.00/kg
    ];

    for (const fixture of fixtures) {
      const created = await createProductForVendor(prisma as never, vendor.id, {
        name: `__verify unit-price ${fixture.label} ${STAMP}`,
        slug: `__verify-unit-price-${fixture.label}-${STAMP}`,
        description: "Temporary row written by scripts/verify-unit-price-sort.ts",
        categoryId: category.id,
        basePrice: fixture.basePrice,
        originalPrice: null,
        unitLabel: "n/a — net content set",
        netContentAmount: fixture.netContentAmount,
        netContentUnit: fixture.netContentUnit,
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
        quantity: 1,
        lowStockThreshold: 1,
        tier: null,
      });
      if (!created.ok) throw new Error(`create refused for ${fixture.label}: ${created.error}`);
      createdIds.push(created.id);
    }

    // Confirm the stored sort key actually landed as expected before trusting the ordered read.
    const stored = await prisma.product.findMany({
      where: { id: { in: createdIds } },
      select: { id: true, slug: true, unitPricePencePerBaseUnit: true },
    });
    console.log("stored unitPricePencePerBaseUnit per created row:");
    for (const row of stored) console.log(`  ${row.slug}: ${row.unitPricePencePerBaseUnit}`);
    console.log();

    const page = await listProductsByUnitPrice(prisma as never, vendor.id, 500);
    const ordered = page
      .filter((p) => createdIds.includes(p.id))
      .map((p) => ({ slug: p.slug, basePrice: p.basePrice }));

    console.log("listProductsByUnitPrice() ordering (ascending, cheapest per kg first):");
    for (const row of ordered) console.log(`  ${row.slug} — basePrice ${row.basePrice}p`);
    console.log();

    const slugs = ordered.map((r) => r.slug);
    const expected = [
      `__verify-unit-price-cheap-${STAMP}`,
      `__verify-unit-price-mid-${STAMP}`,
      `__verify-unit-price-expensive-${STAMP}`,
    ];
    if (JSON.stringify(slugs) !== JSON.stringify(expected)) {
      throw new Error(
        `ordering mismatch — expected ${JSON.stringify(expected)}, got ${JSON.stringify(slugs)}`,
      );
    }
    console.log("PASS  listProductsByUnitPrice() returned the three rows in ascending order");
  } finally {
    // Inventory rows carry a FK to Product with no onDelete: Cascade — they must go first, or
    // prisma.product.delete throws a foreign-key violation and the row is left behind silently.
    for (const id of createdIds) {
      await prisma.inventory.deleteMany({ where: { productId: id } });
      await prisma.product.delete({ where: { id } });
    }
    const remaining = await prisma.product.count({
      where: { slug: { contains: String(STAMP) } },
    });
    console.log(`\ncleanup: ${createdIds.length} row(s) targeted, ${remaining} remaining`);
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
