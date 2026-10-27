import { ICON_REGISTRY, type IconName } from "@/components/icons/registry";

/**
 * THE list of icon slots a vendor can replace with an AI-generated asset (#1288, ADR-008 Decision 6).
 *
 * One registry for the gallery's generator, the generate route's validation and the prompt builder;
 * before #1288 the gallery, `lib/category-image.ts` and the 3D catalog each kept their own copy.
 *
 * - `kind: "3d"` — the 15 non-department `Icon3D` names. Ids are the values already stored in
 *   `CategoryAsset.slot`, so existing rows keep working; `cart-floating` is the slot for the
 *   `cart-add` icon (the name the gallery shipped with in #1285).
 * - `kind: "flat"` — `icon:<name>` for every Noto entry in `ICON_REGISTRY`, derived below rather than
 *   copied. Functional Lucide icons and the rating `star` are never slots.
 *
 * The 8 department 3D names are NOT slots: a department's artwork is managed per category
 * (`Category.imageKey`), and `tests/icon-slots.test.ts` checks the 15 + 8 = 23 split.
 *
 * Plain module on purpose — no React, no directive — so a route, a Node test and a client
 * component can all import it.
 */

export type IconSlotKind = "3d" | "flat";

export interface Icon3DSlot {
  id: string;
  kind: "3d";
  label: string;
  /** The `Icon3D` name this slot overrides. */
  icon3d: string;
  /** Where shoppers or staff see it, in words an operator recognises. */
  surfaces: readonly string[];
}

export interface FlatIconSlot {
  id: `icon:${string}`;
  kind: "flat";
  label: string;
  /** The `<Icon>` registry name this slot overrides. */
  iconName: IconName;
  /** The icon's Noto Emoji id, used as the prompt's subject. */
  notoId: string;
}

export type IconSlot = Icon3DSlot | FlatIconSlot;

export const DEPARTMENT_3D_NAMES = [
  "fruit-veg",
  "halal-meat",
  "bakery",
  "dairy-eggs",
  "beverages",
  "snacks",
  "frozen-foods",
  "household",
] as const;

export const ICON_3D_SLOTS: readonly Icon3DSlot[] = [
  {
    id: "delivery-van",
    kind: "3d",
    label: "Delivery van",
    icon3d: "delivery-van",
    surfaces: ["Landing trust strip", "Landing feature card: local delivery"],
  },
  {
    id: "storefront",
    kind: "3d",
    label: "Shop / storefront",
    icon3d: "storefront",
    surfaces: ["Header: Shop link"],
  },
  {
    id: "quick-shop",
    kind: "3d",
    label: "Quick Shop basket",
    icon3d: "quick-shop",
    surfaces: ["Header: Quick Shop link"],
  },
  {
    id: "user-profile",
    kind: "3d",
    label: "User profile avatar",
    icon3d: "user-profile",
    surfaces: ["Header: Sign in / Account"],
  },
  {
    id: "cart-floating",
    kind: "3d",
    label: "Cart trolley",
    icon3d: "cart-add",
    surfaces: ["Header cart button", "Cart drawer heading", "Empty cart"],
  },
  {
    id: "secure-checkout",
    kind: "3d",
    label: "Secure checkout shield",
    icon3d: "secure-checkout",
    surfaces: ["Checkout page heading", "Landing feature card: secure checkout"],
  },
  {
    id: "order-updates",
    kind: "3d",
    label: "Order updates bell",
    icon3d: "order-updates",
    surfaces: ["Landing feature card: order updates"],
  },
  {
    id: "view-shopper",
    kind: "3d",
    label: "Role switcher: shopper view",
    icon3d: "view-shopper",
    surfaces: ["Header role switcher"],
  },
  {
    id: "view-staff",
    kind: "3d",
    label: "Role switcher: staff view",
    icon3d: "view-staff",
    surfaces: ["Header role switcher"],
  },
  {
    id: "view-admin",
    kind: "3d",
    label: "Role switcher: admin view",
    icon3d: "view-admin",
    surfaces: ["Header role switcher"],
  },
  {
    id: "rewards-coin",
    kind: "3d",
    label: "Rewards launcher coin",
    icon3d: "rewards-coin",
    surfaces: ["Floating rewards launcher"],
  },
  {
    id: "halal-certified",
    kind: "3d",
    label: "Halal certified badge",
    icon3d: "halal-certified",
    surfaces: ["Landing trust strip"],
  },
  {
    id: "postcode-search",
    kind: "3d",
    label: "Postcode / location pin",
    icon3d: "postcode-search",
    surfaces: ["Delivery location dialog"],
  },
  {
    id: "contact-follow",
    kind: "3d",
    label: "Contact & follow",
    icon3d: "contact-follow",
    surfaces: ["Floating contact button"],
  },
  {
    id: "rewards-gift",
    kind: "3d",
    label: "Rewards gift",
    icon3d: "rewards-gift",
    surfaces: ["Icon credits page"],
  },
];

function humanise(id: string): string {
  const words = id.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const FLAT_ICON_SLOTS: readonly FlatIconSlot[] = (
  Object.entries(ICON_REGISTRY) as [IconName, (typeof ICON_REGISTRY)[IconName]][]
)
  .filter(([, entry]) => entry.provider === "noto")
  .map(([name, entry]) => ({
    id: `icon:${name}` as const,
    kind: "flat" as const,
    label: humanise(name),
    iconName: name,
    notoId: entry.id,
  }));

export const ICON_SLOTS: readonly IconSlot[] = [...ICON_3D_SLOTS, ...FLAT_ICON_SLOTS];

const SLOTS_BY_ID = new Map<string, IconSlot>(ICON_SLOTS.map((slot) => [slot.id, slot]));

export function isIconSlotId(id: string): boolean {
  return SLOTS_BY_ID.has(id);
}

export function getIconSlot(id: string): IconSlot | undefined {
  return SLOTS_BY_ID.get(id);
}

/** The slot overriding a given `Icon3D` name (`cart-add` → `cart-floating`), if any. */
export function slotIdForIcon3D(name: string): string | undefined {
  return ICON_3D_SLOTS.find((slot) => slot.icon3d === name)?.id;
}

/** The slot overriding a given `<Icon>` name, or undefined for a functional icon. */
export function slotIdForIconName(name: string): string | undefined {
  const id = `icon:${name}`;
  return SLOTS_BY_ID.has(id) ? id : undefined;
}
