"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getOrderRepository } from "@/lib/repositories/orders";
import { getCartRepository } from "@/lib/repositories/cart";

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

  const cartRepo = getCartRepository();
  const identity = { userId, guestToken: null };
  const lines = order.items
    .filter((item) => item.productId !== null)
    .map((item) => ({
      productId: item.productId as string,
      quantity: item.quantity,
    }));

  if (lines.length > 0) {
    await cartRepo.addItems(identity, lines);
  }

  redirect("/cart");
}
