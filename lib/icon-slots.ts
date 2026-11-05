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

export type IconSlotGroup =
  | "Fulfilment & Delivery"
  | "Trust & Security"
  | "Storefront & Navigation"
  | "Subcategories & Produce"
  | "Account & Orders"
  | "Rewards & Loyalty"
  | "Staff & Operations"
  | "General UI";

export interface Icon3DSlot {
  id: string;
  kind: "3d";
  group: IconSlotGroup;
  label: string;
  /** The `Icon3D` name this slot overrides. */
  icon3d: string;
  /** Where shoppers or staff see it, in words an operator recognises. */
  surfaces: readonly string[];
}

export interface FlatIconSlot {
  id: `icon:${string}`;
  kind: "flat";
  group: IconSlotGroup;
  label: string;
  /** The `<Icon>` registry name this slot overrides. */
  iconName: IconName;
  /** The icon's Noto Emoji id, used as the prompt's subject. */
  notoId: string;
  /** Where shoppers or staff see it, in words an operator recognises. */
  surfaces: readonly string[];
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
    group: "Fulfilment & Delivery",
    label: "Delivery van",
    icon3d: "delivery-van",
    surfaces: [
      "Header: Delivery method selector",
      "Landing hero trust badges: Local Delivery",
      "Landing feature card: local delivery",
    ],
  },
  {
    id: "storefront",
    kind: "3d",
    group: "Fulfilment & Delivery",
    label: "Shop / Click & Collect storefront",
    icon3d: "storefront",
    surfaces: [
      "Header: Click & Collect selector",
      "Header: Shop navigation link",
      "Help Centre: Click & Collect guide",
    ],
  },
  {
    id: "quick-shop",
    kind: "3d",
    group: "Storefront & Navigation",
    label: "Quick Shop basket",
    icon3d: "quick-shop",
    surfaces: ["Header: Quick Shop link"],
  },
  {
    id: "user-profile",
    kind: "3d",
    group: "Account & Orders",
    label: "User profile avatar",
    icon3d: "user-profile",
    surfaces: ["Header: Sign in / Account"],
  },
  {
    id: "cart-floating",
    kind: "3d",
    group: "Storefront & Navigation",
    label: "Cart trolley",
    icon3d: "cart-add",
    surfaces: ["Header cart button", "Cart drawer heading", "Empty cart"],
  },
  {
    id: "secure-checkout",
    kind: "3d",
    group: "Trust & Security",
    label: "Secure checkout shield",
    icon3d: "secure-checkout",
    surfaces: [
      "Landing hero trust badges: Minimum delivery order",
      "Checkout page heading",
      "Landing feature card: secure checkout",
      "Help Centre: Platform Admin journey",
    ],
  },
  {
    id: "order-updates",
    kind: "3d",
    group: "Account & Orders",
    label: "Order updates bell",
    icon3d: "order-updates",
    surfaces: ["Landing feature card: order updates"],
  },
  {
    id: "view-shopper",
    kind: "3d",
    group: "Staff & Operations",
    label: "Role switcher: shopper view",
    icon3d: "view-shopper",
    surfaces: ["Header role switcher", "Help Centre: Shopper journey"],
  },
  {
    id: "view-staff",
    kind: "3d",
    group: "Staff & Operations",
    label: "Role switcher: staff view",
    icon3d: "view-staff",
    surfaces: ["Header role switcher", "Help Centre: Staff journey"],
  },
  {
    id: "view-admin",
    kind: "3d",
    group: "Staff & Operations",
    label: "Role switcher: admin view",
    icon3d: "view-admin",
    surfaces: ["Header role switcher", "Help Centre: Store Admin journey"],
  },
  {
    id: "rewards-coin",
    kind: "3d",
    group: "Rewards & Loyalty",
    label: "Rewards launcher coin",
    icon3d: "rewards-coin",
    surfaces: ["Floating rewards launcher", "Help Centre: Loyalty Points"],
  },
  {
    id: "halal-certified",
    kind: "3d",
    group: "Trust & Security",
    label: "100% Halal certified badge",
    icon3d: "halal-certified",
    surfaces: ["Landing hero trust badges: 100% Certified HMC Halal", "Landing trust strip"],
  },
  {
    id: "postcode-search",
    kind: "3d",
    group: "Fulfilment & Delivery",
    label: "Postcode / location pin",
    icon3d: "postcode-search",
    surfaces: ["Delivery location dialog", "Help Centre: Delivery & Minimums"],
  },
  {
    id: "contact-follow",
    kind: "3d",
    group: "Fulfilment & Delivery",
    label: "Contact & follow",
    icon3d: "contact-follow",
    surfaces: ["Floating contact button"],
  },
  {
    id: "rewards-gift",
    kind: "3d",
    group: "Rewards & Loyalty",
    label: "Rewards gift",
    icon3d: "rewards-gift",
    surfaces: ["Third-party credits page"],
  },
];

