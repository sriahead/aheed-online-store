import { getPrisma, getPrismaWs } from "@/lib/db";
import { buildOrderNumber, computeTotals, type DeliveryRules } from "@/lib/order-totals";
import { getPaymentService } from "@/lib/payments";
import { effectiveStock } from "@/lib/cart-rules";
import {
  buildStaffTimeline,
  buildTimeline,
  canTransition,
  isOrderStatus,
  REVENUE_STATUSES,
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
import { tieredLineTotalPence } from "@/lib/tier-pricing";
import { listActiveTiersForProducts } from "@/lib/repositories/product-tiers";

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
  /**
   * P9.1 (#427/#428) — the order's capability token, returned so the caller can
   * build the shopper's own confirmation URL when `redirectUrl` is null (the
   * stub adapter: local preview, CI, and any environment with no
   * STRIPE_SECRET_KEY). Without it that fallback hands the shopper a URL the
   * authorization rule immediately refuses.
   *
   * This is the ONLY type that carries the token back into application code, and
   * it is deliberately not `OrderSummary` — every order page renders from that
   * one. `features/checkout/place-order.ts` reads two fields off this object and
   * never renders it.
   */
  confirmationToken: string;
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

    // P8.5d (#348) — multi-buy tiers, read inside the transaction for the same
    // reason prices are: never trust what the page rendered. The SAME
    // `lib/tier-pricing.ts` function prices the cart display
    // (`lib/repositories/cart.ts`), and those are independent code paths — if
    // they ever diverge the shopper sees one total and is charged another.
    const tiers = await listActiveTiersForProducts(
      tx,
      vendorId,
      products.map((p) => p.id),
    );

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
        // Explicit because a tiered line is not unitPrice × quantity. When no
        // tier applies this is exactly that product, so nothing changes.
        lineTotalPence: tieredLineTotalPence(
          product.basePrice,
          item.quantity,
          tiers.get(product.id) ?? null,
        ),
      };
    });

    // Computed BEFORE any discount: both the vendor's minimum and (inside
    // computeTotals) the free-delivery threshold are judged on what the shopper
    // bought, not on what they paid after spending points. Redeeming must not
    // push an otherwise-valid order under the minimum, nor claw back free
    // delivery already earned.
    //
    // A MULTI-BUY TIER IS ON THE OTHER SIDE OF THAT LINE, deliberately (P8.5d,
    // #348). A tier is not a deduction from what the shopper bought — it IS the
    // price they bought it at — so it is already inside `preDiscount` here, and
    // both the vendor minimum and the free-delivery threshold are judged on the
    // tier-reduced figure. A shopper whose multi-buy drops them under the
    // minimum is genuinely under it. Codes and points behave the opposite way
    // and that asymmetry is intended, not an oversight.
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
    let order: { id: string; orderNumber: string; confirmationToken: string | null } | null = null;
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
          // P9.1 (#427/#428) — minted here, in the same write as the order
          // number, so no order can ever exist without one. 122 bits of
          // randomness from the same source lib/cart-identity.ts already uses.
          confirmationToken: crypto.randomUUID(),
          userId: input.userId,
          guestEmail: input.guestEmail,
          addressId: address.id,
          subtotalPence: totals.subtotalPence,
          discountPence: totals.discountPence,
          deliveryFeePence: totals.deliveryFeePence,
          totalPence: totals.totalPence,
        },
        select: { id: true, orderNumber: true, confirmationToken: true },
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
        // P8.5d (#348): the tiered total, NOT unitPricePence × quantity.
        // `unitPricePence` stays the product's base unit price, so the two
        // columns together record both what the product listed at and what this
        // line actually charged — which is what makes the multi-buy auditable
        // without a DiscountRedemption row.
        lineTotalPence: line.lineTotalPence,
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
      // Non-null by construction: the create above always supplies it. The
      // column is nullable only for orders that predate the P9.1 migration.
      confirmationToken: order.confirmationToken ?? "",
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
      confirmationToken: created.confirmationToken,
    });

    await prisma.payment.update({
      where: { orderId: created.orderId },
      data: { provider: intent.provider, providerReference: intent.providerReference },
    });

    return {
      orderNumber: created.orderNumber,
      totalPence: created.totalPence,
      redirectUrl: intent.redirectUrl,
      confirmationToken: created.confirmationToken,
    };
  } catch (error) {
    const cancelled = await releaseOrder(
      prisma,
      vendorId,
      created.orderId,
      "Payment provider unavailable; order cancelled and stock released.",
    );
    // The message below tells the shopper to try again, so the basket they were
    // about to buy has to still exist (P7.5a, #234). The transaction above
    // cleared it, and everything else that transaction did has just been undone
    // by releaseOrder — the cart was the one piece of the compensation missing.
    //
    // Guarded on releaseOrder actually having cancelled: `false` means the order
    // was already CONFIRMED or already CANCELLED by someone else. Refilling the
    // cart for an order that turned out to be PAID would hand the shopper a
    // duplicate basket, which is a worse failure than the empty one this fixes.
    if (cancelled) {
      await restoreCartFromOrder(prisma, vendorId, created.orderId, input.cartId);
    }
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
 *
 * `binding` (P9.1, #429) is supplied only by the webhook path, where the request
 * to cancel arrives from outside and has to prove which payment it is about; it
 * is added to the same guarded `where`, so an unbound event matches no row and
 * changes nothing. `placeOrder`'s own failure path passes nothing and is
 * unchanged by this slice: it already holds the order id from the transaction it
 * just committed, so there is no external claim to verify.
 */
async function releaseOrder(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  orderId: string,
  note: string,
  binding?: { provider: string; providerReference: string },
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: {
        id: orderId,
        vendorId,
        status: "PENDING_PAYMENT",
        ...(binding
          ? {
              payment: {
                is: { provider: binding.provider, providerReference: binding.providerReference },
              },
            }
          : {}),
      },
      data: { status: "CANCELLED" },
    });
    if (count === 0) return false; // already handled, or the binding refused it

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

/**
 * Puts an order's lines back into the cart they came from (P7.5a, #234).
 *
 * `placeOrder` clears the cart INSIDE the order-creating transaction, and that
 * placement is load-bearing — it is what makes a double submit safe, because the
 * second attempt finds CART_EMPTY. So the cart cannot simply be cleared later;
 * it has to be put back when the order it paid for is cancelled seconds after
 * being created.
 *
 * Deliberately NOT called from `releaseOrder`, even though the rest of the
 * compensation (stock, points, discount-code use) lives there. `releaseOrder` is
 * shared with the Stripe webhook, which cancels orders whose Checkout session
 * EXPIRED — typically hours later, with the shopper long gone and quite possibly
 * a new basket already built. Restoring a cart there would resurrect a stale
 * basket rather than repair anything. Only `placeOrder`'s synchronous failure
 * has a shopper waiting on the response, and only it knows which cart to refill.
 *
 * `skipDuplicates` rather than an upsert: `CartItem` is unique on
 * `[cartId, productId]`, and if a row for that product somehow already exists,
 * the shopper's own newer quantity is the one to keep, not the one this order
 * captured.
 */
async function restoreCartFromOrder(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  orderId: string,
  cartId: string,
): Promise<void> {
  const items = await prisma.orderItem.findMany({
    where: { orderId },
    select: { productId: true, quantity: true },
  });
  if (items.length === 0) return;

  await prisma.cartItem.createMany({
    data: items.map((item) => ({
      cartId,
      vendorId,
      productId: item.productId,
      quantity: item.quantity,
    })),
    skipDuplicates: true,
  });
}

/**
 * The two relations an order's money provenance is read from (P7.5b, #150/#138).
 *
 * One constant shared by every read that returns an `OrderSummary`, rather than
 * the same two clauses copied into each: `getByOrderNumber`, `getForUser` and
 * `getForStaff` all build their own select literal, and a field added to three
 * of four places is exactly the defect this slice exists to remove.
 *
 * `discountUse` is `@@unique([orderId])` and `loyaltyEntries` is
 * `@@unique([orderId, kind])`, so both yield at most one row per order.
 */
const ORDER_PROVENANCE_SELECT = {
  discountUse: { select: { amountPence: true, code: { select: { code: true } } } },
  loyaltyEntries: { where: { kind: "EARN" as const }, select: { points: true } },
} as const;

/**
 * Shape the two provenance relations into the fields `OrderSummary` declares.
 *
 * Exported for the same reason `placeOrder` takes its client explicitly: the
 * three reads that use it resolve Prisma and the vendor from request context, so
 * this mapping could not otherwise be proven from a plain test. Pure — explicit
 * argument in, plain object out, no request context read.
 */
export function toProvenance(row: {
  discountUse: { amountPence: number; code: { code: string } } | null;
  loyaltyEntries: { points: number }[];
}): Pick<OrderSummary, "discountCode" | "pointsEarned"> {
  return {
    discountCode: row.discountUse
      ? { code: row.discountUse.code.code, amountPence: row.discountUse.amountPence }
      : null,
    // Absent row → null, never 0. See the field's own note.
    pointsEarned: row.loyaltyEntries[0]?.points ?? null,
  };
}

export interface OrderSummary {
  orderNumber: string;
  status: string;
  createdAt: Date;
  subtotalPence: number;
  /** P5a (#135). Zero for every pre-P5a order and for any order with no discount. */
  discountPence: number;
  /**
   * P7.5b (#150) — the code applied to this order, or null if none was. Since
   * `discountPence` can combine a code AND a loyalty redemption, `amountPence`
   * is the code's own share of it; pass both to `splitDiscount` rather than
   * assuming the code accounts for the whole figure.
   */
  discountCode: { code: string; amountPence: number } | null;
  /**
   * P7.5b (#138) — points this order earned, from its EARN ledger row.
   *
   * `null` means NO EARN ROW EXISTS — the order has not been paid for yet, or it
   * belongs to a guest, who earns nothing. Deliberately not `0`: "we have not
   * awarded points" and "we awarded zero points" are different claims, and only
   * the second one may be rendered as a figure.
   */
  pointsEarned: number | null;
  /**
   * P7.5b (#138) — does this order belong to a registered account?
   *
   * Derived from `userId`, which this type deliberately does NOT expose — along
   * with `confirmationToken`, the credential that actually authorizes a guest
   * order since P9.1 (#427). The boolean is needed because "will this order ever
   * earn points?" cannot be answered from the viewer's session: a signed-in
   * shopper can legitimately hold a guest order's token (they may have created
   * an account after checking out as a guest), and telling them points are
   * coming would promise what a guest order never delivers.
   */
  hasAccount: boolean;
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
  /**
   * Scoped to the current vendor, so one vendor's number never resolves on
   * another's host. `confirmationToken` is the guest credential (P9.1, #427);
   * pass the request's `t` search parameter, or null when there is none.
   */
  getByOrderNumber(
    orderNumber: string,
    viewerUserId: string | null,
    confirmationToken: string | null,
  ): Promise<OrderSummary | null>;
  /** The signed-in shopper's own orders for this vendor, newest first (P4a). */
  listForUser(userId: string, opts: { take: number; cursor?: string }): Promise<OrderListPage>;
  /**
   * One order the viewer OWNS. Stricter than getByOrderNumber on purpose: that
   * method also admits a guest order presented with its capability token (P9.1,
   * #427), which is right for /checkout/{n} and wrong for /account/orders/{n} —
   * a page claiming to be *your* history must not render an order that is not
   * yours because someone pasted a link. Filtering on userId makes a guest order
   * and another member's order both resolve to null.
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
  /**
   * Same compare-and-set as `advance`, for a whole selection at once (P7a fix,
   * #162): every order's read-check-write runs inside ONE `$transaction`, so a
   * bulk submit is atomic as a batch rather than N independent round trips. An
   * individual order that's illegal (already moved under the staff member's feet)
   * is reported per-order, not failed as a whole batch — the same "matches zero
   * rows, not an error" posture `advance` already takes with a single order.
   */
  advanceBulk(
    items: { orderNumber: string; toStatus: string }[],
    actor: StatusActor,
  ): Promise<AdvanceBulkResult>;
  /** High-level financial reporting (P6.6c). */
  getFinancialsForStaff(): Promise<{ totalRevenuePence: number; totalOrders: number }>;
}

/**
 * Order reads (#252). Every one takes `prisma` and `vendorId` as explicit
 * arguments and reads no request context — the request-scoped facade that
 * resolves both lives in `lib/orders-service.ts`, beside the webhook and
 * guest-lookup services that used to sit here too.
 */
export async function findOrderForViewer(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  orderNumber: string,
  viewerUserId: string | null,
  confirmationToken: string | null,
) {
  const order = await prisma.order.findFirst({
    where: { orderNumber, vendorId },
    select: {
      orderNumber: true,
      confirmationToken: true,
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
      ...ORDER_PROVENANCE_SELECT,
    },
  });
  if (!order) return null;

  // A member's order is theirs alone — the token is irrelevant to it, so a
  // non-owner holding a valid token is still refused.
  if (order.userId) {
    if (order.userId !== viewerUserId) return null;
  } else {
    // P9.1 (#427). A guest order has no owner, so it is authorized by its
    // capability token and nothing else. The order number is NOT a credential:
    // it travels through emails, shared links and support threads.
    //
    // Both null checks are load-bearing. An order placed before the P9.1
    // migration has a null stored token, and `null === null` would otherwise
    // hand every pre-migration guest order to a caller passing no token at all
    // — exactly the hole this closes. Those orders are reachable through
    // /orders/lookup instead, which proves order number + email.
    //
    // Plain equality, deliberately: see plan.md's "On not claiming constant-time
    // comparison". The right fix, if ever needed, moves this into the `where`
    // clause so Postgres does it — not a hand-rolled JS loop claiming a
    // property the JIT makes unprovable.
    if (!confirmationToken) return null;
    if (!order.confirmationToken) return null;
    if (order.confirmationToken !== confirmationToken) return null;
  }

  // `confirmationToken` is pulled out here for the same reason `userId` is: it
  // is a credential, and OrderSummary is what every order page renders from.
  const {
    userId: ownerId,
    confirmationToken: _token,
    discountUse,
    loyaltyEntries,
    ...summary
  } = order;
  return {
    ...summary,
    ...toProvenance({ discountUse, loyaltyEntries }),
    hasAccount: ownerId !== null,
  };
}

export async function listOrdersForUser(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  userId: string,
  { take, cursor }: { take: number; cursor?: string },
) {
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
    where: { vendorId, userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: ORDER_LIST_SELECT,
  });

  return toOrderListPage(rows, take);
}

