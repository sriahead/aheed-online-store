import type { getPrisma } from "@/lib/db";

/**
 * Per-vendor storefront promotions (P7.5c+f, #233) — the ONLY DB access for the
 * homepage hero carousel. Pages reach this through
 * `lib/promotions-service.ts`'s request-scoped wrapper (ADR-004 slice-2
 * no-direct-Prisma guard); nothing in this file resolves a live client or a
 * request itself.
 *
 * THE `@/lib/db` IMPORT IS TYPE-ONLY, DELIBERATELY — matching
 * `lib/repositories/data-rights.ts`. `lib/db.ts` imports PrismaClient from
 * `@prisma/client/wasm`, the workerd-safe loader, which a plain Node process
 * should not pull in. Every function here already takes its client as an
 * argument, so a runtime import would buy nothing and would stop a `tsx` script
 * from loading this module at all.
 *
 * EVERY EXPORTED FUNCTION takes `prisma` and `vendorId` as EXPLICIT arguments
 * and reads no request context — no `getCurrentVendorId()`, no `headers()`, no
 * `getAuth()`. That is why the request-scoped facade lives in
 * `lib/promotions-service.ts` instead of here: it necessarily resolves a live
 * client and the current vendor, and if it lived in this file that would be a
 * second entry point request context could reach these exports through, making
 * the module's contract true of some exports and not others. `#252` tracks the
 * nine legacy facades that got this wrong; this slice adds no tenth, and
 * `tests/repository-vendor-scoping.test.ts` is what enforces it.
 */

type Db = ReturnType<typeof getPrisma>;

/** One promotion as the storefront renders it. */
export interface Promotion {
  id: string;
  title: string;
  description: string;
  /**
   * RELATIVE storage key (ADR-003), or null. Null is the ORDINARY case, not a
   * degraded one: a promo without artwork renders as a token-styled card, which
   * is what lets a vendor have working promotions before anyone uploads an
   * image. Compose with `composePublicUrl(CDN_BASE_URL, key)` at render time —
   * never store a URL.
   */
  imageKey: string | null;
  /** Required whenever `imageKey` is set — jsx-a11y/alt-text runs at `error`. */
  altText: string | null;
  linkUrl: string;
}

/**
 * This vendor's active promotions, in display order.
 *
 * `vendorId` leads the `where` and `@@index([vendorId, isActive, sortOrder])`
 * serves the whole query — filter, tenant scope and ordering — so the carousel
 * costs one indexed read regardless of how many vendors exist.
 *
 * Inactive rows are filtered in SQL rather than after the fetch: `isActive` is
 * how a vendor retires a campaign, and reading retired rows into the Worker only
 * to discard them would put a vendor's withdrawn marketing on the wire.
 */
export async function listActivePromotions(
  prisma: Db,
  vendorId: string,
): Promise<readonly Promotion[]> {
  const rows = await prisma.vendorPromotion.findMany({
    where: { vendorId, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      title: true,
      description: true,
      imageKey: true,
      altText: true,
      linkUrl: true,
    },
  });

  return rows;
}
