import { parsePriceInput } from "@/components/product/parse-price-input";

/**
 * Catalogue admin field rules (P6b1, #159) — pure, DB-free, unit-tested.
 *
 * Same posture as lib/staff-orders-query.ts (P6a) and lib/shopping-list.ts
 * (P3d): every decision about what a submitted field MEANS lives where a test
 * can reach it without a database, a session or a request. The server actions in
 * features/admin/catalogue.ts do the FormData reading and the repository calls;
 * nothing here knows either exists.
 *
 * Errors are RETURNED, never thrown. A bad price is an ordinary thing for a
 * human to type, and the form has to re-render with the field named — an
 * exception would have to be caught and converted at every call site anyway.
 */

export interface FieldError {
  /** Matches the form control's `name`, so the UI can point at the right input. */
  field: string;
  message: string;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: FieldError };

/** What the actions read out of FormData — deliberately plain strings, so tests need no FormData. */
export type RawForm = Record<string, string | undefined>;

export interface ProductFormValues {
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  basePrice: number;
  originalPrice: number | null;
  unitLabel: string;
  origin: string | null;
  isHalal: boolean;
  isFresh: boolean;
  isOrganic: boolean;
  isActive: boolean;
  quantity: number;
  lowStockThreshold: number;
}

export interface CategoryFormValues {
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface CatalogueFormState {
  error: string | null;
  /** The control to point at, matching the input's `name`. Null for whole-form errors. */
  field: string | null;
  saved: boolean;
}

/**
 * The initial `useActionState` value for both catalogue forms.
 *
 * Lives here, not in features/admin/catalogue.ts, because that file is
 * `"use server"` — every export of such a file must be an async function
 * (Next throws `ensureServerEntryExports`'s "found object" error the moment
 * ANY action in the file is dispatched otherwise, since the whole module's
 * export set is validated together, not just the one being called). A plain
 * state constant has no business there regardless of that constraint.
 */
export const initialCatalogueState: CatalogueFormState = {
  error: null,
  field: null,
  saved: false,
};

/** First and last code point of Unicode's Combining Diacritical Marks block. */
const COMBINING_MARK_FIRST = 0x300;
const COMBINING_MARK_LAST = 0x36f;

/**
 * Drop the combining marks NFKD splits off from letters like "è".
 *
 * Written as a loop rather than a regex character class deliberately: the class
 * would have to carry the two code points literally, and a pair of bare
 * combining marks in source is invisible in review and easy for a tool to
 * mangle. Without this step the generic [^a-z0-9] pass below would turn each
 * orphaned mark into a separator, making "Crème" into "cre-me".
 */
function stripCombiningMarks(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < COMBINING_MARK_FIRST || code > COMBINING_MARK_LAST) out += char;
  }
  return out;
}

/**
 * A URL-safe slug, or "" when the input has nothing usable in it.
 *
 * Diacritics are folded rather than dropped, so "Crème Fraîche" becomes
 * "creme-fraiche" and not "cr-me-fra-che" — a UK grocery catalogue carries
 * plenty of them.
 */
