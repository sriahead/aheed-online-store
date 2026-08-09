"use server";

import { getCartRepository } from "@/lib/repositories/cart";
import { getCartIdentity } from "@/lib/cart-identity";
import { clearStaleGuestCookie, revalidateCartSurfaces, scopedToUser } from "./shared";

export async function updateQuantity(productId: string, quantity: number) {
  const identity = await getCartIdentity();
  const repo = getCartRepository();
  const scoped = scopedToUser(identity);

  if (quantity <= 0) await repo.removeItem(scoped, productId);
  else await repo.setQuantity(scoped, productId, quantity);

  await clearStaleGuestCookie(identity);
  await revalidateCartSurfaces();
}
