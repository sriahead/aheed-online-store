import "dotenv/config"; // load .env in THIS process, regardless of how it's launched
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { AHEED_FOOTER_DEFAULTS, AHEED_VENDOR_ID, seedFooterDefaults } from "../prisma/seed-footer";

/**
 * #1060 R22a — seed ONLY the storefront footer defaults for Aheed (weekly hours, missing contact /
 * legal values, badges), fill-only, against the database in `DIRECT_URL`.
 *
 * Why not `npm run db:seed`: the full seed's `upsertVendorSatellites` writes the whole
 * `VendorBranding` and `VendorConfig` rows back to seed values, and re-uploads placeholder product
 * images. On a database an admin has customised (staging), that reverts their edits. This script
 * runs the one fill-only step and nothing else — see `prisma/seed-footer.ts` for exactly what it
 * may write.
 *
 * Run it only AFTER the #1060 migration has applied to the target database. For staging:
 *
 *   DIRECT_URL=<staging direct URL from secrets/staging.vars> npx tsx scripts/seed-footer-defaults.ts
 *
 * A Node script against `DIRECT_URL`, like the seed — never the Worker.
 */

async function main() {
  const connectionString = process.env.DIRECT_URL;
  if (!connectionString) {
    console.error("DIRECT_URL is empty — set it to the target database's direct (non-pooled) URL.");
    process.exit(1);
  }
  const host = new URL(connectionString).host;
  console.log(`target database host: ${host}`);

  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { id: AHEED_VENDOR_ID },
      select: { name: true },
    });
    if (!vendor) {
      console.error(`Vendor ${AHEED_VENDOR_ID} (Aheed) not found on ${host} — nothing written.`);
      process.exitCode = 1;
      return;
    }
    await seedFooterDefaults(prisma, AHEED_VENDOR_ID, AHEED_FOOTER_DEFAULTS);
    console.log(`done: footer defaults for ${vendor.name} on ${host}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
