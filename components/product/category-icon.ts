import type { IconName } from "@/components/icons/registry";

/**
 * Maps a category slug to a semantic icon name (`components/icons/registry.ts`). Icons for the
 * mockup's departments (docs/ui-ref/src/data/products.ts) mapped onto our real DB slugs — note our
 * `fruit-veg` is the mockup's `fresh-produce`, and `bakery` has no mockup equivalent. Any slug not
 * listed (e.g. a category added later in the DB) falls back to a generic tag, so a new category still
 * renders an icon — no schema `iconName` field needed.
 *
 * #729 — the fallback was a shopping basket, which read as groceries on every
 * category of a non-grocery vendor (every SriMart category rendered one). The
 * nine mappings below only fire for a vendor that uses these slugs.
 *
 * #1223 — returns a NAME, not a component, so no file outside `components/icons/` needs to know which
 * library draws it. Callers render `<Icon name={categoryIconName(slug)} />`.
 */
const ICONS_BY_SLUG: Record<string, IconName> = {
  "fruit-veg": "apple",
  bakery: "croissant",
  "dairy-eggs": "milk",
  "halal-meat": "beef",
  groceries: "shopping-bag",
  international: "globe",
  beverages: "coffee",
  snacks: "cookie",
  household: "house",
};

export function categoryIconName(slug: string): IconName {
  return ICONS_BY_SLUG[slug] ?? "tag";
}
