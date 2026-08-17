import { getPrisma, getPrismaWs } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import { buildOrderNumber, computeTotals, type DeliveryRules } from "@/lib/order-totals";
import { getPaymentService } from "@/lib/payments";
import { effectiveStock } from "@/lib/cart-rules";
import {
  buildStaffTimeline,
  buildTimeline,
  canTransition,
  isOrderStatus,
  STAFF_QUEUE_STATUSES,
  type OrderStatusValue,
  type StaffTimelineEntry,
  type TimelineEntry,
} from "@/lib/order-status";
import {
  earnPoints,
  getLoyaltyConfig,
  getTiers,
  recordRedemption,
  reverseRedemption,
  spendPoints,
  windowSpendPence,
} from "@/lib/repositories/loyalty";
import {
  DiscountClaimError,
  claimCode,
  recordCodeRedemption,
  releaseCodeRedemption,
} from "@/lib/repositories/discounts";
import { refusalMessage } from "@/lib/discounts";

/**
 * Order read/write path (P3b, #96) — the ONLY DB access for orders. Pages,
 * components and feature actions go through here (slice-2 no-direct-Prisma guard).
 *
 * The transactional core is `placeOrder(prisma, vendorId, input)`, which takes its
 * client and vendor as EXPLICIT arguments and reads no request context. That is a
 * testability requirement, not a style choice: the concurrency guarantee is this
 * slice's most important property and cannot be tested at all if the only entry
 * point needs a live request (see the spec's R9a).
 */

export class CheckoutError extends Error {
  constructor(
    readonly code:
      | "MERGE_PENDING"
      | "CART_EMPTY"
      | "LINE_UNAVAILABLE"
      | "NOT_DELIVERABLE"
      | "BELOW_MINIMUM"
      | "INSUFFICIENT_STOCK"
      | "ORDER_NUMBER_COLLISION"
      | "PAYMENT_PROVIDER_FAILED"
      | "DISCOUNT_CODE",
    message: string,
  ) {
    super(message);
    this.name = "CheckoutError";
  }
}

export interface PlaceOrderInput {
  cartId: string;
  /** Exactly one of these identifies the buyer. */
  userId: string | null;
  guestEmail: string | null;
  address: {
    recipientName: string;
    phone: string;
    line1: string;
    line2: string | null;
    city: string;
    postcode: string;
    notes: string | null;
  };
  rules: DeliveryRules & { minimumOrderPence: number };
  /**
   * Loyalty points the shopper asked to spend (P5a, #135). An INTENT, never an
   * amount: the discount in pence is recomputed here from the persisted balance,
   * exactly as the subtotal is recomputed rather than trusted from the form.
   */
  redeemPoints?: number;
  /**
   * The discount code the shopper typed (P5b, #145). An INTENT, never an amount:
   * the discount in pence is recomputed here from the persisted code row, exactly
   * as the subtotal is recomputed rather than trusted from the form.
   *
   * Unlike `redeemPoints`, an unusable value here FAILS the checkout rather than
   * being treated as zero — silently charging full price for an order the shopper
   * believes is discounted is worse than refusing it and saying why.
   */
  discountCode?: string | null;
  vendorSlug: string;
  /** Absolute origin for the provider's return URLs. Supplied by the checkout
   *  action so this stays free of request context (P3b R9a). */
  returnOrigin: string;
}

export interface PlacedOrder {
  orderNumber: string;
  totalPence: number;
  /** Where to send the shopper to pay; null when the stub adapter is active. */
  redirectUrl: string | null;
}

const ORDER_NUMBER_ATTEMPTS = 5;

/** Written before the provider is contacted; overwritten once a session exists. */
const PENDING_PROVIDER = "pending";
const CURRENCY = "GBP";

/**
 * Creates an order from a cart, atomically.
 *
 * Everything happens in ONE interactive transaction: decrement stock → create
 * Address/Order/OrderItems/Payment/OrderStatusEvent → clear the cart. Any failure
 * rolls the whole thing back, so a partial order cannot exist.
 *
 * Clearing the cart inside the transaction also gives double-submit protection for
 * free: a second submit finds an empty cart and fails with CART_EMPTY rather than
 * creating a duplicate order.
 */
