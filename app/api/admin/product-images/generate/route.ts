import { requireVendorRole } from "@/lib/auth-rbac";
import { runProductImagePipeline } from "@/lib/product-image-pipeline";
import { saveGeneratedProductImage } from "@/lib/repositories/products";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as any;
    const { productId, productName } = body;
    if (!productId || !productName) {
      return NextResponse.json({ error: "Missing productId or productName" }, { status: 400 });
    }

    const result = await runProductImagePipeline(productId, productName, null);
    if (!result) {
      return NextResponse.json({ error: "Failed to fetch or generate image" }, { status: 500 });
    }

    await saveGeneratedProductImage(
      auth.vendorId,
      productId,
      result.imageKey,
      productName,
      result.needsReview,
    );

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Image generation error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
