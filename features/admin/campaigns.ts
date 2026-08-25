"use server";

import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { CAMPAIGN_FIELDS, parseCampaignForm, type CampaignFormState } from "@/lib/campaign-form";
import { saveCampaignForVendor } from "@/lib/campaigns-service";
import { readForm } from "@/lib/catalogue-form";

/**
 * Department campaign write path (P8.5e, #356) — the text-fields half of
 * `/staff/promotions`; `features/admin/campaign-image.ts` is the image half.
 *
 * ONLY ASYNC FUNCTIONS MAY BE EXPORTED FROM THIS FILE (CLAUDE.md's Server
 * Actions section — the P6b1/#159 trap). `initialCampaignFormState` lives in
 * lib/campaign-form.ts for exactly that reason.
 *
 * Runs `requireVendorRole("ADMIN")` itself, matching `saveCategory` /
 * `saveProduct` — a server action is a public endpoint at a stable id, so the
 * page's own check protects the page, not this.
 */

function refusal(status: number): CampaignFormState {
  return {
    error:
      status === 401
        ? "Please sign in as a store admin to manage this store's campaigns."
        : "You don't have permission to manage this store's campaigns.",
    field: null,
    saved: false,
  };
}

export async function saveCampaign(
  _prev: CampaignFormState,
  form: FormData,
): Promise<CampaignFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return refusal(auth.status);

  const categoryId = String(form.get("categoryId") ?? "").trim();
  if (categoryId === "") {
    return { error: "Missing department.", field: null, saved: false };
  }

  const parsed = parseCampaignForm(readForm(form, CAMPAIGN_FIELDS));
  if (!parsed.ok) {
    return { error: parsed.error.message, field: parsed.error.field, saved: false };
  }

  const result = await saveCampaignForVendor(auth.vendorId, categoryId, parsed.value);
  if (!result.ok) {
    return { error: result.error, field: result.field ?? null, saved: false };
  }

  revalidatePath("/staff/promotions");
  revalidatePath(`/staff/promotions/${categoryId}`);
  revalidatePath("/", "layout");

  return { error: null, field: null, saved: true };
}
