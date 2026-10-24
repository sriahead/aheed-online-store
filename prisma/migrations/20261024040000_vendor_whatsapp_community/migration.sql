-- #1233 — hand-authored per CLAUDE.md (#895: prisma migrate dev refuses on shared dev DB due to historical checksum drift).
-- Additive nullable columns on VendorConfig for the per-vendor WhatsApp community invite link and QR code object key.

-- AlterTable
ALTER TABLE "VendorConfig" ADD COLUMN     "whatsappCommunityUrl" TEXT,
ADD COLUMN     "whatsappCommunityQrKey" TEXT;

-- Backfill Aheed Food Centre's WhatsApp community group invite URL and QR code object key (fill-only)
UPDATE "VendorConfig"
SET
  "whatsappCommunityUrl" = COALESCE("whatsappCommunityUrl", 'https://chat.whatsapp.com/FTgLVoelRw7262i0OvAIzS'),
  "whatsappCommunityQrKey" = COALESCE("whatsappCommunityQrKey", 'vendors/a4ed0000-0000-4000-a000-000000000001/whatsapp-qr.png')
WHERE "vendorId" = 'a4ed0000-0000-4000-a000-000000000001';
