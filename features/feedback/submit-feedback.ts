"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getAuth } from "@/lib/auth";
import { getCurrentVendorId } from "@/lib/tenant";
import { getCustomerFeedbackRepository } from "@/lib/customer-feedback-service";
import { checkFeedbackWriteRateLimitForVendor } from "@/lib/customer-feedback-rate-limit-service";
import { parseRating } from "@/features/reviews/validate-rating";
import { parseComment, toDisplayAuthorName, type FeedbackFormState } from "./validate-feedback";

/**
 * Customer feedback submission (P9.2, #818).
 *
 * ONLY ASYNC FUNCTIONS MAY BE EXPORTED FROM THIS FILE — not even a plain constant. It is
 * enforced at runtime, so a stray `export const` leaves `build`, `typecheck` and `test`
 * green while every action here 500s for every caller. `./validate-feedback.ts` holds the
 * pure helpers for that reason.
 *
 * Session-gated Server Action behind a plain `<form>`, the same progressive-enhancement
 * shape as `features/reviews/submit-review.ts`. The session check runs unconditionally
 * before any write, even though the page already hides the form from logged-out visitors —
 * a hidden form is not an access control.
 */

export async function submitFeedback(
  _prev: FeedbackFormState,
  formData: FormData,
): Promise<FeedbackFormState> {
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Please sign in to leave feedback.", success: false };
  }

  const rating = parseRating(String(formData.get("rating") ?? ""));
  if (rating === null) {
    return { error: "Choose a rating from 1 to 5 stars.", success: false };
  }

  const comment = parseComment(String(formData.get("comment") ?? ""));
  if (!comment.ok) {
    return { error: comment.error, success: false };
  }

  const vendorId = await getCurrentVendorId();
  const repo = getCustomerFeedbackRepository();

  // Read the existing row first: the throttle needs its `submittedAt` for the per-row edit
  // interval, and reading it here keeps the rate limiter a pure counter over its own table.
  const existing = await repo.getOwn(session.user.id);

  const limit = await checkFeedbackWriteRateLimitForVendor(
    vendorId,
    await resolveClientIp(),
    existing?.submittedAt ?? null,
  );
  if (!limit.allowed) {
    // Deliberately vague: a refusal that names the window and the threshold is a refusal
    // that tells an abuser exactly how to pace themselves.
    return {
      error:
        limit.reason === "too-soon-after-last-edit"
          ? "You've just updated your feedback. Please wait a moment before changing it again."
          : "Too many attempts. Please try again later.",
      success: false,
    };
  }

  // Computed server-side from this customer's OWN orders. A `verifiedPurchase` field in the
  // submitted form data is never read — the badge is a claim the platform makes, not one the
  // submitter makes about themselves (#818 R15).
  const verifiedPurchase = await repo.customerHasCompletedOrder(session.user.id);

  await repo.upsertOwn(session.user.id, {
    authorName: toDisplayAuthorName(session.user.name ?? ""),
    rating,
    comment: comment.value,
    verifiedPurchase,
    ipHash: limit.ipHash,
  });

  // The landing page renders approved feedback, and an edit to an approved row un-publishes
  // it, so both surfaces can change on any successful write.
  revalidatePath("/feedback");
  revalidatePath("/");

  return { error: null, success: true };
}

/**
 * Cloudflare always sets CF-Connecting-IP on a real request; x-forwarded-for is the local
 * and proxied fallback. Same resolution as `app/(storefront)/orders/lookup/page.tsx`.
 */
async function resolveClientIp(): Promise<string> {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
