import type { getPrisma } from "@/lib/db";
import { REVENUE_STATUSES } from "@/lib/order-status";
import { visibleBalance } from "@/lib/loyalty";

/**
 * The staff customer directory (P7.5d+e, #160) — the P6 roadmap line's
 * "customer directory", which had never been built.
 *
 * NO REQUEST-SCOPED FACADE LIVES IN THIS FILE, and nothing here resolves its own
 * Prisma client: both `prisma` and `vendorId` are explicit parameters, so a plain
 * `tsx` script can exercise it directly. See `lib/customers-service.ts` for the
 * request-scoped entry point.
 *
 * This docstring used to make that claim while `listCustomersForAdmin` called
 * `getPrisma()` itself, which made it false — a `lib/db` client is built from
 * `@prisma/client/wasm`, whose query compiler Node cannot load, so the function
 * could not run in a script at all (#409). Keep the import above type-only: that
 * is what makes the claim structurally true rather than aspirational.
 *
 * WHAT A "CUSTOMER" IS HERE
 *
 * A person who has placed at least one REVENUE-status order with THIS vendor —
 * not a `User` row. `User` is global across tenants (ADR-004), so listing it on a
 * vendor's panel would show one vendor the other's customers. Orders are
 * vendor-scoped, so deriving the directory from them is what makes it correct by
 * construction rather than by a filter someone has to remember.
 *
 * Revenue statuses (not all statuses) for the same reason /staff/reports uses
 * them since P7.5a (#238): someone who abandoned a checkout that never got paid
 * for is not a customer, and counting their basket as "spend" is the exact defect
 * that phase existed to fix.
 */

/** One directory entry. */
export interface AdminCustomerRow {
  /**
   * How this person is identified — which determines what can be shown.
   *
   * ERASED is a real, expected state, not an error: P7b's erasure nulls BOTH
   * `userId` and `guestEmail` on the order (lib/repositories/data-rights.ts), so
   * every erased person's orders collapse into ONE indistinguishable group. That
   * is the correct outcome of erasure, and it is rendered as a single aggregate
   * entry rather than silently dropped — an order that still counts toward the
   * store's revenue should still be visible as a line in the directory.
   */
  kind: "ACCOUNT" | "GUEST" | "ERASED";
  userId: string | null;
  /** The account holder's email, or the guest's. Null once erased. */
  email: string | null;
  /** The account holder's name. Null for guests and erased entries. */
  name: string | null;
  orderCount: number;
  totalSpendPence: number;
  /** Points, expiry already applied. Null where there is no account to hold them. */
  loyaltyPoints: number | null;
}

export interface AdminCustomerPage {
  items: AdminCustomerRow[];
  /** Zero-based, matching the `page` argument. */
  page: number;
  hasMore: boolean;
}

/**
 * PAGINATION IS OFFSET-BASED, NOT KEYSET — a deliberate departure from
 * /staff/orders and /staff/products, and the one place this module differs from
 * its neighbours.
 *
 * Those pages paginate ROWS, which have a stable unique id to key on. A customer
 * is not a row: it is a GROUP over orders, and its identity is the (userId,
 * guestEmail) pair the grouping is done on. Keyset paging over an aggregate would
 * mean filtering the underlying orders by that composite key — expressible only
 * as raw SQL, which is forbidden in this layer.
 *
 * Ordering by total spend descending is also what makes the first page the useful
 * one for a shop owner, and a spend-ordered keyset would need a tiebreak column
 * the group does not have.
 */
export async function listCustomersForAdmin(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  { take, page }: { take: number; page: number },
): Promise<AdminCustomerPage> {
  const safePage = Number.isInteger(page) && page > 0 ? page : 0;

  const groups = await prisma.order.groupBy({
    by: ["userId", "guestEmail"],
    where: { vendorId, status: { in: [...REVENUE_STATUSES] } },
    _count: { _all: true },
    _sum: { totalPence: true },
    orderBy: { _sum: { totalPence: "desc" } },
    take: take + 1,
    skip: safePage * take,
  });

  const hasMore = groups.length > take;
  const pageGroups = hasMore ? groups.slice(0, take) : groups;

  const userIds = pageGroups.map((group) => group.userId).filter((id): id is string => id !== null);

  // Two small reads keyed by the ids actually on this page, rather than joining
  // the whole user table into the aggregate.
  const [users, loyaltyAccounts, config] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : Promise.resolve([]),
    userIds.length
      ? prisma.loyaltyAccount.findMany({
          where: { vendorId, userId: { in: userIds } },
          select: { userId: true, balancePoints: true, lastActivityAt: true },
        })
      : Promise.resolve([]),
    prisma.vendorConfig.findUnique({
      where: { vendorId },
      select: { pointsExpiryMonths: true },
    }),
  ]);

  const userById = new Map(users.map((user) => [user.id, user]));
  const loyaltyByUserId = new Map(loyaltyAccounts.map((account) => [account.userId, account]));
  const pointsExpiryMonths = config?.pointsExpiryMonths ?? null;
  const now = new Date();

  const items: AdminCustomerRow[] = pageGroups.map((group) => {
    const orderCount = group._count._all;
    const totalSpendPence = group._sum.totalPence ?? 0;

    if (group.userId !== null) {
      const user = userById.get(group.userId);
      const account = loyaltyByUserId.get(group.userId);
      return {
        kind: "ACCOUNT",
        userId: group.userId,
        email: user?.email ?? null,
        name: user?.name ?? null,
        orderCount,
        totalSpendPence,
        // Expiry applied here for the same reason /staff/reports applies it:
        // balancePoints is left deliberately stale after a lapse and only resets
        // on the next EARN, so the stored column is not the answer.
        loyaltyPoints: account
          ? visibleBalance(account.balancePoints, account.lastActivityAt, now, pointsExpiryMonths)
          : 0,
      };
    }

    if (group.guestEmail !== null) {
      return {
        kind: "GUEST",
        userId: null,
        email: group.guestEmail,
        name: null,
        orderCount,
        totalSpendPence,
        loyaltyPoints: null,
      };
    }

    return {
      kind: "ERASED",
      userId: null,
      email: null,
      name: null,
      orderCount,
      totalSpendPence,
      loyaltyPoints: null,
    };
  });

  return { items, page: safePage, hasMore };
}
