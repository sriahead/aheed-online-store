"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getAuth } from "@/lib/auth";
import { getReviewRepository } from "@/lib/reviews-service";
import { parseRating } from "./validate-rating";

/**
 * Session-gated Server Action behind a plain <form> (see ReviewForm.tsx) — no
 * client component needed, same progressive-enhancement pattern P2's GET
 * forms used. The session check runs unconditionally before any write, even
 * though the UI already hides the form from logged-out visitors.
 */
export async function submitReview(formData: FormData): Promise<void> {
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Must be signed in to leave a review");
  }

  const rating = parseRating(String(formData.get("rating") ?? ""));
  if (rating === null) {
    throw new Error("Invalid rating");
  }

  const productId = String(formData.get("productId") ?? "");
  const productSlug = String(formData.get("productSlug") ?? "");
  if (!productId || !productSlug) {
    throw new Error("Missing product");
  }

  const commentRaw = String(formData.get("comment") ?? "").trim();

  await getReviewRepository().upsert(
    session.user.id,
    productId,
    rating,
    commentRaw ? commentRaw : null,
  );
  revalidatePath(`/products/${productSlug}`);
}
