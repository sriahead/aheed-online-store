import type { Prisma } from "@prisma/client";
import type { getPrisma, getPrismaWs } from "@/lib/db";
import { isUniqueViolation } from "@/lib/repositories/prisma-errors";
import { effectiveStock } from "@/lib/cart-rules";
import { CANDIDATE_QUERY_LIMIT, type ListCandidate } from "@/lib/shopping-list";
import { parseSearchQuery } from "@/lib/search-query";
import { hasNameTierCandidate, rankSearchCandidates } from "@/lib/search-ranking";
import { correctTerms } from "@/lib/search-typo-correction";
import {
  expandSearchTerms,
  flattenVariants,
  toUnexpandedGroups,
  type SearchTermGroup,
} from "@/lib/search-expansion";
import { listApprovedAliasMap } from "@/lib/repositories/search-synonyms";
import {
  MAX_IMAGE_ATTEMPT_FAILURES,
  PLACEHOLDER_IMAGE_SUFFIX,
  isPlaceholderImageKey,
} from "@/lib/product-image";
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
  /**
   * P2.6 slice 1 (#564) — true when and only when MORE results exist than
   * `searchProducts` was willing to rank, so the page can say so rather than
   * presenting a partial set as if it were complete.
   *
   * Set by a SENTINEL ROW, not by the cap being reached: the fetch asks for
   * `SEARCH_CANDIDATE_LIMIT + 1` rows and this is `rows.length > limit`.
   * Defining it as "the cap was reached" would make it LIE when the catalogue
   * holds exactly `SEARCH_CANDIDATE_LIMIT` matches — nothing would be missing,
   * yet the shopper would be told the list is incomplete. One extra row buys a
   * flag that means what it says.
   *
   * Always `false` for the keyset-paginated paths (`listProducts`,
   * `listProductsByCategory`), which are not capped at all.
   */
  truncated: boolean;
  /**
   * P2.6 slice 2 (#565) — the DIRECT (#564) search's own candidate count, captured before any
   * zero-result-ladder rung runs (capped at `SEARCH_CANDIDATE_LIMIT`, same as `truncated`'s
   * source count). Exists so `lib/products-service.ts`'s query-log write can log a real count
   * without a second query to re-derive one. Always `0` for `listProducts`/`listProductsByCategory`
   * — meaningless there, present only so every `ProductPage` has the same shape.
   */
  directResultCount: number;
  /**
   * P2.6 slice 2 (#565) — `null` when the direct search already found something (the ladder never
   * ran). `{ rung: "none" }` means every rung was tried and none found anything. Always `null` for
   * `listProducts`/`listProductsByCategory`.
   */
  recovery: SearchRecoveryInfo | null;
  /**
   * P2.6 slice 3 (#580) — did the DIRECT search match anything on NAME (ranking tier 0-2), rather
   * than only through some product's description prose?
   *
   * `directResultCount` cannot express this: a query returning one tangential description hit and a
   * query that worked perfectly both report a positive count. This is what
   * `lib/products-service.ts` writes to `SearchQueryLog.directNameMatch`, and what the thin-result
   * suggestions below are triggered by. Always `false` for `listProducts`/`listProductsByCategory`,
   * where it is meaningless.
   */
  directNameMatch: boolean;
  /**
   * P2.6 slice 3 (#580) — set when the direct search returned candidates but NONE of them matched
   * on name, so the shopper is looking at results that are probably not what they asked for.
   *
   * This is deliberately NOT a ladder rung. The ladder REPLACES the result set, which is right for
   * a query that found nothing and wrong for one that found something tangential: a shopper with
   * fifty description-only matches must not have all fifty swapped out. Recovery must never
   * subtract. So the page renders every direct result AND these suggestions beside them.
   *
   * `null` when the direct search found a name match, when it found nothing at all (the ladder
   * handles that case), or on the non-search paths.
   */
  suggestions: SearchSuggestions | null;
}

/**
 * Ways out of a thin result (P2.6 slice 3, #580), each rendered as a link to that search. Both
 * fields are independently nullable; the notice renders when at least one is set.
 */
