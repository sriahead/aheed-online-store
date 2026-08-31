import type { Prisma } from "@prisma/client";
import type { getPrisma, getPrismaWs } from "@/lib/db";
import { isUniqueViolation } from "@/lib/repositories/prisma-errors";
import { effectiveStock } from "@/lib/cart-rules";
import { CANDIDATE_QUERY_LIMIT, type ListCandidate } from "@/lib/shopping-list";
import type { ProductTier } from "@/lib/tier-pricing";
import {
  deleteProductTier,
  getTierForProduct,
  listActiveTiersForProducts,
  upsertProductTier,
} from "@/lib/repositories/product-tiers";

export interface ProductImageSummary {
  storageKey: string;
  alt: string;
  isPrimary: boolean;
}

/**
 * The admin gallery (#211) needs to target one specific row, which the
 * public-facing ProductImageSummary deliberately doesn't carry — storefront
 * reads never need a row's id.
 */
export interface AdminProductImage extends ProductImageSummary {
  id: string;
  sortOrder: number;
}

export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  basePrice: number;
  unitLabel: string;
  primaryImage: ProductImageSummary | null;
  origin: string | null;
  originalPrice: number | null;
  isHalal: boolean;
  isFresh: boolean;
  isOrganic: boolean;
  averageRating: number;
  reviewCount: number;
  /** P3a — cards need this to render the add-to-cart out-of-stock state. */
  inStock: boolean;
  /**
   * P8.5a (#345) — the card's low-stock urgency badge needs the COUNT, not just
   * `inStock`. Both come from the `Inventory` row that was already joined for
   * `inStock`, so this adds no query and no migration.
   *
   * `stockQuantity` is normalised through `effectiveStock()`, so a negative or
   * null inventory reads as 0 rather than leaking a nonsense number into the
   * UI. `lowStockThreshold` falls back to the schema default (3) when there is
   * no inventory row at all — a product with no inventory is out of stock, so
   * the threshold is never actually consulted for it, but a number keeps the
   * type honest and the card free of null handling.
   */
  stockQuantity: number;
  lowStockThreshold: number;
  /**
   * P8.5d (#348) — the product's active multi-buy tier, or null.
   *
   * The card advertises it ("3 for £10.00") without knowing any quantity, which
   * is why the tier itself travels rather than a computed saving: a saving needs
   * a line quantity and a card has none. `lib/tier-pricing.ts` does the
   * arithmetic wherever a quantity actually exists (the cart, the order).
   */
  tier: ProductTier | null;
}

/**
 * Mirrors `Inventory.lowStockThreshold`'s schema default. Used only when a
 * product has no inventory row; see ProductSummary's note.
 */
const DEFAULT_LOW_STOCK_THRESHOLD = 3;

export interface ProductDetail extends ProductSummary {
  description: string;
  images: ProductImageSummary[];
}

export interface ProductPage {
  items: ProductSummary[];
  nextCursor: string | null;
}

/** Shared filter shape for listByCategory(), search() and list() — one definition, not three. */
export interface ProductFilters {
  minPricePence?: number;
  maxPricePence?: number;
  inStockOnly?: boolean;
  isHalal?: boolean;
  isFresh?: boolean;
  isOrganic?: boolean;
  isFeatured?: boolean;
}

/**
 * P8.5b (#346) — one department's headline product, for the hero's live price
 * callout. Deliberately smaller than ProductSummary: the hero shows a name, a
 * price and a link, and carrying rating/stock/badges it never renders would
 * invite them onto the panel later without anyone deciding to put them there.
 */
export interface CategorySpotlight {
  categoryId: string;
  name: string;
  slug: string;
  basePrice: number;
  originalPrice: number | null;
  unitLabel: string;
}

/** Which speciality attributes the current vendor actually uses (≥1 active product). */
export interface AvailableSpecialities {
  halal: boolean;
  fresh: boolean;
  organic: boolean;
}

