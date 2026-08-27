import { getPrisma, getPrismaWs } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import {
  addProductImage as addProductImageRepo,
  approveProductImageRow as approveProductImageRowRepo,
  createProductForVendor as createProductForVendorRepo,
  getAvailableSpecialities,
  getProductBySlug,
  getProductForAdmin as getProductForAdminRepo,
  getProductsWithoutImages as getProductsWithoutImagesRepo,
  listCategorySpotlights,
  listInventoryForStaff as listInventoryForStaffRepo,
  listProducts,
  listProductsByCategory,
  listProductsForAdmin as listProductsForAdminRepo,
  matchProductListTerms,
  promoteProductImage as promoteProductImageRepo,
  quickUpdateInventory as quickUpdateInventoryRepo,
  removeProductImage as removeProductImageRepo,
  reorderProductImages as reorderProductImagesRepo,
  saveGeneratedProductImage as saveGeneratedProductImageRepo,
  searchProducts,
  setPrimaryProductImage as setPrimaryProductImageRepo,
  updateProductForVendor as updateProductForVendorRepo,
  type AdminProductDetail,
  type AdminProductPage,
  type CatalogueWriteResult,
  type ProductRepository,
  type ProductWriteInput,
  type RemoveImageResult,
  type StaffInventoryPage,
} from "@/lib/repositories/products";

/**
 * Request-scoped wrapper around `lib/repositories/products.ts`'s pure reads
 * (#252) — resolves a live Prisma client and the current vendor, both of which
 * need a real Workers request.
 *
 * Lives beside, not inside, `lib/repositories/`, matching
 * `lib/data-rights-service.ts` and `lib/categories-service.ts`.
 *
 * **This docstring used to claim that the repository module's admin write path
 * was already exercisable from a plain `tsx` script. It was false for all 14 of
 * those exports, which resolved their own client** and so could not run in Node
 * at all — `lib/db.ts` builds from `@prisma/client/wasm`, whose query compiler
 * Node cannot load. #411/#412 made the claim true; it is left recorded here
 * because the same sentence was confidently wrong in four separate docstrings
 * (`customers.ts`, `reports.ts`, `discounts-service.ts` and this one), which is
 * the evidence that nobody had ever checked it.
 *
 * `tests/repository-purity.test.ts` enforces the request-context half of the
 * rule; `tests/repository-client-injection.test.ts` the client half.
 *
 * Constructed fresh per call, never cached across requests.
 */
export function getProductRepository(): ProductRepository {
  const prisma = getPrisma();
  // Resolve the current vendor once per repository instance (request-scoped);
  // never cached across requests. Every query below is scoped to it (ADR-004 slice 2).
  let vendorIdPromise: Promise<string> | undefined;
  const vendorId = () => (vendorIdPromise ??= getCurrentVendorId());

  return {
    async listByCategory(categoryId, opts) {
      return listProductsByCategory(prisma, await vendorId(), categoryId, opts);
    },

    async list(opts) {
      return listProducts(prisma, await vendorId(), opts);
    },

    async search(query, opts) {
      return searchProducts(prisma, await vendorId(), query, opts);
    },

    async getBySlug(slug) {
      return getProductBySlug(prisma, await vendorId(), slug);
    },

    async availableSpecialities() {
      return getAvailableSpecialities(prisma, await vendorId());
    },

    async matchListTerms(terms) {
      return matchProductListTerms(prisma, await vendorId(), terms);
    },

    async categorySpotlights(categoryIds) {
      return listCategorySpotlights(prisma, await vendorId(), categoryIds);
    },
  };
}

