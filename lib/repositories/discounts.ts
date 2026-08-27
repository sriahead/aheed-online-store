import { getPrisma, getPrismaWs } from "@/lib/db";
import { isUniqueViolation } from "@/lib/repositories/prisma-errors";
import {
  evaluateCode,
  normaliseCode,
  type CodeRefusalReason,
  type DiscountKind,
} from "@/lib/discounts";

/**
 * Discount-code read/write path (P5b, #145) — the ONLY DB access for codes.
 * Pages, components and feature actions go through here (ADR-004 slice-2
 * no-direct-Prisma guard).
 *
 * Every function that writes takes `prisma` (or a transaction client) and
 * `vendorId` as EXPLICIT arguments and reads no request context, matching
 * `placeOrder(prisma, vendorId, input)` and `spendPoints(tx, vendorId, …)`.
 * That is a testability requirement, not a style choice: this slice's
 * most important properties are its two concurrency guarantees, and neither can
 * be proven at all if the only entry point needs a live Workers request.
 */

type Db = ReturnType<typeof getPrisma>;
type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];
type AnyDb = Db | Tx;

/**
 * Thrown when the database refuses a claim that passed every pre-check — today,
 * only the per-customer race losing at `@@unique([codeId, userId, seq])`.
 *
 * It exists so `lib/repositories/orders.ts` can translate a Prisma unique
 * violation into a shopper-facing `CheckoutError` without this module importing
 * `CheckoutError` and creating an import cycle.
 */
export class DiscountClaimError extends Error {
  constructor(readonly reason: CodeRefusalReason) {
    super(`Discount code claim refused: ${reason}`);
    this.name = "DiscountClaimError";
  }
}

export interface ClaimedCode {
  codeId: string;
  discountPence: number;
  /** This shopper's zero-based use index — becomes DiscountRedemption.seq. */
  seq: number;
}

export type ClaimResult =
  { ok: true; claim: ClaimedCode } | { ok: false; reason: CodeRefusalReason };

export interface ClaimCodeInput {
  code: string;
  userId: string | null;
  /** PRE-discount subtotal — see lib/discounts.ts on why. */
  subtotalPence: number;
  deliveryFeePence: number;
  now?: Date;
}

/**
 * Reserve one use of a code for this checkout. Call INSIDE `placeOrder`'s
 * transaction, before the Order row is written, so an order can never carry a
 * discount whose use was not actually reserved.
 *
 * The reservation is a compare-and-set on a counter that runs DOWN — the same
 * technique as P3b's `quantity: { gte: qty }` stock decrement and P5a's
 * `balancePoints: { gte: n }`. `remainingRedemptions` counts down rather than up
 * because `usedCount < maxRedemptions` is a column-to-column comparison Prisma
 * cannot express in a `where`, and raw SQL is forbidden in application code.
 *
 * `null` means unlimited: the OR admits it, and `decrement` leaves it null,
 * because Postgres arithmetic on NULL is NULL.
 */
