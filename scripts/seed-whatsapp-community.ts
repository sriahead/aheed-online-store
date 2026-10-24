import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { getStorage } from "../lib/storage";
import { AHEED_VENDOR_ID } from "../prisma/seed-footer";
import {
  AHEED_WHATSAPP_COMMUNITY_DEFAULTS,
  seedWhatsappCommunityDefaults,
} from "../prisma/seed-whatsapp-community";

/**
 * #1233 — seed ONLY Aheed's WhatsApp community group invite link and QR code (fill-only) against
 * the database in `DIRECT_URL`, matching `scripts/seed-footer-defaults.ts`.
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
    await seedWhatsappCommunityDefaults(
      prisma,
      AHEED_VENDOR_ID,
      AHEED_WHATSAPP_COMMUNITY_DEFAULTS,
      async (key, body, contentType) => {
        try {
          await getStorage().putObject(key, body, contentType);
          console.log(`uploaded ${key} (${body.byteLength} bytes)`);
        } catch (err) {
          console.warn(
            `WARNING: storage upload for ${key} did not succeed (${err instanceof Error ? err.message : String(err)}) — recording key on VendorConfig anyway.`,
          );
        }
      },
    );
    console.log(`done: WhatsApp community defaults for ${vendor.name} on ${host}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
