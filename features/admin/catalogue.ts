"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import {
  CATEGORY_FIELDS,
  PRODUCT_FIELDS,
  parseCategoryForm,
  parseProductForm,
  readForm,
} from "@/lib/catalogue-form";
import {
  createProductForVendor,
  updateProductForVendor,
  type CatalogueWriteResult,
} from "@/lib/repositories/products";
import { createCategoryForVendor, updateCategoryForVendor } from "@/lib/repositories/categories";

/**
 * Catalogue admin actions (P6b1, #159) — the write half of /staff/products and
 * /staff/categories, and the first admin write path the catalogue has ever had.
 *
 * Each action runs `requireVendorRole("ADMIN")` ITSELF rather than trusting the
 * page that rendered the form. A server action is a public endpoint at a stable
 * id: anyone who has loaded the page once can POST to it forever, so the page's
 * check protects the page, not this. Same posture P4b's advance-status, P5a's
 * loyalty-config and P5b's discount-code actions take.
 *
 * ADMIN only, matching /staff/loyalty and /staff/discounts. Prices and the
 * catalogue itself are owner decisions, not packing-floor ones.
 *
 * The vendor comes from `requireVendorRole`, which resolves it from the request
 * host — never from a submitted field, so nothing in the form can redirect a
 * write at another vendor's rows.
 *
 * Every field rule lives in lib/catalogue-form.ts, which knows nothing about
 * FormData, Prisma or sessions; these functions are the wiring between it and
 * the repositories, and deliberately hold no rules of their own.
 */

export interface CatalogueFormState {
  error: string | null;
  /** The control to point at, matching the input's `name`. Null for whole-form errors. */
  field: string | null;
  saved: boolean;
}

export const initialCatalogueState: CatalogueFormState = {
  error: null,
  field: null,
  saved: false,
};

function refusal(status: number, subject: string): CatalogueFormState {
  return {
    error:
      status === 401
        ? `Please sign in as a store admin to manage ${subject}.`
        : `You don't have permission to manage this store's ${subject}.`,
    field: null,
    saved: false,
  };
}

function failure(result: Extract<CatalogueWriteResult, { ok: false }>): CatalogueFormState {
  return { error: result.error, field: result.field ?? null, saved: false };
}

/**
 * Create when `productId` is absent, update when it is present — one action, so
 * the form component doesn't have to know which mode it is in.
 */
export async function saveProduct(
  _prev: CatalogueFormState,
  form: FormData,
): Promise<CatalogueFormState> {
  const auth = await requireVendorRole("ADMIN");
  // Returned as data, never thrown — matching lib/auth-rbac.ts's posture, so a
  // refusal renders as a message rather than a 500.
  if (!auth.ok) return refusal(auth.status, "the catalogue");

  const parsed = parseProductForm(readForm(form, PRODUCT_FIELDS));
  if (!parsed.ok) {
    return { error: parsed.error.message, field: parsed.error.field, saved: false };
  }

  const productId = String(form.get("productId") ?? "").trim();
  const result =
    productId === ""
      ? await createProductForVendor(auth.vendorId, parsed.value)
      : await updateProductForVendor(auth.vendorId, productId, parsed.value);

  if (!result.ok) return failure(result);

  revalidatePath("/staff/products");
  revalidatePath(`/staff/products/${result.id}`);
  // The storefront reads this product by slug, and the slug may have just
  // changed — revalidate both so neither the old nor the new path serves stale
  // copy. Category pages list it too.
  revalidatePath(`/products/${parsed.value.slug}`);
  revalidatePath("/categories", "layout");

  // A newly created product has nowhere to go but its own edit page; redirect()
  // throws, so it sits outside every try block above by construction.
  if (productId === "") redirect(`/staff/products/${result.id}`);

  return { error: null, field: null, saved: true };
}

export async function saveCategory(
  _prev: CatalogueFormState,
  form: FormData,
): Promise<CatalogueFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return refusal(auth.status, "categories");

  const parsed = parseCategoryForm(readForm(form, CATEGORY_FIELDS));
  if (!parsed.ok) {
    return { error: parsed.error.message, field: parsed.error.field, saved: false };
  }

  const categoryId = String(form.get("categoryId") ?? "").trim();
  const result =
    categoryId === ""
      ? await createCategoryForVendor(auth.vendorId, parsed.value)
      : await updateCategoryForVendor(auth.vendorId, categoryId, parsed.value);

  if (!result.ok) return failure(result);

  revalidatePath("/staff/categories");
  revalidatePath(`/staff/categories/${result.id}`);
  // Categories drive the storefront's department navigation, which every
  // storefront page renders — so the whole segment, not one path.
  revalidatePath("/categories", "layout");
  revalidatePath("/", "layout");

  if (categoryId === "") redirect(`/staff/categories/${result.id}`);

  return { error: null, field: null, saved: true };
}