export interface SearchSuggestions {
  /**
   * The query rewritten in the catalogue's own vocabulary, when an approved synonym covers one of
   * its terms — "haldi" offered as "turmeric".
   */
  canonicalQuery: string | null;
  /**
   * The query with each correctable term replaced by its nearest product-name token, when one is
   * within the edit-distance budget. Same deterministic machinery as the ladder's typo rung.
   */
  correctedQuery: string | null;
}

/**
 * See `ProductPage.recovery`. The ladder has three rungs — "typo", "identity", "broad" — tried in
 * that order; "none" means all three ran and found nothing.
 *
 * #566 did NOT add a synonym rung, which an earlier version of this comment predicted it would.
 * Synonyms widen the DIRECT predicate instead (`directSearchPredicate` over term groups), so an
 * alias-matched product is a first-class result ranked on its merits rather than a consolation
 * prize reached only after the direct search had already failed.
 */
export type SearchRecoveryRung = "typo" | "identity" | "broad" | "none";

export interface SearchRecoveryInfo {
  rung: SearchRecoveryRung;
  /** Only set when `rung === "typo"`. */
  correctedTerms?: string[];
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
   * (#211) — for the shop page's "recent"/"featured" rows, which need "products
   * matching these filters", not "products matching this search term". Kept
   * separate from search() rather than teaching it to treat "" as "no text
   * filter", and that separation still stands: searchProducts()'s empty-query
   * guard is untouched and is correct for what search() means.
   *
   * #501 — this docstring used to justify the split by asserting that on the
   * /search page "an empty box means 'nothing searched yet', not 'browse
   * everything'". That is no longer true of the page, and leaving the sentence
   * here would have left the doc contradicting the code beside it. Bare
   * /search rendered no products at all, which made the shop page's "View all"
   * a dead end, so `app/(storefront)/search/page.tsx` now BRANCHES to list()
   * for its browse mode. The structural decision survives — two functions, the
   * guard intact; only the page's reading of an empty box changed.
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

/**
 * Exported for `tests/search-repository.test.ts` (#564, R8), which asserts that
 * `searchProducts`'s composed `where` still contains every filter by comparing
 * against this helper's own output rather than against a hand-written copy of
 * it. A hand-written expectation is what lets a filter silently stop being
 * applied: it drifts from the helper and the test keeps passing.
 */
export function buildFilterWhere(filters: ProductFilters): Prisma.ProductWhereInput {
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
 * The columns every storefront ProductSummary is built from. One definition, so
 * the keyset path and the ranked search path cannot select different shapes and
 * drift into returning different fields (#564, R18).
 */
const productSummarySelect = {
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
} as const;

/** A row as selected by `productSummarySelect`. */
type ProductSummaryRow = Prisma.ProductGetPayload<{ select: typeof productSummarySelect }>;

/**
 * Row to ProductSummary. Shared by `findPage` and `searchProducts` (#564, R18):
 * this mapping used to be inline in `findPage`, so the ranked search path would
 * have needed a second copy, and two copies of a fifteen-field mapping is how
 * one storefront surface quietly starts rendering a field the other does not.
 *
 * `tier` is a parameter because the two paths resolve tiers at different points
 * — `findPage` after slicing its keyset page, search after slicing its RANKED
 * page — but both look them up for at most `take` products, never for the whole
 * candidate set.
 */
function toProductSummary(row: ProductSummaryRow, tier: ProductTier | null): ProductSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    basePrice: row.basePrice,
    unitLabel: row.unitLabel,
    origin: row.origin,
    originalPrice: row.originalPrice,
    isHalal: row.isHalal,
    isFresh: row.isFresh,
    isOrganic: row.isOrganic,
    averageRating: row.averageRating,
    reviewCount: row.reviewCount,
    primaryImage: row.images[0] ?? null,
    inStock: (row.inventory?.quantity ?? 0) > 0,
    stockQuantity: effectiveStock(row.inventory?.quantity),
    lowStockThreshold: row.inventory?.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD,
    tier,
  };
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
  //
  // #564 amended that rule for `searchProducts` ALONE, which cannot use this
  // function because its sort key is computed rather than stored. Nothing here
  // changed: this is still keyset, and it is still what every browse and
  // category listing uses.
  const rows = await prisma.product.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: productSummarySelect,
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
    items: page.map((p) => toProductSummary(p, tiers.get(p.id) ?? null)),
    nextCursor: hasMore ? page[page.length - 1].id : null,
    // Never capped — this path pages through everything by keyset.
    truncated: false,
    // No zero-result ladder outside searchProducts() — see ProductPage's docstring.
    directResultCount: 0,
    recovery: null,
    // Relevance is not computed on the browse paths, so there is no name-tier notion to report
    // and no thin-result case to rescue (#580).
    directNameMatch: false,
    suggestions: null,
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

/**
 * How many matching rows search is willing to RANK (#564).
 *
 * Exported so tests assert against the constant rather than a literal, and so
 * `scripts/verify-search-slice.ts` can decide whether a live query is even
 * capable of exceeding it.
 *
 * The cap exists because relevance is computed in JavaScript
 * (`lib/search-ranking.ts` explains why it cannot be computed in SQL here), and
 * an uncapped fetch would make the cost of a broad single-word query
 * proportional to the catalogue. What it costs is stated plainly rather than
 * hidden: a query matching more than this cannot reach the products beyond it,
 * WHICH of them are ranked is decided by the fetch's own `createdAt desc,
 * id desc` order rather than by relevance, and `ProductPage.truncated` tells the
 * page to say so. Raising it needs an index that can serve ranking, or #286.
 */
export const SEARCH_CANDIDATE_LIMIT = 200;

/**
 * The search cursor is an OFFSET into the ranked candidate array, not a keyset
 * id (see `specs/architecture.md`'s scoped exception). Parsed defensively:
 * anything that is not a non-negative integer is page zero rather than an
 * error, because a cursor arrives straight from a URL a shopper may have
 * edited, bookmarked or truncated.
 */
function parseSearchOffset(cursor: string | undefined): number {
  if (cursor === undefined) return 0;
  const parsed = Number(cursor);
  if (!Number.isInteger(parsed) || parsed < 0) return 0;
  return parsed;
}

/**
 * One fetch/cap/rank-input-shape, shared by the direct search and every zero-result-ladder rung
 * (#565) — the query SHAPE (the `predicate` argument) changes per rung, the sentinel/cap machinery
 * does not. Mirrors exactly what `searchProducts` fetched inline before this slice.
 */
async function fetchSearchCandidates(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  filters: ProductFilters,
  predicate: Prisma.ProductWhereInput,
): Promise<{ truncated: boolean; candidates: ProductSummary[] }> {
  const rows = await prisma.product.findMany({
    where: {
      vendorId,
      isActive: true,
      ...buildFilterWhere(filters),
      ...predicate,
    },
    // A TOTAL order, so which rows land inside the cap is deterministic even
    // when createdAt ties right at the boundary. Without `id`, two products
    // sharing a timestamp could swap across the cap between identical requests.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    // The +1 row is a truncation sentinel and nothing else: it is never ranked
    // and never rendered. See ProductPage.truncated for why the flag is not
    // simply "the cap was reached".
    take: SEARCH_CANDIDATE_LIMIT + 1,
    select: productSummarySelect,
  });

  const truncated = rows.length > SEARCH_CANDIDATE_LIMIT;
  const candidates = rows
    .slice(0, SEARCH_CANDIDATE_LIMIT)
    .map((row) => toProductSummary(row, null));
  return { truncated, candidates };
}

/**
 * The direct predicate: every term group required, each satisfied by `name` OR `description` for
 * ANY of that group's variants (#564, extended to groups by #566).
 *
 * With no approved synonyms every group holds exactly one variant, so this builds the identical
 * `AND` of per-term `OR`s that `#564` shipped — which is what makes an empty dictionary a no-op
 * rather than a behaviour change. `tests/search-repository.test.ts` pins that shape.
 */
function directSearchPredicate(groups: readonly SearchTermGroup[]): Prisma.ProductWhereInput {
  return {
    AND: groups.map((group) => ({
      OR: group.variants.flatMap((variant) => [
        { name: { contains: variant, mode: "insensitive" as const } },
        { description: { contains: variant, mode: "insensitive" as const } },
      ]),
    })),
  };
}

/**
 * Ladder rung "identity" (#565): loosens the direct predicate's `AND` to an `OR`, and narrows the
 * fields to `name`/category `name` (drops `description` — a term hitting prose is a much weaker
 * signal once every-term-required has already been given up).
 */
function identitySearchPredicate(groups: readonly SearchTermGroup[]): Prisma.ProductWhereInput {
  return {
    OR: flattenVariants(groups).flatMap((variant) => [
      { name: { contains: variant, mode: "insensitive" as const } },
      { category: { name: { contains: variant, mode: "insensitive" as const } } },
    ]),
  };
}

/** Ladder rung "broad" (#565): the widest net — `OR` across terms, `name` or `description`. */
function broadSearchPredicate(groups: readonly SearchTermGroup[]): Prisma.ProductWhereInput {
  return {
    OR: flattenVariants(groups).flatMap((variant) => [
      { name: { contains: variant, mode: "insensitive" as const } },
      { description: { contains: variant, mode: "insensitive" as const } },
    ]),
  };
}

/**
 * The vendor's deduplicated product-**name** vocabulary (#565) — `description` is deliberately
 * excluded, a token from prose being a much weaker signal of what a shopper meant to type. Feeds
 * the zero-result ladder's typo-correction rung (`lib/search-typo-correction.ts`).
 *
 * Takes `prisma` and `vendorId` as explicit parameters and reads no request context (#252).
 */
export async function listProductNameTokens(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
): Promise<Set<string>> {
  const rows = await prisma.product.findMany({
    where: { vendorId, isActive: true },
    select: { name: true },
  });

  const tokens = new Set<string>();
  for (const row of rows) {
    for (const token of parseSearchQuery(row.name)) tokens.add(token);
  }
  return tokens;
}

/**
 * Storefront search (#564, #565).
 *
 * The query is TOKENISED: the predicate is an AND over the parsed terms, each satisfied by a
 * case-insensitive `contains` on name OR description — every term must be satisfied by something.
 * Results are RANKED rather than ordered by recency, which is why this doesn't use `findPage`: the
 * sort key is computed, so keyset pagination on (createdAt, id) cannot express it. It fetches a
 * bounded candidate set, ranks it purely, slices the requested page, and only THEN looks up tier
 * pricing — for the rows being rendered, not for all the candidates.
 *
 * ZERO-RESULT LADDER (#565): when the direct predicate above finds nothing, up to three further
 * attempts run in order, stopping at the first that yields a result — typo correction (re-runs the
 * SAME direct predicate shape with each uncorrectable-as-typed term replaced by its nearest token
 * in the vendor's own product-name vocabulary), then a loosened identity-field match, then the
 * broadest name-or-description match. `recovery` on the returned page tells the caller which rung
 * (if any) supplied the results, or that all three were tried and none did. See `plan.md` in
 * `specs/2026-09-03-search-zero-result-recovery/` for the full rationale — in particular why a
 * term already in the vendor's vocabulary is never "corrected" into something else.
 */
export async function searchProducts(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  query: string,
  { take, cursor, ...filters }: { take: number; cursor?: string } & ProductFilters,
): Promise<ProductPage> {
  const terms = parseSearchQuery(query);
  // Guard retained from the original (#211's split): search() means "match this
  // text", and an empty box is the PAGE's decision to browse instead — see
  // ProductRepository.list's docstring. Returns before touching the client at
  // all, which is what `tests/search-repository.test.ts` asserts with spies.
  //
  // Since #572 this also covers a query made ENTIRELY of low-information tokens ("e", "-"), which
  // now parse to nothing. `/search` renders "too short" for that rather than claiming the
  // catalogue holds no match — and, as before, no query is issued.
  if (terms.length === 0) {
    return {
      items: [],
      nextCursor: null,
      truncated: false,
      directResultCount: 0,
      recovery: null,
      directNameMatch: false,
      suggestions: null,
    };
  }

  // #566 — one read, before the search itself, turning the flat term list into groups. An empty
  // dictionary yields single-variant groups and therefore #564's exact predicate.
  const aliases = await listApprovedAliasMap(prisma, vendorId);
  const groups = expandSearchTerms(terms, aliases);

  let { truncated, candidates } = await fetchSearchCandidates(
    prisma,
    vendorId,
    filters,
    directSearchPredicate(groups),
  );
  // Captured BEFORE any ladder rung runs, regardless of what happens next — this is what the
  // search query log (lib/products-service.ts) reports as the direct search's own outcome.
  const directResultCount = candidates.length;
  const directNameMatch = hasNameTierCandidate(candidates, groups);
  let rankingGroups = groups;
  let recovery: SearchRecoveryInfo | null = null;
  let suggestions: SearchSuggestions | null = null;

  if (candidates.length === 0) {
    const tokens = await listProductNameTokens(prisma, vendorId);
    const correction = correctTerms(terms, tokens);
    // Skip the re-query entirely when nothing was correctable — re-running the identical direct
    // predicate would just reproduce the zero result already known from above.
    if (correction.corrected) {
      const correctedGroups = expandSearchTerms(correction.terms, aliases);
      const typoResult = await fetchSearchCandidates(
        prisma,
        vendorId,
        filters,
        directSearchPredicate(correctedGroups),
      );
      if (typoResult.candidates.length > 0) {
        candidates = typoResult.candidates;
        truncated = typoResult.truncated;
        rankingGroups = correctedGroups;
        recovery = { rung: "typo", correctedTerms: correction.terms };
      }
    }
  }

  if (candidates.length === 0) {
    const identityResult = await fetchSearchCandidates(
      prisma,
      vendorId,
      filters,
      identitySearchPredicate(groups),
    );
    if (identityResult.candidates.length > 0) {
      candidates = identityResult.candidates;
      truncated = identityResult.truncated;
      recovery = { rung: "identity" };
    }
  }

  if (candidates.length === 0) {
    const broadResult = await fetchSearchCandidates(
      prisma,
      vendorId,
      filters,
      broadSearchPredicate(groups),
    );
    if (broadResult.candidates.length > 0) {
      candidates = broadResult.candidates;
      truncated = broadResult.truncated;
      recovery = { rung: "broad" };
    }
  }

  if (candidates.length === 0) {
    recovery = { rung: "none" };
  } else if (!directNameMatch && recovery === null) {
    // THIN RESULT (#580): the direct search found something, but only through description prose.
    // Nothing is removed or re-queried — the shopper keeps every product they had, and gets ways
    // out beside them. Guarded on `recovery === null` so a set the ladder already rescued (which
    // is by definition not a direct result at all) never also renders suggestions.
    suggestions = await buildThinResultSuggestions(prisma, vendorId, terms, groups);
  }

  const ranked = rankSearchCandidates(candidates, rankingGroups);
  const offset = parseSearchOffset(cursor);
  // An offset at or beyond the ranked count yields an honest empty page rather
  // than bouncing back to page one, which would loop a shopper who followed a
  // stale deep link. `truncated` is still the real value — the fetch happened.
  const page = ranked.slice(offset, offset + take);

  const tiers = await listActiveTiersForProducts(
    prisma,
    vendorId,
    page.map((p) => p.id),
  );

  const nextOffset = offset + take;
  return {
    items: page.map((p) => (tiers.has(p.id) ? { ...p, tier: tiers.get(p.id) ?? null } : p)),
    nextCursor: nextOffset < ranked.length ? String(nextOffset) : null,
    truncated,
    directResultCount,
    recovery,
    directNameMatch,
    suggestions,
  };
}

/**
 * The two ways out offered beside a thin result (#580).
 *
 * Runs ONLY on the thin path, so the extra token fetch it needs is not on the hot path of a
 * search that worked. Returns `null` when neither suggestion is available, so the page renders
 * nothing rather than an empty notice.
 */
async function buildThinResultSuggestions(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  terms: readonly string[],
  groups: readonly SearchTermGroup[],
): Promise<SearchSuggestions | null> {
  // The canonical rewrite needs no query — the expansion already resolved it.
  const expanded = groups.some((group) => group.variants.length > 1);
  const canonicalQuery = expanded
    ? groups.map((group) => group.variants[group.variants.length - 1]).join(" ")
    : null;

  const tokens = await listProductNameTokens(prisma, vendorId);
  const correction = correctTerms([...terms], tokens);
  const corrected = correction.terms.join(" ");
  // A "correction" identical to what was typed is not a suggestion.
  const correctedQuery = correction.corrected && corrected !== terms.join(" ") ? corrected : null;

  if (canonicalQuery === null && correctedQuery === null) return null;
  return { canonicalQuery, correctedQuery };
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

/**
 * P2.6 slice 3 (#566) — "Shop your list" reads the SAME approved dictionary the storefront search
 * does. A synonym that works in one path and not the other is the defect the shared
 * `expandSearchTerms` exists to design out, so this widens its `OR` with each term's variants.
 *
 * `description` stays excluded here, unchanged: P3d's ruling is that a term matching prose produces
 * a confident-looking wrong match, which is precisely what this path's review step exists to
 * prevent. Expansion adds APPROVED aliases only, so it widens recall without weakening that.
 */
export async function matchProductListTerms(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  terms: string[],
): Promise<ListCandidate[]> {
  if (terms.length === 0) return [];

  const aliases = await listApprovedAliasMap(prisma, vendorId);
  const variants = flattenVariants(expandSearchTerms(terms, aliases));

  const rows = await prisma.product.findMany({
    where: {
      vendorId,
      isActive: true,
      OR: variants.map((variant) => ({
        name: { contains: variant, mode: "insensitive" as const },
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

/**
 * Attach a pipeline-generated image and make it the one the storefront shows
 * (#502).
 *
 * `isPrimary: true`, NOT false. Every storefront read selects
 * `images: { where: { isPrimary: true }, take: 1 }` (see `findPage` above), so
 * the previous `isPrimary: false` meant a generated image uploaded, cost an AI
 * call, and then never appeared on a single card — invisible, because the job
 * that produced it could never match a product in the first place (see
 * `getProductsWithoutImages`).
 *
 * The placeholder rows this replaces are DELETED rather than demoted. They are
 * shared objects — every product in a subcategory points at the same
 * `products/gen-{categorySlug}/main.svg` — so keeping one around as a secondary
 * gallery image would put an identical "No image" tile in the gallery of every
 * product that has ever been backfilled. Only placeholders are removed; a real
 * image a vendor uploaded is demoted to non-primary and kept.
 */
export async function saveGeneratedProductImage(
  prisma: Db,
  vendorId: string,
  productId: string,
  storageKey: string,
  alt: string,
  needsReview: boolean,
): Promise<void> {
  const existing = await prisma.productImage.findMany({
    where: { productId },
    select: { id: true, storageKey: true, isPrimary: true },
  });

  await prisma.productImage.create({
    data: {
      productId,
      storageKey,
      alt,
      isPrimary: true,
    },
  });

  for (const image of existing) {
    if (isPlaceholderImageKey(image.storageKey)) {
      await prisma.productImage.delete({ where: { id: image.id } });
    } else if (image.isPrimary) {
      // A real image the vendor uploaded keeps its place in the gallery, but
      // only one row may claim primary. Singular `update`, not `updateMany` —
      // #382: the HTTP adapter cannot run the transaction the query compiler
      // wraps `updateMany` in.
      await prisma.productImage.update({
        where: { id: image.id },
        data: { isPrimary: false },
      });
    }
  }

  // #523 — an image landed, so any historic failures are no longer relevant.
  // Reset unconditionally rather than only when the counter is non-zero: if this
  // product later loses its image it should be retried from scratch, not
  // excluded by attempts that predate an image it once had. Merged into the
  // `needsReview` update when both apply, so this stays one write either way.
  await prisma.product.update({
    where: { id: productId, vendorId },
    data: { imageAttemptFailures: 0, ...(needsReview ? { imageNeedsReview: true } : {}) },
  });
}

/**
 * Products the "Auto-fill Missing Images" job should act on (#502).
 *
 * This asked for `images: { none: {} }` — products with NO image row — and so
 * matched NOTHING, ever: both seed paths give every product a placeholder row,
 * measured at 0 for both vendors on the dev branch while thousands of cards
 * rendered a grey "No image" box. The real condition is "has no image a
 * customer would call an image", which covers a product with no rows at all AND
 * a product still carrying only a seeded placeholder.
 *
 * Expressed as one query rather than an over-fetch-and-filter: Prisma's `every`
 * on a relation is true for a product with no images at all, so a single
 * `every: { storageKey: { endsWith: ... } }` covers both halves, and `take`
 * still means the database returns exactly what the caller will act on. The
 * suffix comes from `lib/product-image.ts`, the same constant
 * `isPlaceholderImageKey` reads, so the SQL filter and the pure predicate
 * cannot drift apart.
 */
/**
 * Record one failed image-pipeline attempt for a product (#523).
 *
 * Singular `update`, not `updateMany` — CLAUDE.md's #382 note: Prisma's client
 * query compiler wraps `updateMany` in a transaction the HTTP adapter cannot
 * execute, and this is called from the admin route, which runs on `getPrisma()`.
 *
 * Scoped by `vendorId` in the `where` so a caller cannot increment a counter on
 * another tenant's product by passing an id it happened to learn.
 *
 * Failures are counted, never reset here; `saveGeneratedProductImage` clears the
 * counter when an image finally lands, so a product that later loses its image
 * is retried rather than being excluded forever by a historic failure.
 */
export async function recordImageAttemptFailure(
  prisma: Db,
  vendorId: string,
  productId: string,
): Promise<void> {
  await prisma.product.update({
    where: { id: productId, vendorId },
    data: { imageAttemptFailures: { increment: 1 } },
  });
}

/**
 * How many products are excluded from automatic filling because they have
 * exhausted their attempts (#523).
 *
 * Exists so a run can SAY it is skipping them. A give-up rule that silently
 * shrinks the work list is the same class of problem it was built to fix: the
 * job would report "nothing to do" while products sat permanently unfilled and
 * nothing pointed at them.
 */
export async function countProductsWithExhaustedImageAttempts(
  prisma: Db,
  vendorId: string,
): Promise<number> {
  return await prisma.product.count({
    where: {
      vendorId,
      images: { every: { storageKey: { endsWith: PLACEHOLDER_IMAGE_SUFFIX } } },
      imageAttemptFailures: { gte: MAX_IMAGE_ATTEMPT_FAILURES },
    },
  });
}

export async function getProductsWithoutImages(prisma: Db, vendorId: string, limit: number) {
  return await prisma.product.findMany({
    where: {
      vendorId,
      images: { every: { storageKey: { endsWith: PLACEHOLDER_IMAGE_SUFFIX } } },
      // #523 — exclude products the pipeline has already failed on
      // MAX_IMAGE_ATTEMPT_FAILURES times. This selection is newest-first and
      // BOUNDED, so a product that can never succeed would otherwise be
      // re-selected on every scheduled run, consume a slot, fail, and leave the
      // fillable backlog behind it untouched while the job reported success.
      imageAttemptFailures: { lt: MAX_IMAGE_ATTEMPT_FAILURES },
    },
    // Newest first, so a bounded batch is deterministic rather than whatever
    // order the planner happens to return. Two things follow from that, both
    // wanted: `scripts/verify-repository-injection.ts` can assert on rows it
    // just created, and a vendor's real catalogue — which is newer than the
    // seeded demo set — is filled before the 2,000 generated products.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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
