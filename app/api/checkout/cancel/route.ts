import { NextResponse, type NextRequest } from "next/server";
import { getOrderRepository, getWebhookOrderService } from "@/lib/orders-service";
import { getCartRepository } from "@/lib/cart-service";
import { getCartIdentity } from "@/lib/cart-identity";
import { scopedToUser } from "@/features/cart/shared";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const orderNumber = req.nextUrl.searchParams.get("orderNumber");
  if (!orderNumber) {
    return NextResponse.redirect(new URL("/cart", req.url));
  }

  const identity = await getCartIdentity();
  const repo = getCartRepository();
  const orderRepo = getOrderRepository();
  const scoped = scopedToUser(identity);
  const userId = scoped.userId ?? null;

  // We only cancel it if it's PENDING_PAYMENT, otherwise we do nothing.
  // The shopper's userId ensures they own it if signed in. If they are a guest (userId is null),
  // they can only cancel by knowing the exact unguessable orderNumber, which is safe enough.
  const order = await orderRepo.getByOrderNumber(orderNumber, userId);

  if (order && order.status === "PENDING_PAYMENT") {
    // 1. Cancel the order (releases inventory)
    await getWebhookOrderService().fail(orderNumber, "Shopper cancelled payment at checkout");

    // 2. Restore items to cart
    if (order.items.length > 0) {
      await repo.addItems(
        scoped,
        order.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      );
    }
  }

  return NextResponse.redirect(new URL("/cart", req.url));
}