export function slugify(input: string): string {
  return stripCombiningMarks(input.normalize("NFKD"))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function text(raw: RawForm, field: string): string {
  return (raw[field] ?? "").trim();
}

/** An HTML checkbox submits its value only when checked; absent means false. */
function checkbox(raw: RawForm, field: string): boolean {
  const value = raw[field];
  return value !== undefined && value !== "" && value !== "off";
}

function requiredText(raw: RawForm, field: string, label: string): ParseResult<string> {
  const value = text(raw, field);
  if (value === "") return { ok: false, error: { field, message: `${label} is required.` } };
  return { ok: true, value };
}

function optionalText(raw: RawForm, field: string): string | null {
  const value = text(raw, field);
  return value === "" ? null : value;
}

/** A whole number ≥ min. Rejects "", "abc", "1.5" and negatives identically. */
function wholeNumber(raw: RawForm, field: string, label: string, min: number): ParseResult<number> {
  const value = text(raw, field);
  const parsed = Number(value);
  if (value === "" || !Number.isInteger(parsed) || parsed < min) {
    return {
      ok: false,
      error: { field, message: `${label} must be a whole number of at least ${min}.` },
    };
  }
  return { ok: true, value: parsed };
}

/**
 * The slug rule for both models: a blank field is derived from the name, and a
 * typed one is normalised through the same function — so no slug this module
 * accepts can differ in shape from one it generated.
 */
function resolveSlug(raw: RawForm, name: string): ParseResult<string> {
  const typed = text(raw, "slug");
  const slug = slugify(typed === "" ? name : typed);
  if (slug === "") {
    return {
      ok: false,
      error: {
        field: "slug",
        message: "The web address needs at least one letter or number — add one, or edit the name.",
      },
    };
  }
  return { ok: true, value: slug };
}

export function parseProductForm(raw: RawForm): ParseResult<ProductFormValues> {
  const name = requiredText(raw, "name", "Name");
  if (!name.ok) return name;

  const slug = resolveSlug(raw, name.value);
  if (!slug.ok) return slug;

  const categoryId = requiredText(raw, "categoryId", "Category");
  if (!categoryId.ok) return categoryId;

  const unitLabel = requiredText(raw, "unitLabel", "Unit label");
  if (!unitLabel.ok) return unitLabel;

  // parsePriceInput() returns undefined for blank, non-numeric AND negative
  // input alike — all three are "this isn't a price", so one message covers them.
  const basePrice = parsePriceInput(text(raw, "basePrice"));
  if (basePrice === undefined) {
    return {
      ok: false,
      error: { field: "basePrice", message: "Price must be an amount in pounds, like 2.40." },
    };
  }

  const originalRaw = text(raw, "originalPrice");
  let originalPrice: number | null = null;
  if (originalRaw !== "") {
    const parsed = parsePriceInput(originalRaw);
    if (parsed === undefined) {
      return {
        ok: false,
        error: {
          field: "originalPrice",
          message: "Was-price must be an amount in pounds, like 3.00 — or leave it blank.",
        },
      };
    }
    // A "was" price at or below the current price would render a discount badge
    // advertising a saving of zero or less. Blank means "not on offer".
    if (parsed <= basePrice) {
      return {
        ok: false,
        error: {
          field: "originalPrice",
          message: "Was-price must be higher than the price, or blank if this isn't on offer.",
        },
      };
    }
    originalPrice = parsed;
  }

  const quantity = wholeNumber(raw, "quantity", "Stock", 0);
  if (!quantity.ok) return quantity;

  const lowStockThreshold = wholeNumber(raw, "lowStockThreshold", "Low-stock threshold", 0);
  if (!lowStockThreshold.ok) return lowStockThreshold;

  return {
    ok: true,
    value: {
      name: name.value,
      slug: slug.value,
      // The schema's `description` is non-null, so a blank one is "" not null.
      description: text(raw, "description"),
      categoryId: categoryId.value,
      basePrice,
      originalPrice,
      unitLabel: unitLabel.value,
      origin: optionalText(raw, "origin"),
      isHalal: checkbox(raw, "isHalal"),
      isFresh: checkbox(raw, "isFresh"),
      isOrganic: checkbox(raw, "isOrganic"),
      isActive: checkbox(raw, "isActive"),
      quantity: quantity.value,
      lowStockThreshold: lowStockThreshold.value,
    },
  };
}

export function parseCategoryForm(raw: RawForm): ParseResult<CategoryFormValues> {
  const name = requiredText(raw, "name", "Name");
  if (!name.ok) return name;

  const slug = resolveSlug(raw, name.value);
  if (!slug.ok) return slug;

  const sortOrder = wholeNumber(raw, "sortOrder", "Sort order", 0);
  if (!sortOrder.ok) return sortOrder;

  return {
    ok: true,
    value: {
      name: name.value,
      slug: slug.value,
      // Blank means top-level. Whether the referenced category is ITSELF
      // top-level is a database question, answered in the repository.
      parentId: optionalText(raw, "parentId"),
      sortOrder: sortOrder.value,
      isActive: checkbox(raw, "isActive"),
    },
  };
}

/** FormData -> RawForm. Kept here so field names are declared once, beside their rules. */
export function readForm(form: FormData, fields: readonly string[]): RawForm {
  const raw: RawForm = {};
  for (const field of fields) {
    const value = form.get(field);
    if (value !== null) raw[field] = typeof value === "string" ? value : "";
  }
  return raw;
}

export const PRODUCT_FIELDS = [
  "name",
  "slug",
  "description",
  "categoryId",
  "basePrice",
  "originalPrice",
  "unitLabel",
  "origin",
  "isHalal",
  "isFresh",
  "isOrganic",
  "isActive",
  "quantity",
  "lowStockThreshold",
] as const;

export const CATEGORY_FIELDS = ["name", "slug", "parentId", "sortOrder", "isActive"] as const;
