"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getOrderRepository } from "@/lib/orders-service";
import { getCartRepository } from "@/lib/cart-service";
import { restoredLines } from "@/lib/restore-lines";
import { buildRestoreNoticeUrl } from "@/lib/restore-notice";

/**
 * Put a past order's lines back in the cart.
 *
 * #957 — and say what did not go back. `addItems` skips a product that is inactive or out of stock
 * and caps the rest at current stock; reorder is the weekly-shop feature, so a shopper who gets 18 of
 * 20 lines back with no message finds the missing two while cooking. The redirect carries the
 * shortfall to `/cart` (`lib/restore-notice.ts`), and is plain `/cart` when everything went in.
 *
 * NOTE: this file may export async functions and nothing else (CLAUDE.md's Server Actions section).
 */
export async function reorderItems(formData: FormData): Promise<void> {
  const orderNumber = formData.get("orderNumber");
  if (typeof orderNumber !== "string" || !orderNumber) {
    throw new Error("Missing orderNumber");
  }

  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const userId = (session.user as { id: string }).id;
  const order = await getOrderRepository().getForUser(orderNumber, userId);
  if (!order) {
    throw new Error("Order not found");
  }

  const identity = { userId, guestToken: null };
  const lines = await restoredLines(order.items, (toAdd) =>
    getCartRepository().addItems(identity, toAdd),
  );

  redirect(buildRestoreNoticeUrl("reorder", lines));
}
