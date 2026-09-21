import type { getPrisma, getPrismaWs } from "@/lib/db";
import { isUniqueViolation } from "@/lib/repositories/prisma-errors";
import {
  DEFAULT_MULTIPLIER_BPS,
  clampRedemption,
  computePointsEarned,
  eligibleSpendPence,
  isLapsed,
  resolveTier,
  visibleBalance,
  type LoyaltyTier,
} from "@/lib/loyalty";

/**
 * Loyalty read/write path (P5a, #135) — the ONLY DB access for points. Pages,
 * components and feature actions go through here (ADR-004 slice-2
 * no-direct-Prisma guard).
 *
 * Every transactional function takes `prisma` (or a transaction client) and
 * `vendorId` as EXPLICIT arguments and reads no request context, matching
 * `placeOrder(prisma, vendorId, input)`. That is a testability requirement, not
 * a style choice: the concurrency and idempotency guarantees are this slice's
 * most important properties and cannot be proven at all if the only entry point
 * needs a live Workers request.
 */

/** A Prisma client or an interactive-transaction client — the writes work on either. */
type Db = ReturnType<typeof getPrisma>;
type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];
type AnyDb = Db | Tx;

/**
 * The WebSocket-adapter client, for the one export here that opens an
 * interactive transaction. `PrismaNeonHttp` cannot execute one at all (#382), so
 * this is a distinct type from `Db` by intent, not by accident — #390 tracks
 * making the two nominally incompatible so the compiler enforces it.
 */
type DbWs = ReturnType<typeof getPrismaWs>;

/** The vendor's loyalty settings, as the pure rules need them. */
export interface LoyaltyConfig {
  loyaltyEnabled: boolean;
  pointsPerPoundEarned: number;
  pencePerPointRedeemed: number;
  minRedeemPoints: number;
  tierWindowDays: number;
  pointsExpiryMonths: number | null;
}

/** Schema defaults, repeated here so an unseeded VendorConfig doesn't crash a checkout. */
export const LOYALTY_CONFIG_FALLBACK: LoyaltyConfig = {
  loyaltyEnabled: false,
  pointsPerPoundEarned: 1,
  pencePerPointRedeemed: 1,
  minRedeemPoints: 100,
  tierWindowDays: 30,
  pointsExpiryMonths: null,
};

export async function getLoyaltyConfig(db: AnyDb, vendorId: string): Promise<LoyaltyConfig> {
  const config = await db.vendorConfig.findUnique({
    where: { vendorId },
    select: {
      loyaltyEnabled: true,
      pointsPerPoundEarned: true,
      pencePerPointRedeemed: true,
      minRedeemPoints: true,
      tierWindowDays: true,
      pointsExpiryMonths: true,
    },
  });
  return config ?? LOYALTY_CONFIG_FALLBACK;
}

export async function getTiers(db: AnyDb, vendorId: string): Promise<LoyaltyTier[]> {
  return db.vendorLoyaltyTier.findMany({
    where: { vendorId },
    select: { key: true, name: true, thresholdPence: true, multiplierBps: true },
    orderBy: { thresholdPence: "asc" },
  });
}

export interface LoyaltyBalance {
  /** What the shopper may see and spend — zero once the account has lapsed. */
  balancePoints: number;
  /** The raw stored counter, which a lapsed account leaves stale by design. */
  storedPoints: number;
  lifetimePoints: number;
  lastActivityAt: Date | null;
  lapsed: boolean;
}

const NO_BALANCE: LoyaltyBalance = {
  balancePoints: 0,
  storedPoints: 0,
  lifetimePoints: 0,
  lastActivityAt: null,
  lapsed: false,
};

export async function getBalance(
  db: AnyDb,
  vendorId: string,
  userId: string,
  config: LoyaltyConfig,
  now: Date = new Date(),
): Promise<LoyaltyBalance> {
  const account = await db.loyaltyAccount.findUnique({
    where: { vendorId_userId: { vendorId, userId } },
    select: { balancePoints: true, lifetimePoints: true, lastActivityAt: true },
  });
  if (!account) return NO_BALANCE;

  const lapsed = isLapsed(account.lastActivityAt, now, config.pointsExpiryMonths);
  return {
    balancePoints: visibleBalance(
      account.balancePoints,
      account.lastActivityAt,
      now,
      config.pointsExpiryMonths,
    ),
    storedPoints: account.balancePoints,
    lifetimePoints: account.lifetimePoints,
    lastActivityAt: account.lastActivityAt,
    lapsed,
  };
}

