"use server";

import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getAssistantService } from "@/lib/assistant-service";
import {
  ASSISTANT_ENABLED_FIELD,
  type AssistantSettingsFormState,
} from "@/lib/assistant-settings-form";

/**
 * The help assistant's switch (#1015) — the one write `/staff/assistant` makes.
 *
 * ONLY ASYNC FUNCTIONS MAY BE EXPORTED FROM THIS FILE (#159); the form state lives in
 * `lib/assistant-settings-form.ts`.
 *
 * `("ADMIN")` alone, matching the page: what the storefront offers shoppers is a storefront
 * setting, the side of #737's split `/staff/faqs` and `/staff/storefront` sit on. The write is
 * keyed on the current vendor's own config row, so it can never touch another vendor's.
 */
export async function saveAssistantSettings(
  _prev: AssistantSettingsFormState,
  formData: FormData,
): Promise<AssistantSettingsFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    return { error: "You don't have permission to change this.", saved: false };
  }

  const changed = await getAssistantService().setEnabled(
    formData.get(ASSISTANT_ENABLED_FIELD) === "on",
  );
  if (changed === 0) {
    return { error: "This store has no settings record yet.", saved: false };
  }

  revalidatePath("/staff/assistant");
  return { error: null, saved: true };
}