export async function findOrderForUser(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  orderNumber: string,
  userId: string,
) {
  const order = await prisma.order.findFirst({
    // userId is part of the WHERE, not a post-hoc check: a guest order
    // (userId null) and another member's order both simply do not match.
    where: { orderNumber, vendorId, userId },
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
      ...ORDER_PROVENANCE_SELECT,
    },
  });
  if (!order) return null;

  const { statusEvents, discountUse, loyaltyEntries, ...summary } = order;
  return {
    ...summary,
    ...toProvenance({ discountUse, loyaltyEntries }),
    // `userId` is in this method's WHERE, so a row here is always a member's.
    hasAccount: true,
    timeline: buildTimeline(statusEvents),
  };
}

export async function listOrdersForStaff(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  { take, cursor, filter }: { take: number; cursor?: string; filter: StaffOrderFilter },
) {
  // Same keyset shape as listForUser, but scoped by status instead of by
  // owner — and served by Order's existing @@index([vendorId, status,
  // createdAt]) from P3b, so no index work was needed for this slice.
  const rows = await prisma.order.findMany({
    where: staffOrderWhere(vendorId, filter),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: ORDER_LIST_SELECT,
  });

  return toOrderListPage(rows, take);
}

export async function countOrdersForStaff(prisma: ReturnType<typeof getPrisma>, vendorId: string) {
  return prisma.order.count({
    where: { vendorId, status: { in: [...STAFF_QUEUE_STATUSES] } },
  });
}

