-- The three DropIndex statements Prisma generated here for
-- "Order_guestEmail_trgm_idx", "Order_orderNumber_trgm_idx" and
-- "User_email_trgm_idx" were removed by hand (CLAUDE.md, "Schema rules" — GAP-011).
-- Those are hand-authored pg_trgm indexes from
-- 20260820143949_p7_5de_order_search_trigram that Prisma's schema language cannot
-- express, so an unrelated model/column addition (NetContentUnit and Product's
-- three new columns, here) reads them as drift on every migration since #508.
-- Keep them; this migration only adds NetContentUnit and Product.netContentAmount /
-- Product.netContentUnit / Product.unitPricePencePerBaseUnit.

-- CreateEnum
CREATE TYPE "NetContentUnit" AS ENUM ('GRAM', 'KILOGRAM', 'MILLILITRE', 'LITRE', 'EACH');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "netContentAmount" INTEGER,
ADD COLUMN     "netContentUnit" "NetContentUnit",
ADD COLUMN     "unitPricePencePerBaseUnit" INTEGER;

-- CreateIndex
CREATE INDEX "Product_vendorId_isActive_unitPricePencePerBaseUnit_idx" ON "Product"("vendorId", "isActive", "unitPricePencePerBaseUnit");
