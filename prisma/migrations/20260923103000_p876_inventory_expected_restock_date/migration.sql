-- #876 — expected restock date. Additive and nullable: every existing Inventory row keeps
-- working with no date. Holds the UTC midnight of a vendor-local calendar day (see schema.prisma).
-- Generated with `prisma migrate diff` between the previous and new datamodels and read before
-- committing: it contains no DROP, so the hand-authored pg_trgm indexes are untouched.

-- AlterTable
ALTER TABLE "Inventory" ADD COLUMN     "expectedRestockDate" TIMESTAMP(3);
