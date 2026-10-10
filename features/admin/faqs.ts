"use server";

import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getVendorFaqRepository } from "@/lib/vendor-faqs-service";
import {
  parseFaqSortOrder,
  parseVendorFaq,
  QUESTION_FIELD,
  type VendorFaqFormState,
} from "@/lib/faq-form";

/**
 * The per-vendor approved-answer corpus's write paths (P10, #1012).
 *
 * ONLY ASYNC FUNCTIONS MAY BE EXPORTED FROM THIS FILE. The form-state type, every parser and every
 * length cap live in `lib/faq-form.ts` for that reason: this rule is enforced at RUNTIME, so a
 * single exported constant here would 500 every action below for every caller while `lint`,
 * `typecheck`, `test` and `build` all stayed green (#159).
 *
 * `("ADMIN")` alone, not `("STAFF", "ADMIN")`: an answer published under the store's name is a
 * claim the store is making, which is the split #737 drew between day-to-day operations and
 * storefront settings. The page these serve, `/staff/faqs`, carries the same gate.
 *
 * NO ANSWER TEXT IS AUTHORED HERE. Every row is the vendor's own words; `#1021` tracks the content.
 */

export async function saveFaq(
  _prev: VendorFaqFormState,
  formData: FormData,
): Promise<VendorFaqFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    return { error: "You don't have permission to change this.", field: null, saved: false };
  }

  const parsed = parseVendorFaq({
    question: String(formData.get("question") ?? ""),
    answer: String(formData.get("answer") ?? ""),
    sortOrder: String(formData.get("sortOrder") ?? ""),
    isActive: formData.get("isActive") !== null,
  });

  if (!parsed.ok) {
    return { error: parsed.error.message, field: parsed.error.field, saved: false };
  }

  // Present = edit an existing row; absent = add a new one. The id is never trusted on its own:
  // every repository write carries `vendorId` in its `where`, so a forged id from another vendor
  // changes nothing rather than changing their row.
  const faqId = String(formData.get("faqId") ?? "").trim();
  const repository = getVendorFaqRepository();

  const result = faqId
    ? await repository.update(faqId, parsed.value)
    : await repository.create(parsed.value);

  if (!result.ok) {
    return {
      error: "You already have an answer for that question. Edit the existing one instead.",
      field: QUESTION_FIELD,
      saved: false,
    };
  }

  // An edit that matched no row means the entry was deleted, or never belonged to this vendor.
  // Reported rather than shown as success, so a stale tab cannot look like it saved.
  if ("count" in result && result.count === 0) {
    return { error: "That answer no longer exists.", field: null, saved: false };
  }

  revalidateFaqSurfaces();
  return { error: null, field: null, saved: true };
}

export async function setFaqActiveAction(formData: FormData): Promise<void> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return;

  const faqId = String(formData.get("faqId") ?? "").trim();
  if (!faqId) return;

  await getVendorFaqRepository().setActive(faqId, formData.get("isActive") !== null);

  revalidateFaqSurfaces();
}

export async function reorderFaqAction(formData: FormData): Promise<void> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return;

  const faqId = String(formData.get("faqId") ?? "").trim();
  if (!faqId) return;

  const sortOrder = parseFaqSortOrder(String(formData.get("sortOrder") ?? ""));
  if (!sortOrder.ok) return;

  await getVendorFaqRepository().reorder(faqId, sortOrder.value);

  revalidateFaqSurfaces();
}

export async function deleteFaqAction(formData: FormData): Promise<void> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return;

  const faqId = String(formData.get("faqId") ?? "").trim();
  if (!faqId) return;

  await getVendorFaqRepository().remove(faqId);

  revalidateFaqSurfaces();
}

/**
 * The two surfaces a changed answer is visible on: the editor itself and the shopper's Help Centre.
 *
 * NOT exported, which is why it may be a plain synchronous function: the async-only rule above
 * constrains this file's *exports*, not its internals. Deliberately a function rather than a
 * shared `const` array of paths — that constant would have to be exported to be shared, and
 * exporting it is the exact runtime failure the rule exists to prevent.
 */
function revalidateFaqSurfaces(): void {
  revalidatePath("/staff/faqs");
  revalidatePath("/help");
}
