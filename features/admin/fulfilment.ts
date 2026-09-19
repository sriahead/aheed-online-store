"use server";

import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getFulfilmentAdminRepository } from "@/lib/fulfilment-slots-service";
import {
  parseExpressWindowInput,
  parseFulfilmentSettings,
  parseSlotInput,
  type FulfilmentFormState,
} from "@/lib/fulfilment-form";
import type { CatalogueWriteResult } from "@/lib/repositories/products";

/**
 * Fulfilment-scheduling admin actions (P10, #750) — the write half of /staff/fulfilment.
 *
 * Each action runs `requireVendorRole("ADMIN")` ITSELF rather than trusting the page that rendered
 * the form. A server action is a public endpoint at a stable id: anyone who has loaded the page once
 * can POST to it forever, so the page's check protects the page, not this. Same posture as
 * `features/admin/delivery-areas.ts`.
 *
 * The vendor comes from the request host via the repository facade, never from a submitted field, so
 * nothing in the form can redirect a write at another vendor's rows. The repository ALSO scopes
 * every query by `vendorId`, so a valid id belonging to another vendor removes nothing rather than
 * succeeding.
 *
 * THIS FILE EXPORTS ONLY ASYNC FUNCTIONS. A `"use server"` module may export nothing else — not even
 * a plain constant used to seed `useActionState` — and the restriction is enforced at RUNTIME, not
 * build time: a value export makes EVERY action here 500 for every caller, while `next build`,
 * `tsc --noEmit` and the whole test suite stay green (#159). `initialFulfilmentState` and the
 * parsers therefore live in `lib/fulfilment-form.ts`.
 */

function refusal(status: number): FulfilmentFormState {
  return {
    error:
      status === 401
        ? "Please sign in as a store admin to manage fulfilment scheduling."
        : "You don't have permission to manage this store's fulfilment scheduling.",
    field: null,
    saved: false,
  };
}

function failure(result: Extract<CatalogueWriteResult, { ok: false }>): FulfilmentFormState {
  return { error: result.error, field: result.field ?? null, saved: false };
}

/**
 * Both surfaces that read these rows have to re-render.
 *
 * `/staff/fulfilment` is the obvious one. The second is CHECKOUT: `app/(storefront)/checkout/page.tsx`
 * reads `offerDeliverySlots`/`expressCollectionEnabled`/`bookingWindowDays` from the vendor profile
 * and `components/checkout/SlotPicker.tsx` renders the slots — so without this, an admin could add a
 * Saturday slot and no shopper's checkout would offer it. Same pairing as
 * `features/admin/delivery-areas.ts`'s header/prefix revalidation.
 */
function revalidateFulfilmentSurfaces(): void {
  revalidatePath("/staff/fulfilment");
  revalidatePath("/checkout");
}

export async function saveFulfilmentSettings(
  _prev: FulfilmentFormState,
  form: FormData,
): Promise<FulfilmentFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return refusal(auth.status);

  // An unchecked checkbox is absent from FormData entirely, so `=== "on"` reads absence as a
  // deliberate false rather than as a missing required field.
  const parsed = parseFulfilmentSettings({
    offerDeliverySlots: form.get("offerDeliverySlots") === "on",
    expressCollectionEnabled: form.get("expressCollectionEnabled") === "on",
    bookingWindowDays: String(form.get("bookingWindowDays") ?? ""),
    slotHoldDurationMinutes: String(form.get("slotHoldDurationMinutes") ?? ""),
    timezone: String(form.get("timezone") ?? ""),
  });
  if (!parsed.ok) {
    return { error: parsed.error.message, field: parsed.error.field, saved: false };
  }

  const result = await getFulfilmentAdminRepository().saveSettings(parsed.value);
  if (!result.ok) return failure(result);

  revalidateFulfilmentSurfaces();
  return { error: null, field: null, saved: true };
}

export async function addFulfilmentSlot(
  _prev: FulfilmentFormState,
  form: FormData,
): Promise<FulfilmentFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return refusal(auth.status);

  const parsed = parseSlotInput({
    method: String(form.get("method") ?? ""),
    dayOfWeek: String(form.get("dayOfWeek") ?? ""),
    startTime: String(form.get("startTime") ?? ""),
    endTime: String(form.get("endTime") ?? ""),
    capacity: String(form.get("capacity") ?? ""),
  });
  if (!parsed.ok) {
    return { error: parsed.error.message, field: parsed.error.field, saved: false };
  }

  const result = await getFulfilmentAdminRepository().createSlot(parsed.value);
  if (!result.ok) return failure(result);

  revalidateFulfilmentSurfaces();
  return { error: null, field: null, saved: true };
}

export async function removeFulfilmentSlot(
  _prev: FulfilmentFormState,
  form: FormData,
): Promise<FulfilmentFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return refusal(auth.status);

  const id = String(form.get("slotId") ?? "").trim();
  if (id === "") {
    return { error: "That slot no longer exists.", field: null, saved: false };
  }

  const result = await getFulfilmentAdminRepository().removeSlot(id);
  if (!result.ok) return failure(result);

  revalidateFulfilmentSurfaces();
  return { error: null, field: null, saved: true };
}

export async function addExpressWindow(
  _prev: FulfilmentFormState,
  form: FormData,
): Promise<FulfilmentFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return refusal(auth.status);

  const parsed = parseExpressWindowInput({
    dayOfWeek: String(form.get("dayOfWeek") ?? ""),
    openTime: String(form.get("openTime") ?? ""),
    closeTime: String(form.get("closeTime") ?? ""),
  });
  if (!parsed.ok) {
    return { error: parsed.error.message, field: parsed.error.field, saved: false };
  }

  const result = await getFulfilmentAdminRepository().createExpressWindow(parsed.value);
  if (!result.ok) return failure(result);

  revalidateFulfilmentSurfaces();
  return { error: null, field: null, saved: true };
}

export async function removeExpressWindow(
  _prev: FulfilmentFormState,
  form: FormData,
): Promise<FulfilmentFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return refusal(auth.status);

  const id = String(form.get("windowId") ?? "").trim();
  if (id === "") {
    return { error: "That express window no longer exists.", field: null, saved: false };
  }

  const result = await getFulfilmentAdminRepository().removeExpressWindow(id);
  if (!result.ok) return failure(result);

  revalidateFulfilmentSurfaces();
  return { error: null, field: null, saved: true };
}