/**
 * The earliest `lastActivityAt` that still counts as live, or `null` when this
 * vendor's points never expire. Used as the `gt` bound inside the redemption
 * guard, so a lapsed account fails the WHERE rather than being caught by a
 * separate check that a concurrent write could race past.
 */
function activityCutoff(now: Date, pointsExpiryMonths: number | null): Date | null {
  if (pointsExpiryMonths === null) return null;
  const cutoff = new Date(now.getTime());
  cutoff.setUTCMonth(cutoff.getUTCMonth() - pointsExpiryMonths);
  return cutoff;
}

export interface RedemptionResult {
  pointsSpent: number;
  discountPence: number;
}

const NO_REDEMPTION: RedemptionResult = { pointsSpent: 0, discountPence: 0 };

/**
 * Take the points, then record what they bought. `spendPoints` and
 * `recordRedemption` are a PAIR, and both must run inside the checkout's single
 * transaction.
 *
 * They are two functions rather than one because of an ordering constraint that
 * has no way around it: the guarded debit has to happen BEFORE the Order row is
 * created, or an order could be written carrying a discount whose points the
 * shopper turned out not to have — but the ledger row needs the `orderId` that
 * only exists afterwards. Splitting keeps the debit first and the audit row
 * accurate; the surrounding transaction is what makes the pair atomic, so an
 * order that fails after the debit rolls the points back with it.
 *
 * The debit is a conditional `updateMany` whose WHERE carries `vendorId`,
 * `userId`, `balancePoints: { gte: n }` and the activity cutoff. That is the same
 * compare-and-set P3b used to make overselling impossible, aimed at a different
 * race: two concurrent checkouts reading the same balance cannot both spend it,
 * because the second matches zero rows. `vendorId` sits in the WHERE rather than
 * being compared afterwards, so another vendor's balance is unmatchable rather
 * than merely rejected.
 *
 * Returns a zero redemption rather than throwing whenever the spend can't
 * happen — a shopper who lost a points race should still get their order.
 */
export async function spendPoints(
  tx: AnyDb,
  vendorId: string,
  input: {
    userId: string | null;
    requestedPoints: number;
    subtotalPence: number;
    deliveryFeePence: number;
    /** Discount already claimed on this order by a P5b code (#145). */
    existingDiscountPence?: number;
    config: LoyaltyConfig;
    now?: Date;
  },
): Promise<RedemptionResult> {
  const { userId, requestedPoints, subtotalPence, deliveryFeePence, config } = input;
  const now = input.now ?? new Date();

  // Guests have no identity to hold a balance (P3a's guestToken identifies a
  // cart, not a person), and a vendor with loyalty off has no balances at all.
  if (!userId || !config.loyaltyEnabled) return NO_REDEMPTION;
  if (!Number.isInteger(requestedPoints) || requestedPoints <= 0) return NO_REDEMPTION;

  const account = await tx.loyaltyAccount.findUnique({
    where: { vendorId_userId: { vendorId, userId } },
    select: { balancePoints: true, lastActivityAt: true },
  });
  if (!account) return NO_REDEMPTION;
  if (isLapsed(account.lastActivityAt, now, config.pointsExpiryMonths)) return NO_REDEMPTION;

  const clamped = clampRedemption({
    requestedPoints,
    balancePoints: account.balancePoints,
    pencePerPointRedeemed: config.pencePerPointRedeemed,
    minRedeemPoints: config.minRedeemPoints,
    subtotalPence,
    deliveryFeePence,
    existingDiscountPence: input.existingDiscountPence,
  });
  if (clamped.pointsSpent <= 0) return NO_REDEMPTION;

  const cutoff = activityCutoff(now, config.pointsExpiryMonths);
  const { count } = await tx.loyaltyAccount.updateMany({
    where: {
      vendorId,
      userId,
      balancePoints: { gte: clamped.pointsSpent },
      ...(cutoff ? { lastActivityAt: { gt: cutoff } } : {}),
    },
    data: { balancePoints: { decrement: clamped.pointsSpent }, lastActivityAt: now },
  });
  // Someone else spent it between the read and here. No discount, no entry.
  if (count === 0) return NO_REDEMPTION;

  return clamped;
}