export async function findOrderForStaff(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  orderNumber: string,
) {
  const order = await prisma.order.findFirst({
    // vendorId only. No userId — see the interface note: a guest order has
    // no owner and still has to be packed by this vendor's staff.
    where: { orderNumber, vendorId },
    select: {
      orderNumber: true,
      status: true,
      createdAt: true,
      subtotalPence: true,
      discountPence: true,
      deliveryFeePence: true,
      totalPence: true,
      guestEmail: true,
      userId: true,
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
      ...ORDER_PROVENANCE_SELECT,
    },
  });
  if (!order) return null;

  const { statusEvents, guestEmail, user, userId, discountUse, loyaltyEntries, ...summary } = order;
  return {
    ...summary,
    ...toProvenance({ discountUse, loyaltyEntries }),
    hasAccount: userId !== null,
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
}

export async function getFinancialsForStaff(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
): Promise<{ totalRevenuePence: number; totalOrders: number }> {
  // Only orders that were actually paid for. Without the status filter this
  // counted abandoned checkouts and cancelled orders as revenue (P7.5a,
  // #238) — 39% overstated on staging.
  const aggregate = await prisma.order.aggregate({
    where: { vendorId, status: { in: [...REVENUE_STATUSES] } },
    _sum: { totalPence: true },
    _count: { id: true },
  });

  return {
    totalRevenuePence: aggregate._sum.totalPence ?? 0,
    totalOrders: aggregate._count.id,
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

export type AdvanceBulkResult = {
  moved: { order: WebhookOrder; toStatus: string }[];
  skipped: { orderNumber: string; reason: "not-found" | "illegal-transition" }[];
};

/**
 * The bulk sibling of `advanceOrderStatus` (P7a fix, #162): staff select a set
 * of rows on `/staff/orders` and advance each to ITS OWN next rung in one
 * submit — the queue mixes orders at different stages, so there is no single
 * shared `toStatus`, unlike a single-row form.
 *
 * All reads and writes run inside ONE `$transaction`, satisfying "moves
 * multiple orders simultaneously in one transaction" literally, not just as a
 * loop of independent calls. Legality is still evaluated per order against its
 * OWN persisted status — a stale or forged pairing for one row skips only that
 * row (same "compare-and-set, not an error" posture as the single-order path)
 * rather than aborting every other row's legitimate transition.
 */
export async function advanceOrderStatusBulk(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  items: { orderNumber: string; toStatus: string }[],
  actor: StatusActor,
): Promise<AdvanceBulkResult> {
  const movedNumbers: { orderNumber: string; toStatus: string }[] = [];
  const skipped: AdvanceBulkResult["skipped"] = [];

  await prisma.$transaction(async (tx) => {
    for (const { orderNumber, toStatus } of items) {
      const existing = await tx.order.findFirst({
        where: { orderNumber, vendorId },
        select: { id: true, status: true },
      });
      if (!existing) {
        skipped.push({ orderNumber, reason: "not-found" });
        continue;
      }

      if (!isOrderStatus(toStatus) || !canTransition(existing.status, toStatus)) {
        skipped.push({ orderNumber, reason: "illegal-transition" });
        continue;
      }

      const { count } = await tx.order.updateMany({
        where: { id: existing.id, vendorId, status: existing.status },
        data: { status: toStatus },
      });
      if (count === 0) {
        skipped.push({ orderNumber, reason: "illegal-transition" });
        continue;
      }

      await tx.orderStatusEvent.create({
        data: {
          orderId: existing.id,
          vendorId,
          status: toStatus,
          note: TRANSITION_NOTES[toStatus] ?? null,
          createdByUserId: actor.userId,
        },
      });
      movedNumbers.push({ orderNumber, toStatus });
    }
  });

  // Re-read AFTER the commit, same reason advanceOrderStatus does: an order
  // object built from mid-transaction state could be re-read by a caller that
  // outlives the transaction, and findOrderForWebhook is the one place that
  // already resolves buyerEmail (guestEmail ?? user.email) and carries items.
  const moved: AdvanceBulkResult["moved"] = [];
  for (const { orderNumber, toStatus } of movedNumbers) {
    const order = await findOrderForWebhook(prisma, orderNumber);
    if (order) moved.push({ order, toStatus });
  }

  return { moved, skipped };
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
  /** P7.5b (#150) — as `OrderSummary.discountCode`. */
  discountCode: { code: string; amountPence: number } | null;
  /**
   * P7.5b (#138) — as `OrderSummary.pointsEarned`.
   *
   * Timing matters on this path: `confirmPayment` calls `findOrderForWebhook`
   * BEFORE its transaction, so the order it works from always has `null` here.
   * The confirmation email reads a SECOND, post-commit fetch — the webhook route
   * re-calls `findOrder` only once `confirm` returned true — which is the one
   * that carries the awarded figure.
   */
  pointsEarned: number | null;
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
      ...ORDER_PROVENANCE_SELECT,
    },
  });
  if (!order) return null;

  const { guestEmail, user, discountUse, loyaltyEntries, ...rest } = order;
  return {
    ...rest,
    ...toProvenance({ discountUse, loyaltyEntries }),
    buyerEmail: guestEmail ?? user?.email ?? null,
  };
}

