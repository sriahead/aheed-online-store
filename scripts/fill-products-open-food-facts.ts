import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { parseEnvFile } from "./lib/env-file";
import { getProductMetadataService } from "../lib/product-metadata";
import { getStorage } from "../lib/storage";
import { buildProductImageKey } from "../lib/product-image";
import { saveGeneratedProductImage } from "../lib/repositories/products";

function flagValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const envPath = flagValue("--env-file") || "secrets/merqify-production.vars";
  const vars = parseEnvFile(envPath);
  for (const [k, v] of Object.entries(vars)) {
    process.env[k] = v;
  }

  const directUrl = vars.DIRECT_URL;
  if (!directUrl) throw new Error(`Missing DIRECT_URL in ${envPath}`);

  const rawLimit = flagValue("--limit");
  const limit = rawLimit ? Number.parseInt(rawLimit, 10) : 100;

  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: directUrl }) });
  const vendorId = "a4ed0000-0000-4000-a000-000000000001";

  const totalWithoutImages = await prisma.product.count({
    where: { vendorId, images: { none: {} } },
  });

  console.log(`Open Food Facts Lookup (NO AI)`);
  console.log(`Environment: ${envPath}`);
  console.log(`Total products missing images in DB: ${totalWithoutImages}`);
  console.log(`Batch limit for this run: ${limit}`);
  console.log("");

  const products = await prisma.product.findMany({
    where: { vendorId, images: { none: {} } },
    select: { id: true, name: true, slug: true, barcode: true, plu: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const metadataService = getProductMetadataService();
  const storage = getStorage();

  let matched = 0;
  let unmatched = 0;
  let errors = 0;

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    console.log(`[${i + 1}/${products.length}] Checking: "${product.name}" (PLU: ${product.plu || "none"})...`);

    try {
      // 1. Query Open Food Facts (barcode if available, otherwise strict text search)
      const offImageUrl = await metadataService.fetchImageUrl(product.name, product.barcode);

      if (!offImageUrl) {
        console.log(`  - No Open Food Facts match found (leaving for AI step)`);
        unmatched++;
        // Respectful rate limit to Open Food Facts API (300ms)
        await sleep(300);
        continue;
      }

      console.log(`  ✓ Found OFF match: ${offImageUrl}`);

      // 2. Fetch the image bytes from Open Food Facts
      const imgRes = await fetch(offImageUrl, {
        headers: { "User-Agent": "AheedFoodCentre/1.0 (contact@aheed.merqify.com)" },
      });

      if (!imgRes.ok) {
        console.warn(`  ! Failed to download image from OFF: ${imgRes.statusText}`);
        unmatched++;
        await sleep(300);
        continue;
      }

      const contentType = imgRes.headers.get("content-type") || "image/jpeg";
      const buffer = await imgRes.arrayBuffer();

      // 3. Upload to our R2 storage
      const storageKey = buildProductImageKey(product.id, contentType);
      await storage.putObject(storageKey, buffer, contentType);

      // 4. Save to ProductImage ledger
      await saveGeneratedProductImage(
        prisma as any,
        vendorId,
        product.id,
        storageKey,
        product.name,
        false, // needsReview: false
        "OPEN_FOOD_FACTS",
      );

      console.log(`  ✓ Saved to R2 & DB: ${storageKey}`);
      matched++;

      // Polite throttle
      await sleep(300);
    } catch (err) {
      console.error(`  ✗ Error processing ${product.name}:`, err);
      errors++;
      await sleep(300);
    }
  }

  const remainingWithoutImages = totalWithoutImages - matched;

  console.log("\n=======================================================");
  console.log(`Open Food Facts Batch Complete:`);
  console.log(`- Scanned in this run: ${products.length}`);
  console.log(`- Matched & Saved from Open Food Facts: ${matched}`);
  console.log(`- No Open Food Facts match (candidate for AI): ${unmatched}`);
  console.log(`- Errors: ${errors}`);
  console.log(`- Total products still missing images in store: ${remainingWithoutImages}`);
  console.log("=======================================================\n");

  await prisma.$disconnect();
}

main().catch(console.error);
