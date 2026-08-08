-- ADR-004 slice 4 follow-up — per-vendor header search-box placeholder copy.
-- Additive, nullable column; no backfill (the read path falls back to a generic default,
-- and the seed sets per-vendor values).
ALTER TABLE "VendorConfig" ADD COLUMN "searchPlaceholder" TEXT;