export interface ProductRepository {
  listByCategory(
    categoryIds: string[],
    opts: { take: number; cursor?: string } & ProductFilters,
  ): Promise<ProductPage>;
  search(
    query: string,
    opts: { take: number; cursor?: string } & ProductFilters,
  ): Promise<ProductPage>;
  /**
   * Filtered product listing with NO text query and no category constraint
   * (#211) — for the homepage's "recent"/"featured" rows, which need "products
   * matching these filters", not "products matching this search term". Kept
   * separate from search() rather than teaching it to treat "" as "no text
   * filter": search()'s empty-query guard is correct for its real caller, the
   * /search page, where an empty box means "nothing searched yet", not
   * "browse everything".
   */
  list(opts: { take: number; cursor?: string } & ProductFilters): Promise<ProductPage>;
  getBySlug(slug: string): Promise<ProductDetail | null>;
  /** Drives per-vendor filter visibility — a food vendor shows Halal/Fresh/Organic; a tech one shows none. */
  availableSpecialities(): Promise<AvailableSpecialities>;
  /**
   * Candidate products for a whole "Shop your list" paste (P3d, #114), in ONE
   * query for the entire list rather than one per line. Deliberately separate
   * from search(): it matches `name` only (a term hitting prose in a
   * description yields a confident-looking wrong product) and leaves the
   * per-line all-terms decision to lib/shopping-list.ts.
   */
  matchListTerms(terms: string[]): Promise<ListCandidate[]>;
  /**
   * P8.5b (#346) — one headline product per department for the homepage hero,
   * in a single query. Keyed by category id.
   */
  categorySpotlights(categoryIds: readonly string[]): Promise<Map<string, CategorySpotlight>>;
}

const productImageSelect = { storageKey: true, alt: true, isPrimary: true } as const;

/** productImageSelect plus id/sortOrder — see AdminProductImage. */
const adminProductImageSelect = {
  id: true,
  storageKey: true,
  alt: true,
  isPrimary: true,
  sortOrder: true,
} as const;

function buildFilterWhere(filters: ProductFilters): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {};
  if (filters.minPricePence !== undefined || filters.maxPricePence !== undefined) {
    where.basePrice = {
      ...(filters.minPricePence !== undefined ? { gte: filters.minPricePence } : {}),
      ...(filters.maxPricePence !== undefined ? { lte: filters.maxPricePence } : {}),
    };
  }
  if (filters.inStockOnly) {
    where.inventory = { quantity: { gt: 0 } };
  }
  if (filters.isHalal) where.isHalal = true;
  if (filters.isFresh) where.isFresh = true;
  if (filters.isOrganic) where.isOrganic = true;
  if (filters.isFeatured) where.isFeatured = true;
  return where;
}

/**
 * Storefront product reads (#252). Every one takes `prisma` and `vendorId` as
 * explicit arguments and reads no request context — the request-scoped facade
 * that resolves both lives in `lib/products-service.ts`.
 */