/* ------------------------------------------------------------------------- *
 * Admin catalogue, inventory and product-image entry points (#412)
 *
 * Repository names are kept so a call site moves by changing its import path
 * alone; the originals are aliased `…Repo` above. `vendorId` is a parameter,
 * not resolved here — every caller holds an authoritative one from
 * `requireVendorRole`. Each function resolves its client per call, inside the
 * body.
 *
 * WHICH client is not a free choice. The seven that open an interactive
 * transaction take `getPrismaWs()`; `PrismaNeonHttp` cannot execute one at all,
 * and `updateMany`/`createMany` fail over HTTP even outside an explicit
 * transaction because the query compiler opens one itself (#382).
 * `tests/repository-transaction-safety.test.ts` is the guard on this.
 * ------------------------------------------------------------------------- */

export async function listInventoryForStaff(
  vendorId: string,
  options: { take: number; cursor?: string; query?: string },
): Promise<StaffInventoryPage> {
  return listInventoryForStaffRepo(getPrisma(), vendorId, options);
}

export async function listProductsForAdmin(
  vendorId: string,
  options: { take: number; cursor?: string; search?: string | null; isActive?: boolean },
): Promise<AdminProductPage> {
  return listProductsForAdminRepo(getPrisma(), vendorId, options);
}

export async function getProductForAdmin(
  vendorId: string,
  id: string,
): Promise<AdminProductDetail | null> {
  return getProductForAdminRepo(getPrisma(), vendorId, id);
}

export async function createProductForVendor(
  vendorId: string,
  input: ProductWriteInput,
): Promise<CatalogueWriteResult> {
  return createProductForVendorRepo(getPrisma(), vendorId, input);
}

export async function saveGeneratedProductImage(
  vendorId: string,
  productId: string,
  storageKey: string,
  alt: string,
  needsReview: boolean,
): Promise<void> {
  return saveGeneratedProductImageRepo(
    getPrisma(),
    vendorId,
    productId,
    storageKey,
    alt,
    needsReview,
  );
}

export async function getProductsWithoutImages(vendorId: string, limit: number) {
  return getProductsWithoutImagesRepo(getPrisma(), vendorId, limit);
}

export async function approveProductImageRow(
  vendorId: string,
  productId: string,
): Promise<CatalogueWriteResult> {
  return approveProductImageRowRepo(getPrisma(), vendorId, productId);
}

/* --- transaction-bearing writes: WebSocket client only (#382) ------------- */

export async function updateProductForVendor(
  vendorId: string,
  id: string,
  input: ProductWriteInput,
): Promise<CatalogueWriteResult> {
  return updateProductForVendorRepo(getPrismaWs(), vendorId, id, input);
}

export async function setPrimaryProductImage(
  vendorId: string,
  productId: string,
  storageKey: string,
  alt: string,
): Promise<CatalogueWriteResult> {
  return setPrimaryProductImageRepo(getPrismaWs(), vendorId, productId, storageKey, alt);
}

export async function addProductImage(
  vendorId: string,
  productId: string,
  storageKey: string,
  alt: string,
): Promise<CatalogueWriteResult> {
  return addProductImageRepo(getPrismaWs(), vendorId, productId, storageKey, alt);
}

export async function promoteProductImage(
  vendorId: string,
  productId: string,
  imageId: string,
): Promise<CatalogueWriteResult> {
  return promoteProductImageRepo(getPrismaWs(), vendorId, productId, imageId);
}

export async function removeProductImage(
  vendorId: string,
  productId: string,
  imageId: string,
): Promise<RemoveImageResult> {
  return removeProductImageRepo(getPrismaWs(), vendorId, productId, imageId);
}

export async function reorderProductImages(
  vendorId: string,
  productId: string,
  orderedImageIds: string[],
): Promise<CatalogueWriteResult> {
  return reorderProductImagesRepo(getPrismaWs(), vendorId, productId, orderedImageIds);
}

export async function quickUpdateInventory(
  vendorId: string,
  productId: string,
  data: { quantity?: number; isActive?: boolean },
): Promise<CatalogueWriteResult> {
  return quickUpdateInventoryRepo(getPrismaWs(), vendorId, productId, data);
}
