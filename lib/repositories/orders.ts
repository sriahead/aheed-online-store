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
      | "ORDER_NUMBER_COLLISION",
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
}

export interface PlacedOrder {
  orderNumber: string;
  totalPence: number;
}

const ORDER_NUMBER_ATTEMPTS = 5;

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

  return prisma.$transaction(async (tx) => {
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

    const intent = await payments.createPayment({
      orderNumber: order.orderNumber,
      amountPence: totals.totalPence,
      currency: "GBP",
      vendorId,
    });

    await tx.payment.create({
      data: {
        orderId: order.id,
        vendorId,
        provider: intent.provider,
        providerReference: intent.providerReference,
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

    return { orderNumber: order.orderNumber, totalPence: totals.totalPence };
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