/* ---- Payment binding (P9.1, #429) ------------------------------------------
 *
 * A verified Stripe signature proves an event came from Stripe. It does NOT
 * prove the event is about the payment THIS order is waiting on: a session
 * created in the same Stripe account with crafted metadata, or a metadata mix-up
 * during an integration change, both arrive correctly signed. Until this slice,
 * `metadata.orderNumber` was the only thing standing between such an event and a
 * confirmed order.
 *
 * The binding is enforced in the `where` clause of the compare-and-set that
 * already guards the status transition, never by fetching and then comparing in
 * application code. That is the P7a lesson recorded on `findOrderForGuestLookup`
 * below: the previous guest lookup returned a full match with no email supplied
 * at all, precisely because a missing credential SKIPPED the comparison instead
 * of failing it. In a `where`, a missing credential simply matches nothing.
 *
 * It also makes the nullable-reference case free. `Payment.providerReference` is
 * null between order creation and the post-commit session write, and for any
 * order whose provider call never completed. A stored null cannot equal a
 * non-null session id, so those orders are refused by the same predicate that
 * refuses a wrong one — the same property #427 relied on for `confirmationToken`.
 */

/** Same shape the other repository modules use, so a read can run inside a caller's transaction. */
type OrdersDb = ReturnType<typeof getPrisma>;
type OrdersTx = Parameters<Parameters<OrdersDb["$transaction"]>[0]>[0];

