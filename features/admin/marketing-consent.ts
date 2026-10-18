"use server";

import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getMarketingConsentRepository } from "@/lib/marketing-consent-service";
import {
  MARKETING_CONSENT_ENABLED_FIELD,
  type MarketingConsentSettingsFormState,
} from "@/lib/marketing-consent-settings-form";

/**
 * The marketing-consent switch (#1134) — the write `/staff/storefront`'s Marketing consent section
 * makes.
 *
 * ONLY ASYNC FUNCTIONS MAY BE EXPORTED FROM THIS FILE (#159); the form state lives in
 * `lib/marketing-consent-settings-form.ts`.
 *
 * `("ADMIN")` alone, matching the page. The write is keyed on the authenticated ADMIN's own vendor
 * (`auth.vendorId`), so it can never touch another vendor's config row.
 */
export async function saveMarketingConsentSettings(
  _prev: MarketingConsentSettingsFormState,
  formData: FormData,
): Promise<MarketingConsentSettingsFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    return { error: "You don't have permission to change this.", saved: false };
  }

  const changed = await getMarketingConsentRepository().setEnabled(
    auth.vendorId,
    formData.get(MARKETING_CONSENT_ENABLED_FIELD) === "on",
  );
  if (changed === 0) {
    return { error: "This store has no settings record yet.", saved: false };
  }

  revalidatePath("/staff/storefront");
  return { error: null, saved: true };
}
