"use server";

import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getDeliveryAreaRepository } from "@/lib/delivery-areas-service";
import {
  AREA_FEE_FIELD,
  AREA_MINIMUM_FIELD,
  AREA_THRESHOLD_FIELD,
  bulkAddMessage,
  parseAreaChargesInput,
  parsePrefixListInput,
  type DeliveryAreaFormState,
} from "@/lib/delivery-area-form";
import type { CatalogueWriteResult } from "@/lib/repositories/products";

/**
 * Delivery-area admin actions (P9.2 #612; lists, ranges and per-area charges #613/#890) — the write
 * half of /staff/delivery-areas.
 *
 * A row is a postcode AREA (`MK` — every district in it) or a DISTRICT (`MK9` — exactly that
 * outward code); `lib/delivery.ts` matches them by string comparison, a district row beating an
 * area row. `addDeliveryArea` accepts one entry, a comma list or a range (`MK1-MK10`), each stored
 * as ordinary rows; `updateDeliveryAreaCharges` sets a row's optional delivery charge, minimum
 * order and free-delivery threshold (blank = the store default).
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
    message: null,
  };
}

function failure(result: Extract<CatalogueWriteResult, { ok: false }>): DeliveryAreaFormState {
  return { error: result.error, field: result.field ?? null, saved: false, message: null };
}

function fieldError(error: { field: string; message: string }): DeliveryAreaFormState {
  return { error: error.message, field: error.field, saved: false, message: null };
}

const SAVED: DeliveryAreaFormState = { error: null, field: null, saved: true, message: null };

/** The three optional money fields shared by the add form and each row's edit form (#890). */
function chargesFrom(form: FormData) {
  return parseAreaChargesInput({
    deliveryFee: String(form.get(AREA_FEE_FIELD) ?? ""),
    minimumOrder: String(form.get(AREA_MINIMUM_FIELD) ?? ""),
    freeDeliveryThreshold: String(form.get(AREA_THRESHOLD_FIELD) ?? ""),
  });
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

  // Parsed BEFORE the repository is touched. These rows gate checkout, so only a well-formed area
  // (`MK`) or district (`MK9`) may be stored — `lib/delivery-area-form.ts` explains the allow-list.
  // A comma list or a range (`MK1-MK10`, #613) expands here into individual districts.
  const parsed = parsePrefixListInput(String(form.get("prefix") ?? ""));
  if (!parsed.ok) return fieldError(parsed.error);

  // #890 — optional per-area charges, applied to every district in this submission.
  const charges = chargesFrom(form);
  if (!charges.ok) return fieldError(charges.error);

  const repository = getDeliveryAreaRepository();

  // One value keeps the original single-row path exactly, including its duplicate field error.
  if (parsed.value.length === 1) {
    const result = await repository.create(parsed.value[0], charges.value);
    if (!result.ok) return failure(result);
    revalidateDeliverySurfaces();
    return SAVED;
  }

  const { added, alreadyListed } = await repository.createMany(parsed.value, charges.value);
  if (added > 0) revalidateDeliverySurfaces();
  return { error: null, field: null, saved: true, message: bulkAddMessage(added, alreadyListed) };
}

/** Replace one area's per-area charges (#890). Blank = the store default. */
export async function updateDeliveryAreaCharges(
  _prev: DeliveryAreaFormState,
  form: FormData,
): Promise<DeliveryAreaFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return refusal(auth.status);

  const id = String(form.get("areaId") ?? "").trim();
  if (id === "") {
    return {
      error: "That delivery area no longer exists.",
      field: null,
      saved: false,
      message: null,
    };
  }

  const charges = chargesFrom(form);
  if (!charges.ok) return fieldError(charges.error);

  const result = await getDeliveryAreaRepository().updateCharges(id, charges.value);
  if (!result.ok) return failure(result);

  revalidateDeliverySurfaces();
  return SAVED;
}

export async function removeDeliveryArea(
  _prev: DeliveryAreaFormState,
  form: FormData,
): Promise<DeliveryAreaFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return refusal(auth.status);

  const id = String(form.get("areaId") ?? "").trim();
  if (id === "") {
    return {
      error: "That delivery area no longer exists.",
      field: null,
      saved: false,
      message: null,
    };
  }

  const result = await getDeliveryAreaRepository().remove(id);
  if (!result.ok) return failure(result);

  revalidateDeliverySurfaces();
  return SAVED;
}