/** What the caller claims this event is about. Any null field is unprovable. */
export interface PaymentBinding {
  provider: string;
  providerReference: string | null;
  amountPence: number | null;
  currency: string | null;
}

/**
 * Why a payment transition did not happen.
 *
 * `already-processed` and `binding-mismatch` are deliberately distinct even
 * though both mean "no row moved". The first is normal — Stripe retries
 * aggressively and duplicate deliveries are expected — and must stay silent. The
 * second is an integration defect or an attempt, and must be loud. A bare
 * boolean cannot carry that difference, which is why these are unions.
 */
export type PaymentTransitionRefusal =
  "not-found" | "unbindable" | "binding-mismatch" | "already-processed";

export type ConfirmPaymentResult = { ok: true } | { ok: false; reason: PaymentTransitionRefusal };
export type FailPaymentResult = { ok: true } | { ok: false; reason: PaymentTransitionRefusal };

/**
 * Classifies a zero-row compare-and-set, and NOTHING else.
 *
 * This is the one read in the binding path that is not part of the `where`, so
 * it is worth being explicit about what it may do: authorization has already
 * been decided, atomically, by the predicate that matched no rows. This runs
 * only on that failure path and can only ever choose between two refusals. It
 * cannot grant a transition, and no caller may use it to.
 */
