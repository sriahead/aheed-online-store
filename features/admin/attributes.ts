"use server";

import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import {
  createAttribute as createAttributeRow,
  createAttributeOption as createAttributeOptionRow,
  deleteAttribute as deleteAttributeRow,
  deleteAttributeOption as deleteAttributeOptionRow,
  renameAttribute as renameAttributeRow,
  renameAttributeOption as renameAttributeOptionRow,
} from "@/lib/attributes-service";
import { parseAttributeName, parseSortOrder } from "@/lib/attribute-form";
import type { CatalogueFormState } from "@/lib/catalogue-form";
import type { CatalogueWriteResult } from "@/lib/repositories/products";

/**
 * Product-filter admin actions (#912) — the write half of /staff/attributes.
 *
 * Each action runs `requireVendorRole("STAFF", "ADMIN")` ITSELF, the same posture as
 * `features/admin/brands.ts`: a server action is a public endpoint, so the page's own check
 * protects the page, not this. The vendor comes from that call — never from a submitted field —
 * and the repository scopes every write by it again in its `where`.
 *
 * THIS FILE EXPORTS ONLY ASYNC FUNCTIONS. A `"use server"` module may export nothing else, and the
 * restriction is enforced at RUNTIME: a value export 500s every action here while build, typecheck
 * and tests stay green (#159). Field rules and the confirmation label live in
 * `lib/attribute-form.ts`.
 */

const SAVED: CatalogueFormState = { error: null, field: null, saved: true };

function refusal(status: number): CatalogueFormState {
  return {
    error:
      status === 401
        ? "Please sign in as a store admin to manage product filters."
        : "You don't have permission to manage this store's product filters.",
    field: null,
    saved: false,
  };
}

function failure(result: Extract<CatalogueWriteResult, { ok: false }>): CatalogueFormState {
  return { error: result.error, field: result.field ?? null, saved: false };
}

function invalid(field: string, error: string): CatalogueFormState {
  return { error, field, saved: false };
}

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function revalidateAttributeSurfaces(): void {
  revalidatePath("/staff/attributes");
  // The product form renders a select per filter.
  revalidatePath("/staff/products", "layout");
  // Filters are storefront facets and product-page specifications.
  revalidatePath("/categories", "layout");
  revalidatePath("/search");
  revalidatePath("/products", "layout");
}

async function finish(result: CatalogueWriteResult): Promise<CatalogueFormState> {
  if (!result.ok) return failure(result);
  revalidateAttributeSurfaces();
  return SAVED;
}

export async function createAttribute(
  _prev: CatalogueFormState,
  form: FormData,
): Promise<CatalogueFormState> {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) return refusal(auth.status);

  const name = parseAttributeName(field(form, "name"));
  if (!name.ok) return invalid(name.field, name.error);

  return finish(await createAttributeRow(auth.vendorId, name.value));
}

export async function renameAttribute(
  _prev: CatalogueFormState,
  form: FormData,
): Promise<CatalogueFormState> {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) return refusal(auth.status);

  const name = parseAttributeName(field(form, "name"));
  if (!name.ok) return invalid(name.field, name.error);
  const sortOrder = parseSortOrder(field(form, "sortOrder"));
  if (!sortOrder.ok) return invalid(sortOrder.field, sortOrder.error);

  return finish(
    await renameAttributeRow(auth.vendorId, {
      id: field(form, "attributeId"),
      name: name.value.name,
      sortOrder: sortOrder.value,
    }),
  );
}

export async function deleteAttribute(
  _prev: CatalogueFormState,
  form: FormData,
): Promise<CatalogueFormState> {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) return refusal(auth.status);

  return finish(
    await deleteAttributeRow(auth.vendorId, {
      id: field(form, "attributeId"),
      confirmed: field(form, "confirmDelete") === "on",
    }),
  );
}

export async function createAttributeOption(
  _prev: CatalogueFormState,
  form: FormData,
): Promise<CatalogueFormState> {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) return refusal(auth.status);

  const name = parseAttributeName(field(form, "name"));
  if (!name.ok) return invalid(name.field, name.error);

  return finish(
    await createAttributeOptionRow(auth.vendorId, {
      attributeId: field(form, "attributeId"),
      ...name.value,
    }),
  );
}

export async function renameAttributeOption(
  _prev: CatalogueFormState,
  form: FormData,
): Promise<CatalogueFormState> {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) return refusal(auth.status);

  const name = parseAttributeName(field(form, "name"));
  if (!name.ok) return invalid(name.field, name.error);
  const sortOrder = parseSortOrder(field(form, "sortOrder"));
  if (!sortOrder.ok) return invalid(sortOrder.field, sortOrder.error);

  return finish(
    await renameAttributeOptionRow(auth.vendorId, {
      id: field(form, "optionId"),
      name: name.value.name,
      sortOrder: sortOrder.value,
    }),
  );
}

export async function deleteAttributeOption(
  _prev: CatalogueFormState,
  form: FormData,
): Promise<CatalogueFormState> {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) return refusal(auth.status);

  return finish(
    await deleteAttributeOptionRow(auth.vendorId, {
      id: field(form, "optionId"),
      confirmed: field(form, "confirmDelete") === "on",
    }),
  );
}
