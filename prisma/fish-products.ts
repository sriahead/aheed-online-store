import { deriveUnitPriceLabel, type NetContent } from "@/components/product/unit-price";

/**
 * #1147 — the products for the Fish department that `#1131` created empty, and the ONE decision
 * function that turns a vendor's current categories and product slugs into the creates needed.
 *
 * Imported by `prisma/seed.ts` (through `toSeedProducts`, for a clean dev database) and by
 * `scripts/add-fish-products.ts` (staging and production). Pure: no Prisma client, no I/O, so
 * `tests/add-fish-products.test.ts` covers every decision without a database.
 *
 * WHAT IS DELIBERATELY NOT HERE. No origin, brand, halal, organic, fresh, vegetarian, gluten-free or
 * HMC value, and no image: those are claims or files about a real product that nobody has verified.
 * `#239` is the precedent for what an unsupported certification claim costs. The owner sets any that
 * are true in the staff panel. Descriptions say what the item is and name its allergen, nothing else.
 *
 * The prices are indicative and are for the owner's review (`#1147`). Net content is a whole number in
 * its own unit, so a kilo is 1000 grams, and the unit label is derived from it rather than typed.
 */

export type FishSubcategorySlug = "fresh-fish" | "frozen-fish";

export interface FishProduct {
  slug: string;
  name: string;
  description: string;
  subcategory: FishSubcategorySlug;
  /** Pence. */
  basePricePence: number;
  netContent: NetContent;
}

const FISH = "Contains: Fish.";
const CRUSTACEANS = "Contains: Crustaceans.";
const MOLLUSCS = "Contains: Molluscs.";

