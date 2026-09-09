import { cache } from "react";
import { getPrisma } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import {
  createCategoryForVendor as createCategoryForVendorRepo,
  getCategoryBySlug,
  getCategoryForAdmin as getCategoryForAdminRepo,
  listCategoriesForAdmin as listCategoriesForAdminRepo,
  listCategoryTreeForStorefront,
  listTopLevelCategories,
  suggestCategories,
  updateCategoryForVendor as updateCategoryForVendorRepo,
  type AdminCategoryDetail,
  type AdminCategoryRow,
  type CategoryRepository,
  type CategoryWriteInput,
} from "@/lib/repositories/categories";
import type { CatalogueWriteResult } from "@/lib/repositories/products";

/**
 * The two whole-list storefront reads, memoized PER REQUEST (#682, #670 part 2).
 *
 * These sit at module scope rather than inside the factory below because
 * `getCategoryRepository()` returns a fresh object on every call, so a
 * factory-local memo only de-duplicates calls made through that ONE instance.
 * `listTopLevel` is reached from four storefront pages and their layouts,
 * `listTree` from `/search` and `/bundles`, and a page that builds two
 * repositories issued the identical query twice.
 *
 * React `cache()` is request-scoped, so nothing is retained between requests and
 * the Workers I/O rule is not engaged — same mechanism as `lib/db.ts` and
 * `lib/vendor-service.ts`. `getPrisma()` is resolved inside each call rather
 * than captured, so no client is ever held across a request boundary.
 *
 * `getBySlug` and `suggest` are deliberately NOT memoized here: they take
 * arguments, are called once per render today, and adding an argument-keyed
 * cache would be speculation rather than a measured saving.
 */
const listTopLevelForRequest = cache(async () =>
  listTopLevelCategories(getPrisma(), await getCurrentVendorId()),
);

const listTreeForRequest = cache(async () =>
  listCategoryTreeForStorefront(getPrisma(), await getCurrentVendorId()),
);

/**
 * Request-scoped wrapper around `lib/repositories/categories.ts`'s pure reads
 * (#252) — resolves a live Prisma client and the current vendor, both of which
 * need a real Workers request.
 *
 * Lives beside, not inside, `lib/repositories/` for the reason
 * `lib/data-rights-service.ts` and `lib/products-service.ts` already do: the
 * repository module's defining property is that every export takes `prisma` and
 * `vendorId` explicitly and reads no request context, so a plain `tsx` script
 * can import it in real Node. A context-resolving factory in that file would
 * make the property true of some exports and not others.
 * `tests/repository-purity.test.ts` is what enforces the location.
 *
 * Constructed fresh per call, never cached across requests — a cached client
 * throws "Cannot perform I/O on behalf of a different request" on Workers
 * (CLAUDE.md), and caching this wrapper would pin the first request's client
 * inside it just the same.
 */
export function getCategoryRepository(): CategoryRepository {
  const prisma = getPrisma();
  let vendorIdPromise: Promise<string> | undefined;
  const vendorId = () => (vendorIdPromise ??= getCurrentVendorId());

  return {
    async listTopLevel() {
      return listTopLevelForRequest();
    },

    async getBySlug(slug) {
      return getCategoryBySlug(prisma, await vendorId(), slug);
    },

    async suggest(terms, limit) {
      return suggestCategories(prisma, await vendorId(), terms, limit);
    },

    async listTree() {
      return listTreeForRequest();
    },
  };
}

/* ------------------------------------------------------------------------- *
 * Admin catalogue entry points (#411)
 *
 * These deliberately keep the repository functions' NAMES, so a call site moves
 * by changing its import path and nothing else — across 26 conversions that
 * keeps the diff reviewable and removes a whole class of rename mistake. The
 * repository originals are imported here under a `…Repo` alias.
 *
 * They take `vendorId` rather than resolving it, unlike the storefront factory
 * above: every caller already holds an authoritative one from
 * `requireVendorRole`, which derives it from the request host. See
 * `lib/customers-service.ts` for the full rationale.
 *
 * Each resolves its client per call, inside the function — never at module
 * scope, which would cache it across requests (CLAUDE.md).
 * ------------------------------------------------------------------------- */

/**
 * Memoized per request, keyed on `vendorId` (#682, #670 part 2).
 *
 * Six admin pages call this, and `/staff/products` needs it before its product
 * query can run at all — `parseStaffProductsQuery` validates and expands the
 * category selection against this vendor's real list (#503), so the call is
 * ordered rather than parallel and every extra round-trip is on the critical
 * path. `cache()` keys on the argument, so a platform admin resolving two
 * vendors in one render still gets one query each rather than a shared answer.
 */
export const listCategoriesForAdmin = cache(async (vendorId: string): Promise<AdminCategoryRow[]> =>
  listCategoriesForAdminRepo(getPrisma(), vendorId),
);

export async function getCategoryForAdmin(
  vendorId: string,
  id: string,
): Promise<AdminCategoryDetail | null> {
  return getCategoryForAdminRepo(getPrisma(), vendorId, id);
}

export async function createCategoryForVendor(
  vendorId: string,
  input: CategoryWriteInput,
): Promise<CatalogueWriteResult> {
  return createCategoryForVendorRepo(getPrisma(), vendorId, input);
}

export async function updateCategoryForVendor(
  vendorId: string,
  id: string,
  input: CategoryWriteInput,
): Promise<CatalogueWriteResult> {
  return updateCategoryForVendorRepo(getPrisma(), vendorId, id, input);
}
