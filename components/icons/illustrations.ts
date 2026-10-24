/**
 * Department illustrations (#1223 Phase 4a, ADR-008): slug -> Noto Emoji id.
 *
 * Unlike the inline icons these are static files, `public/illustrations/departments/<slug>.svg`, written
 * by `npm run icons:build` and rendered with `<img>` rather than inlined: `DepartmentScroller` and
 * `DepartmentHero` are client components, so inlined art would ship in the client bundle (R37), and the
 * `<img>` costs nothing until the strip is on screen.
 *
 * The map lives in code, as `category-icon.ts` does, and is deliberately small: any slug not listed
 * renders a neutral decorative glyph, never a picture of food on another vendor's shelf (#729). Making
 * the map data-driven per vendor is #1224.
 *
 * This is the only file that names an illustration's subject; no component does (R49).
 */
export const DEPARTMENT_ILLUSTRATIONS = {
  "fruit-veg": "red-apple",
  bakery: "croissant",
  "dairy-eggs": "glass-of-milk",
  "halal-meat": "cut-of-meat",
  groceries: "shopping-cart",
  international: "globe-showing-europe-africa",
  beverages: "hot-beverage",
  snacks: "cookie",
  household: "soap",
  "frozen-foods": "ice-cream",
  "health-beauty": "lipstick",
  "baby-kids": "teddy-bear",
  "pet-supplies": "dog-face",
  fish: "fish",
  "sri-electronics": "headphone",
  "sri-home": "light-bulb",
} as const satisfies Record<string, string>;

export type IllustratedDepartment = keyof typeof DEPARTMENT_ILLUSTRATIONS;

/**
 * 3D Department icons (#1245, #1248): slug -> 3D icon definition id.
 * Maps department slugs to matching modern 3D vector icons in `lib/icons-3d/catalog.ts`.
 */
export const DEPARTMENT_3D_ICONS = {
  "fruit-veg": "fruit-veg",
  bakery: "bakery",
  "dairy-eggs": "dairy-eggs",
  "halal-meat": "halal-meat",
  groceries: "cart-add",
  beverages: "beverages",
  snacks: "snacks",
  "frozen-foods": "frozen-foods",
  household: "household",
} as const;

export type Department3DIcon = (typeof DEPARTMENT_3D_ICONS)[keyof typeof DEPARTMENT_3D_ICONS];

/** Returns the matching 3D icon name for a department slug, or null when none is mapped. */
export function department3DIcon(slug: string): Department3DIcon | null {
  return Object.hasOwn(DEPARTMENT_3D_ICONS, slug)
    ? DEPARTMENT_3D_ICONS[slug as keyof typeof DEPARTMENT_3D_ICONS]
    : null;
}

/** Public path of a department's illustration, or `null` when the slug has none. */
export function departmentIllustration(slug: string): string | null {
  return Object.hasOwn(DEPARTMENT_ILLUSTRATIONS, slug)
    ? `/illustrations/departments/${slug}.svg`
    : null;
}
