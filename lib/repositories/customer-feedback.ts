import type { getPrisma, getPrismaWs } from "@/lib/db";

/**
 * Business-level customer feedback (P9.2, #818) — the ONLY DB access for it. Pages,
 * components and feature actions reach these through `lib/customer-feedback-service.ts`'s
 * request-scoped wrapper (ADR-004 slice-2 no-direct-Prisma guard).
 *
 * THE `@/lib/db` IMPORT IS TYPE-ONLY, DELIBERATELY — matching `lib/repositories/reviews.ts`
 * and `lib/repositories/categories.ts`. `lib/db.ts` imports PrismaClient from
 * `@prisma/client/wasm`, the workerd-safe loader, which a plain Node process should not pull
 * in. Every function here takes its client as an argument, so a runtime import would buy
 * nothing and would stop a `tsx` script from loading this module at all — and this module
 * carries a security control, so being runnable from a script is the point (#409).
 *
 * EVERY EXPORTED FUNCTION takes its client and `vendorId` (plus `userId` where user-scoped)
 * as EXPLICIT arguments and reads no request context — no `getCurrentVendorId()`, no
 * `headers()`, no `getAuth()`. `tests/repository-purity.test.ts` enforces it without an
 * allowlist.
 *
 * WHAT STAFF CANNOT DO, BY CONSTRUCTION (#818 R31). No export here creates a row, and no
 * export changes `rating`, `comment` or `authorName` on an existing one except
 * `upsertCustomerFeedback`, which is reachable only from the customer's own session-gated
 * action and always writes the caller's own `userId`. Staff-reachable writes go through
 * `setFeedbackStatus`/`setFeedbackStatusBulk`, which touch only moderation columns. That is
 * the enforcement for "staff may not fabricate or edit a customer's words" — a rule stated
 * in prose elsewhere is a rule nobody provides.
 */

type Db = ReturnType<typeof getPrisma>;
type DbWs = ReturnType<typeof getPrismaWs>;

/** A row as the storefront renders it. Carries no moderation columns and no user id. */
export interface PublicFeedback {
  id: string;
  authorName: string;
  rating: number;
  comment: string | null;
  verifiedPurchase: boolean;
  submittedAt: Date;
}

/** Approved-row aggregate for the section header. */
export interface FeedbackSummary {
  averageRating: number;
  approvedCount: number;
}

/** A row as the customer sees their own, including its moderation state. */
export interface OwnFeedback {
  id: string;
  rating: number;
  comment: string | null;
  verifiedPurchase: boolean;
  status: "PENDING" | "APPROVED" | "REJECTED";
  submittedAt: Date;
}

/** A row as the staff moderation queue lists it. */
export interface ModerationFeedback extends OwnFeedback {
  authorName: string;
  moderationNote: string | null;
  moderatedAt: Date | null;
}

export interface UpsertFeedbackInput {
  authorName: string;
  rating: number;
  comment: string | null;
  verifiedPurchase: boolean;
  ipHash: string | null;
}

/**
 * Write (or replace) this customer's feedback for this vendor.
 *
 * THE RESET IS THE WHOLE POINT. Both the create and the update branch set
 * `status: PENDING` and null the moderation stamp, so editing an already-approved row
 * un-publishes it until a human looks again. Without that, a customer could submit something
 * innocuous, wait for approval, then edit it into anything at all — a complete bypass of the
 * only content control this feature has (#818 R18).
 *
 * `submittedAt` moves on every write: the per-row edit throttle and the storefront's
 * newest-first ordering both read it, and a stale value would defeat both.
 *
 * The ordinary HTTP client is correct here. This is a singular `upsert` with NO nested
 * writes, which CLAUDE.md lists among the operations that do not open an implicit
 * transaction — unlike `updateMany`/`createMany`, or a `create` carrying nested children.
 */
export async function upsertCustomerFeedback(
  prisma: Db,
  vendorId: string,
  userId: string,
  input: UpsertFeedbackInput,
): Promise<void> {
  const now = new Date();
  await prisma.customerFeedback.upsert({
    where: { vendorId_userId: { vendorId, userId } },
    create: {
      vendorId,
      userId,
      authorName: input.authorName,
      rating: input.rating,
      comment: input.comment,
      verifiedPurchase: input.verifiedPurchase,
      ipHash: input.ipHash,
      status: "PENDING",
      submittedAt: now,
    },
    update: {
      authorName: input.authorName,
      rating: input.rating,
      comment: input.comment,
      verifiedPurchase: input.verifiedPurchase,
      ipHash: input.ipHash,
      status: "PENDING",
      moderatedById: null,
      moderatedAt: null,
      submittedAt: now,
    },
  });
}

/** This customer's own feedback for this vendor, whatever its moderation state. */
export async function getOwnFeedback(
  prisma: Db,
  vendorId: string,
  userId: string,
): Promise<OwnFeedback | null> {
  const row = await prisma.customerFeedback.findUnique({
    where: { vendorId_userId: { vendorId, userId } },
    select: {
      id: true,
      rating: true,
      comment: true,
      verifiedPurchase: true,
      status: true,
      submittedAt: true,
    },
  });
  return row ?? null;
}

/**
 * Approved feedback for the storefront, newest first.
 *
 * The `status` filter is in the query rather than applied by the caller on purpose: a
 * component that receives every row and filters in JSX is one careless edit away from
 * rendering unmoderated text, and the index is `[vendorId, status, submittedAt]` precisely
 * so this shape is the cheap one.
 */