export async function placeOrder(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  input: PlaceOrderInput,
): Promise<PlacedOrder> {
  if ((input.userId === null) === (input.guestEmail === null)) {
    throw new Error("Order buyer must be exactly one of userId or guestEmail");
  }

  const payments = getPaymentService();

  const created = await prisma.$transaction(async (tx) => {
    // Re-read the cart inside the transaction — never trust what the page rendered.
    const cart = await tx.cart.findFirst({
      where: { id: input.cartId, vendorId },
      select: { id: true, items: { select: { productId: true, quantity: true } } },
    });
    if (!cart || cart.items.length === 0) {
      throw new CheckoutError("CART_EMPTY", "Your cart is empty.");
    }

    // Prices and availability come from the DB at this instant, never from the form.
    const products = await tx.product.findMany({
      where: { vendorId, id: { in: cart.items.map((i) => i.productId) } },
      select: {
        id: true,
        name: true,
        basePrice: true,
        isActive: true,
        inventory: { select: { quantity: true } },
      },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    const lines = cart.items.map((item) => {
      const product = byId.get(item.productId);
      if (!product) {
        throw new CheckoutError("LINE_UNAVAILABLE", "An item in your cart is no longer available.");
      }
      const available = product.isActive && effectiveStock(product.inventory?.quantity) > 0;
      if (!available) {
        throw new CheckoutError(
          "LINE_UNAVAILABLE",
          `${product.name} is no longer available — please remove it to continue.`,
        );
      }
      return {
        productId: product.id,
        productName: product.name,
        unitPricePence: product.basePrice,
        quantity: item.quantity,
        available,
      };
    });

    // Computed BEFORE any discount: both the vendor's minimum and (inside
    // computeTotals) the free-delivery threshold are judged on what the shopper
    // bought, not on what they paid after spending points. Redeeming must not
    // push an otherwise-valid order under the minimum, nor claw back free
    // delivery already earned.
    const preDiscount = computeTotals(lines, input.rules);
    if (preDiscount.subtotalPence < input.rules.minimumOrderPence) {
      throw new CheckoutError("BELOW_MINIMUM", "Your order is below this store's minimum.");
    }

    // The guard that makes overselling impossible: the WHERE and the write are
    // evaluated atomically by Postgres, so two concurrent checkouts for the last
    // item cannot both succeed. count === 0 means someone got there first.
    for (const line of lines) {
      const { count } = await tx.inventory.updateMany({
        where: { vendorId, productId: line.productId, quantity: { gte: line.quantity } },
        data: { quantity: { decrement: line.quantity } },
      });
      if (count === 0) {
        throw new CheckoutError(
          "INSUFFICIENT_STOCK",
          `${line.productName} just sold out — please adjust your cart.`,
        );
      }
    }

    const address = await tx.address.create({
      data: { vendorId, userId: input.userId, ...input.address },
      select: { id: true },
    });

    // The code is claimed FIRST and evaluated against the pre-discount subtotal:
    // a percentage code must not shrink because the shopper also spent points.
    // Like the points debit below, the reservation happens before the Order row
    // exists, so an order can never carry a discount that was not actually
    // reserved. Its record is written after the insert, once there is an orderId.
    const claimed =
      input.discountCode == null || input.discountCode.trim() === ""
        ? null
        : await claimCode(tx, vendorId, {
            code: input.discountCode,
            userId: input.userId,
            subtotalPence: preDiscount.subtotalPence,
            deliveryFeePence: preDiscount.deliveryFeePence,
          });
    if (claimed && !claimed.ok) {
      throw new CheckoutError("DISCOUNT_CODE", refusalMessage(claimed.reason));
    }
    const codeDiscountPence = claimed?.ok ? claimed.claim.discountPence : 0;

    // Points are debited BEFORE the order is written, so an order can never
    // carry a discount whose points the shopper turned out not to have. The
    // matching ledger row is written below, once there is an orderId to attach
    // it to; both are inside this transaction, so they commit or roll back
    // together. See lib/repositories/loyalty.ts for why this is a pair.
    //
    // `existingDiscountPence` is what stops the two mechanisms each claiming the
    // whole subtotal: points fill only the headroom the code left.
    const loyaltyConfig = await getLoyaltyConfig(tx, vendorId);
    const redemption = await spendPoints(tx, vendorId, {
      userId: input.userId,
      requestedPoints: input.redeemPoints ?? 0,
      subtotalPence: preDiscount.subtotalPence,
      deliveryFeePence: preDiscount.deliveryFeePence,
      existingDiscountPence: codeDiscountPence,
      config: loyaltyConfig,
    });

    const totals = computeTotals(lines, input.rules, codeDiscountPence + redemption.discountPence);

    // Retry against the unique index rather than assuming randomness never collides.
    let order: { id: string; orderNumber: string } | null = null;
    for (let attempt = 0; attempt < ORDER_NUMBER_ATTEMPTS; attempt++) {
      const orderNumber = buildOrderNumber(input.vendorSlug, new Date());
      const clash = await tx.order.findUnique({
        where: { orderNumber },
        select: { id: true },
      });
      if (clash) continue;
      order = await tx.order.create({
        data: {
          vendorId,
          orderNumber,
          userId: input.userId,
          guestEmail: input.guestEmail,
          addressId: address.id,
          subtotalPence: totals.subtotalPence,
          discountPence: totals.discountPence,
          deliveryFeePence: totals.deliveryFeePence,
          totalPence: totals.totalPence,
        },
        select: { id: true, orderNumber: true },
      });
      break;
    }
    if (!order) {
      throw new CheckoutError(
        "ORDER_NUMBER_COLLISION",
        "Could not allocate an order number — please try again.",
      );
    }

    // The audit half of the redemption above, now that the order has an id.
    if (redemption.pointsSpent > 0 && input.userId) {
      await recordRedemption(tx, vendorId, {
        userId: input.userId,
        orderId: order.id,
        pointsSpent: redemption.pointsSpent,
      });
    }

    // The record half of the code claim. This is also where the per-customer cap
    // is actually enforced — the unique index refuses a concurrent second claim
    // by the same shopper, rolling this whole transaction back.
    if (claimed?.ok) {
      try {
        await recordCodeRedemption(tx, vendorId, {
          codeId: claimed.claim.codeId,
          orderId: order.id,
          userId: input.userId,
          seq: claimed.claim.seq,
          amountPence: claimed.claim.discountPence,
        });
      } catch (error) {
        if (error instanceof DiscountClaimError) {
          throw new CheckoutError("DISCOUNT_CODE", refusalMessage(error.reason));
        }
        throw error;
      }
    }

    await tx.orderItem.createMany({
      data: lines.map((line) => ({
        orderId: order.id,
        vendorId,
        productId: line.productId,
        productName: line.productName,
        unitPricePence: line.unitPricePence,
        quantity: line.quantity,
        lineTotalPence: line.unitPricePence * line.quantity,
      })),
    });

    // NO external call inside the transaction (P3c R6). An HTTP round-trip to
    // Stripe here would hold a Postgres transaction open on a serverless
    // connection against Prisma's 5s interactive-transaction timeout — a slow
    // provider would roll back a perfectly good order. The provider reference is
    // filled in after commit.
    await tx.payment.create({
      data: {
        orderId: order.id,
        vendorId,
        provider: PENDING_PROVIDER,
        providerReference: null,
        amountPence: totals.totalPence,
      },
    });

    await tx.orderStatusEvent.create({
      data: {
        orderId: order.id,
        vendorId,
        status: "PENDING_PAYMENT",
        note: "Order placed; awaiting payment.",
      },
    });

    // Clearing the cart last, inside the transaction, is what makes a double
    // submit safe (the second finds CART_EMPTY).
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalPence: totals.totalPence,
      currency: CURRENCY,
    };
  });

  // ---- After commit: talk to the payment provider ----------------------------
  // If this fails, the order exists but can never be paid, so it is cancelled and
  // its stock released immediately (P3c R7) rather than silently holding
  // inventory until the (never-created) session would have expired.
  try {
    const intent = await payments.createPayment({
      orderNumber: created.orderNumber,
      amountPence: created.totalPence,
      currency: created.currency,
      vendorId,
      returnOrigin: input.returnOrigin,
    });

    await prisma.payment.update({
      where: { orderId: created.orderId },
      data: { provider: intent.provider, providerReference: intent.providerReference },
    });

    return {
      orderNumber: created.orderNumber,
      totalPence: created.totalPence,
      redirectUrl: intent.redirectUrl,
    };
  } catch (error) {
    await releaseOrder(
      prisma,
      vendorId,
      created.orderId,
      "Payment provider unavailable; order cancelled and stock released.",
    );
    throw new CheckoutError(
      "PAYMENT_PROVIDER_FAILED",
      "We couldn't reach our payment provider. Nothing has been charged — please try again.",
    );
  }
}

/**
 * Cancels an order and returns its stock, idempotently.
 *
 * The status guard (`status: "PENDING_PAYMENT"`) is what makes it safe to call
 * more than once: Stripe retries webhooks aggressively and can deliver out of
 * order, and releasing the same stock twice would silently inflate inventory.
 * `count === 0` means someone already handled it — same technique as the
 * decrement guard above.
 */
async function releaseOrder(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  orderId: string,
  note: string,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { id: orderId, vendorId, status: "PENDING_PAYMENT" },
      data: { status: "CANCELLED" },
    });
    if (count === 0) return false; // already confirmed or already cancelled

    const items = await tx.orderItem.findMany({
      where: { orderId },
      select: { productId: true, quantity: true },
    });
    for (const item of items) {
      await tx.inventory.updateMany({
        where: { vendorId, productId: item.productId },
        data: { quantity: { increment: item.quantity } },
      });
    }

    await tx.payment.updateMany({ where: { orderId }, data: { status: "FAILED" } });
    await tx.orderStatusEvent.create({
      data: { orderId, vendorId, status: "CANCELLED", note },
    });

    // Give back any points this checkout was holding. Only a REDEEM is ever
    // reversed — this path acts solely on PENDING_PAYMENT orders, which is
    // strictly before confirmPayment writes an EARN, so an earned order cannot
    // reach here (P5a, #135).
    await reverseRedemption(tx, vendorId, orderId);

    // And give back any discount-code use it was holding (P5b, #145). Without
    // this, every abandoned checkout permanently burns a use of a limited code.
    await releaseCodeRedemption(tx, vendorId, orderId);

    return true;
  });
}