async function findPage(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  where: Prisma.ProductWhereInput,
  { take, cursor }: { take: number; cursor?: string },
): Promise<ProductPage> {
  // Keyset (cursor) pagination on (createdAt, id) — never OFFSET, per
  // specs/architecture.md's pagination strategy. Over-fetch by one to
  // know whether a next page exists without a separate count query.
  const rows = await prisma.product.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      slug: true,
      name: true,
      basePrice: true,
      unitLabel: true,
      origin: true,
      originalPrice: true,
      isHalal: true,
      isFresh: true,
      isOrganic: true,
      averageRating: true,
      reviewCount: true,
      images: { where: { isPrimary: true }, take: 1, select: productImageSelect },
      inventory: { select: { quantity: true, lowStockThreshold: true } },
    },
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;

  // One query for the page's tiers, then a lookup per card — never one per row.
  const tiers = await listActiveTiersForProducts(
    prisma,
    vendorId,
    page.map((p) => p.id),
  );

  return {
    items: page.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      basePrice: p.basePrice,
      unitLabel: p.unitLabel,
      origin: p.origin,
      originalPrice: p.originalPrice,
      isHalal: p.isHalal,
      isFresh: p.isFresh,
      isOrganic: p.isOrganic,
      averageRating: p.averageRating,
      reviewCount: p.reviewCount,
      primaryImage: p.images[0] ?? null,
      inStock: (p.inventory?.quantity ?? 0) > 0,
      stockQuantity: effectiveStock(p.inventory?.quantity),
      lowStockThreshold: p.inventory?.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD,
      tier: tiers.get(p.id) ?? null,
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

/**
 * #496 — takes an array, not a single id, so the storefront category page can
 * aggregate a department's own products with every one of its subcategories'
 * products in one query, rather than showing only the 2-3 products a
 * department happens to hold directly. A single category still passes a
 * one-element array; a subcategory (which has no children of its own, the
 * tree being capped at two levels) always calls this with exactly its own id.
 */
export async function listProductsByCategory(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  categoryIds: string[],
  { take, cursor, ...filters }: { take: number; cursor?: string } & ProductFilters,
): Promise<ProductPage> {
  return findPage(
    prisma,
    vendorId,
    { vendorId, categoryId: { in: categoryIds }, isActive: true, ...buildFilterWhere(filters) },
    { take, cursor },
  );
}

/**
 * How many rows to pull per requested category. The hero needs ONE product per
 * department, but "one per group" is not expressible in a single Prisma query
 * without raw SQL — which `CLAUDE.md` bans in application code. So this
 * over-fetches a bounded window and picks the first per category in memory.
 *
 * 4 is chosen against the real ordering: featured products sort first, and a
 * department with four or more featured products is choosing between good
 * candidates, not missing one. The cost is bounded at `4 x departments` rows
 * (roughly 36 for the seeded vendors), which is smaller than the product rows
 * the same page already fetches.
 */
const SPOTLIGHT_ROWS_PER_CATEGORY = 4;

/**
 * P8.5b (#346) — the headline product for each of several departments, in ONE
 * query rather than one per department (requirement R5).
 *
 * Ordering is `isFeatured desc, createdAt desc`: a vendor's own curation wins,
 * and newest-first breaks the tie. A department whose products all fall outside
 * the fetched window simply has no spotlight, and the hero renders that panel
 * without a price callout rather than inventing one — the same principle #239
 * established when hardcoded hero copy turned out to be one vendor's claim
 * rendered for everyone.
 */
export async function listCategorySpotlights(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  categoryIds: readonly string[],
): Promise<Map<string, CategorySpotlight>> {
  if (categoryIds.length === 0) return new Map();

  const rows = await prisma.product.findMany({
    where: { vendorId, isActive: true, categoryId: { in: [...categoryIds] } },
    orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
    take: categoryIds.length * SPOTLIGHT_ROWS_PER_CATEGORY,
    select: {
      categoryId: true,
      name: true,
      slug: true,
      basePrice: true,
      originalPrice: true,
      unitLabel: true,
    },
  });

  const spotlights = new Map<string, CategorySpotlight>();
  for (const row of rows) {
    // First row wins per category — the list is already in priority order.
    if (!spotlights.has(row.categoryId)) spotlights.set(row.categoryId, row);
  }
  return spotlights;
}

export async function listProducts(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  { take, cursor, ...filters }: { take: number; cursor?: string } & ProductFilters,
): Promise<ProductPage> {
  return findPage(
    prisma,
    vendorId,
    { vendorId, isActive: true, ...buildFilterWhere(filters) },
    { take, cursor },
  );
}

export async function searchProducts(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  query: string,
  { take, cursor, ...filters }: { take: number; cursor?: string } & ProductFilters,
): Promise<ProductPage> {
  const trimmed = query.trim();
  if (!trimmed) return { items: [], nextCursor: null };

  return findPage(
    prisma,
    vendorId,
    {
      vendorId,
      isActive: true,
      ...buildFilterWhere(filters),
      OR: [
        { name: { contains: trimmed, mode: "insensitive" } },
        { description: { contains: trimmed, mode: "insensitive" } },
      ],
    },
    { take, cursor },
  );
}

export async function getProductBySlug(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  slug: string,
): Promise<ProductDetail | null> {
  const product = await prisma.product.findFirst({
    where: { vendorId, slug, isActive: true },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      basePrice: true,
      unitLabel: true,
      origin: true,
      originalPrice: true,
      isHalal: true,
      isFresh: true,
      isOrganic: true,
      averageRating: true,
      reviewCount: true,
      images: { orderBy: { sortOrder: "asc" }, select: productImageSelect },
      inventory: { select: { quantity: true, lowStockThreshold: true } },
    },
  });
  if (!product) return null;

  const { inventory, images, ...rest } = product;
  const tiers = await listActiveTiersForProducts(prisma, vendorId, [product.id]);
  return {
    ...rest,
    images,
    primaryImage: images.find((i) => i.isPrimary) ?? images[0] ?? null,
    inStock: (inventory?.quantity ?? 0) > 0,
    stockQuantity: effectiveStock(inventory?.quantity),
    lowStockThreshold: inventory?.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD,
    tier: tiers.get(product.id) ?? null,
  };
}

export async function getAvailableSpecialities(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
): Promise<AvailableSpecialities> {
  const base = { vendorId, isActive: true };
  const [halal, fresh, organic] = await Promise.all([
    prisma.product.findFirst({ where: { ...base, isHalal: true }, select: { id: true } }),
    prisma.product.findFirst({ where: { ...base, isFresh: true }, select: { id: true } }),
    prisma.product.findFirst({ where: { ...base, isOrganic: true }, select: { id: true } }),
  ]);
  return { halal: halal !== null, fresh: fresh !== null, organic: organic !== null };
}

