-- P3a — cart foundation (specs/2026-08-09-p3a-cart-foundation/, issue #93).
--
-- Purely additive: two new tables plus three defaulted/nullable VendorConfig
-- columns. No existing column is altered and no data backfill is required.
--
-- Note on the partial-looking uniques: Postgres treats NULLs as distinct in a
-- unique index, so ("vendorId","userId") permits many rows with a NULL userId
-- (i.e. many guest carts per vendor) while still allowing at most one cart per
-- (vendor, user). Same for ("vendorId","guestToken"). That is the intended
-- behaviour — "exactly one of userId/guestToken" is enforced in the repository.

-- Delivery rules become vendor data (the design mockup hardcoded a £30 threshold).
ALTER TABLE "VendorConfig"
    ADD COLUMN "deliveryFeePence" INTEGER NOT NULL DEFAULT 349,
    ADD COLUMN "freeDeliveryThresholdPence" INTEGER,
    ADD COLUMN "minimumOrderPence" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Cart" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "userId" TEXT,
    "guestToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Cart_vendorId_idx" ON "Cart"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_vendorId_userId_key" ON "Cart"("vendorId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_vendorId_guestToken_key" ON "Cart"("vendorId", "guestToken");

-- CreateIndex
CREATE INDEX "CartItem_cartId_idx" ON "CartItem"("cartId");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_productId_key" ON "CartItem"("cartId", "productId");

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
