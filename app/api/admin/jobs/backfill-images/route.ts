import { requireVendorRole } from "@/lib/auth-rbac";
import { runProductImagePipeline } from "@/lib/product-image-pipeline";
import { getProductsWithoutImages, saveGeneratedProductImage } from "@/lib/repositories/products";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  // Find up to 10 products with NO images
  const products = await getProductsWithoutImages(auth.vendorId, 10);

  if (products.length === 0) {
    return NextResponse.json({ message: "No products need backfill", processed: 0 });
  }

  let processed = 0;
  for (const product of products) {
    try {
      const result = await runProductImagePipeline(product.id, product.name, null);
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
