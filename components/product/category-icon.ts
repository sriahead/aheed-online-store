import {
  Apple,
  Croissant,
  Milk,
  Beef,
  ShoppingBag,
  Globe,
  Coffee,
  Cookie,
  Home,
  ShoppingBasket,
  type LucideIcon,
} from "lucide-react";

/**
 * Maps a category slug to a lucide icon. Icons for the mockup's departments
 * (docs/ui-ref/src/data/products.ts) mapped onto our real DB slugs — note our
 * `fruit-veg` is the mockup's `fresh-produce`, and `bakery` has no mockup
 * equivalent. Any slug not listed (e.g. a category added later in the DB)
 * falls back to a generic basket, so a new category still renders an icon —
 * no schema `iconName` field needed.
 */
const ICONS_BY_SLUG: Record<string, LucideIcon> = {
  "fruit-veg": Apple,
  bakery: Croissant,
  "dairy-eggs": Milk,
  "halal-meat": Beef,
  groceries: ShoppingBag,
  international: Globe,
  beverages: Coffee,
  snacks: Cookie,
  household: Home,
};

export function categoryIcon(slug: string): LucideIcon {
  return ICONS_BY_SLUG[slug] ?? ShoppingBasket;
}
