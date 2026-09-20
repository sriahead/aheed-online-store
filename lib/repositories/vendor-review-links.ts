import type { getPrisma } from "@/lib/db";

/**
 * Outbound links to external review platforms (P9.2, #818) — the ONLY DB access for them.
 *
 * LINKS ONLY. Nothing in this application fetches, syncs, caches or displays review content
 * from Google, Trustpilot or anywhere else. That is a standing boundary from #818's spec,
 * not a not-yet: see `specs/2026-09-19-p818-customer-feedback-reviews/plan.md` for why the
 * embedded-widget and Places-API routes were both rejected.
 *
 * NO PLATFORM IS NAMED IN THIS FILE, or anywhere else under `lib/` and `components/`.
 * `platform` is the vendor's own label for the destination, which is what lets a vendor add
 * a platform nobody has thought of yet without a migration or a deploy.
 *
 * Type-only `@/lib/db` import and explicit `prisma`/`vendorId` parameters, per the
 * repository rules enforced by `tests/repository-purity.test.ts`.
 */

type Db = ReturnType<typeof getPrisma>;

export interface ReviewLink {
  id: string;
  platform: string;
  url: string;
  sortOrder: number;
  isActive: boolean;
}

/** Active links for the storefront, in the vendor's chosen order. */
export async function listActiveReviewLinks(prisma: Db, vendorId: string): Promise<ReviewLink[]> {
  return prisma.vendorReviewLink.findMany({
    where: { vendorId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { platform: "asc" }],
    select: { id: true, platform: true, url: true, sortOrder: true, isActive: true },
  });
}

/** Every link, active or not, for the staff editor. */
export async function listAllReviewLinks(prisma: Db, vendorId: string): Promise<ReviewLink[]> {
  return prisma.vendorReviewLink.findMany({
    where: { vendorId },
    orderBy: [{ sortOrder: "asc" }, { platform: "asc" }],
    select: { id: true, platform: true, url: true, sortOrder: true, isActive: true },
  });
}

export interface ReviewLinkInput {
  platform: string;
  url: string;
  sortOrder: number;
  isActive: boolean;
}

/**
 * Create or replace a link by its (vendor, platform) key.
 *
 * Singular `upsert` with no nested writes, so the HTTP client is correct. The URL must
 * already have been validated by `parseReviewLink` in `lib/review-link-form.ts` — this layer
 * does no validation of its own, matching how the rest of the repository layer treats
 * already-parsed input.
 */
export async function upsertReviewLink(
  prisma: Db,
  vendorId: string,
  input: ReviewLinkInput,
): Promise<void> {
  await prisma.vendorReviewLink.upsert({
    where: { vendorId_platform: { vendorId, platform: input.platform } },
    create: {
      vendorId,
      platform: input.platform,
      url: input.url,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    },
    update: {
      url: input.url,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    },
  });
}

/**
 * Remove a link. Vendor-scoped so a forged id from another vendor deletes nothing.
 *
 * `deleteMany` rather than `delete`: it is confirmed safe on the HTTP adapter (CLAUDE.md
 * lists it among the operations that do not open an implicit transaction), it accepts a
 * non-unique `where` so the tenancy filter goes in the query rather than a pre-read, and a
 * no-match is a zero count rather than a throw.
 */
export async function deleteReviewLink(
  prisma: Db,
  vendorId: string,
  linkId: string,
): Promise<number> {
  const result = await prisma.vendorReviewLink.deleteMany({ where: { id: linkId, vendorId } });
  return result.count;
}