export const FISH_PRODUCTS: readonly FishProduct[] = [
  {
    slug: "atlantic-salmon-fillets-240g",
    name: "Atlantic Salmon Fillets 240g",
    description: `Atlantic salmon fillets in a 240g pack. ${FISH}`,
    subcategory: "fresh-fish",
    basePricePence: 499,
    netContent: { amount: 240, unit: "GRAM" },
  },
  {
    slug: "cod-fillets-400g",
    name: "Cod Fillets 400g",
    description: `Cod fillets in a 400g pack. ${FISH}`,
    subcategory: "fresh-fish",
    basePricePence: 649,
    netContent: { amount: 400, unit: "GRAM" },
  },
  {
    slug: "sea-bass-fillets-260g",
    name: "Sea Bass Fillets 260g",
    description: `Sea bass fillets in a 260g pack. ${FISH}`,
    subcategory: "fresh-fish",
    basePricePence: 499,
    netContent: { amount: 260, unit: "GRAM" },
  },
  {
    slug: "whole-sea-bream",
    name: "Whole Sea Bream",
    description: `Whole sea bream, sold by the fish. ${FISH}`,
    subcategory: "fresh-fish",
    basePricePence: 399,
    netContent: { amount: 1, unit: "EACH" },
  },
  {
    slug: "whole-tilapia",
    name: "Whole Tilapia",
    description: `Whole tilapia, sold by the fish. ${FISH}`,
    subcategory: "fresh-fish",
    basePricePence: 349,
    netContent: { amount: 1, unit: "EACH" },
  },
  {
    slug: "whole-mackerel-2-pack-500g",
    name: "Whole Mackerel (2) 500g",
    description: `Two whole mackerel in a 500g pack. ${FISH}`,
    subcategory: "fresh-fish",
    basePricePence: 329,
    netContent: { amount: 500, unit: "GRAM" },
  },
  {
    slug: "whole-rainbow-trout",
    name: "Whole Rainbow Trout",
    description: `Whole rainbow trout, sold by the fish. ${FISH}`,
    subcategory: "fresh-fish",
    basePricePence: 349,
    netContent: { amount: 1, unit: "EACH" },
  },
  {
    slug: "raw-king-prawns-300g",
    name: "Raw King Prawns 300g",
    description: `Raw king prawns in a 300g pack. ${CRUSTACEANS}`,
    subcategory: "fresh-fish",
    basePricePence: 599,
    netContent: { amount: 300, unit: "GRAM" },
  },
  {
    slug: "whole-silver-pomfret-800g",
    name: "Whole Silver Pomfret 800g",
    description: `Frozen whole silver pomfret in an 800g pack. ${FISH}`,
    subcategory: "frozen-fish",
    basePricePence: 699,
    netContent: { amount: 800, unit: "GRAM" },
  },
  {
    slug: "rohu-steaks-1kg",
    name: "Rohu Steaks 1kg",
    description: `Frozen rohu steaks in a 1kg pack. ${FISH}`,
    subcategory: "frozen-fish",
    basePricePence: 749,
    netContent: { amount: 1000, unit: "GRAM" },
  },
  {
    slug: "hilsa-ilish-cuts-1kg",
    name: "Hilsa (Ilish) Cuts 1kg",
    description: `Frozen hilsa (ilish) cuts in a 1kg pack. ${FISH}`,
    subcategory: "frozen-fish",
    basePricePence: 1499,
    netContent: { amount: 1000, unit: "GRAM" },
  },
  {
    slug: "whole-tilapia-1kg",
    name: "Whole Tilapia 1kg",
    description: `Frozen whole tilapia in a 1kg pack. ${FISH}`,
    subcategory: "frozen-fish",
    basePricePence: 549,
    netContent: { amount: 1000, unit: "GRAM" },
  },
  {
    slug: "kingfish-seer-steaks-1kg",
    name: "Kingfish (Seer) Steaks 1kg",
    description: `Frozen kingfish (seer) steaks in a 1kg pack. ${FISH}`,
    subcategory: "frozen-fish",
    basePricePence: 999,
    netContent: { amount: 1000, unit: "GRAM" },
  },
  {
    slug: "basa-fillets-1kg",
    name: "Basa Fillets 1kg",
    description: `Frozen basa fillets in a 1kg pack. ${FISH}`,
    subcategory: "frozen-fish",
    basePricePence: 599,
    netContent: { amount: 1000, unit: "GRAM" },
  },
  {
    slug: "frozen-cod-fillets-800g",
    name: "Cod Fillets 800g",
    description: `Frozen cod fillets in an 800g pack. ${FISH}`,
    subcategory: "frozen-fish",
    basePricePence: 749,
    netContent: { amount: 800, unit: "GRAM" },
  },
  {
    slug: "raw-king-prawns-peeled-500g",
    name: "Raw King Prawns Peeled 500g",
    description: `Frozen raw king prawns, peeled, in a 500g pack. ${CRUSTACEANS}`,
    subcategory: "frozen-fish",
    basePricePence: 699,
    netContent: { amount: 500, unit: "GRAM" },
  },
  {
    slug: "salmon-fillets-4-pack-500g",
    name: "Salmon Fillets 4 Pack 500g",
    description: `Frozen salmon fillets, four in a 500g pack. ${FISH}`,
    subcategory: "frozen-fish",
    basePricePence: 649,
    netContent: { amount: 500, unit: "GRAM" },
  },
  {
    slug: "squid-rings-500g",
    name: "Squid Rings 500g",
    description: `Frozen squid rings in a 500g pack. ${MOLLUSCS}`,
    subcategory: "frozen-fish",
    basePricePence: 399,
    netContent: { amount: 500, unit: "GRAM" },
  },
];

/** The unit label a product carries: the same string the shop derives for display (null is impossible
 * for a positive net content, and a null here would be a typo in the table above). */
function unitLabelFor(product: FishProduct): string {
  const label = deriveUnitPriceLabel(product.basePricePence, product.netContent);
  if (label === null) throw new Error(`${product.slug}: net content cannot price this product`);
  return label;
}

/** The fields a `create-product` change defines, named as `ProductWriteInput` names them. */
export interface CreateProductChange {
  kind: "create-product";
  subcategory: FishSubcategorySlug;
  slug: string;
  name: string;
  description: string;
  basePrice: number;
  unitLabel: string;
  netContentAmount: number;
  netContentUnit: NetContent["unit"];
  originalPrice: null;
  origin: null;
  brandId: null;
  isHalal: false;
  isFresh: false;
  isOrganic: false;
  isVegetarian: false;
  isGlutenFree: false;
  isHmcCertified: false;
  hmcReference: null;
  hmcVerifiedAt: null;
  tier: null;
  attributeValues: [];
}

export type FishProductChange = CreateProductChange;

export interface FishCategoryState {
  id: string;
  slug: string;
  parentId: string | null;
  isActive: boolean;
}

export interface FishPlanState {
  categories: readonly FishCategoryState[];
  /** Every product slug the vendor already has, in any category. */
  existingProductSlugs: readonly string[];
}

