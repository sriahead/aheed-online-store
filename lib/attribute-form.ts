import { slugify } from "@/lib/catalogue-form";

/**
 * #912 — field rules for vendor-defined product filters ("Colour") and their values ("Black").
 *
 * Pure and dependency-free apart from `slugify`, so every rule is unit-tested
 * (`tests/attribute-form.test.ts`) and `features/admin/attributes.ts` stays wiring only. Not a
 * `"use server"` file: such a file may export only async functions, and the label helper below is a
 * plain one.
 */

export const ATTRIBUTE_NAME_MAX_LENGTH = 40;
export const MAX_ATTRIBUTES_PER_VENDOR = 20;
export const MAX_OPTIONS_PER_ATTRIBUTE = 50;
export const MAX_SORT_ORDER = 999;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; field: string; error: string };

/**
 * A filter or value name, and the slug its URL key is built from. The slug is derived here, once,
 * at creation — it is never regenerated on rename (a shopper's shared link carries it).
 */
export function parseAttributeName(raw: string): ParseResult<{ name: string; slug: string }> {
  const name = raw.trim();
  if (name === "") return { ok: false, field: "name", error: "Enter a name." };
  if (name.length > ATTRIBUTE_NAME_MAX_LENGTH) {
    return { ok: false, field: "name", error: "Keep the name to 40 characters or fewer." };
  }
  const slug = slugify(name);
  if (slug === "") {
    return { ok: false, field: "name", error: "Use at least one letter or number." };
  }
  return { ok: true, value: { name, slug } };
}

/** A whole number from 0 to 999. Blank is refused rather than defaulted: the field is pre-filled. */
export function parseSortOrder(raw: string): ParseResult<number> {
  const trimmed = raw.trim();
  const refused = {
    ok: false as const,
    field: "sortOrder",
    error: "Enter a position from 0 to 999.",
  };
  if (!/^\d+$/.test(trimmed)) return refused;
  const value = Number(trimmed);
  return value <= MAX_SORT_ORDER ? { ok: true, value } : refused;
}

export const ATTRIBUTE_UNIT_MAX_LENGTH = 10;

export type AttributeKindValue = "LIST" | "NUMBER";

/**
 * #918 — the add-filter form's type choice. Refused rather than defaulted: the form always submits
 * one, so anything else is a crafted request.
 */
export function parseAttributeKind(raw: string): ParseResult<AttributeKindValue> {
  const trimmed = raw.trim();
  if (trimmed === "LIST" || trimmed === "NUMBER") return { ok: true, value: trimmed };
  return { ok: false, field: "kind", error: "Choose a filter type." };
}

/** #918 — a number filter's optional unit ("W", "in"). Blank means none. */
export function parseAttributeUnit(raw: string): ParseResult<string | null> {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (trimmed.length > ATTRIBUTE_UNIT_MAX_LENGTH) {
    return { ok: false, field: "unit", error: "Keep the unit to 10 characters or fewer." };
  }
  return { ok: true, value: trimmed };
}

/** The delete form's confirmation label — "Also remove it from 1 product" / "… from 3 products". */
export function confirmDeleteLabel(productCount: number): string {
  return `Also remove it from ${productCount} ${productCount === 1 ? "product" : "products"}`;
}
