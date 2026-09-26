import type { ParseResult } from "@/lib/catalogue-form";
import type { BrandPrimitives } from "@/lib/repositories/vendor";

export interface BrandColourInput {
  bannerNote: string | null;
  heroSubtitle: string | null;
  /** #729 — header search-box hint; `null` shows the platform default "Search products…". */
  searchPlaceholder: string | null;
  brandGreenDark?: string;
  brandGreen?: string;
  brandOrange?: string;
  brandRed?: string;
  brandCream?: string;
  brandGreenTint?: string;
  brandOrangeTint?: string;
  brandRedTint?: string;
}

export interface BrandColourFormState {
  error: string | null;
  field: string | null;
  saved: boolean;
}

export const initialBrandColourState: BrandColourFormState = {
  error: null,
  field: null,
  saved: false,
};

const HEX = /^#[0-9a-fA-F]{6}$/;

/** #729 — the search box is one line of header chrome; longer text is cut off on a phone. */
export const MAX_SEARCH_PLACEHOLDER_LENGTH = 80;

function parseHex(
  raw: string | undefined | null,
  field: string,
  label: string,
): ParseResult<string | undefined> {
  if (!raw) return { ok: true, value: undefined };
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: undefined };

  if (!HEX.test(trimmed)) {
    return {
      ok: false,
      error: { field, message: `${label} must be a 6-digit hex colour, e.g. #2e4d26` },
    };
  }

  return { ok: true, value: trimmed };
}

/**
 * The eight `BrandPrimitives` keys, paired with the labels the branding form already
 * uses, so a rejection reads the same whichever write path produced it.
 */
const PRIMITIVE_LABELS: ReadonlyArray<[keyof BrandPrimitives, string]> = [
  ["green-dark", "Primary Brand Color (Dark)"],
  ["green", "Primary Brand Color"],
  ["orange", "Secondary Color"],
  ["red", "Accent Color"],
  ["cream", "Background Color"],
  ["green-tint", "Primary Tint"],
  ["orange-tint", "Secondary Tint"],
  ["red-tint", "Accent Tint"],
];

/**
 * Validate a whole `BrandPrimitives` object (#782).
 *
 * `#713` closed the branding FORM's write path with `parseBrandColourForm` above. The theme
 * path is a second writer to the same eight columns — `saveStorefrontTheme` takes a
 * `BrandPrimitives` object straight from a client component and `saveVendorTheme` writes all
 * eight verbatim — and it arrived later, with `#714`, so it was never covered.
 *
 * Unlike the form parser, every key is REQUIRED here: a theme row stores all eight columns as
 * non-null, so "absent" is not a meaningful state the way an untouched form field is.
 *
 * Pure and DB-free for the same reason as the rest of this module: it has to be exercisable
 * from a plain test without a request context.
 */
export function parseBrandPrimitives(primitives: BrandPrimitives): ParseResult<BrandPrimitives> {
  const validated = {} as BrandPrimitives;

  for (const [key, label] of PRIMITIVE_LABELS) {
    const raw = primitives?.[key];

    if (typeof raw !== "string" || raw.trim() === "") {
      return { ok: false, error: { field: key, message: `${label} is required.` } };
    }

    const trimmed = raw.trim();
    if (!HEX.test(trimmed)) {
      return {
        ok: false,
        error: { field: key, message: `${label} must be a 6-digit hex colour, e.g. #2e4d26` },
      };
    }

    validated[key] = trimmed;
  }

  return { ok: true, value: validated };
}

export function parseBrandColourForm(formData: FormData): ParseResult<BrandColourInput> {
  const bannerNote = formData.get("bannerNote") as string;
  const heroSubtitle = formData.get("heroSubtitle") as string;

  const fields = [
    { key: "brandGreenDark", label: "Primary Brand Color (Dark)" },
    { key: "brandGreen", label: "Primary Brand Color" },
    { key: "brandOrange", label: "Secondary Color" },
    { key: "brandRed", label: "Accent Color" },
    { key: "brandCream", label: "Background Color" },
    { key: "brandGreenTint", label: "Primary Tint" },
    { key: "brandOrangeTint", label: "Secondary Tint" },
    { key: "brandRedTint", label: "Accent Tint" },
  ];

  const searchPlaceholder = ((formData.get("searchPlaceholder") as string | null) ?? "").trim();
  if (searchPlaceholder.length > MAX_SEARCH_PLACEHOLDER_LENGTH) {
    return {
      ok: false,
      error: {
        field: "searchPlaceholder",
        message: `Search box text must be ${MAX_SEARCH_PLACEHOLDER_LENGTH} characters or fewer.`,
      },
    };
  }

  const parsed: Partial<BrandColourInput> = {
    bannerNote: bannerNote || null,
    heroSubtitle: heroSubtitle || null,
    searchPlaceholder: searchPlaceholder || null,
  };

  for (const { key, label } of fields) {
    const value = formData.get(key) as string;
    const result = parseHex(value, key, label);
    if (!result.ok) return result;
    if (result.value !== undefined) {
      (parsed as any)[key] = result.value;
    }
  }

  return { ok: true, value: parsed as BrandColourInput };
}