async function classifyNoMatch(
  client: OrdersDb | OrdersTx,
  orderId: string,
): Promise<"already-processed" | "binding-mismatch"> {
  const current = await client.order.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  // A row that is no longer awaiting payment was moved by someone else — a
  // duplicate delivery, or a staff cancellation. Anything else means the row is
  // still there, still PENDING_PAYMENT, and the binding is what refused it.
  return current && current.status !== "PENDING_PAYMENT" ? "already-processed" : "binding-mismatch";
}

/**
 * PENDING_PAYMENT → CONFIRMED, idempotently AND only for the expected payment.
 *
 * Returns `{ ok: true }` only when THIS call performed the transition — the
 * caller uses that to decide whether to send the confirmation email, so a
 * duplicate webhook delivery (Stripe retries aggressively) can't email the
 * shopper twice.
 *
 * The order number alone does not authorize this transition. The event must also
 * correspond to the Checkout Session stored on this order's `Payment` row, for
 * the expected provider, at the expected amount and currency — see the binding
 * note above. Amount and currency are checked here because confirmation is where
 * money is asserted; `failPayment` deliberately checks neither.
 */
export async function confirmPayment(
  prisma: ReturnType<typeof getPrisma>,
  orderNumber: string,
  binding: PaymentBinding,
): Promise<ConfirmPaymentResult> {
  // Destructured to `const` BEFORE the guard so the narrowing survives into the
  // transaction callback below — TypeScript discards narrowing of a mutable
  // property access across a closure boundary, which would leave
  // `providerReference` typed `string | null` exactly where it must not be.
  const { provider, providerReference, amountPence, currency: rawCurrency } = binding;

  // Refuse before reading anything: an event missing any of these cannot be
  // proved to be about this payment, and guessing is the failure mode this
  // function exists to remove.
  if (providerReference === null || amountPence === null || rawCurrency === null) {
    return { ok: false, reason: "unbindable" };
  }

  const order = await findOrderForWebhook(prisma, orderNumber);
  if (!order) return { ok: false, reason: "not-found" };

  // `Order.currency` is upper-case ("GBP", the column default); Stripe echoes it
  // back lower-cased because `lib/payments.ts` sends it lower-cased. Normalising
  // the INPUT once is not the same thing as comparing a credential in
  // application code — the value still has to survive the `where` below. Doing it
  // here rather than with `mode: "insensitive"` keeps the guard off collation
  // semantics inside a write path.
  const currency = rawCurrency.toUpperCase();

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
      where: {
        id: order.id,
        status: "PENDING_PAYMENT",
        currency,
        // The binding itself. One predicate, evaluated by Postgres, in the same
        // statement that performs the transition — so a mismatched event and a
        // duplicate delivery are refused by the same mechanism, and neither can
        // race the other.
        payment: { is: { provider, providerReference, amountPence } },
      },
      data: { status: "CONFIRMED" },
    });
    if (count === 0) {
      return { ok: false as const, reason: await classifyNoMatch(tx, order.id) };
    }

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

    return { ok: true as const };
  });
}