/** The second half of `spendPoints` — the audit row, once the order has an id. */
export async function recordRedemption(
  tx: AnyDb,
  vendorId: string,
  input: { userId: string; orderId: string; pointsSpent: number },
): Promise<void> {
  if (input.pointsSpent <= 0) return;
  await tx.loyaltyLedgerEntry.create({
    data: {
      vendorId,
      userId: input.userId,
      orderId: input.orderId,
      kind: "REDEEM",
      points: -input.pointsSpent,
    },
  });
}

/**
 * Credit points for an order whose payment just confirmed. Call INSIDE
 * `confirmPayment`'s transaction, so points and the CONFIRMED status commit
 * together or not at all.
 *
 * Idempotency is structural: `LoyaltyLedgerEntry` carries
 * `@@unique([orderId, kind])`, so a duplicate Stripe delivery that reaches this
 * far is refused by the database. The caller (`confirmPayment`) only gets here
 * when its own compare-and-set performed the transition, which is the first
 * line of defence; this is the second.
 */
export async function earnPoints(
  tx: AnyDb,
  vendorId: string,
  input: {
    userId: string | null;
    orderId: string;
    subtotalPence: number;
    discountPence: number;
    config: LoyaltyConfig;
    tiers: LoyaltyTier[];
    windowSpendPence: number;
    now?: Date;
  },
): Promise<number> {
  const { userId, orderId, subtotalPence, discountPence, config, tiers, windowSpendPence } = input;
  const now = input.now ?? new Date();

  if (!userId || !config.loyaltyEnabled) return 0;

  const spend = eligibleSpendPence({ subtotalPence, discountPence });
  const tier = resolveTier(tiers, windowSpendPence);
  const multiplierBps = tier?.multiplierBps ?? DEFAULT_MULTIPLIER_BPS;
  const points = computePointsEarned(spend, config.pointsPerPoundEarned, multiplierBps);
  if (points <= 0) return 0;

  const existing = await tx.loyaltyAccount.findUnique({
    where: { vendorId_userId: { vendorId, userId } },
    select: { id: true, lastActivityAt: true },
  });

  if (!existing) {
    await tx.loyaltyAccount.create({
      data: {
        vendorId,
        userId,
        balancePoints: points,
        lifetimePoints: points,
        lastActivityAt: now,
      },
    });
  } else if (isLapsed(existing.lastActivityAt, now, config.pointsExpiryMonths)) {
    // A lapsed balance is stale, not spendable — this is where it actually
    // becomes zero. Setting rather than incrementing is what keeps the stored
    // column honest once the account comes back to life. `lifetimePoints` still
    // increments: lapsing forfeits a balance, it doesn't rewrite history.
    await tx.loyaltyAccount.update({
      where: { vendorId_userId: { vendorId, userId } },
      data: {
        balancePoints: points,
        lifetimePoints: { increment: points },
        lastActivityAt: now,
      },
    });
  } else {
    await tx.loyaltyAccount.update({
      where: { vendorId_userId: { vendorId, userId } },
      data: {
        balancePoints: { increment: points },
        lifetimePoints: { increment: points },
        lastActivityAt: now,
      },
    });
  }

  await tx.loyaltyLedgerEntry.create({
    data: {
      vendorId,
      userId,
      orderId,
      kind: "EARN",
      points,
      tierKey: tier?.key ?? null,
      multiplierBps,
    },
  });

  return points;
}

/**
 * Award referral bonus points to a referrer's loyalty account upon a referred
 * friend's successful qualifying order payment confirmation.
 *
 * Direct write to LoyaltyAccount inside confirmPayment's interactive transaction.
 */
