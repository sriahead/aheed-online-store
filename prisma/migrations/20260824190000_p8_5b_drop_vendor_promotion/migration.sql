-- P8.5b (#346) — drop VendorPromotion.
--
-- The model is SUPERSEDED, not merely unused. It was one generic banner (title,
-- description, optional image, link) created in P7.5c+f (#233) to replace a
-- hardcoded PromoSlider. It never gained a staff UI, so its rows stayed
-- seed-only and no vendor could ever edit a campaign. The homepage hero is now
-- the department hero, generated from real categories and real product prices,
-- so it cannot advertise something the catalogue does not have — which is the
-- failure #233 itself existed to stop. Richer, purpose-built merchandising
-- surfaces follow in P8.5c (bundles, #347) and P8.5d (multi-buy tiers, #348).
--
-- This DROP is generated from the schema declaration's removal, not
-- hand-authored DDL for something Prisma cannot express: schema.prisma remains
-- the complete description of the database afterwards.
--
-- Data loss is intended and bounded: the table held only seeded marketing copy
-- for the two demo vendors. No other table references it — the only foreign key
-- pointed OUT of it, at Vendor.

-- DropForeignKey
ALTER TABLE "VendorPromotion" DROP CONSTRAINT "VendorPromotion_vendorId_fkey";

-- DropTable
DROP TABLE "VendorPromotion";
