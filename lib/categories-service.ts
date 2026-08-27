import { getPrisma } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import {
  createCategoryForVendor as createCategoryForVendorRepo,
  getCategoryBySlug,
  getCategoryForAdmin as getCategoryForAdminRepo,
  listCategoriesForAdmin as listCategoriesForAdminRepo,
  listTopLevelCategories,
  updateCategoryForVendor as updateCategoryForVendorRepo,
  type AdminCategoryDetail,
  type AdminCategoryRow,
  type CategoryRepository,
  type CategoryWriteInput,
} from "@/lib/repositories/categories";
import type { CatalogueWriteResult } from "@/lib/repositories/products";

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
      return listTopLevelCategories(prisma, await vendorId());
    },

    async getBySlug(slug) {
      return getCategoryBySlug(prisma, await vendorId(), slug);
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

export async function listCategoriesForAdmin(vendorId: string): Promise<AdminCategoryRow[]> {
  return listCategoriesForAdminRepo(getPrisma(), vendorId);
}

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
