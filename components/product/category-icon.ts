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
  // Top-level departments
  "fruit-veg": "apple",
  bakery: "croissant",
  "dairy-eggs": "milk",
  "halal-meat": "beef",
  groceries: "shopping-bag",
  international: "globe",
  beverages: "coffee",
  snacks: "cookie",
  household: "house",
  "frozen-foods": "package",
  "health-beauty": "sparkles",
  "baby-kids": "gift",
  "pet-supplies": "tag",

  // Fruit & Veg subcategories
  "fresh-fruit": "apple",
  "fresh-vegetables": "apple",
  "herbs-salads": "apple",

  // Bakery subcategories
  "bread-loaves": "croissant",
  pastries: "croissant",
  "cakes-desserts": "cookie",

  // Dairy & Eggs subcategories
  "milk-cream": "milk",
  "cheese-paneer": "milk",
  "eggs-butter": "milk",

  // Halal Meat subcategories
  "lamb-mutton": "beef",
  "chicken-poultry": "beef",
  "beef-mince": "beef",

  // Fish subcategories
  fish: "package",
  "fresh-fish": "package",
  "frozen-fish": "package",

  // Groceries subcategories
  "rice-grains": "shopping-bag",
  "lentils-pulses": "shopping-bag",
  "cooking-oils": "shopping-bag",

  // International subcategories
  "south-asian": "globe",
  "middle-eastern": "globe",
  "african-caribbean": "globe",

  // Beverages subcategories
  "tea-coffee": "coffee",
  "juices-soft-drinks": "coffee",
  "water-mixers": "coffee",

  // Snacks subcategories
  "crisps-namkeen": "cookie",
  "biscuits-sweets": "cookie",
  "nuts-dried-fruit": "cookie",

  // Household subcategories
  cleaning: "house",
  "kitchen-foil": "house",
  "paper-toiletries": "house",
};

export function categoryIconName(slug: string): IconName {
  return ICONS_BY_SLUG[slug] ?? "tag";
}
