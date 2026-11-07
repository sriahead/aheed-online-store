import "dotenv/config";
import * as fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { parseEnvFile } from "./lib/env-file";

function resolveConnectionString(): string {
  const envFlagIndex = process.argv.indexOf("--env-file");
  if (envFlagIndex !== -1 && process.argv[envFlagIndex + 1]) {
    const envVars = parseEnvFile(process.argv[envFlagIndex + 1]);
    const conn = envVars.DIRECT_URL || envVars.DATABASE_URL;
    if (conn) return conn;
  }
  return process.env.DIRECT_URL || process.env.DATABASE_URL || "";
}

const connectionString = resolveConnectionString();
if (!connectionString) {
  console.error("Neither DIRECT_URL nor DATABASE_URL is set in environment or env-file.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });

async function exportVatReview() {
  const batchFlagIndex = process.argv.indexOf("--batch");
  const batchId =
    batchFlagIndex !== -1
      ? process.argv[batchFlagIndex + 1]
      : process.argv[2] && !process.argv[2].startsWith("--")
        ? process.argv[2]
        : "aheed-batch-2";

  const vendorFlagIndex = process.argv.indexOf("--vendor-id");
  const vendorId =
    vendorFlagIndex !== -1
      ? process.argv[vendorFlagIndex + 1]
      : "a4ed0000-0000-4000-a000-000000000001";

  const items = await prisma.product.findMany({
    where: {
      vendorId,
      importBatchId: batchId,
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

  const outFile = `${outDir}/vat-review-${batchId}.json`;
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        batchId,
        count: items.length,
        generatedAt: new Date().toISOString(),
        items,
      },
      null,
      2,
    ),
  );

  console.log(`VAT review export written to ${outFile}: ${items.length} items`);
  await prisma.$disconnect();
}

exportVatReview().catch((err) => {
  console.error(err);
  process.exit(1);
});
