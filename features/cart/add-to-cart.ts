"use server";

import { getCartRepository } from "@/lib/repositories/cart";
import { getUserId, issueGuestToken, type CartIdentity } from "@/lib/cart-identity";
import { revalidateCartSurfaces } from "./shared";

export async function addToCart(productId: string) {
  const userId = await getUserId();
  // Only now — on a real add — does a guest get a token, so browsing (including
  // by crawlers) never creates a cookie or a Cart row.
  const identity: CartIdentity = userId
    ? { userId, guestToken: null }
    : { userId: null, guestToken: await issueGuestToken() };

  await getCartRepository().addItem(identity, productId, 1);
  await revalidateCartSurfaces();
}
