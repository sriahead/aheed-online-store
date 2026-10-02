import type { ParseResult } from "@/lib/catalogue-form";

/**
 * Product listing density (#962). Pure, DB-free and unit-tested, like `lib/catalogue-settings-form.ts`.
 * `components/product/ProductGrid.tsx` renders the class strings and
 * `features/admin/storefront.ts` parses the staff form. Nothing here knows either exists.
 *
 * **Every class string is a literal.** Tailwind finds utilities by scanning source text, so a
 * `grid-cols-${n}` built at runtime would never reach the stylesheet. That is why a vendor picks a
 * preset rather than a column count. A free count also allows layouts that break the card.
 *
 * Rules the table follows (`specs/design-system.md`, "Product grids"):
 * - every multi-column step is even, so a short page never renders a ragged 3 + 3 + 2;
 * - four columns never start before `lg`, because `FilterPanel`'s 240px sidebar from `md` leaves
 *   about 500px, which is roughly 110px per card at four;
 * - six columns start only at `xl`.
 */

/** Mirrors the Prisma `ProductGridDensity` enum; kept as a plain union so this module stays DB-free. */
export type ProductGridDensity = "COMPACT" | "STANDARD" | "SPACIOUS";

export const PRODUCT_GRID_DENSITIES: readonly ProductGridDensity[] = [
  "COMPACT",
  "STANDARD",
  "SPACIOUS",
];

/** What every vendor gets until an admin chooses otherwise (the column default). */
export const DEFAULT_PRODUCT_GRID_DENSITY: ProductGridDensity = "STANDARD";

export const PRODUCT_GRID_DENSITY_FIELD = "productGridDensity";

const GRID_CLASS: Record<ProductGridDensity, string> = {
  COMPACT: "grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-6",
  STANDARD: "grid grid-cols-2 gap-4 lg:grid-cols-4",
  SPACIOUS: "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4",
};

/** The grid's full class string for a preset. */
export function productGridClassName(density: ProductGridDensity): string {
  return GRID_CLASS[density];
}

/**
 * Staff-facing copy for `/staff/storefront`. Vendor-neutral by rule: it describes layout only and
 * names no shop, product or trade (`docs/developer-portal/app-conventions.md`, "User-facing copy").
 */
export const PRODUCT_GRID_DENSITY_OPTIONS: Record<
  ProductGridDensity,
  { label: string; description: string }
> = {
  COMPACT: {
    label: "Compact",
    description:
      "More, smaller product cards: 2 per row on phones, 4 on laptops and 6 on the widest screens.",
  },
  STANDARD: {
    label: "Standard",
    description: "2 product cards per row on phones and tablets, 4 on laptops and wider screens.",
  },
  SPACIOUS: {
    label: "Spacious",
    description:
      "Fewer, larger product cards: 1 per row on phones, 2 on tablets and laptops, 4 on the widest screens.",
  },
};

/** Exact enum names only. Anything else, including a lower-case name, is refused, not guessed. */
export function parseProductGridDensity(value: unknown): ParseResult<ProductGridDensity> {
  if (typeof value === "string" && (PRODUCT_GRID_DENSITIES as readonly string[]).includes(value)) {
    return { ok: true, value: value as ProductGridDensity };
  }
  return {
    ok: false,
    error: { field: PRODUCT_GRID_DENSITY_FIELD, message: "Choose one of the grid layouts." },
  };
}

/**
 * `useActionState` shape. It lives here, not in the `"use server"` action file, because such a
 * file may export only async functions (CLAUDE.md, Server Actions).
 */
export interface ProductGridDensityFormState {
  error: string | null;
  saved: boolean;
}

export const initialProductGridDensityState: ProductGridDensityFormState = {
  error: null,
  saved: false,
};