export async function listApprovedFeedback(
  prisma: Db,
  vendorId: string,
  take: number,
): Promise<PublicFeedback[]> {
  return prisma.customerFeedback.findMany({
    where: { vendorId, status: "APPROVED" },
    orderBy: { submittedAt: "desc" },
    take,
    select: {
      id: true,
      authorName: true,
      rating: true,
      comment: true,
      verifiedPurchase: true,
      submittedAt: true,
    },
  });
}

/** Mean rating and count over APPROVED rows only — the same set the cards render. */
export async function getApprovedFeedbackSummary(
  prisma: Db,
  vendorId: string,
): Promise<FeedbackSummary> {
  const aggregate = await prisma.customerFeedback.aggregate({
    where: { vendorId, status: "APPROVED" },
    _avg: { rating: true },
    _count: true,
  });
  return {
    averageRating: aggregate._avg.rating ?? 0,
    approvedCount: aggregate._count,
  };
}

/**
 * The moderation queue: PENDING first, then newest first within each state.
 *
 * Two-key ordering rather than a status filter, so a moderator can still see what they
 * approved and reject it again without a second screen.
 */
export async function listFeedbackForModeration(
  prisma: Db,
  vendorId: string,
  take: number,
): Promise<ModerationFeedback[]> {
  const rows = await prisma.customerFeedback.findMany({
    where: { vendorId },
    orderBy: [{ status: "asc" }, { submittedAt: "desc" }],
    take,
    select: {
      id: true,
      authorName: true,
      rating: true,
      comment: true,
      verifiedPurchase: true,
      status: true,
      moderationNote: true,
      moderatedAt: true,
      submittedAt: true,
    },
  });
  // `status: "asc"` orders by the enum's declaration order — PENDING, APPROVED, REJECTED —
  // which is the queue order this page wants and is why the enum is declared that way.
  return rows;
}

/**
 * Moderate one row. Returns false when no row of this vendor's has that id.
 *
 * TWO QUERIES RATHER THAN ONE, for two separate reasons.
 *
 * It is NOT `updateMany` with `{ id, vendorId }`, which would be the obvious one-query
 * shape: `updateMany` through the HTTP client crashes unconditionally, even matching zero
 * rows (CLAUDE.md; measured in #382 and #116). Only the bulk path below, which genuinely
 * needs it, pays for the websocket client.
 *
 * And it is not a singular `update` with `{ id, vendorId }` plus a caught `P2025`: the two
 * adapters report the same Postgres condition under different `.code` values, so any code
 * path whose correctness depends on matching an error code has to be proven against a real
 * failing request. A scoped read followed by an update by primary key needs no error code at
 * all, and a missing row is an ordinary `false` rather than a throw.
 *
 * `vendorId` scopes the read, so a forged id from another vendor changes nothing. Only
 * moderation columns are writable here — never `rating`, `comment` or `authorName` (R31).
 */
export async function setFeedbackStatus(
  prisma: Db,
  vendorId: string,
  feedbackId: string,
  status: "PENDING" | "APPROVED" | "REJECTED",
  moderatorId: string,
  moderationNote: string | null,
): Promise<boolean> {
  const existing = await prisma.customerFeedback.findFirst({
    where: { id: feedbackId, vendorId },
    select: { id: true },
  });
  if (!existing) return false;

  const moderated = status !== "PENDING";
  await prisma.customerFeedback.update({
    where: { id: existing.id },
    data: {
      status,
      moderationNote,
      moderatedById: moderated ? moderatorId : null,
      moderatedAt: moderated ? new Date() : null,
    },
  });
  return true;
}

/**
 * Approve several rows at once.
 *
 * **MUST be the websocket client.** `updateMany` through `getPrisma()` (the HTTP adapter)
 * crashes unconditionally — even when it matches zero rows — because it opens an implicit
 * transaction the HTTP adapter cannot run. That is a CLAUDE.md rule with measurements behind
 * it (#382, #116), and it is invisible to `build`, `typecheck` and `test`: the only thing
 * that catches a wrong client here is running it against a real database, which is what
 * `scripts/verify-customer-feedback.ts --bulk-approve` exists to do.
 */
export async function setFeedbackStatusBulk(
  prismaWs: DbWs,
  vendorId: string,
  feedbackIds: string[],
  moderatorId: string,
): Promise<number> {
  if (feedbackIds.length === 0) return 0;
  const result = await prismaWs.customerFeedback.updateMany({
    where: { id: { in: feedbackIds }, vendorId },
    data: {
      status: "APPROVED",
      moderatedById: moderatorId,
      moderatedAt: new Date(),
    },
  });
  return result.count;
}

/**
 * Whether this customer has an order that counts as completed for the "Verified customer"
 * badge.
 *
 * DELIVERED or COLLECTED only. `CONFIRMED` and `OUT_FOR_DELIVERY` deliberately do not count
 * — the badge claims the customer received their order, and an order still in a van has not
 * been received. Defined once here rather than at each call site so the two paths that need
 * it (submit and edit) cannot drift apart.
 */
export async function hasCompletedOrder(
  prisma: Db,
  vendorId: string,
  userId: string,
): Promise<boolean> {
  const count = await prisma.order.count({
    where: { vendorId, userId, status: { in: ["DELIVERED", "COLLECTED"] } },
  });
  return count > 0;
}
