"use server";

import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getBrandRepository } from "@/lib/brands-service";
import type { CatalogueFormState } from "@/lib/catalogue-form";
import type { CatalogueWriteResult } from "@/lib/repositories/products";

/**
 * Brand admin actions (P2.6 slice 6, #569) — the write half of /staff/brands.
 *
 * Each action runs `requireVendorRole("ADMIN")` ITSELF rather than trusting the page that rendered
 * the form. A server action is a public endpoint at a stable id: anyone who has loaded the page
 * once can POST to it forever, so the page's check protects the page, not this. Same posture every
 * other admin action in this codebase takes.
 *
 * The vendor comes from `requireVendorRole`, which resolves it from the request host — never from
 * a submitted field, so nothing in the form can redirect a write at another vendor's rows. The
 * repository ALSO scopes every write by `vendorId` in its `where`, so a valid id belonging to
 * another vendor updates nothing rather than succeeding.
 *
 * THIS FILE EXPORTS ONLY ASYNC FUNCTIONS. A `"use server"` module may export nothing else — not
 * even a plain constant used to seed `useActionState` — and the restriction is enforced at RUNTIME,
 * not build time: a value export makes EVERY action here 500 for every caller, while `next build`,
 * `tsc --noEmit` and the whole test suite stay green (#159). `initialCatalogueState` therefore
 * lives in `lib/catalogue-form.ts` and is imported by the client component directly.
 */

function refusal(status: number): CatalogueFormState {
  return {
    error:
      status === 401
        ? "Please sign in as a store admin to manage brands."
        : "You don't have permission to manage this store's brands.",
    field: null,
    saved: false,
  };
}

function failure(result: Extract<CatalogueWriteResult, { ok: false }>): CatalogueFormState {
  return { error: result.error, field: result.field ?? null, saved: false };
}

function revalidateBrandSurfaces(): void {
  revalidatePath("/staff/brands");
  // The brand picker on the product form reads the same list.
  revalidatePath("/staff/products", "layout");
  // Brands are a storefront facet, so both browse pages' filter panels change with them.
  revalidatePath("/search");
  revalidatePath("/categories", "layout");
}

export async function createBrand(
  _prev: CatalogueFormState,
  form: FormData,
): Promise<CatalogueFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return refusal(auth.status);

  const name = String(form.get("name") ?? "").trim();
  if (name === "") {
    return { error: "Enter a brand name.", field: "name", saved: false };
  }

  const result = await getBrandRepository().create(name);
  if (!result.ok) return failure(result);

  revalidateBrandSurfaces();
  return { error: null, field: null, saved: true };
}

export async function renameBrand(
  _prev: CatalogueFormState,
  form: FormData,
): Promise<CatalogueFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return refusal(auth.status);

  const id = String(form.get("brandId") ?? "").trim();
  const name = String(form.get("name") ?? "").trim();
  if (id === "") return { error: "That brand no longer exists.", field: null, saved: false };
  if (name === "") return { error: "Enter a brand name.", field: "name", saved: false };

  const result = await getBrandRepository().rename(id, name);
  if (!result.ok) return failure(result);

  revalidateBrandSurfaces();
  return { error: null, field: null, saved: true };
}

/**
 * Set or clear a brand's relative storage key. A blank submission CLEARS it (null) rather than
 * storing an empty string, so "no image" has exactly one representation in the column.
 */
export async function setBrandImage(
  _prev: CatalogueFormState,
  form: FormData,
): Promise<CatalogueFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return refusal(auth.status);

  const id = String(form.get("brandId") ?? "").trim();
  const imageKey = String(form.get("imageKey") ?? "").trim();
  if (id === "") return { error: "That brand no longer exists.", field: null, saved: false };

  const result = await getBrandRepository().setImageKey(id, imageKey === "" ? null : imageKey);
  if (!result.ok) return failure(result);

  revalidateBrandSurfaces();
  return { error: null, field: null, saved: true };
}