export async function awardReferralBonusPoints(
  tx: AnyDb,
  vendorId: string,
  referrerUserId: string,
  points: number,
  now: Date = new Date(),
): Promise<number> {
  if (points <= 0) return 0;

  const existing = await tx.loyaltyAccount.findUnique({
    where: { vendorId_userId: { vendorId, userId: referrerUserId } },
    select: { id: true },
  });

  if (!existing) {
    await tx.loyaltyAccount.create({
      data: {
        vendorId,
        userId: referrerUserId,
        balancePoints: points,
        lifetimePoints: points,
        lastActivityAt: now,
      },
    });
  } else {
    await tx.loyaltyAccount.update({
      where: { vendorId_userId: { vendorId, userId: referrerUserId } },
      data: {
        balancePoints: { increment: points },
        lifetimePoints: { increment: points },
        lastActivityAt: now,
      },
    });
  }

  return points;
}

/**
 * Give back points held by an order that is being cancelled. Call INSIDE
 * `releaseOrder`'s transaction.
 *
 * Only a REDEEM is reversed here — see `reverseEarn` below for the other half.
 * Until #696 an EARN could not be reversed at all, because `releaseOrder` acts
 * only on PENDING_PAYMENT orders, strictly before `confirmPayment` writes an
 * earn, so nothing could cancel an order that had earned. `cancelConfirmedOrder`
 * is that missing path, and it calls BOTH functions: a cancelled paid order may
 * carry a REDEEM and an EARN, and each is undone by its own row.
 *
 * Idempotent by the same unique index as the earn path.
 */
export async function reverseRedemption(
  tx: AnyDb,
  vendorId: string,
  orderId: string,
  now: Date = new Date(),
): Promise<number> {
  const redeem = await tx.loyaltyLedgerEntry.findUnique({
    where: { orderId_kind: { orderId, kind: "REDEEM" } },
    select: { userId: true, points: true },
  });
  if (!redeem) return 0;

  const alreadyReversed = await tx.loyaltyLedgerEntry.findUnique({
    where: { orderId_kind: { orderId, kind: "REVERSAL" } },
    select: { id: true },
  });
  if (alreadyReversed) return 0;

  const restored = -redeem.points; // REDEEM.points is negative

  // userId is null when the shopper has since exercised erasure (P7b, #216):
  // their LoyaltyAccount was deleted and this ledger row was detached, but the
  // row itself survives because a retained order's discountPence needs it to
  // stay explainable. There is no balance left to credit — write the REVERSAL
  // anyway, so the trail still balances and the idempotency guard still holds.
  if (redeem.userId !== null) {
    await tx.loyaltyAccount.updateMany({
      where: { vendorId, userId: redeem.userId },
      data: { balancePoints: { increment: restored }, lastActivityAt: now },
    });
  }

  await tx.loyaltyLedgerEntry.create({
    data: {
      vendorId,
      userId: redeem.userId,
      orderId,
      kind: "REVERSAL",
      points: restored,
    },
  });

  return restored;
}

/**
 * Take back points an order EARNED, when staff cancel that order after it was
 * paid for (P9.2, #696 — the reversal half of #137). Call INSIDE
 * `cancelConfirmedOrder`'s transaction, beside `reverseRedemption`.
 *
 * This is the mirror of `reverseRedemption` and deliberately a separate
 * function rather than a `kind` parameter on it: the two differ in which row
 * they read, which row they write, and which direction the balance moves, and
 * the only thing they share is the shape. Collapsing them would produce a
 * function whose every line branches on the argument.
 *
 * `EARN_REVERSAL`, not `REVERSAL`. `@@unique([orderId, kind])` permits exactly
 * one row per kind per order, and `REVERSAL` is already spoken for by the redeem
 * path — an order that both redeemed and earned needs both reversals, and a
 * fourth enum value is what lets the index keep doing its job untouched rather
 * than being widened to accommodate a second meaning.
 *
 * NOTE: the EARN row's `tierKey`/`multiplierBps` snapshot is deliberately left
 * alone. It records what was true when the points were granted, which is the
 * whole reason it is snapshotted rather than recomputed; the cancelled order
 * separately drops out of `windowSpendPence` because that query filters on order
 * status, so future tier resolution already excludes it with no write here.
 *
 * Idempotent by that same unique index, and by the explicit pre-check below.
 */
