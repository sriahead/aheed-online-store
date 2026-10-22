import { connectDev } from "./lib/dev-client";

/**
 * Read-only check that a freshly imported vendor is still entirely hidden (#1216 R29).
 *
 *   npx tsx scripts/verify-onboarding.ts <vendor-slug> --expect-hidden
 *
 * Exits 0 only when the vendor exists, has at least one VendorDomain, and has no active product, no
 * active category, no inventory row whose stock mode is anything but UNKNOWN, and no inventory row
 * with a non-zero quantity. Run it straight after an import; once staff start activating products
 * it is expected to fail, which is why the flag is explicit rather than a default.
 *
 * It writes nothing. The host guard applies: it refuses a staging or production database.
 */

async function main() {
  const args = process.argv.slice(2);
  const slug = args.find((a) => !a.startsWith("--"));
  if (!slug || !args.includes("--expect-hidden")) {
    console.error("usage: npx tsx scripts/verify-onboarding.ts <vendor-slug> --expect-hidden");
    process.exit(1);
  }

  const { prisma, host } = connectDev();
  console.log(`database: ${host ?? "(unparseable)"} — not staging/production`);
  try {
    const vendor = await prisma.vendor.findUnique({ where: { slug }, select: { id: true } });
    if (!vendor) {
      console.error(`FAIL  vendor "${slug}" does not exist`);
      process.exit(1);
    }
    const vendorId = vendor.id;

    const checks: { name: string; count: number; expect: "zero" | "positive" }[] = [
      {
        name: "VendorDomain rows",
        count: await prisma.vendorDomain.count({ where: { vendorId } }),
        expect: "positive",
      },
      {
        name: "active products",
        count: await prisma.product.count({ where: { vendorId, isActive: true } }),
        expect: "zero",
      },
      {
        name: "active categories",
        count: await prisma.category.count({ where: { vendorId, isActive: true } }),
        expect: "zero",
      },
      {
        name: "inventory rows whose stockMode is not UNKNOWN",
        count: await prisma.inventory.count({ where: { vendorId, NOT: { stockMode: "UNKNOWN" } } }),
        expect: "zero",
      },
      {
        name: "inventory rows with a non-zero quantity",
        count: await prisma.inventory.count({ where: { vendorId, NOT: { quantity: 0 } } }),
        expect: "zero",
      },
    ];

    let failed = 0;
    for (const check of checks) {
      const ok = check.expect === "zero" ? check.count === 0 : check.count > 0;
      if (!ok) failed += 1;
      console.log(`${ok ? "ok  " : "FAIL"}  ${check.name}: ${check.count}`);
    }
    process.exitCode = failed === 0 ? 0 : 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
