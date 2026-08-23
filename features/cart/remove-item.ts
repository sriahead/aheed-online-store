"use server";

import { getCartRepository } from "@/lib/cart-service";
import { getCartIdentity } from "@/lib/cart-identity";
import { clearStaleGuestCookie, revalidateCartSurfaces, scopedToUser } from "./shared";

export async function removeFromCart(productId: string) {
  const identity = await getCartIdentity();
  const scoped = scopedToUser(identity);

  await getCartRepository().removeItem(scoped, productId);
  await clearStaleGuestCookie(identity);
  await revalidateCartSurfaces();
}
