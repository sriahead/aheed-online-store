import { requireVendorRole } from "@/lib/auth-rbac";
import { runProductImagePipeline } from "@/lib/product-image-pipeline";
import { getProductsWithoutImages, saveGeneratedProductImage } from "@/lib/products-service";
import { NextResponse } from "next/server";

/**
 * How many products one click fills. Deliberately small and deliberately NOT
 * raised in #502: the Aheed vendor holds 2,026 products, and every fill that
 * falls through to AI generation is a paid Workers AI call, so an uncapped run
 * is an unbounded spend started by a single button. Draining the whole
 * catalogue at this rate is impractical by design; doing it properly needs a
 * batching and cost decision of its own.
 */
const BACKFILL_BATCH = 10;

export async function POST(request: Request) {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  /**
   * #502 — the operator's per-run switch for Open Food Facts.
   *
   * Defaults to ON when the body is absent or unparseable, so the endpoint
   * behaves exactly as it did before this slice for any caller that doesn't
   * send one. Only an explicit `false` turns the source off.
   */
  let useOpenFoodFacts = true;
  try {
    const body = (await request.json()) as { useOpenFoodFacts?: unknown };
    if (body?.useOpenFoodFacts === false) useOpenFoodFacts = false;
  } catch {
    // No body, or not JSON — keep the default.
  }

  // Products with no image at all, or carrying only a seeded placeholder (#502).
  const products = await getProductsWithoutImages(auth.vendorId, BACKFILL_BATCH);

  if (products.length === 0) {
    return NextResponse.json({ message: "No products need backfill", processed: 0 });
  }

  let processed = 0;
  for (const product of products) {
    try {
      const result = await runProductImagePipeline(product.id, product.name, null, {
        useOpenFoodFacts,
      });
      if (result) {
        await saveGeneratedProductImage(
          auth.vendorId,
          product.id,
          result.imageKey,
          product.name,
          result.needsReview,
        );
        processed++;
      }
    } catch (err) {
      console.error(`Failed to backfill image for product ${product.id}`, err);
    }
  }

  return NextResponse.json({
    message: "Backfill complete",
    processed,
    totalFound: products.length,
  });
}
