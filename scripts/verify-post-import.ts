import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });

async function verify() {
  const aheedId = "a4ed0000-0000-4000-a000-000000000001";
  const sriMartId = "5217a4a7-0000-4000-a000-000000000002";

  const aheedProducts = await prisma.product.count({ where: { vendorId: aheedId } });
  const aheedActive = await prisma.product.count({ where: { vendorId: aheedId, isActive: true } });
  const aheedBatch1 = await prisma.product.count({ where: { vendorId: aheedId, importBatchId: "aheed-batch-1" } });
  const aheedVatReview = await prisma.product.count({ where: { vendorId: aheedId, vatNeedsReview: true } });
  const aheedOrders = await prisma.order.count({ where: { vendorId: aheedId } });
  const aheedOrderItems = await prisma.orderItem.count({ where: { order: { vendorId: aheedId } } });

  const sriMartProducts = await prisma.product.count({ where: { vendorId: sriMartId } });
  const sriMartOrders = await prisma.order.count({ where: { vendorId: sriMartId } });

  console.log("=== VERIFICATION RESULTS ===");
  console.log("Aheed Food Centre:", {
    totalProducts: aheedProducts,
    activeProducts: aheedActive,
    batch1Products: aheedBatch1,
    vatNeedsReview: aheedVatReview,
    ordersPreserved: aheedOrders,
    orderItemsPreserved: aheedOrderItems,
  });
  console.log("SriMart (Untouched Tenant):", {
    sriMartProducts,
    sriMartOrders,
  });

  await prisma.$disconnect();
}

verify().catch((err) => {
  console.error(err);
  process.exit(1);
});