/**
 * PENDING_PAYMENT → CANCELLED with stock released, idempotently AND only for the
 * expected payment.
 *
 * This is the gap P3b explicitly left open: until P3c an abandoned checkout held
 * its stock forever. P9.1 (#429) closes a second one — the order number alone
 * used to be enough to cancel an order and return its inventory, reverse a
 * loyalty redemption and free a discount-code use, from an event nothing had
 * bound to this order's payment.
 *
 * Binds on the session identity ONLY — deliberately not on amount or currency,
 * unlike `confirmPayment`. Cancellation asserts no money, so the amount is not
 * what authorizes it; and refusing to release stock because Stripe omitted
 * `amount_total` on an expired session would leave an order holding inventory
 * indefinitely, which is a worse failure than the one being prevented and needs
 * no attacker to reach.
 */
export async function failPayment(
  prisma: ReturnType<typeof getPrisma>,
  orderNumber: string,
  binding: PaymentBinding,
  reason: string,
): Promise<FailPaymentResult> {
  if (binding.providerReference === null) return { ok: false, reason: "unbindable" };

  const order = await findOrderForWebhook(prisma, orderNumber);
  if (!order) return { ok: false, reason: "not-found" };

  const released = await releaseOrder(prisma, order.vendorId, order.id, reason, {
    provider: binding.provider,
    providerReference: binding.providerReference,
  });
  if (released) return { ok: true };
  return { ok: false, reason: await classifyNoMatch(prisma, order.id) };
}