export async function reverseEarn(
  tx: AnyDb,
  vendorId: string,
  orderId: string,
  now: Date = new Date(),
): Promise<number> {
  const earn = await tx.loyaltyLedgerEntry.findUnique({
    where: { orderId_kind: { orderId, kind: "EARN" } },
    select: { userId: true, points: true },
  });
  if (!earn) return 0;

  const alreadyReversed = await tx.loyaltyLedgerEntry.findUnique({
    where: { orderId_kind: { orderId, kind: "EARN_REVERSAL" } },
    select: { id: true },
  });
  if (alreadyReversed) return 0;

  const taken = -earn.points; // EARN.points is positive, so this is negative

  // Same erasure case reverseRedemption documents (P7b, #216): a null userId
  // means the shopper exercised erasure and their LoyaltyAccount is gone. There
  // is no balance left to debit — write the ledger row anyway so the trail still
  // balances and the idempotency guard still holds.
  //
  // `increment` by a negative can drive balancePoints below zero, and that is
  // correct rather than something to clamp: the shopper may already have spent
  // these points on another order. A clamp here would silently forgive the
  // difference and leave the ledger disagreeing with the balance it is supposed
  // to explain. The redemption path's own guard is what stops a negative balance
  // being SPENT.
  //
  // `lifetimePoints` moves too, and this is a decision requirements.md did not
  // specify either way (#696, noted in build-notes.md for the validator). The
  // EARN incremented BOTH columns, so a full reversal of that EARN has to undo
  // both or the account's two counters end up explaining different histories.
  // This is NOT in tension with the lapsing comment in `awardPoints` above —
  // "lapsing forfeits a balance, it doesn't rewrite history" is about points
  // that WERE earned and then expired, whereas a cancelled order's points were
  // never earned at all. Expiry and cancellation are different events and only
  // one of them is history.
  if (earn.userId !== null) {
    await tx.loyaltyAccount.updateMany({
      where: { vendorId, userId: earn.userId },
      data: {
        balancePoints: { increment: taken },
        lifetimePoints: { increment: taken },
        lastActivityAt: now,
      },
    });
  }

  await tx.loyaltyLedgerEntry.create({
    data: {
      vendorId,
      userId: earn.userId,
      orderId,
      kind: "EARN_REVERSAL",
      points: taken,
    },
  });

  return taken;
}

/**
 * Qualifying spend over the vendor's rolling tier window — goods value only
 * (`subtotalPence - discountPence`), and only orders that actually got paid for.
 */
export async function windowSpendPence(
  db: AnyDb,
  vendorId: string,
  userId: string,
  tierWindowDays: number,
  now: Date = new Date(),
): Promise<number> {
  const since = new Date(now.getTime() - tierWindowDays * 24 * 60 * 60 * 1000);
  const orders = await db.order.findMany({
    where: {
      vendorId,
      userId,
      createdAt: { gte: since },
      status: { in: ["CONFIRMED", "OUT_FOR_DELIVERY", "DELIVERED"] },
    },
    select: { subtotalPence: true, discountPence: true },
  });
  return orders.reduce(
    (sum, order) =>
      sum +
      eligibleSpendPence({
        subtotalPence: order.subtotalPence,
        discountPence: order.discountPence,
      }),
    0,
  );
}

export interface LoyaltySettingsInput {
  loyaltyEnabled: boolean;
  pointsPerPoundEarned: number;
  pencePerPointRedeemed: number;
  minRedeemPoints: number;
  tierWindowDays: number;
  pointsExpiryMonths: number | null;
  /** Edits to EXISTING tiers only, addressed by key. */
  tiers: { key: string; thresholdPence: number; multiplierBps: number }[];
}

/**
 * Persist the admin form (P5a, #135).
 *
 * `vendorId` comes from `requireVendorRole`, which resolves it from the request
 * host — never from the submitted form. Both writes carry it, so a tier key
 * belonging to another vendor simply matches nothing.
 *
 * Tiers are UPDATED, never created or deleted: P5a deliberately ships no tier
 * CRUD, and `updateMany` on a (vendorId, key) pair that doesn't exist is a
 * no-op rather than an accidental insert.
 */