export interface OrderSummary {
  orderNumber: string;
  status: string;
  createdAt: Date;
  subtotalPence: number;
  /** P5a (#135). Zero for every pre-P5a order and for any order with no discount. */
  discountPence: number;
  deliveryFeePence: number;
  totalPence: number;
  items: {
    productId: string;
    productName: string;
    unitPricePence: number;
    quantity: number;
    lineTotalPence: number;
  }[];
  address: {
    recipientName: string;
    phone: string;
    line1: string;
    line2: string | null;
    city: string;
    postcode: string;
    notes: string | null;
  };
}

/** One row of the account-area order history (P4a, #122). No address, no per-item pricing. */
export interface OrderListItem {
  orderNumber: string;
  status: string;
  createdAt: Date;
  totalPence: number;
  /** Sum of EVERY item's quantity — 2 × milk + 1 × rice is 3, not 2. */
  itemCount: number;
  /** First 3 items by product name ascending — a total order, so it never varies. */
  previewItems: { productName: string; quantity: number }[];
}

export interface OrderListPage {
  items: OrderListItem[];
  nextCursor: string | null;
}

/** An owned order plus its customer-facing timeline (P4a, #122). */
export interface OrderDetail extends OrderSummary {
  timeline: TimelineEntry[];
}

/**
 * One order as STAFF see it (P6a, #158): the same money/items/address as
 * `OrderDetail`, plus the buyer's email and a timeline carrying each event's
 * note and acting user.
 *
 * A distinct type from `OrderDetail`, not a superset flag on it — see
 * `buildStaffTimeline`'s contract. The customer path must stay unable to
 * express a note.
 */