export async function matchProductListTerms(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  terms: string[],
): Promise<ListCandidate[]> {
  if (terms.length === 0) return [];

  const rows = await prisma.product.findMany({
    where: {
      vendorId,
      isActive: true,
      OR: terms.map((term) => ({
        name: { contains: term, mode: "insensitive" as const },
      })),
    },
    take: CANDIDATE_QUERY_LIMIT,
    select: {
      id: true,
      slug: true,
      name: true,
      basePrice: true,
      unitLabel: true,
      inventory: { select: { quantity: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    basePrice: row.basePrice,
    unitLabel: row.unitLabel,
    stock: effectiveStock(row.inventory?.quantity),
  }));
}

/* ------------------------------------------------------------------------- *
 * Admin catalogue path (P6b1, #159)
 *
 * The first WRITES on this repository — everything above is a query. Three
 * properties hold across all of it:
 *
 *  1. `vendorId` is an explicit ARGUMENT, never resolved from a form and never
 *     read from request context inside these functions. That is what lets a
 *     plain script exercise them (the `placeOrder(prisma, vendorId, input)`
 *     shape), and it is why no submitted field can redirect a write at another
 *     vendor's rows.
 *  2. No admin read filters `isActive`. The storefront reads above deliberately
 *     do, which is exactly why they cannot serve this surface: an owner has to
 *     be able to find and re-activate the product they just switched off.
 *  3. Errors a human can cause — a duplicate slug, a category that isn't
 *     theirs — come back as data. Only genuine faults throw.
 * ------------------------------------------------------------------------- */

/** Same shape lib/repositories/discounts.ts and loyalty.ts use, so a write can run inside a caller's transaction. */
type Db = ReturnType<typeof getPrisma>;
type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];
type AnyDb = Db | Tx;

/**
 * The WebSocket-adapter client, required by every export below that opens an
 * interactive transaction — `PrismaNeonHttp` cannot execute one at all (#382).
 *
 * Structurally identical to `Db` today, so the compiler will not stop you
 * passing the wrong one; #390 tracks making them nominally distinct. Until then
 * the parameter NAME (`prismaWs` vs `prisma`) is the signal, and
 * `tests/repository-transaction-safety.test.ts` is the check.
 */
type DbWs = ReturnType<typeof getPrismaWs>;

export interface AdminProductRow {
  id: string;
  slug: string;
  name: string;
  basePrice: number;
  isActive: boolean;
  categoryName: string;
  quantity: number;
  imageNeedsReview: boolean;
}

export interface AdminProductPage {
  items: AdminProductRow[];
  nextCursor: string | null;
}

export interface AdminProductDetail {
  id: string;
  slug: string;
  name: string;
  description: string;
  categoryId: string;
  basePrice: number;
  originalPrice: number | null;
  unitLabel: string;
  origin: string | null;
  isHalal: boolean;
  isFresh: boolean;
  isOrganic: boolean;
  isFeatured: boolean;
  isActive: boolean;
  quantity: number;
  lowStockThreshold: number;
  imageNeedsReview: boolean;
  /** Read here; written by setPrimaryProductImage/addProductImage/etc. (P6b2, #211). */
  images: AdminProductImage[];
  /** P8.5d (#348) — the multi-buy tier, active or not, so the form can re-enable one. */
  tier: ProductTier | null;
}

/** Everything a product write needs, already validated by lib/catalogue-form.ts. */
export interface ProductWriteInput {
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
  isFeatured: boolean;
  isActive: boolean;
  quantity: number;
  lowStockThreshold: number;
  /** P8.5d (#348) — the multi-buy tier, or null to remove it entirely. */
  tier: { groupQuantity: number; groupPricePence: number; isActive: boolean } | null;
}

export type CatalogueWriteResult =
  { ok: true; id: string } | { ok: false; error: string; field?: string };

export interface StaffInventoryRow {
  id: string;
  slug: string;
  name: string;
  unitLabel: string;
  basePrice: number;
  isActive: boolean;
  categoryName: string;
  quantity: number;
  primaryImage: ProductImageSummary | null;
}

export interface StaffInventoryPage {
  items: StaffInventoryRow[];
  nextCursor: string | null;
}

export async function listInventoryForStaff(
  prisma: Db,
  vendorId: string,
  { take, cursor, query }: { take: number; cursor?: string; query?: string },
): Promise<StaffInventoryPage> {
  const trimmed = query?.trim() ?? "";

  const whereClause: Prisma.ProductWhereInput = { vendorId };
  if (trimmed) {
    whereClause.OR = [
      { name: { contains: trimmed, mode: "insensitive" } },
      { description: { contains: trimmed, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.product.findMany({
    where: whereClause,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      slug: true,
      name: true,
      unitLabel: true,
      basePrice: true,
      isActive: true,
      category: { select: { name: true } },
      inventory: { select: { quantity: true } },
      images: { where: { isPrimary: true }, take: 1, select: productImageSelect },
    },
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;

  return {
    items: page.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      unitLabel: row.unitLabel,
      basePrice: row.basePrice,
      isActive: row.isActive,
      categoryName: row.category?.name ?? "Unknown",
      quantity: row.inventory?.quantity ?? 0,
      primaryImage: row.images?.[0] ?? null,
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

/** Keyset-paginated on (createdAt, id) like findPage() above — never OFFSET. */
export async function listProductsForAdmin(
  prisma: Db,
  vendorId: string,
  {
    take,
    cursor,
    search,
    isActive,
  }: {
    take: number;
    cursor?: string;
    /** Case-insensitive substring of Product.name. Null/undefined applies no filter (#169). */
    search?: string | null;
    /** undefined applies no filter, preserving P6b1's "show everything" default (#169). */
    isActive?: boolean;
  },
): Promise<AdminProductPage> {
  const rows = await prisma.product.findMany({
    where: {
      vendorId,
      // Name only, deliberately. The storefront's search() ORs a `contains`
      // across name AND description, which is right for a shopper hunting a
      // concept and wrong for an owner who knows what the product is called —
      // a description match would bury the exact-name hit they came for.
      ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
      ...(isActive === undefined ? {} : { isActive }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      slug: true,
      name: true,
      basePrice: true,
      isActive: true,
      imageNeedsReview: true,
      category: { select: { name: true } },
      inventory: { select: { quantity: true } },
    },
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;

  return {
    items: page.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      basePrice: row.basePrice,
      isActive: row.isActive,
      categoryName: row.category?.name ?? "Unknown",
      quantity: row.inventory?.quantity ?? 0,
      imageNeedsReview: row.imageNeedsReview,
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

export async function getProductForAdmin(
  prisma: Db,
  vendorId: string,
  id: string,
): Promise<AdminProductDetail | null> {
  // findFirst, not findUnique: `id` alone is unique, but a vendor-less read has
  // no place in this layer (ADR-004 slice 2).
  const row = await prisma.product.findFirst({
    where: { id, vendorId },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      categoryId: true,
      basePrice: true,
      originalPrice: true,
      unitLabel: true,
      origin: true,
      isHalal: true,
      isFresh: true,
      isOrganic: true,
      isFeatured: true,
      isActive: true,
      imageNeedsReview: true,
      inventory: { select: { quantity: true, lowStockThreshold: true } },
      images: { orderBy: { sortOrder: "asc" }, select: adminProductImageSelect },
    },
  });
  if (!row) return null;

  const { inventory, ...product } = row;
  // Active OR inactive: the form has to be able to re-activate a switched-off
  // multi-buy without the owner retyping its numbers, so this read is
  // deliberately not the active-only one the storefront uses.
  const tier = await getTierForProduct(prisma, vendorId, id);
  return {
    ...product,
    // A product seeded before P6b1 may have no Inventory row at all; the form
    // shows zeroes and the first save creates it (see updateProductForVendor).
    quantity: inventory?.quantity ?? 0,
    lowStockThreshold: inventory?.lowStockThreshold ?? 3,
    tier,
  };
}

/**
 * The category is resolved SCOPED TO THE VENDOR, and its absence is the refusal.
 * `Product.categoryId`'s foreign key carries no vendor, so nothing in the schema
 * stops a form submitting another vendor's category id — this lookup is the only
 * thing that does. Same defence P3d used for its untrusted review-form ids.
 */
async function assertOwnCategory(
  db: AnyDb,
  vendorId: string,
  categoryId: string,
): Promise<boolean> {
  const category = await db.category.findFirst({
    where: { id: categoryId, vendorId },
    select: { id: true },
  });
  return category !== null;
}

const WRONG_CATEGORY = {
  ok: false as const,
  error: "Choose a category that belongs to this store.",
  field: "categoryId",
};

const DUPLICATE_SLUG = {
  ok: false as const,
  error: "Another product in this store already uses that web address.",
  field: "slug",
};

export async function createProductForVendor(
  prisma: Db,
  vendorId: string,
  input: ProductWriteInput,
): Promise<CatalogueWriteResult> {
  try {
    if (!(await assertOwnCategory(prisma, vendorId, input.categoryId))) return WRONG_CATEGORY;

    // The Inventory row is a NESTED create, so it commits in the same implicit
    // transaction as the Product. Two sequential calls could leave a product
    // with no stock row — which every reader then papers over with `?? 0`,
    // making "out of stock" and "never given stock" indistinguishable.
    const created = await prisma.product.create({
      data: {
        vendorId,
        name: input.name,
        slug: input.slug,
        description: input.description,
        categoryId: input.categoryId,
        basePrice: input.basePrice,
        originalPrice: input.originalPrice,
        unitLabel: input.unitLabel,
        origin: input.origin,
        isHalal: input.isHalal,
        isFresh: input.isFresh,
        isOrganic: input.isOrganic,
        isFeatured: input.isFeatured,
        isActive: input.isActive,
        inventory: {
          create: {
            vendorId,
            quantity: input.quantity,
            lowStockThreshold: input.lowStockThreshold,
          },
        },
        // Nested for the same reason Inventory is: one implicit transaction, so
        // a product can never exist with a half-written multi-buy beside it.
        ...(input.tier
          ? {
              priceTier: {
                create: {
                  vendorId,
                  groupQuantity: input.tier.groupQuantity,
                  groupPricePence: input.tier.groupPricePence,
                  isActive: input.tier.isActive,
                },
              },
            }
          : {}),
      },
      select: { id: true },
    });
    return { ok: true, id: created.id };
  } catch (error) {
    if (isUniqueViolation(error)) return DUPLICATE_SLUG;
    throw error;
  }
}

export async function updateProductForVendor(
  prismaWs: DbWs,
  vendorId: string,
  id: string,
  input: ProductWriteInput,
): Promise<CatalogueWriteResult> {
  try {
    return await prismaWs.$transaction(async (tx) => {
      const existing = await tx.product.findFirst({
        where: { id, vendorId },
        select: { id: true },
      });
      // Another vendor's product is indistinguishable from one that never existed.
      if (!existing) return { ok: false as const, error: "That product no longer exists." };

      if (!(await assertOwnCategory(tx, vendorId, input.categoryId))) return WRONG_CATEGORY;

      await tx.product.update({
        where: { id, vendorId },
        data: {
          name: input.name,
          slug: input.slug,
          description: input.description,
          categoryId: input.categoryId,
          basePrice: input.basePrice,
          originalPrice: input.originalPrice,
          unitLabel: input.unitLabel,
          origin: input.origin,
          isHalal: input.isHalal,
          isFresh: input.isFresh,
          isOrganic: input.isOrganic,
          isFeatured: input.isFeatured,
          isActive: input.isActive,
        },
      });

      // upsert, not update: a product created before this slice may have no
      // Inventory row, and the owner's first save is where it should appear
      // rather than failing on a missing record.
      await tx.inventory.upsert({
        where: { productId: id, vendorId },
        create: {
          vendorId,
          productId: id,
          quantity: input.quantity,
          lowStockThreshold: input.lowStockThreshold,
        },
        update: { quantity: input.quantity, lowStockThreshold: input.lowStockThreshold },
      });

      // P8.5d (#348). Clearing both multi-buy fields DELETES the row rather than
      // deactivating it: "no multi-buy" and "a multi-buy that is switched off"
      // are different intents, and the form offers both (the active checkbox is
      // how you keep the numbers for next season). Inside this transaction, so
      // a product and its tier commit or roll back together.
      if (input.tier) {
        await upsertProductTier(tx, vendorId, id, input.tier);
      } else {
        await deleteProductTier(tx, vendorId, id);
      }

      return { ok: true as const, id };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return DUPLICATE_SLUG;
    throw error;
  }
}

/**
 * Point a product's PRIMARY image at a newly uploaded key (P6b2, #167).
 *
 * Repoint, never replace: the existing primary row is updated in place so its id
 * survives, and a product that has never had an image gets exactly one row. The
 * superseded object stays in storage — immutable keys are the whole reason no
 * CDN purge is needed, and cleaning them up is #174.
 *
 * Non-primary rows are left alone rather than cleared. None exist today (the
 * seed writes one image per product), but multi-image management is #173 and
 * this must not quietly destroy its data when it arrives.
 *
 * `alt` falls back to the product's own name, which is why the name is selected
 * here: ProductImage.alt is non-null, and an empty alt on a storefront image is
 * an accessibility defect rather than a tidy default.
 */
export async function setPrimaryProductImage(
  prismaWs: DbWs,
  vendorId: string,
  productId: string,
  storageKey: string,
  alt: string,
): Promise<CatalogueWriteResult> {
  return await prismaWs.$transaction(async (tx) => {
    // Vendor-scoped: another vendor's product is indistinguishable from one that
    // never existed, exactly as updateProductForVendor treats it.
    const product = await tx.product.findFirst({
      where: { id: productId, vendorId },
      select: { id: true, name: true },
    });
    if (!product) return { ok: false as const, error: "That product no longer exists." };

    const altText = alt.trim() === "" ? product.name : alt.trim();
    const existing = await tx.productImage.findFirst({
      where: { productId, isPrimary: true },
      select: { id: true },
    });

    if (existing) {
      await tx.productImage.update({
        where: { id: existing.id },
        data: { storageKey, alt: altText },
      });
    } else {
      await tx.productImage.create({
        data: { productId, storageKey, alt: altText, isPrimary: true, sortOrder: 0 },
      });
    }

    return { ok: true as const, id: productId };
  });
}

/**
 * Add a NON-primary image (#211) — the gap #173 named: nothing before this
 * ever created a second ProductImage row. `isPrimary: true` only when the
 * product currently has zero images, so a product's first image is primary
 * however it arrived (this action or the original upload-as-primary flow).
 */
export async function addProductImage(
  prismaWs: DbWs,
  vendorId: string,
  productId: string,
  storageKey: string,
  alt: string,
): Promise<CatalogueWriteResult> {
  return await prismaWs.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: productId, vendorId },
      select: { id: true, name: true },
    });
    if (!product) return { ok: false as const, error: "That product no longer exists." };

    const existing = await tx.productImage.findMany({
      where: { productId },
      select: { sortOrder: true },
      orderBy: { sortOrder: "desc" },
      take: 1,
    });
    const nextSortOrder = existing.length === 0 ? 0 : existing[0].sortOrder + 1;
    const altText = alt.trim() === "" ? product.name : alt.trim();

    await tx.productImage.create({
      data: {
        productId,
        storageKey,
        alt: altText,
        isPrimary: existing.length === 0,
        sortOrder: nextSortOrder,
      },
    });

    return { ok: true as const, id: productId };
  });
}

/**
 * Promote an existing image to primary (#211) — unlike setPrimaryProductImage,
 * this never touches storageKey; it only moves which row `isPrimary` sits on.
 */
export async function promoteProductImage(
  prismaWs: DbWs,
  vendorId: string,
  productId: string,
  imageId: string,
): Promise<CatalogueWriteResult> {
  return await prismaWs.$transaction(async (tx) => {
    const product = await tx.product.findFirst({ where: { id: productId, vendorId } });
    if (!product) return { ok: false as const, error: "That product no longer exists." };

    const target = await tx.productImage.findFirst({
      where: { id: imageId, productId },
      select: { id: true, isPrimary: true },
    });
    if (!target) return { ok: false as const, error: "That image no longer exists." };
    if (target.isPrimary) return { ok: true as const, id: productId };

    await tx.productImage.updateMany({
      where: { productId, isPrimary: true },
      data: { isPrimary: false },
    });
    await tx.productImage.update({ where: { id: target.id }, data: { isPrimary: true } });

    return { ok: true as const, id: productId };
  });
}

/** What removeProductImage deleted, so the caller (Service layer) can remove it from storage too. */
export type RemoveImageResult = { ok: true; storageKey: string } | { ok: false; error: string };

/**
 * Delete a ProductImage row (#211). Deliberately does NOT touch storage —
 * Presentation -> Service -> Repository -> Prisma (specs/architecture.md):
 * the repository layer is DB-only, same as setPrimaryProductImage never
 * called headObject itself. The Service layer (features/admin/product-image.ts)
 * calls StorageService.deleteObject with the storageKey this returns.
 *
 * If the removed row was primary and others remain, the row with the lowest
 * remaining sortOrder is promoted in the same transaction — a product with
 * any images always has exactly one primary.
 */
export async function removeProductImage(
  prismaWs: DbWs,
  vendorId: string,
  productId: string,
  imageId: string,
): Promise<RemoveImageResult> {
  return await prismaWs.$transaction(async (tx) => {
    const product = await tx.product.findFirst({ where: { id: productId, vendorId } });
    if (!product) return { ok: false as const, error: "That product no longer exists." };

    const target = await tx.productImage.findFirst({
      where: { id: imageId, productId },
      select: { id: true, storageKey: true, isPrimary: true },
    });
    if (!target) return { ok: false as const, error: "That image no longer exists." };

    await tx.productImage.delete({ where: { id: target.id } });

    if (target.isPrimary) {
      const next = await tx.productImage.findFirst({
        where: { productId },
        orderBy: { sortOrder: "asc" },
        select: { id: true },
      });
      if (next) {
        await tx.productImage.update({ where: { id: next.id }, data: { isPrimary: true } });
      }
    }

    return { ok: true as const, storageKey: target.storageKey };
  });
}

/**
 * Rewrite sortOrder to match a given order (#211). Refuses (no writes) unless
 * `orderedImageIds` is EXACTLY the product's current image id set — a partial
 * or stale list would otherwise silently reorder a subset and leave the rest
 * inconsistent.
 */
export async function reorderProductImages(
  prismaWs: DbWs,
  vendorId: string,
  productId: string,
  orderedImageIds: string[],
): Promise<CatalogueWriteResult> {
  return await prismaWs.$transaction(async (tx) => {
    const product = await tx.product.findFirst({ where: { id: productId, vendorId } });
    if (!product) return { ok: false as const, error: "That product no longer exists." };

    const current = await tx.productImage.findMany({
      where: { productId },
      select: { id: true },
    });
    const currentIds = new Set(current.map((row) => row.id));
    const requestedIds = new Set(orderedImageIds);
    const sameSet =
      currentIds.size === requestedIds.size && [...currentIds].every((id) => requestedIds.has(id));
    if (!sameSet) {
      return { ok: false as const, error: "That image list doesn't match this product anymore." };
    }

    await Promise.all(
      orderedImageIds.map((id, index) =>
        tx.productImage.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );

    return { ok: true as const, id: productId };
  });
}

/**
 * Fast-path for shop-floor staff to increment/decrement stock and toggle availability
 * without needing the full product edit payload (P6, #168).
 */
export async function quickUpdateInventory(
  prismaWs: DbWs,
  vendorId: string,
  productId: string,
  data: { quantity?: number; isActive?: boolean },
): Promise<CatalogueWriteResult> {
  try {
    return await prismaWs.$transaction(async (tx) => {
      const existing = await tx.product.findFirst({
        where: { id: productId, vendorId },
        select: { id: true, inventory: { select: { quantity: true, lowStockThreshold: true } } },
      });
      if (!existing) return { ok: false as const, error: "That product no longer exists." };

      if (data.isActive !== undefined) {
        await tx.product.update({
          where: { id: productId },
          data: { isActive: data.isActive },
        });
      }

      if (data.quantity !== undefined) {
        await tx.inventory.upsert({
          where: { productId, vendorId },
          create: {
            vendorId,
            productId,
            quantity: data.quantity,
            lowStockThreshold: 3,
          },
          update: { quantity: data.quantity },
        });
      }

      return { ok: true as const, id: productId };
    });
  } catch (error) {
    throw error;
  }
}

export async function saveGeneratedProductImage(
  prisma: Db,
  vendorId: string,
  productId: string,
  storageKey: string,
  alt: string,
  needsReview: boolean,
): Promise<void> {
  await prisma.productImage.create({
    data: {
      productId,
      storageKey,
      alt,
      isPrimary: false,
    },
  });

  if (needsReview) {
    await prisma.product.update({
      where: { id: productId, vendorId },
      data: { imageNeedsReview: true },
    });
  }
}

export async function getProductsWithoutImages(prisma: Db, vendorId: string, limit: number) {
  return await prisma.product.findMany({
    where: {
      vendorId,
      images: { none: {} },
    },
    take: limit,
    select: { id: true, name: true },
  });
}

export async function approveProductImageRow(
  prisma: Db,
  vendorId: string,
  productId: string,
): Promise<CatalogueWriteResult> {
  const existing = await prisma.product.findFirst({
    where: { id: productId, vendorId },
    select: { id: true },
  });
  if (!existing) return { ok: false as const, error: "That product no longer exists." };

  await prisma.product.update({
    where: { id: productId },
    data: { imageNeedsReview: false },
  });

  return { ok: true as const, id: productId };
}