export interface FishProductPlan {
  changes: FishProductChange[];
  /** Things the plan deliberately does not do, said out loud so a dry run explains itself. */
  notes: string[];
  /** A reason the plan cannot run at all (the Fish tree is incomplete), or null. */
  blocked: string | null;
  /** Subcategory slug to category id, for the writer. Empty when `blocked`. */
  categoryIds: Partial<Record<FishSubcategorySlug, string>>;
}

const SUBCATEGORIES: readonly FishSubcategorySlug[] = ["fresh-fish", "frozen-fish"];

/**
 * Decide the creates. Blocked, with no changes, unless the department `fish` and both sub-categories
 * exist and the sub-categories are its children: products cannot be filed under a tree that is not
 * there, and `scripts/apply-department-changes.ts` is what creates it.
 *
 * Only ever creates. A slug the vendor already has, in any category, is skipped with a note, so the
 * owner's edits to an existing product survive a re-run and a plan computed after its own changes
 * is empty.
 */
export function planFishProducts(state: FishPlanState): FishProductPlan {
  const bySlug = new Map(state.categories.map((category) => [category.slug, category]));
  const fish = bySlug.get("fish");
  const missing: string[] = [];
  const categoryIds: Partial<Record<FishSubcategorySlug, string>> = {};

  if (!fish || fish.parentId !== null) missing.push("the Fish department (fish)");
  for (const slug of SUBCATEGORIES) {
    const child = bySlug.get(slug);
    if (!child || !fish || child.parentId !== fish.id) missing.push(`the sub-category ${slug}`);
    else categoryIds[slug] = child.id;
  }

  if (missing.length > 0) {
    return {
      changes: [],
      notes: [],
      blocked:
        `The Fish tree is incomplete: missing ${missing.join(", ")}. ` +
        "Run scripts/apply-department-changes.ts for this vendor with --apply first.",
      categoryIds: {},
    };
  }

  const notes: string[] = [];
  if (fish && !fish.isActive) {
    notes.push("the Fish department is hidden here, so shoppers will not see these products yet");
  }

  const existing = new Set(state.existingProductSlugs);
  const changes: FishProductChange[] = [];
  for (const product of FISH_PRODUCTS) {
    if (existing.has(product.slug)) {
      notes.push(`skipped ${product.slug}: a product with that slug already exists`);
      continue;
    }
    changes.push({
      kind: "create-product",
      subcategory: product.subcategory,
      slug: product.slug,
      name: product.name,
      description: product.description,
      basePrice: product.basePricePence,
      unitLabel: unitLabelFor(product),
      netContentAmount: product.netContent.amount,
      netContentUnit: product.netContent.unit,
      originalPrice: null,
      origin: null,
      brandId: null,
      isHalal: false,
      isFresh: false,
      isOrganic: false,
      isVegetarian: false,
      isGlutenFree: false,
      isHmcCertified: false,
      hmcReference: null,
      hmcVerifiedAt: null,
      tier: null,
      attributeValues: [],
    });
  }
  return { changes, notes, blocked: null, categoryIds };
}

/** One human-readable line per change, for the dry run and the apply log. */
export function describeFishChange(change: FishProductChange): string {
  return `create ${change.name} (${change.slug}) in ${change.subcategory}, ${change.unitLabel}`;
}

/** The shape `prisma/seed.ts`'s `CatalogueProduct` takes for the products it seeds. */
export interface SeedFishProduct {
  slug: string;
  name: string;
  description: string;
  basePrice: number;
  unitLabel: string;
  quantity: number;
}

/** Dev stock for a seeded product, the same figure as the other seeded subcategory products. */
const SEED_QUANTITY = 20;

/**
 * The Fish products for the dev seed, keyed on the sub-category slug like
 * `AHEED_SUBCATEGORY_PRODUCTS`. Built from `FISH_PRODUCTS`, so the seed and the script cannot
 * disagree about a name, slug or price.
 */
export function toSeedProducts(): Record<FishSubcategorySlug, SeedFishProduct[]> {
  const out: Record<FishSubcategorySlug, SeedFishProduct[]> = {
    "fresh-fish": [],
    "frozen-fish": [],
  };
  for (const product of FISH_PRODUCTS) {
    out[product.subcategory].push({
      slug: product.slug,
      name: product.name,
      description: product.description,
      basePrice: product.basePricePence,
      unitLabel: unitLabelFor(product),
      quantity: SEED_QUANTITY,
    });
  }
  return out;
}
