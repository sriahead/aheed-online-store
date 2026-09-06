"use server";

import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getDeliveryAreaRepository } from "@/lib/delivery-areas-service";
import { parsePrefixInput, type DeliveryAreaFormState } from "@/lib/delivery-area-form";
import type { CatalogueWriteResult } from "@/lib/repositories/products";

/**
 * Delivery-area admin actions (P9.2, #612) — the write half of /staff/delivery-areas.
 *
 * Each action runs `requireVendorRole("ADMIN")` ITSELF rather than trusting the page that rendered
 * the form. A server action is a public endpoint at a stable id: anyone who has loaded the page
 * once can POST to it forever, so the page's check protects the page, not this. Same posture every
 * other admin action in this codebase takes.
 *
 * The vendor comes from `requireVendorRole`, which resolves it from the request host — never from a
 * submitted field, so nothing in the form can redirect a write at another vendor's rows. The
 * repository ALSO scopes every query by `vendorId`, so a valid id belonging to another vendor
 * removes nothing rather than succeeding.
 *
 * THIS FILE EXPORTS ONLY ASYNC FUNCTIONS. A `"use server"` module may export nothing else — not
 * even a plain constant used to seed `useActionState` — and the restriction is enforced at RUNTIME,
 * not build time: a value export makes EVERY action here 500 for every caller, while `next build`,
 * `tsc --noEmit` and the whole test suite stay green (#159). `initialDeliveryAreaState` therefore
 * lives in `lib/delivery-area-form.ts` and is imported by the client component directly.
 */

function refusal(status: number): DeliveryAreaFormState {
  return {
    error:
      status === 401
        ? "Please sign in as a store admin to manage delivery areas."
        : "You don't have permission to manage this store's delivery areas.",
    field: null,
    saved: false,
  };
}

function failure(result: Extract<CatalogueWriteResult, { ok: false }>): DeliveryAreaFormState {
  return { error: result.error, field: result.field ?? null, saved: false };
}

/**
 * Both surfaces that read these rows have to re-render.
 *
 * `/staff/delivery-areas` is the obvious one. The second is the STOREFRONT LAYOUT:
 * `components/layout/Header.tsx` derives a per-request deliverability badge from this vendor's
 * prefixes and the shopper's stored postcode, and the Header lives in the layout rather than any
 * page — so without this, a vendor could add a district and every shopper's header would go on
 * saying "we don't deliver to you". `features/storefront/delivery.ts` revalidates the same path for
 * exactly the same reason when the postcode changes; this is the other half of that pair.
 */
function revalidateDeliverySurfaces(): void {
  revalidatePath("/staff/delivery-areas");
  revalidatePath("/", "layout");
}

export async function addDeliveryArea(
  _prev: DeliveryAreaFormState,
  form: FormData,
): Promise<DeliveryAreaFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return refusal(auth.status);

  // Parsed BEFORE the repository is touched. An unvalidated string in this column is a
  // checkout-path hazard, not a cosmetic one — `lib/delivery.ts` interpolates the stored value
  // straight into a RegExp, so a metacharacter would throw for every shopper of this vendor.
  const parsed = parsePrefixInput(String(form.get("prefix") ?? ""));
  if (!parsed.ok) {
    return { error: parsed.error.message, field: parsed.error.field, saved: false };
  }

  const result = await getDeliveryAreaRepository().create(parsed.value);
  if (!result.ok) return failure(result);

  revalidateDeliverySurfaces();
  return { error: null, field: null, saved: true };
}

export async function removeDeliveryArea(
  _prev: DeliveryAreaFormState,
  form: FormData,
): Promise<DeliveryAreaFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return refusal(auth.status);

  const id = String(form.get("areaId") ?? "").trim();
  if (id === "") {
    return { error: "That delivery area no longer exists.", field: null, saved: false };
  }

  const result = await getDeliveryAreaRepository().remove(id);
  if (!result.ok) return failure(result);

  revalidateDeliverySurfaces();
  return { error: null, field: null, saved: true };
}
