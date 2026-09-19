"use server";

import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getVendorReviewLinkRepository } from "@/lib/vendor-review-links-service";
import { parseReviewLink, type ReviewLinkFormState } from "@/lib/review-link-form";

/**
 * Vendor-configurable outbound links to external review platforms (P9.2, #818).
 *
 * LINKS ONLY. Nothing here, and nothing anywhere in this application, fetches or displays
 * review content from an external platform — see
 * `specs/2026-09-19-p818-customer-feedback-reviews/plan.md`.
 *
 * ONLY ASYNC FUNCTIONS MAY BE EXPORTED FROM THIS FILE. The form state type and every parser
 * live in `lib/review-link-form.ts` for that reason.
 *
 * `("ADMIN")` alone, unlike the moderation actions: these are storefront settings rather
 * than day-to-day operations, which is the split #737 drew, and they live on
 * `/staff/storefront`, which is already admin-only.
 */

export async function saveReviewLink(
  _prev: ReviewLinkFormState,
  formData: FormData,
): Promise<ReviewLinkFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    return { error: "You don't have permission to change this.", field: null, saved: false };
  }

  const parsed = parseReviewLink({
    platform: String(formData.get("platform") ?? ""),
    url: String(formData.get("url") ?? ""),
    sortOrder: String(formData.get("sortOrder") ?? ""),
    isActive: formData.get("isActive") !== null,
  });

  if (!parsed.ok) {
    return { error: parsed.error.message, field: parsed.error.field, saved: false };
  }

  await getVendorReviewLinkRepository().upsert(parsed.value);

  revalidatePath("/staff/storefront");
  revalidatePath("/");

  return { error: null, field: null, saved: true };
}

export async function deleteReviewLinkAction(formData: FormData): Promise<void> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return;

  const linkId = String(formData.get("linkId") ?? "");
  if (!linkId) return;

  await getVendorReviewLinkRepository().remove(linkId);

  revalidatePath("/staff/storefront");
  revalidatePath("/");
}
