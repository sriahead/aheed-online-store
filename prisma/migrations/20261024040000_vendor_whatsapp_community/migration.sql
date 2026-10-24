-- #1233 — hand-authored per CLAUDE.md (#895: prisma migrate dev refuses on shared dev DB due to historical checksum drift).
-- Additive nullable columns on VendorConfig for the per-vendor WhatsApp community invite link and QR code object key.

-- AlterTable
ALTER TABLE "VendorConfig" ADD COLUMN     "whatsappCommunityUrl" TEXT,
ADD COLUMN     "whatsappCommunityQrKey" TEXT;
