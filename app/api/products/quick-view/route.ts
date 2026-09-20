import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getProductRepository } from "@/lib/products-service";
import { getReviewRepository } from "@/lib/reviews-service";
import { getAuth } from "@/lib/auth";
import { getEnv } from "@/lib/config";
import { getCurrentVendorIdOrNull } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "Missing product slug" }, { status: 400 });
  }

  const vendorId = await getCurrentVendorIdOrNull();
  if (!vendorId) {
    return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
  }

  const product = await getProductRepository().getBySlug(slug);
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const { CDN_BASE_URL } = getEnv();
  const requestHeaders = await headers();
  const session = await (await getAuth()).api.getSession({ headers: requestHeaders });
  const reviewRepo = getReviewRepository();

  const [reviews, existingReview] = await Promise.all([
    reviewRepo.listByProduct(product.id, 20),
    session?.user
      ? reviewRepo.getByUserAndProduct(session.user.id, product.id)
      : Promise.resolve(null),
  ]);

  return NextResponse.json({
    product,
    reviews,
    existingReview,
    currentUser: session?.user ? { id: session.user.id, name: session.user.name } : null,
    cdnBaseUrl: CDN_BASE_URL ?? "",
  });
}