/**
 * Cancels a still-unpaid order the CALLER has already authorized (P9.1, #429).
 *
 * The shopper-facing cancel action (`features/checkout/cancel-order.ts`) proves
 * the order's capability token before it gets here, so there is no Stripe event
 * and no session id to bind against — the same position `placeOrder`'s own
 * failure path is in. It therefore calls `releaseOrder` with no binding, and the
 * unchanged status guard still makes calling it twice safe.
 *
 * It exists as its own export rather than reusing `failPayment` because that
 * function now REQUIRES a binding, correctly: the webhook must never be able to
 * cancel an order without proving which payment it means. Handing it a
 * placeholder binding to satisfy the type would defeat the whole slice.
 *
 * Vendor-scoped, unlike the webhook path. `#428` routed this through
 * `getWebhookOrderService()`, whose read is deliberately un-scoped because a
 * payment provider arrives with no host — an exemption ADR-004 records and that
 * a request-bound shopper action does not need or want.
 */
export async function cancelUnpaidOrder(
  prisma: ReturnType<typeof getPrismaWs>,
  vendorId: string,
  orderNumber: string,
  reason: string,
): Promise<boolean> {
  const order = await prisma.order.findFirst({
    where: { orderNumber, vendorId },
    select: { id: true },
  });
  if (!order) return false;
  return releaseOrder(prisma, vendorId, order.id, reason);
}

/* `getWebhookOrderService()` moved to `lib/orders-service.ts` (#252). It resolved
 * a live client itself, which is the property this module must not have — the
 * pure functions it wrapped (`findOrderForWebhook`, `confirmPayment`,
 * `failPayment`) are unchanged and still take their client explicitly, so they
 * stay testable from a plain script against a real database. */

// ---- Guest order lookup (P7a fix, #123/#192) -------------------------------
//
// #123 named the open question exactly: "order number alone, order number +
// email, or order number + postcode... plus rate limiting... a deliberate
// answer on enumeration." requirements.md §4.1 (P7a) already settled the
// credential pair as Order Number + Email — the defect was that the shipped
// page made email optional and reused `findOrderForWebhook`, the ONE function
// this file's own comment above marks as deliberately un-scoped for Stripe's
// server-to-server calls. A public page is exactly the caller that exemption
// does not cover.

export interface GuestLookupOrder {
  orderNumber: string;
  status: string;
  totalPence: number;
  items: { productName: string; quantity: number; lineTotalPence: number }[];
}

/**
 * Vendor-scoped AND email-matched at the query level — never fetched, then
 * compared in application code, which is what let the previous implementation
 * return a full match with no email supplied at all. A wrong order number or a
 * mismatched email both simply find nothing; the caller cannot tell which.
 */
export async function findOrderForGuestLookup(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  orderNumber: string,
  email: string,
): Promise<GuestLookupOrder | null> {
  return prisma.order.findFirst({
    where: {
      orderNumber,
      vendorId,
      OR: [
        { guestEmail: { equals: email, mode: "insensitive" } },
        { user: { email: { equals: email, mode: "insensitive" } } },
      ],
    },
    select: {
      orderNumber: true,
      status: true,
      totalPence: true,
      items: { select: { productName: true, quantity: true, lineTotalPence: true } },
    },
  });
}

/* `getGuestOrderLookupService()` moved to `lib/orders-service.ts` (#252) — it
 * resolved both a live client and the current vendor from request context.
 * `findOrderForGuestLookup` above is unchanged and still takes both explicitly,
 * which is what lets a `tsx` script prove the order-number/email credential
 * pair is enforced at the query level. */
