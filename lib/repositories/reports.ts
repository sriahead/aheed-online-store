import type { getPrisma } from "@/lib/db";
import { pointsToPence, visibleBalance } from "@/lib/loyalty";

/**
 * Non-sales reporting aggregates (P7.5d+e, #161).
 *
 * SALES analytics is deliberately absent. Production still runs Stripe TEST keys
 * (#113), so there is no real trading data; anything designed against seed
 * fixtures would be redesigned the moment real order patterns appear. The three
 * revenue tiles /staff/reports already has (P7.5a) are the whole of its sales
 * surface, and this module does not add a fourth.
 *
 * What IS here describes configuration and catalogue state, both of which are
 * real today regardless of whether any money has moved.
 *
 * As with lib/repositories/customers.ts, both `prisma` and `vendorId` are
 * explicit parameters and nothing reads request context, so a plain `tsx` script
 * can exercise these directly. `lib/reports-service.ts` is the request-scoped
 * entry point.
 *
 * Until #409 this docstring made that claim while both exports called
 * `getPrisma()` themselves, which made it false: a `lib/db` client is built from
 * `@prisma/client/wasm`, whose query compiler Node cannot load, so neither could
 * run in a script. The type-only import above is what keeps the claim true.
 */

export interface CatalogueHealth {
  totalProducts: number;
  activeProducts: number;
  outOfStock: number;
  /** At or below this product's own lowStockThreshold, and not already zero. */
  lowStock: number;
}

/**
 * Catalogue and stock health.
 *
 * `lowStock` compares two COLUMNS of the same row, which Prisma cannot express in
 * a `where` — there is no "field A ≤ field B" filter. Rather than reach for raw
 * SQL (forbidden in this layer), the inventory rows are read and compared in
 * memory. One row per product for one vendor is a size this is fine at; if a
 * catalogue ever outgrows it, the honest fix is a generated column or a view in a
 * migration, not a raw query here.
 *
 * `outOfStock` and `lowStock` are deliberately DISJOINT — a zero-quantity product
 * is out of stock, not "also low" — so the two figures sum to something
 * meaningful rather than double-counting the worst rows.
 */
export async function getCatalogueHealth(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
): Promise<CatalogueHealth> {
  const [totalProducts, activeProducts, inventory] = await Promise.all([
    prisma.product.count({ where: { vendorId } }),
    prisma.product.count({ where: { vendorId, isActive: true } }),
    prisma.inventory.findMany({
      where: { vendorId },
      select: { quantity: true, lowStockThreshold: true },
    }),
  ]);

  let outOfStock = 0;
  let lowStock = 0;
  for (const row of inventory) {
    if (row.quantity === 0) outOfStock += 1;
    else if (row.quantity <= row.lowStockThreshold) lowStock += 1;
  }

  return { totalProducts, activeProducts, outOfStock, lowStock };
}

export interface LoyaltyLiability {
  /** Points a shopper could actually spend today — lapsed balances excluded. */
  outstandingPoints: number;
  /** What those points would cost the store if every one were redeemed. */
  liabilityPence: number;
  /** Accounts holding a non-zero spendable balance. */
  accountsWithBalance: number;
  /** Accounts whose stored balance has lapsed and is therefore worth nothing. */
  lapsedAccounts: number;
}

/**
 * What this store's loyalty scheme actually owes.
 *
 * THE STORED COLUMN IS NOT THE ANSWER. `LoyaltyAccount.balancePoints` is
 * deliberately left STALE after points lapse — expiry is derived at read time
 * from `lastActivityAt` versus `VendorConfig.pointsExpiryMonths`, and the column
 * only resets on the next EARN (see lib/loyalty.ts). So a plain
 * `SUM(balancePoints)` overstates liability by every lapsed balance still sitting
 * in the table, which is the same class of knowably-wrong aggregate that #238
 * was — the defect P7.5a exists to fix. This function must not reintroduce it one
 * page over.
 *
 * The lapse rule is applied by CALLING `visibleBalance()` rather than by
 * re-expressing it as a date filter in the query. A cutoff computed here would be
 * a second copy of a rule that lives in lib/loyalty.ts, free to drift from the
 * one the account page and checkout actually use. The cost is that balances are
 * summed in memory rather than by the database; the rows are two small columns
 * per account for one vendor, and correctness is worth more than that here.
 */
export async function getLoyaltyLiability(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
): Promise<LoyaltyLiability> {
  const [accounts, config] = await Promise.all([
    prisma.loyaltyAccount.findMany({
      where: { vendorId },
      select: { balancePoints: true, lastActivityAt: true },
    }),
    prisma.vendorConfig.findUnique({
      where: { vendorId },
      select: { pointsExpiryMonths: true, pencePerPointRedeemed: true },
    }),
  ]);

  const now = new Date();
  const pointsExpiryMonths = config?.pointsExpiryMonths ?? null;
  // Mirrors LOYALTY_CONFIG_FALLBACK's floor: a zero would make every point
  // worthless while still being redeemable, and it is what pointsToPence divides
  // the ledger by everywhere else.
  const pencePerPointRedeemed = config?.pencePerPointRedeemed ?? 1;

  let outstandingPoints = 0;
  let accountsWithBalance = 0;
  let lapsedAccounts = 0;

  for (const account of accounts) {
    const spendable = visibleBalance(
      account.balancePoints,
      account.lastActivityAt,
      now,
      pointsExpiryMonths,
    );
    if (spendable > 0) {
      outstandingPoints += spendable;
      accountsWithBalance += 1;
    } else if (account.balancePoints > 0) {
      // Held a balance, but it has lapsed — worth surfacing separately so the
      // difference between this and the raw column total is explainable rather
      // than looking like a missing number.
      lapsedAccounts += 1;
    }
  }

  return {
    outstandingPoints,
    liabilityPence: pointsToPence(outstandingPoints, pencePerPointRedeemed),
    accountsWithBalance,
    lapsedAccounts,
  };
}