export interface StaffOrderDetail extends OrderSummary {
  buyerEmail: string | null;
  timeline: StaffTimelineEntry[];
}

/** Filter for the staff dashboard's list (P6a, #158). */
export interface StaffOrderFilter {
  /** Statuses to include — from `parseStaffOrdersQuery`, never raw user input. */
  statuses: readonly OrderStatusValue[];
  /** Case-insensitive substring over order number and buyer email; null = no search. */
  search: string | null;
}

const ORDER_PREVIEW_ITEMS = 3;

/**
 * The columns both order lists need. Shared so the customer history (P4a) and
 * the staff queue (P4b) cannot drift into selecting different shapes for the
 * same `OrderListItem` — the extraction P4a did for the items/address cards,
 * applied one layer down.
 */
const ORDER_LIST_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  createdAt: true,
  totalPence: true,
  items: {
    select: { productName: true, quantity: true },
    orderBy: { productName: "asc" },
  },
} as const;

type OrderListRow = {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: Date;
  totalPence: number;
  items: { productName: string; quantity: number }[];
};

/**
 * Turn an over-fetched row set (take + 1) into a page plus its next cursor,
 * without a separate count query.
 */
function toOrderListPage(rows: OrderListRow[], take: number): OrderListPage {
  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;

  return {
    items: page.map((order) => ({
      orderNumber: order.orderNumber,
      status: order.status,
      createdAt: order.createdAt,
      totalPence: order.totalPence,
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      previewItems: order.items.slice(0, ORDER_PREVIEW_ITEMS),
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

/**
 * The staff dashboard's `where` (P6a, #158) — status filter AND search.
 *
 * `vendorId` leads, so the existing @@index([vendorId, status, createdAt]) from
 * P3b still serves the list. The search is a deliberate unindexed scan across
 * this vendor's rows: order number, guest email, and the member's email through
 * the relation. A trigram index would need `pg_trgm` and `$queryRaw`, which
 * CLAUDE.md forbids in application code — the same wall P2's product search and
 * P3d's list matching hit, resolved the same way (ship the honest version; let
 * real volume justify the index work). Tracked for when it matters.
 */
function staffOrderWhere(vendorId: string, filter: StaffOrderFilter) {
  const search = filter.search;
  return {
    vendorId,
    status: { in: [...filter.statuses] },
    ...(search
      ? {
          OR: [
            { orderNumber: { contains: search, mode: "insensitive" as const } },
            { guestEmail: { contains: search, mode: "insensitive" as const } },
            { user: { email: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
}

export interface OrderRepository {
  createOrder(input: PlaceOrderInput): Promise<PlacedOrder>;
  /** Scoped to the current vendor, so one vendor's number never resolves on another's host. */
  getByOrderNumber(orderNumber: string, viewerUserId: string | null): Promise<OrderSummary | null>;
  /** The signed-in shopper's own orders for this vendor, newest first (P4a). */
  listForUser(userId: string, opts: { take: number; cursor?: string }): Promise<OrderListPage>;
  /**
   * One order the viewer OWNS. Stricter than getByOrderNumber on purpose: that
   * method implements P3b's capability-URL rule (a guest order has no owner, so
   * the unguessable number is the credential), which is right for
   * /checkout/{n} and wrong for /account/orders/{n} — a page claiming to be
   * *your* history must not render an order that is not yours because someone
   * pasted a number. Filtering on userId makes a guest order and another
   * member's order both resolve to null.
   */
  getForUser(orderNumber: string, userId: string): Promise<OrderDetail | null>;
  /**
   * This vendor's orders matching `filter`, newest first (P4b; filter/search
   * added in P6a). Same keyset shape as listForUser — never OFFSET — because a
   * worklist that silently stops at row N hides the order nobody packs.
   */
  listForStaff(opts: {
    take: number;
    cursor?: string;
    filter: StaffOrderFilter;
  }): Promise<OrderListPage>;
  /** How many orders are awaiting staff action — the /staff landing figure (P6a). */
  countForStaff(): Promise<number>;
  /**
   * One order for this vendor's staff (P6a, #158). A THIRD read beside
   * getByOrderNumber and getForUser, and deliberately neither of their rules:
   * scoped by `vendorId` and NOT by owner, because staff authority comes from
   * requireVendorRole plus the vendor in the WHERE — so a guest order (no owner
   * at all) and another member's order are both legitimately visible to the
   * staff of the vendor that must pack them.
   */
  getForStaff(orderNumber: string): Promise<StaffOrderDetail | null>;
  /**
   * Request-scoped wrapper over `advanceOrderStatus` (P4b), resolving prisma and
   * the current vendor here so the feature layer never touches lib/db — the
   * same two-layer shape `createOrder`/`placeOrder` already uses, and what the
   * no-direct-Prisma guard (ADR-004 slice 2) requires.
   */
  advance(orderNumber: string, toStatus: string, actor: StatusActor): Promise<AdvanceResult>;
  /** High-level financial reporting (P6.6c). */
  getFinancialsForStaff(): Promise<{ totalRevenuePence: number; totalOrders: number }>;
}

export function getOrderRepository(): OrderRepository {
  const prisma = getPrisma();
  let vendorIdPromise: Promise<string> | undefined;
  const vendorId = () => (vendorIdPromise ??= getCurrentVendorId());

  return {
    async createOrder(input) {
      return placeOrder(getPrismaWs(), await vendorId(), input);
    },

    async getByOrderNumber(orderNumber, viewerUserId) {
      const order = await prisma.order.findFirst({
        where: { orderNumber, vendorId: await vendorId() },
        select: {
          orderNumber: true,
          status: true,
          createdAt: true,
          subtotalPence: true,
          discountPence: true,
          deliveryFeePence: true,
          totalPence: true,
          userId: true,
          items: {
            select: {
              productId: true,
              productName: true,
              unitPricePence: true,
              quantity: true,
              lineTotalPence: true,
            },
          },
          address: {
            select: {
              recipientName: true,
              phone: true,
              line1: true,
              line2: true,
              city: true,
              postcode: true,
              notes: true,
            },
          },
        },
      });
      if (!order) return null;

      // A member's order is theirs alone. A guest order has no owner, so the
      // (random) order number is the only credential — see the spec's R19a.
      if (order.userId && order.userId !== viewerUserId) return null;

      const { userId: _ownerId, ...summary } = order;
      return summary;
    },

    async listForUser(userId, { take, cursor }) {
      // Keyset (cursor) pagination on (createdAt, id) — never OFFSET, per
      // specs/architecture.md's pagination strategy and matching
      // ProductRepository.findPage. Over-fetch by one to know whether a next
      // page exists without a separate count query.
      //
      // ONE query for the page: items arrive via a nested select, so ten orders
      // are ten rows of one result, not eleven round trips.
      //
      // Deliberately NOT filtered by status. An abandoned PENDING_PAYMENT order
      // and a CANCELLED one are both visible history — hiding them would leave a
      // shopper wondering where their attempted order went.
      const rows = await prisma.order.findMany({
        where: { vendorId: await vendorId(), userId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: take + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: ORDER_LIST_SELECT,
      });

      return toOrderListPage(rows, take);
    },

    async getForUser(orderNumber, userId) {
      const order = await prisma.order.findFirst({
        // userId is part of the WHERE, not a post-hoc check: a guest order
        // (userId null) and another member's order both simply do not match.
        where: { orderNumber, vendorId: await vendorId(), userId },
        select: {
          orderNumber: true,
          status: true,
          createdAt: true,
          subtotalPence: true,
          discountPence: true,
          deliveryFeePence: true,
          totalPence: true,
          items: {
            select: {
              productId: true,
              productName: true,
              unitPricePence: true,
              quantity: true,
              lineTotalPence: true,
            },
          },
          address: {
            select: {
              recipientName: true,
              phone: true,
              line1: true,
              line2: true,
              city: true,
              postcode: true,
              notes: true,
            },
          },
          // `note` is deliberately NOT selected — see buildTimeline's contract.
          statusEvents: { select: { status: true, createdAt: true } },
        },
      });
      if (!order) return null;

      const { statusEvents, ...summary } = order;
      return { ...summary, timeline: buildTimeline(statusEvents) };
    },

    async listForStaff({ take, cursor, filter }) {
      // Same keyset shape as listForUser, but scoped by status instead of by
      // owner — and served by Order's existing @@index([vendorId, status,
      // createdAt]) from P3b, so no index work was needed for this slice.
      const rows = await prisma.order.findMany({
        where: staffOrderWhere(await vendorId(), filter),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: take + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: ORDER_LIST_SELECT,
      });

      return toOrderListPage(rows, take);
    },

    async countForStaff() {
      return prisma.order.count({
        where: { vendorId: await vendorId(), status: { in: [...STAFF_QUEUE_STATUSES] } },
      });
    },

    async getForStaff(orderNumber) {
      const order = await prisma.order.findFirst({
        // vendorId only. No userId — see the interface note: a guest order has
        // no owner and still has to be packed by this vendor's staff.
        where: { orderNumber, vendorId: await vendorId() },
        select: {
          orderNumber: true,
          status: true,
          createdAt: true,
          subtotalPence: true,
          discountPence: true,
          deliveryFeePence: true,
          totalPence: true,
          guestEmail: true,
          user: { select: { email: true } },
          items: {
            select: {
              productId: true,
              productName: true,
              unitPricePence: true,
              quantity: true,
              lineTotalPence: true,
            },
          },
          address: {
            select: {
              recipientName: true,
              phone: true,
              line1: true,
              line2: true,
              city: true,
              postcode: true,
              notes: true,
            },
          },
          // `note` and the actor ARE selected here — the inverse of getForUser,
          // and the whole point of the staff view. P4b has been writing
          // createdByUserId since #125 with nothing able to read it.
          statusEvents: {
            select: {
              status: true,
              createdAt: true,
              note: true,
              createdBy: { select: { name: true } },
            },
          },
        },
      });
      if (!order) return null;

      const { statusEvents, guestEmail, user, ...summary } = order;
      return {
        ...summary,
        buyerEmail: guestEmail ?? user?.email ?? null,
        timeline: buildStaffTimeline(
          statusEvents.map((event) => ({
            status: event.status,
            createdAt: event.createdAt,
            note: event.note,
            actorName: event.createdBy?.name ?? null,
          })),
        ),
      };
    },

    async advance(orderNumber, toStatus, actor) {
      return advanceOrderStatus(getPrismaWs(), await vendorId(), orderNumber, toStatus, actor);
    },

    async getFinancialsForStaff() {
      const vId = await vendorId();

      const aggregate = await prisma.order.aggregate({
        where: { vendorId: vId },
        _sum: { totalPence: true },
        _count: { id: true },
      });

      return {
        totalRevenuePence: aggregate._sum.totalPence ?? 0,
        totalOrders: aggregate._count.id,
      };
    },
  };
}

// ---- Staff transitions (P4b, #125) ----------------------------------------

/** Who moved the order. Only the id is persisted; the rest is for logging. */
export interface StatusActor {
  userId: string;
}

export type AdvanceResult =
  { ok: true; order: WebhookOrder } | { ok: false; reason: "not-found" | "illegal-transition" };

/** System-written, per target status. P4b ships no staff free-text note field. */
const TRANSITION_NOTES: Record<string, string> = {
  OUT_FOR_DELIVERY: "Marked out for delivery by staff.",
  DELIVERED: "Marked delivered by staff.",
};

/**
 * Advance one order along the staff ladder, atomically and attributably.
 *
 * Takes `prisma` and `vendorId` as EXPLICIT arguments for the same reason
 * `placeOrder` does: the concurrency guarantee below is this slice's most
 * important property, and a function that resolves its dependencies from
 * request context cannot be exercised from a plain script to prove it. Both
 * `placeOrder` and `getWebhookOrderService()` had to be refactored into this
 * shape at validation time — this one starts there.
 *
 * Two properties are structural rather than checked-and-hoped:
 *
 *  - Legality is evaluated against the PERSISTED status, never a caller-supplied
 *    "from", and the write is a conditional updateMany whose `where` repeats that
 *    status. A second submit (double click, stale tab, two staff at once) that
 *    lands after the first commit matches zero rows and returns
 *    illegal-transition having written nothing. Same compare-and-set P3b used
 *    for the stock decrement, applied to a different race.
 *  - `vendorId` is in the WHERE, not a post-hoc comparison, so another vendor's
 *    order number is indistinguishable from one that does not exist.
 *
 * Returned as data, never thrown, matching lib/auth-rbac.ts's posture. The email
 * is the CALLER's job and happens after this commits — an HTTP call inside a
 * Prisma transaction holds a Postgres transaction open against a 5s timeout,
 * which is exactly the defect P3c had to fix in `createPayment`.
 */
export async function advanceOrderStatus(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  orderNumber: string,
  toStatus: string,
  actor: StatusActor,
): Promise<AdvanceResult> {
  const existing = await prisma.order.findFirst({
    where: { orderNumber, vendorId },
    select: { id: true, status: true },
  });
  if (!existing) return { ok: false, reason: "not-found" };

  // isOrderStatus first, so a forged value ("BANANA") is rejected identically to
  // a merely illegal one — and narrows `toStatus` for the writes below.
  if (!isOrderStatus(toStatus) || !canTransition(existing.status, toStatus)) {
    return { ok: false, reason: "illegal-transition" };
  }

  const moved = await prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      // `status` in the WHERE is the compare-and-set: if anything moved this
      // order between the read above and here, this matches nothing.
      where: { id: existing.id, vendorId, status: existing.status },
      data: { status: toStatus },
    });
    if (count === 0) return false;

    await tx.orderStatusEvent.create({
      data: {
        orderId: existing.id,
        vendorId,
        status: toStatus,
        note: TRANSITION_NOTES[toStatus] ?? null,
        createdByUserId: actor.userId,
      },
    });
    return true;
  });

  if (!moved) return { ok: false, reason: "illegal-transition" };

  // Re-read AFTER the commit, for the caller's email. findOrderForWebhook
  // already resolves buyerEmail (guestEmail ?? user.email) and carries the
  // items and money — no parallel type for the same payload.
  const order = await findOrderForWebhook(prisma, orderNumber);
  if (!order) return { ok: false, reason: "not-found" };
  return { ok: true, order };
}

// ---- Webhook-facing transitions (P3c, #99) ---------------------------------
//
// These are deliberately NOT on the request-scoped OrderRepository: a payment
// webhook arrives from Stripe with no tenant context, so it cannot resolve a
// vendor from the request host. It looks the order up by its unique, unguessable
// order number and derives vendorId from the row. This is the single justified
// un-scoped read in the codebase, and it is confined to this file so the
// no-direct-Prisma guard still keeps app/ and features/ out of Prisma.

export interface WebhookOrder {
  id: string;
  vendorId: string;
  orderNumber: string;
  status: string;
  totalPence: number;
  subtotalPence: number;
  discountPence: number;
  deliveryFeePence: number;
  buyerEmail: string | null;
  /** Null for a guest order — P5a needs it to decide whether points can be earned. */
  userId: string | null;
  items: {
    productName: string;
    unitPricePence: number;
    quantity: number;
    lineTotalPence: number;
  }[];
}

/**
 * Un-scoped by design — see the note above. Null when no such order exists.
 *
 * Takes `prisma` explicitly, matching `placeOrder`'s R9a pattern: the webhook
 * route resolves it once and passes it through, which is also what lets this be
 * driven from a plain script in tests/validation rather than only through a
 * live Workers request.
 */
export async function findOrderForWebhook(
  prisma: ReturnType<typeof getPrisma>,
  orderNumber: string,
): Promise<WebhookOrder | null> {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    select: {
      id: true,
      vendorId: true,
      orderNumber: true,
      status: true,
      totalPence: true,
      subtotalPence: true,
      discountPence: true,
      deliveryFeePence: true,
      guestEmail: true,
      userId: true,
      user: { select: { email: true } },
      items: {
        select: {
          productName: true,
          unitPricePence: true,
          quantity: true,
          lineTotalPence: true,
        },
      },
    },
  });
  if (!order) return null;

  const { guestEmail, user, ...rest } = order;
  return { ...rest, buyerEmail: guestEmail ?? user?.email ?? null };
}

/**
 * PENDING_PAYMENT → CONFIRMED, idempotently.
 *
 * Returns true only when THIS call performed the transition — the caller uses
 * that to decide whether to send the confirmation email, so a duplicate webhook
 * delivery (Stripe retries aggressively) can't email the shopper twice.
 */
export async function confirmPayment(
  prisma: ReturnType<typeof getPrisma>,
  orderNumber: string,
): Promise<boolean> {
  const order = await findOrderForWebhook(prisma, orderNumber);
  if (!order) return false;

  // Tier depends on a windowed spend query, so it is resolved before the
  // transaction opens rather than holding one open across extra reads. The
  // multiplier it produces is snapshotted onto the EARN row, which is what keeps
  // a historical earn explainable after the tier table changes underneath it.
  const loyaltyConfig = await getLoyaltyConfig(prisma, order.vendorId);
  const tiers =
    loyaltyConfig.loyaltyEnabled && order.userId ? await getTiers(prisma, order.vendorId) : [];
  const windowSpend =
    loyaltyConfig.loyaltyEnabled && order.userId
      ? await windowSpendPence(prisma, order.vendorId, order.userId, loyaltyConfig.tierWindowDays)
      : 0;

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { id: order.id, status: "PENDING_PAYMENT" },
      data: { status: "CONFIRMED" },
    });
    if (count === 0) return false; // already processed

    await tx.payment.updateMany({
      where: { orderId: order.id },
      data: { status: "SUCCEEDED" },
    });
    await tx.orderStatusEvent.create({
      data: {
        orderId: order.id,
        vendorId: order.vendorId,
        status: "CONFIRMED",
        note: "Payment confirmed.",
      },
    });

    // Points are credited here, not at order creation: the money is only real
    // once Stripe confirms it. Inside this transaction, so points and CONFIRMED
    // commit together — and behind the count===0 guard above, so a duplicate
    // webhook delivery never reaches it. The unique index on (orderId, kind) is
    // the second line of defence (P5a, #135).
    await earnPoints(tx, order.vendorId, {
      userId: order.userId,
      orderId: order.id,
      subtotalPence: order.subtotalPence,
      discountPence: order.discountPence,
      config: loyaltyConfig,
      tiers,
      windowSpendPence: windowSpend,
    });

    return true;
  });
}

/**
 * PENDING_PAYMENT → CANCELLED with stock released, idempotently.
 *
 * This is the gap P3b explicitly left open: until now an abandoned checkout held
 * its stock forever.
 */
export async function failPayment(
  prisma: ReturnType<typeof getPrisma>,
  orderNumber: string,
  reason: string,
): Promise<boolean> {
  const order = await findOrderForWebhook(prisma, orderNumber);
  if (!order) return false;
  return releaseOrder(prisma, order.vendorId, order.id, reason);
}

/**
 * Webhook-facing factory, matching `getOrderRepository()`'s shape: resolves its
 * own client internally, so `app/api/webhooks/stripe/route.ts` never imports
 * `@/lib/db` itself (the no-direct-Prisma guard covers `app/`, `features/` and
 * `components/` — there is no webhook-specific carve-out, unlike `/api/health`'s
 * narrow infra-probe exception). The underlying `findOrderForWebhook` /
 * `confirmPayment` / `failPayment` still take `prisma` explicitly, so they stay
 * testable from a plain script against a real database.
 */
export function getWebhookOrderService() {
  const prisma = getPrismaWs();
  return {
    findOrder: (orderNumber: string) => findOrderForWebhook(prisma, orderNumber),
    confirm: (orderNumber: string) => confirmPayment(prisma, orderNumber),
    fail: (orderNumber: string, reason: string) => failPayment(prisma, orderNumber, reason),
  };
}
