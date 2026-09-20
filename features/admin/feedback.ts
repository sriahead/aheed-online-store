"use server";

import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getCustomerFeedbackRepository } from "@/lib/customer-feedback-service";

/**
 * Staff moderation of customer feedback (P9.2, #818).
 *
 * ONLY ASYNC FUNCTIONS MAY BE EXPORTED FROM THIS FILE — enforced at runtime, so a stray
 * `export const` leaves the build green while every action here 500s for every caller.
 *
 * WHAT IS DELIBERATELY ABSENT. There is no action here that creates feedback, and none that
 * changes a row's `rating`, `comment` or `authorName`. Staff moderate; they do not write or
 * edit a customer's words. That is not merely unimplemented — the repository exposes no
 * function capable of it (`lib/repositories/customer-feedback.ts`), so adding such an action
 * later would be a visible change to two layers rather than a quiet one to this file.
 *
 * `("STAFF", "ADMIN")` — both, not `"STAFF"` alone. `requireVendorRole` matches the caller's
 * membership role against the allowed list exactly, so a single `"STAFF"` argument would
 * refuse a vendor ADMIN, who can do strictly more. Moderating the queue is day-to-day shop
 * operations, which #737 scoped to STAFF, and an admin can do it too.
 *
 * Each action runs the check ITSELF rather than trusting the page that rendered the form,
 * matching `features/admin/catalogue.ts`. `requireVendorRole` resolves the vendor, so
 * nothing here trusts a vendor id from the form.
 */

export async function moderateFeedback(formData: FormData): Promise<void> {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) return;

  const feedbackId = String(formData.get("feedbackId") ?? "");
  const intent = String(formData.get("intent") ?? "");
  const noteRaw = String(formData.get("moderationNote") ?? "").trim();

  const status =
    intent === "approve"
      ? "APPROVED"
      : intent === "reject"
        ? "REJECTED"
        : intent === "unapprove"
          ? "PENDING"
          : null;

  if (!feedbackId || status === null) return;

  await getCustomerFeedbackRepository().moderate(
    feedbackId,
    status,
    auth.user.id,
    noteRaw === "" ? null : noteRaw,
  );

  revalidatePath("/staff/feedback");
  // Approving publishes, and rejecting or un-approving un-publishes, so the storefront's
  // rendered set changes on every one of these.
  revalidatePath("/");
}

export async function approveFeedbackBulk(formData: FormData): Promise<void> {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) return;

  const feedbackIds = formData.getAll("feedbackId").map(String).filter(Boolean);
  if (feedbackIds.length === 0) return;

  await getCustomerFeedbackRepository().approveMany(feedbackIds, auth.user.id);

  revalidatePath("/staff/feedback");
  revalidatePath("/");
}