export async function claimCode(
  tx: AnyDb,
  vendorId: string,
  input: ClaimCodeInput,
): Promise<ClaimResult> {
  const code = normaliseCode(input.code);
  if (code === "") return { ok: false, reason: "UNKNOWN" };

  const row = await tx.discountCode.findUnique({
    where: { vendorId_code: { vendorId, code } },
    select: {
      id: true,
      kind: true,
      value: true,
      minSubtotalPence: true,
      startsAt: true,
      endsAt: true,
      remainingRedemptions: true,
      maxPerCustomer: true,
      isActive: true,
    },
  });
  // A code belonging to another vendor is indistinguishable from one that does
  // not exist — the vendor is in the lookup key, not checked afterwards.
  if (!row) return { ok: false, reason: "UNKNOWN" };

  // Only counted when there is an identity to count against. A guest with a
  // capped code is refused by evaluateCode before this number could matter.
  const seq =
    input.userId === null
      ? 0
      : await tx.discountRedemption.count({
          where: { vendorId, codeId: row.id, userId: input.userId },
        });

  const evaluation = evaluateCode({
    kind: row.kind as DiscountKind,
    value: row.value,
    minSubtotalPence: row.minSubtotalPence,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    remainingRedemptions: row.remainingRedemptions,
    maxPerCustomer: row.maxPerCustomer,
    isActive: row.isActive,
    subtotalPence: input.subtotalPence,
    deliveryFeePence: input.deliveryFeePence,
    userId: input.userId,
    customerUseCount: seq,
    now: input.now ?? new Date(),
  });
  if (!evaluation.ok) return { ok: false, reason: evaluation.reason };

  const { count } = await tx.discountCode.updateMany({
    where: {
      id: row.id,
      vendorId,
      isActive: true,
      OR: [{ remainingRedemptions: null }, { remainingRedemptions: { gt: 0 } }],
    },
    data: { remainingRedemptions: { decrement: 1 } },
  });
  // Someone else took the last use between the read and here. The evaluation
  // above saw stock; this is the check that is actually authoritative.
  if (count === 0) return { ok: false, reason: "USAGE_LIMIT_REACHED" };

  return { ok: true, claim: { codeId: row.id, discountPence: evaluation.discountPence, seq } };
}

/**
 * The second half of `claimCode` — the record, once the order has an id.
 *
 * This is where the PER-CUSTOMER cap is actually enforced. Two concurrent
 * checkouts by the same shopper both read `seq = 0` above, and
 * `@@unique([codeId, userId, seq])` refuses the second here, rolling back its
 * whole transaction (including its `remainingRedemptions` decrement). A
 * count-then-write would have let both through.
 */
export async function recordCodeRedemption(
  tx: AnyDb,
  vendorId: string,
  input: {
    codeId: string;
    orderId: string;
    userId: string | null;
    seq: number;
    amountPence: number;
  },
): Promise<void> {
  try {
    await tx.discountRedemption.create({
      data: {
        vendorId,
        codeId: input.codeId,
        orderId: input.orderId,
        userId: input.userId,
        seq: input.seq,
        amountPence: input.amountPence,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new DiscountClaimError("CUSTOMER_LIMIT_REACHED");
    throw error;
  }
}

/**
 * Give back the code use held by an order that is being cancelled. Call INSIDE
 * `releaseOrder`'s transaction, beside `reverseRedemption`.
 *
 * Without this, every abandoned checkout permanently burns a use and a 100-use
 * launch code dies quietly without a single paid order.
 *
 * This DELETES the redemption row rather than writing a reversal beside it, and
 * the asymmetry with the loyalty ledger is deliberate. That ledger is append-only
 * because it is a financial audit trail of a balance persisting between orders; a
 * discount on a never-paid order is not a financial event, and the CANCELLED
 * Order row is itself the record of what happened. Deleting also frees the
 * shopper's `seq` slot, so an abandoned checkout does not consume one of their
 * per-customer uses — which a retained reversal row would, unless the count
 * learned to skip reversed rows, at which point `seq` would collide with the very
 * row it was told to ignore.
 *
 * Idempotent: the row is gone after the first call, so a second finds nothing and
 * increments nothing.
 */
export async function releaseCodeRedemption(
  tx: AnyDb,
  vendorId: string,
  orderId: string,
): Promise<number> {
  // findFirst rather than findUnique so `vendorId` is in the WHERE — orderId
  // alone is unique, but a vendor-less read has no place in this layer.
  const redemption = await tx.discountRedemption.findFirst({
    where: { orderId, vendorId },
    select: { id: true, codeId: true },
  });
  if (!redemption) return 0;

  const { count } = await tx.discountRedemption.deleteMany({
    where: { id: redemption.id, vendorId },
  });
  if (count === 0) return 0;

  // increment on a NULL column leaves it NULL, so an unlimited code stays
  // unlimited without a branch.
  await tx.discountCode.updateMany({
    where: { id: redemption.codeId, vendorId },
    data: { remainingRedemptions: { increment: 1 } },
  });

  return count;
}

// ---- admin surface (/staff/discounts) ---------------------------------------

export interface CodeListRow {
  id: string;
  code: string;
  description: string | null;
  kind: DiscountKind;
  value: number;
  minSubtotalPence: number;
  startsAt: Date;
  endsAt: Date | null;
  remainingRedemptions: number | null;
  maxPerCustomer: number | null;
  isActive: boolean;
  /** DERIVED from DiscountRedemption — there is no stored counter to disagree with. */
  redemptionCount: number;
}

export async function listCodes(db: AnyDb, vendorId: string): Promise<CodeListRow[]> {
  const rows = await db.discountCode.findMany({
    where: { vendorId },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      code: true,
      description: true,
      kind: true,
      value: true,
      minSubtotalPence: true,
      startsAt: true,
      endsAt: true,
      remainingRedemptions: true,
      maxPerCustomer: true,
      isActive: true,
      _count: { select: { redemptions: true } },
    },
  });
  return rows.map(({ _count, ...row }) => ({
    ...row,
    kind: row.kind as DiscountKind,
    redemptionCount: _count.redemptions,
  }));
}

export interface CreateCodeInput {
  code: string;
  description: string | null;
  kind: DiscountKind;
  value: number;
  minSubtotalPence: number;
  startsAt: Date;
  endsAt: Date | null;
  remainingRedemptions: number | null;
  maxPerCustomer: number | null;
}

/**
 * `vendorId` is supplied by the caller from `requireVendorRole`, which resolves
 * it from the request host — never from the submitted form.
 */
export async function createCode(
  db: AnyDb,
  vendorId: string,
  input: CreateCodeInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await db.discountCode.create({
      data: {
        vendorId,
        code: normaliseCode(input.code),
        description: input.description,
        kind: input.kind,
        value: input.value,
        minSubtotalPence: input.minSubtotalPence,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        remainingRedemptions: input.remainingRedemptions,
        maxPerCustomer: input.maxPerCustomer,
      },
    });
    return { ok: true };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "This store already has a code with that name." };
    }
    throw error;
  }
}

