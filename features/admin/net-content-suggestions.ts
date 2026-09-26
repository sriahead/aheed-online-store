"use server";

import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { parseNetContentFields } from "@/lib/catalogue-form";
import type { NetContentReviewState } from "@/lib/net-content-review-form";
import {
  rejectNetContentSuggestionForVendor,
  reviewNetContentSuggestionForVendor,
} from "@/lib/net-content-suggestions-service";

/**
 * `/staff/net-content`'s write path (#900) — the ONLY way an AI net-content suggestion reaches a
 * product, and only by a person's decision.
 *
 * ONLY ASYNC FUNCTIONS MAY BE EXPORTED FROM THIS FILE (CLAUDE.md's Server Actions rule). The form
 * state lives in lib/net-content-review-form.ts for that reason.
 *
 * The action runs `requireVendorRole("STAFF", "ADMIN")` itself: a server action is a public
 * endpoint at a stable id, so the page's own check protects the page, not this. Same one-form,
 * several-`intent`-buttons shape as `features/admin/search-synonyms.ts`'s `manageSynonym`, so a
 * row is a plain HTML form that posts with no client JS and can be driven with curl.
 */
export async function reviewNetContent(
  _prev: NetContentReviewState,
  form: FormData,
): Promise<NetContentReviewState> {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) {
    return {
      error:
        auth.status === 401
          ? "Please sign in as store staff to review net content."
          : "You don't have permission to review this store's net content.",
      notice: null,
    };
  }

  const id = String(form.get("id") ?? "").trim();
  if (id === "") return { error: "Missing suggestion.", notice: null };
  const intent = String(form.get("intent") ?? "");

  if (intent === "reject") {
    const result = await rejectNetContentSuggestionForVendor(auth.vendorId, id, auth.user.id);
    if (!result.ok) return { error: result.error, notice: null };
    revalidatePath("/staff/net-content");
    return { error: null, notice: "Rejected. The product was not changed." };
  }

  if (intent === "accept") {
    const result = await reviewNetContentSuggestionForVendor(auth.vendorId, id, auth.user.id, {
      kind: "accept",
    });
    if (!result.ok) return { error: result.error, notice: null };
    revalidateAfterWrite();
    return { error: null, notice: "Accepted and saved to the product." };
  }

  if (intent === "edit") {
    // R20 — the product form's own rules, so the queue can never store what that form refuses.
    const parsed = parseNetContentFields({
      netContentAmount: String(form.get("netContentAmount") ?? ""),
      netContentUnit: String(form.get("netContentUnit") ?? ""),
    });
    if (!parsed.ok) return { error: parsed.error.message, notice: null };
    const { netContentAmount, netContentUnit } = parsed.value;
    if (netContentAmount === null || netContentUnit === null) {
      return { error: "Enter an amount and a unit, or use Reject instead.", notice: null };
    }
    const result = await reviewNetContentSuggestionForVendor(auth.vendorId, id, auth.user.id, {
      kind: "edit",
      amount: netContentAmount,
      unit: netContentUnit,
    });
    if (!result.ok) return { error: result.error, notice: null };
    revalidateAfterWrite();
    return {
      error: null,
      notice:
        result.status === "ACCEPTED"
          ? "Saved to the product (same as the suggestion, so recorded as accepted)."
          : "Saved your corrected value to the product.",
    };
  }

  return { error: "Unknown action.", notice: null };
}

function revalidateAfterWrite() {
  revalidatePath("/staff/net-content");
  revalidatePath("/staff/products");
}
