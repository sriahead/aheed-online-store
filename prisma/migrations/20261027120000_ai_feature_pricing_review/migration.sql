-- HAND-AUTHORED per CLAUDE.md (#895: prisma migrate dev refuses on the dev database because of historical
-- checksum drift, and its only offer is a destructive reset). Copies Prisma's own AlterEnum form.
-- #1309: meter the platform pricing refresh's Workers AI calls as their own feature.

-- AlterEnum
ALTER TYPE "AiFeature" ADD VALUE 'PRICING_REVIEW';
