import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { AHEED_VENDOR_ID } from "./seed-footer";

/**
 * #1233 — fill-only seeding for Aheed's WhatsApp community invite link and QR code object key.
 *
 * Mirrors `prisma/seed-footer.ts`'s fill-only posture: both columns are editable by a store admin
 * on `/staff/storefront`, so a re-run must never overwrite a value an admin has since changed or
 * cleared, and only writes a column while it is `null`.
 */
export const AHEED_WHATSAPP_COMMUNITY_URL = "https://chat.whatsapp.com/FTgLVoelRw7262i0OvAIzS";
export const AHEED_WHATSAPP_QR_KEY = `vendors/${AHEED_VENDOR_ID}/whatsapp-qr.png`;

export interface WhatsappCommunityDefaults {
  whatsappCommunityUrl: string;
  whatsappCommunityQrKey: string;
}

export const AHEED_WHATSAPP_COMMUNITY_DEFAULTS: WhatsappCommunityDefaults = {
  whatsappCommunityUrl: AHEED_WHATSAPP_COMMUNITY_URL,
  whatsappCommunityQrKey: AHEED_WHATSAPP_QR_KEY,
};

export async function seedWhatsappCommunityDefaults(
  prisma: PrismaClient,
  vendorId: string,
  d: WhatsappCommunityDefaults = AHEED_WHATSAPP_COMMUNITY_DEFAULTS,
  uploadQr?: (key: string, body: Uint8Array, contentType: string) => Promise<void>,
): Promise<void> {
  const config = await prisma.vendorConfig.findUnique({
    where: { vendorId },
    select: { whatsappCommunityUrl: true, whatsappCommunityQrKey: true },
  });
  if (!config) return;

  const data: { whatsappCommunityUrl?: string; whatsappCommunityQrKey?: string } = {};
  if (config.whatsappCommunityUrl === null) {
    data.whatsappCommunityUrl = d.whatsappCommunityUrl;
  }
  if (config.whatsappCommunityQrKey === null) {
    if (uploadQr) {
      const qrBytes = new Uint8Array(
        readFileSync(join(import.meta.dirname, "seed-assets", "aheed-whatsapp-qr.png")),
      );
      await uploadQr(d.whatsappCommunityQrKey, qrBytes, "image/png");
    }
    data.whatsappCommunityQrKey = d.whatsappCommunityQrKey;
  }

  if (Object.keys(data).length > 0) {
    await prisma.vendorConfig.update({
      where: { vendorId },
      data,
    });
  }
  console.log(`seeded WhatsApp community defaults (fill-only) for ${vendorId}`);
}
