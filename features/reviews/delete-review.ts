"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getAuth } from "@/lib/auth";
import { getReviewRepository } from "@/lib/reviews-service";

/** Deleting another user's review is a silent no-op — see ReviewRepository.delete()'s ownership check. */
export async function deleteReview(formData: FormData): Promise<void> {
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Must be signed in to delete a review");
  }

  const reviewId = String(formData.get("reviewId") ?? "");
  const productSlug = String(formData.get("productSlug") ?? "");
  if (!reviewId || !productSlug) {
    throw new Error("Missing review");
  }

  await getReviewRepository().delete(reviewId, session.user.id);
  revalidatePath(`/products/${productSlug}`);
}
