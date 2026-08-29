import { config } from "dotenv";
config();
import { getPrisma } from "../lib/db";

async function run() {
  const prisma = getPrisma();
  let bad = 0;

  const inv = await prisma.inventory.count({ where: { quantity: { lt: 0 } } });
  if (inv > 0) { console.error(`Found ${inv} Inventory rows with quantity < 0`); bad++; }

  const prodBase = await prisma.product.count({ where: { basePrice: { lt: 0 } } });
  if (prodBase > 0) { console.error(`Found ${prodBase} Product rows with basePrice < 0`); bad++; }

  const prodOrig = await prisma.product.count({ where: { originalPrice: { lt: 0 } } });
  if (prodOrig > 0) { console.error(`Found ${prodOrig} Product rows with originalPrice < 0`); bad++; }

  const pTierQty = await prisma.productPriceTier.count({ where: { groupQuantity: { lt: 2 } } });
  if (pTierQty > 0) { console.error(`Found ${pTierQty} ProductPriceTier rows with groupQuantity < 2`); bad++; }

  const pTierPrice = await prisma.productPriceTier.count({ where: { groupPricePence: { lt: 0 } } });
  if (pTierPrice > 0) { console.error(`Found ${pTierPrice} ProductPriceTier rows with groupPricePence < 0`); bad++; }

  const oiQty = await prisma.orderItem.count({ where: { quantity: { lte: 0 } } });
  if (oiQty > 0) { console.error(`Found ${oiQty} OrderItem rows with quantity <= 0`); bad++; }

  const oiPrice = await prisma.orderItem.count({ where: { unitPricePence: { lt: 0 } } });
  if (oiPrice > 0) { console.error(`Found ${oiPrice} OrderItem rows with unitPricePence < 0`); bad++; }

  const payAmt = await prisma.payment.count({ where: { amountPence: { lt: 0 } } });
  if (payAmt > 0) { console.error(`Found ${payAmt} Payment rows with amountPence < 0`); bad++; }

  // Check #432 Slice 1: Product -> Category cross-tenant
  const crossProdCats = await prisma.$queryRaw`
    SELECT p.id as product_id, p."vendorId" as product_vendor, c.id as category_id, c."vendorId" as category_vendor
    FROM "Product" p
    JOIN "Category" c ON p."categoryId" = c.id
    WHERE p."vendorId" != c."vendorId";
  `;
  if ((crossProdCats as any[]).length > 0) {
    console.error(`Found ${(crossProdCats as any[]).length} Product->Category cross-vendor rows!`);
    console.error(crossProdCats);
    bad++;
  }

  if (bad === 0) {
    console.log("Audit passed! No violating rows found.");
  } else {
    console.error("Audit failed.");
    process.exit(1);
  }
}

run().catch(console.error);
