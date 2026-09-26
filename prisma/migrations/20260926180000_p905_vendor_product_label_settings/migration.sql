-- #905 — per-vendor product label settings and store description. Additive only.

-- AlterTable
ALTER TABLE "VendorConfig" ADD COLUMN     "showFreshLabel" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showGlutenFreeLabel" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showHalalLabel" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showHmcCertification" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showOrganicLabel" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showVegetarianLabel" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "storeDescription" TEXT;

-- Backfill from each vendor's own products (active and inactive): a label is switched on exactly
-- when at least one of that vendor's products already carries it, so no vendor loses a label its
-- catalogue uses. Keyed on data only — no vendor is named here.
UPDATE "VendorConfig" AS vc SET
  "showHalalLabel" = EXISTS (
    SELECT 1 FROM "Product" p WHERE p."vendorId" = vc."vendorId" AND p."isHalal" = true
  ),
  "showFreshLabel" = EXISTS (
    SELECT 1 FROM "Product" p WHERE p."vendorId" = vc."vendorId" AND p."isFresh" = true
  ),
  "showOrganicLabel" = EXISTS (
    SELECT 1 FROM "Product" p WHERE p."vendorId" = vc."vendorId" AND p."isOrganic" = true
  ),
  "showVegetarianLabel" = EXISTS (
    SELECT 1 FROM "Product" p WHERE p."vendorId" = vc."vendorId" AND p."isVegetarian" = true
  ),
  "showGlutenFreeLabel" = EXISTS (
    SELECT 1 FROM "Product" p WHERE p."vendorId" = vc."vendorId" AND p."isGlutenFree" = true
  );

-- HMC certification is only offered while Halal is, so it follows the halal result above.
UPDATE "VendorConfig" AS vc SET
  "showHmcCertification" = vc."showHalalLabel" AND EXISTS (
    SELECT 1 FROM "Product" p WHERE p."vendorId" = vc."vendorId" AND p."isHmcCertified" = true
  );
