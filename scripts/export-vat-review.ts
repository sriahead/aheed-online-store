import "dotenv/config";
import * as fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });

async function exportVatReview() {
  const items = await prisma.product.findMany({
    where: {
      vendorId: "a4ed0000-0000-4000-a000-000000000001",
      importBatchId: "aheed-batch-1",
      vatNeedsReview: true,
    },
    select: {
      plu: true,
      name: true,
      basePrice: true,
      originalVatRate: true,
      suggestedVatRate: true,
      vatReviewReason: true,
      importSourceRow: true,
    },
    orderBy: { importSourceRow: "asc" },
  });

  const outDir = ".import-reports";
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(
    `${outDir}/vat-review-batch-1.json`,
    JSON.stringify(
      {
        batchId: "aheed-batch-1",
        count: items.length,
        generatedAt: new Date().toISOString(),
        items,
      },
      null,
      2
    )
  );

  console.log(`VAT review export written: ${items.length} items`);
  await prisma.$disconnect();
}

exportVatReview().catch((err) => {
  console.error(err);
  process.exit(1);
});