function humanise(id: string): string {
  const words = id.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const FLAT_ICON_SURFACES: Partial<Record<IconName, readonly string[]>> = {
  layers: ["Subcategories navigation: 'All' filter tile"],
  apple: ["Subcategories navigation: Fresh Fruit, Fresh Vegetables, Herbs & Salads"],
  croissant: ["Subcategories navigation: Bread & Loaves, Pastries"],
  milk: ["Subcategories navigation: Milk & Cream, Cheese & Paneer, Eggs & Butter"],
  beef: ["Subcategories navigation: Lamb & Mutton, Chicken & Poultry, Beef & Mince"],
  coffee: ["Subcategories navigation: Tea & Coffee, Juices & Soft Drinks, Water & Mixers"],
  cookie: ["Subcategories navigation: Crisps & Namkeen, Biscuits & Sweets, Nuts & Dried Fruit"],
  house: ["Subcategories navigation: Cleaning, Kitchen & Foil, Paper & Toiletries"],
  globe: ["Subcategories navigation: South Asian, Middle Eastern, African & Caribbean"],
  package: [
    "Subcategories navigation: Fresh Fish, Frozen Fish",
    "Customer Account: Orders",
    "Staff: Products & Bundles",
  ],
  tag: ["Category: Pet Supplies", "Checkout: Discount codes", "WhatsApp offers"],
  gift: ["Category: Baby & Kids", "Rewards: Gift perks"],
  sparkles: ["Category: Health & Beauty", "Staff: Visual Asset Generator"],
  "featured-star": ["Storefront: Featured products badge"],
  heart: ["Customer Account: Favourites"],
  "heart-outline": ["Product Cards: Favourite button"],
  "list-checks": ["Shop Your List", "Customer Account: Lists"],
  "clipboard-list": ["Customer Account: Order overview", "Staff: Orders desk"],
  ruler: ["Staff: Net content & measurements"],
  megaphone: ["Staff: Promotions & Announcements"],
  "badge-check": ["Customer Reviews: Verified badge", "Help Centre: Role journeys"],
  "calendar-clock": ["Checkout: Delivery slot picker", "Product: Restock notice"],
  boxes: ["Help Centre: User journeys"],
  "message-square-quote": ["Customer Account: Feedback & reviews"],
  truck: ["Storefront: Delivery trust badges", "Location control"],
  phone: ["Header & Footer: Helpline"],
  mail: ["Storefront Footer: Contact email"],
  "map-pin": ["Storefront Footer: Store address", "Location selector"],
  lock: ["Storefront Footer: Secure 256-bit SSL", "Rewards: Locked perks"],
  "circle-question-mark": ["Header: Help guide", "Help Centre FAQs"],
  "credit-card": ["Payment options badge"],
  banknote: ["Cash on delivery / payment options"],
  coins: ["Loyalty points & cash balance"],
  bookmark: ["Customer Account: Saved items"],
  "bell-ring": ["Staff: Real-time order alerts"],
  "folder-tree": ["Staff: Category catalogue", "Asset Gallery empty states"],
  "image-up": ["Staff: Asset uploaders"],
  "layout-dashboard": ["Staff: Portal navigation"],
  "triangle-alert": ["Storefront: Error alerts", "Quick View: Error dialog"],
  upload: ["Staff: Stock file importer"],
  users: ["Staff: Customer roster", "Rewards: Referral programme"],
  "user-x": ["Staff: Customer redaction"],
};

const FLAT_ICON_GROUPS: Partial<Record<IconName, IconSlotGroup>> = {
  layers: "Storefront & Navigation",
  apple: "Subcategories & Produce",
  croissant: "Subcategories & Produce",
  milk: "Subcategories & Produce",
  beef: "Subcategories & Produce",
  coffee: "Subcategories & Produce",
  cookie: "Subcategories & Produce",
  house: "Subcategories & Produce",
  globe: "Subcategories & Produce",
  package: "Subcategories & Produce",
  tag: "Storefront & Navigation",
  gift: "Rewards & Loyalty",
  sparkles: "Storefront & Navigation",
  "featured-star": "Storefront & Navigation",
  heart: "Account & Orders",
  "heart-outline": "Account & Orders",
  "list-checks": "Account & Orders",
  "clipboard-list": "Account & Orders",
  ruler: "Staff & Operations",
  megaphone: "Staff & Operations",
  "badge-check": "Trust & Security",
  "calendar-clock": "Fulfilment & Delivery",
  boxes: "Staff & Operations",
  "message-square-quote": "Account & Orders",
  truck: "Fulfilment & Delivery",
  phone: "Fulfilment & Delivery",
  mail: "Fulfilment & Delivery",
  "map-pin": "Fulfilment & Delivery",
  lock: "Trust & Security",
  "circle-question-mark": "Storefront & Navigation",
  "credit-card": "Account & Orders",
  banknote: "Account & Orders",
  coins: "Rewards & Loyalty",
  bookmark: "Account & Orders",
  "bell-ring": "Staff & Operations",
  "folder-tree": "Staff & Operations",
  "image-up": "Staff & Operations",
  "layout-dashboard": "Staff & Operations",
  "triangle-alert": "Staff & Operations",
  upload: "Staff & Operations",
  users: "Staff & Operations",
  "user-x": "Staff & Operations",
};

const FLAT_ICON_LABELS: Partial<Record<IconName, string>> = {
  layers: "All Products / Assortment (Subcategories 'All' tile)",
  apple: "Fresh Fruit & Vegetables (Subcategories)",
  croissant: "Bakery & Breads (Subcategories)",
  milk: "Dairy & Milk (Subcategories)",
  beef: "Fresh Meat & Cuts (Subcategories)",
  coffee: "Beverages & Coffee (Subcategories)",
  cookie: "Snacks & Biscuits (Subcategories)",
  house: "Household & Cleaning (Subcategories)",
  globe: "International & World Foods (Subcategories)",
};

export const FLAT_ICON_SLOTS: readonly FlatIconSlot[] = (
  Object.entries(ICON_REGISTRY) as [IconName, (typeof ICON_REGISTRY)[IconName]][]
)
  .filter(([, entry]) => entry.provider === "noto")
  .map(([name, entry]) => ({
    id: `icon:${name}` as const,
    kind: "flat" as const,
    group: FLAT_ICON_GROUPS[name] ?? "General UI",
    label: FLAT_ICON_LABELS[name] ?? humanise(name),
    iconName: name,
    notoId: entry.id,
    surfaces: FLAT_ICON_SURFACES[name] ?? ["Storefront & Staff interface"],
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
