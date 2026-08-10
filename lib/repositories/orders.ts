import { getPrisma } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import { buildOrderNumber, computeTotals, type DeliveryRules } from "@/lib/order-totals";
import { getPaymentService } from "@/lib/payments";
import { effectiveStock } from "@/lib/cart-rules";

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
      | "PAYMENT_PROVIDER_FAILED",
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

    const totals = computeTotals(lines, input.rules);
    if (totals.subtotalPence < input.rules.minimumOrderPence) {
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
    return true;
  });
}

export interface OrderSummary {
  orderNumber: string;
  status: string;
  createdAt: Date;
  subtotalPence: number;
  deliveryFeePence: number;
  totalPence: number;
  items: {
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

export interface OrderRepository {
  createOrder(input: PlaceOrderInput): Promise<PlacedOrder>;
  /** Scoped to the current vendor, so one vendor's number never resolves on another's host. */
  getByOrderNumber(orderNumber: string, viewerUserId: string | null): Promise<OrderSummary | null>;
}

export function getOrderRepository(): OrderRepository {
  const prisma = getPrisma();
  let vendorIdPromise: Promise<string> | undefined;
  const vendorId = () => (vendorIdPromise ??= getCurrentVendorId());

  return {
    async createOrder(input) {
      return placeOrder(prisma, await vendorId(), input);
    },

    async getByOrderNumber(orderNumber, viewerUserId) {
      const order = await prisma.order.findFirst({
        where: { orderNumber, vendorId: await vendorId() },
        select: {
          orderNumber: true,
          status: true,
          createdAt: true,
          subtotalPence: true,
          deliveryFeePence: true,
          totalPence: true,
          userId: true,
          items: {
            select: {
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
  };
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
  deliveryFeePence: number;
  buyerEmail: string | null;
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
      deliveryFeePence: true,
      guestEmail: true,
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
  const prisma = getPrisma();
  return {
    findOrder: (orderNumber: string) => findOrderForWebhook(prisma, orderNumber),
    confirm: (orderNumber: string) => confirmPayment(prisma, orderNumber),
    fail: (orderNumber: string, reason: string) => failPayment(prisma, orderNumber, reason),
  };
}
