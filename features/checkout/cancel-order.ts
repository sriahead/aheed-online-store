"use server";

import { redirect } from "next/navigation";
import { getOrderRepository, getWebhookOrderService } from "@/lib/orders-service";
import { getCartRepository } from "@/lib/cart-service";
import { getCartIdentity } from "@/lib/cart-identity";
import { scopedToUser } from "@/features/cart/shared";

/**
 * Cancel a still-unpaid order and put its lines back in the cart (P9.1, #428).
 *
 * This used to be `app/api/checkout/cancel/route.ts`, a GET that cancelled the
 * order and released its inventory on sight. Stripe's `cancel_url` returns the
 * browser with a GET, so the route was reachable — and destructive — to any link
 * prefetcher, mail scanner, chat unfurler or crawler that so much as touched the
 * URL. Splitting it was the fix: the page at
 * `app/(storefront)/checkout/[orderNumber]/cancel/page.tsx` asks, and this
 * action acts.
 *
 * The hidden fields are attacker-controlled like any other form input, so this
 * re-proves the capability token rather than trusting that the page already did
 * — the same posture `eraseGuestOrder` takes with the order-number/email pair.
 *
 * Refusal and success both end at `/cart`, so the response says nothing about
 * whether the order existed or the token was right.
 *
 * NOTE: this file may export async functions and nothing else. A single value
 * export makes every action in it fail at runtime while `build`, `typecheck` and
 * `test` all stay green (CLAUDE.md's Server Actions section).
 */
export async function cancelOrder(formData: FormData): Promise<void> {
  const orderNumber = String(formData.get("orderNumber") ?? "");
  const token = String(formData.get("t") ?? "");

  const identity = await getCartIdentity();
  const scoped = scopedToUser(identity);
  const userId = scoped.userId ?? null;

  const order = await getOrderRepository().getByOrderNumber(orderNumber, userId, token || null);

  // Only PENDING_PAYMENT is cancellable. A paid or already-cancelled order is
  // left exactly as it is — the same guard the deleted route carried, and the
  // reason calling this twice cannot release the same stock twice.
  if (order && order.status === "PENDING_PAYMENT") {
    await getWebhookOrderService().fail(orderNumber, "Shopper cancelled payment at checkout");

    if (order.items.length > 0) {
      await getCartRepository().addItems(
        scoped,
        order.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      );
    }
  }

  // Outside any try/catch: redirect() throws a control-flow signal that must not
  // be swallowed.
  redirect("/cart");
}
