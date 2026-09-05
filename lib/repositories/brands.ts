import type { getPrisma, getPrismaWs } from "@/lib/db";
import { isUniqueViolation } from "@/lib/repositories/prisma-errors";
import type { CatalogueWriteResult } from "@/lib/repositories/products";

/**
 * Brand reads and writes (P2.6 slice 6, #569).
 *
 * Every export takes `prisma` and `vendorId` as EXPLICIT parameters and reads no request context
 * (#252, #409/#411/#412). That is what lets a plain `tsx` script exercise this module in real Node
 * — `lib/db.ts` builds its client from `@prisma/client/wasm`, whose query compiler Node cannot
 * load, so a function resolving its own client could not be run outside a Workers request at all.
 * The request-scoped facade lives in `lib/brands-service.ts`, beside this file rather than inside
 * it; `tests/repository-purity.test.ts` enforces the location and
 * `tests/repository-client-injection.test.ts` enforces the injection.
 *
 * WHY TWO CLIENT TYPES. `rename` and `setImageKey` take `DbWs`, not `Db`, because both use
 * `updateMany` — and `updateMany`/`createMany` are the two operations that crash UNCONDITIONALLY
 * through the HTTP adapter `getPrisma()` returns, with "Transactions are not supported in HTTP
 * mode", regardless of the `where` clause or how many rows match (#382). Prisma's client-side
 * query compiler wraps them in a transaction it opens itself, which `PrismaNeonHttp` can never
 * execute. `create` and every read here are unaffected and take the ordinary client.
 */

type Db = ReturnType<typeof getPrisma>;
type DbWs = ReturnType<typeof getPrismaWs>;

export interface BrandSummary {
  id: string;
  name: string;
  slug: string;
}

export interface AdminBrandRow extends BrandSummary {
  imageKey: string | null;
  /** How many products currently point at this brand — shown so staff can see what a rename affects. */
  productCount: number;
}

export interface BrandRepository {
  listForAdmin(): Promise<AdminBrandRow[]>;
  listSummaries(): Promise<BrandSummary[]>;
  getBySlug(slug: string): Promise<BrandSummary | null>;
  create(name: string): Promise<CatalogueWriteResult>;
  rename(id: string, name: string): Promise<CatalogueWriteResult>;
  setImageKey(id: string, imageKey: string | null): Promise<CatalogueWriteResult>;
}

const DUPLICATE: CatalogueWriteResult = {
  ok: false,
  error: "A brand with that name already exists.",
  field: "name",
};

const NOT_FOUND: CatalogueWriteResult = {
  ok: false,
  error: "That brand no longer exists.",
  field: "id",
};

/** Every brand for the vendor, with product counts, for the staff admin list. */
export async function listBrandsForAdmin(prisma: Db, vendorId: string): Promise<AdminBrandRow[]> {
  const rows = await prisma.brand.findMany({
    where: { vendorId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      imageKey: true,
      _count: { select: { products: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    imageKey: row.imageKey,
    productCount: row._count.products,
  }));
}

/** The vendor's brands, smallest useful shape — feeds the admin product form's picker. */
export async function listBrandSummaries(prisma: Db, vendorId: string): Promise<BrandSummary[]> {
  return prisma.brand.findMany({
    where: { vendorId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });
}

/**
 * Resolve a storefront `?brand=` slug to a brand of THIS vendor.
 *
 * Vendor-scoped deliberately: without it, one vendor's slug would resolve against another's
 * catalogue. Returning `null` for an unknown slug is what lets the page apply no predicate and
 * render no chip, rather than narrowing to a brand id that matches nothing — the same ruling
 * `#568` reached for an unknown category slug.
 */
export async function getBrandBySlug(
  prisma: Db,
  vendorId: string,
  slug: string,
): Promise<BrandSummary | null> {
  return prisma.brand.findFirst({
    where: { vendorId, slug },
    select: { id: true, name: true, slug: true },
  });
}

/**
 * Create a brand. The slug is derived from the name via `lib/catalogue-form.ts`'s `slugify`, the
 * same helper the product and category forms use, so brand slugs cannot develop their own rules.
 *
 * `isUniqueViolation` covers BOTH driver error codes. The HTTP adapter that `getPrisma()` returns
 * surfaces a duplicate as the raw SQLSTATE `23505` while the WebSocket adapter normalises it to
 * Prisma's `P2002` — checking only one is how `upsertBundle` 500ed on a real duplicate submission
 * (CLAUDE.md's database section).
 */
export async function createBrandForVendor(
  prisma: Db,
  vendorId: string,
  input: { name: string; slug: string },
): Promise<CatalogueWriteResult> {
  try {
    const created = await prisma.brand.create({
      data: { vendorId, name: input.name, slug: input.slug },
      select: { id: true },
    });
    return { ok: true, id: created.id };
  } catch (error) {
    if (isUniqueViolation(error)) return DUPLICATE;
    throw error;
  }
}

/**
 * Rename a brand. The SLUG IS DELIBERATELY NOT REGENERATED: it is the value a shopper's bookmarked
 * or shared `/search?brand=<slug>` URL carries, so rewriting it on every rename would silently
 * break links that worked a moment earlier. A typo fix should not cost a shopper their saved
 * filter.
 *
 * Scoped by `vendorId` in the `where`, so one vendor cannot rename another's brand even given a
 * valid id — the guard lives in the query, not in which host served the page.
 */
export async function renameBrandForVendor(
  prismaWs: DbWs,
  vendorId: string,
  input: { id: string; name: string },
): Promise<CatalogueWriteResult> {
  try {
    const updated = await prismaWs.brand.updateMany({
      where: { id: input.id, vendorId },
      data: { name: input.name },
    });
    if (updated.count === 0) return NOT_FOUND;
    return { ok: true, id: input.id };
  } catch (error) {
    if (isUniqueViolation(error)) return DUPLICATE;
    throw error;
  }
}

/**
 * Set (or clear) a brand's relative storage key. Stores the string only — this slice adds no upload
 * pipeline, because nothing renders a brand image until `#394`, and an upload whose result is never
 * displayed cannot be verified against the CDN of the environment that serves it (`#502`).
 */
export async function setBrandImageKey(
  prismaWs: DbWs,
  vendorId: string,
  input: { id: string; imageKey: string | null },
): Promise<CatalogueWriteResult> {
  const updated = await prismaWs.brand.updateMany({
    where: { id: input.id, vendorId },
    data: { imageKey: input.imageKey },
  });
  if (updated.count === 0) return NOT_FOUND;
  return { ok: true, id: input.id };
}