/**
 * The only post-creation change a code accepts. P5b ships no edit path: changing
 * a live code's value would ask whether past orders re-price (they must not) and
 * create a window where two shoppers used "the same code" at different rates.
 * Deactivate and create a replacement instead.
 */
export async function deactivateCode(db: AnyDb, vendorId: string, codeId: string): Promise<number> {
  const { count } = await db.discountCode.updateMany({
    where: { id: codeId, vendorId },
    data: { isActive: false },
  });
  return count;
}

/**
 * Admin write wrappers for `features/admin/discount-codes.ts`.
 *
 * These take `vendorId` only and resolve Prisma themselves, matching P5a's
 * `saveLoyaltySettings`. ADR-004 slice 2's ESLint guard forbids `@/lib/db` in the
 * feature layer, so an action cannot hand a client in — and unlike the
 * transactional functions above, there is no concurrency guarantee here that
 * needs proving from a plain script.
 *
 * `vendorId` still comes from the caller's `requireVendorRole`, which resolves it
 * from the request host, never from the form.
 */
export async function createCodeForVendor(
  vendorId: string,
  input: CreateCodeInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return createCode(getPrisma(), vendorId, input);
}

export async function deactivateCodeForVendor(vendorId: string, codeId: string): Promise<number> {
  // getPrismaWs(), not getPrisma(): deactivateCode's updateMany needs a
  // transaction-capable client — PrismaNeonHttp can't execute the one Prisma 6's
  // client-side query compiler opens internally for updateMany (#382).
  return deactivateCode(getPrismaWs(), vendorId, codeId);
}

/* The request-scoped read facade that used to sit here now lives in
 * `lib/discounts-service.ts` (#252) — it resolves the current vendor from
 * request context, which this module deliberately never does. */