export async function saveLoyaltySettings(
  prismaWs: DbWs,
  vendorId: string,
  settings: LoyaltySettingsInput,
): Promise<void> {
  const { tiers, ...config } = settings;

  await prismaWs.$transaction(async (tx) => {
    await tx.vendorConfig.update({ where: { vendorId }, data: config });
    for (const tier of tiers) {
      await tx.vendorLoyaltyTier.updateMany({
        where: { vendorId, key: tier.key },
        data: { thresholdPence: tier.thresholdPence, multiplierBps: tier.multiplierBps },
      });
    }
  });
}

export interface CreateTierInput {
  key: string;
  name: string;
  thresholdPence: number;
  multiplierBps: number;
}

export type CreateTierResult = { ok: true } | { ok: false; reason: "DUPLICATE_KEY" };

/**
 * Create one loyalty tier for this vendor (P7.5d+e, #136).
 *
 * `vendorId` is an explicit parameter and no request context is read, so a plain
 * `tsx` script can exercise this directly — the property every function in this
 * directory is expected to have.
 *
 * Duplicate keys are detected by LETTING THE DATABASE REFUSE, not by a
 * check-then-insert: `@@unique([vendorId, key])` is the only thing that can
 * decide this without a race, and two admins creating "GOLD" at once is a real
 * enough sequence to not hand-roll. The vendorId in the constraint is why the
 * SAME key remains creatable for a different vendor.
 */
export async function createLoyaltyTier(
  prisma: Db,
  vendorId: string,
  input: CreateTierInput,
): Promise<CreateTierResult> {
  try {
    await prisma.vendorLoyaltyTier.create({
      data: {
        vendorId,
        key: input.key,
        name: input.name,
        thresholdPence: input.thresholdPence,
        multiplierBps: input.multiplierBps,
        // Ordering follows the threshold, which is what resolveTier() actually
        // sorts on — a separately-managed sortOrder would be a second source of
        // truth for the same ranking.
        sortOrder: input.thresholdPence,
      },
    });
    return { ok: true };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "DUPLICATE_KEY" };
    throw error;
  }
}

/**
 * Delete one loyalty tier for this vendor (P7.5d+e, #136).
 *
 * `deleteMany` scoped by (vendorId, key), so another vendor's tier with the same
 * key matches nothing rather than being deleted.
 *
 * THIS DELIBERATELY DOES NOT TOUCH LoyaltyLedgerEntry. That table snapshots
 * `tierKey` and `multiplierBps` onto each EARN precisely so history survives the
 * tier table changing, and it holds no foreign key to VendorLoyaltyTier — so a
 * ledger row referencing a deleted tier is CORRECT, not dangling. Rewriting or
 * cascading those rows would destroy the audit trail's ability to explain its own
 * numbers, which is the one thing that model is for.
 *
 * Returns how many rows went, so the caller can tell "deleted" from "no such
 * tier" without a second read.
 */
export async function deleteLoyaltyTier(
  prisma: Db,
  vendorId: string,
  key: string,
): Promise<{ count: number }> {
  return prisma.vendorLoyaltyTier.deleteMany({ where: { vendorId, key } });
}

export interface LedgerRow {
  kind: string;
  points: number;
  createdAt: Date;
  orderNumber: string;
}

const LEDGER_PAGE_SIZE = 50;

/**
 * This vendor's ledger entries for this user only, newest first.
 *
 * Takes `prisma` and `vendorId` explicitly and reads no request context — the
 * request-scoped facade that resolves both lives in `lib/loyalty-service.ts`
 * (#252).
 */
export async function listLedgerForUser(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  userId: string,
): Promise<LedgerRow[]> {
  const rows = await prisma.loyaltyLedgerEntry.findMany({
    where: { vendorId, userId },
    select: {
      kind: true,
      points: true,
      createdAt: true,
      order: { select: { orderNumber: true } },
    },
    orderBy: { createdAt: "desc" },
    take: LEDGER_PAGE_SIZE,
  });
  return rows.map((row) => ({
    kind: row.kind,
    points: row.points,
    createdAt: row.createdAt,
    orderNumber: row.order.orderNumber,
  }));
}
