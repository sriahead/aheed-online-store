"use server";

import { revalidatePath } from "next/cache";
import { getCartRepository } from "@/lib/repositories/cart";
import {
  clearGuestToken,
  getCartIdentity,
  getUserId,
  issueGuestToken,
  type CartIdentity,
} from "@/lib/cart-identity";
import { isMergeResolution } from "@/lib/cart-rules";

/**
 * Cart mutations (P3a, #93). Server actions — the same shape as
 * features/reviews/*. Identity is resolved here and passed into the repository,
 * so the repository never reads cookies or the session itself.
 *
 * Cookie writes live in this layer by necessity: Next forbids setting or
 * deleting cookies during a Server Component render, so the read path can only
 * reconcile the database, and the (now inert) guest cookie is cleared on the
 * next mutation.
 */

async function revalidateCartSurfaces() {
  // The header count renders in the storefront layout, so revalidate the layout
  // rather than just the page — otherwise the badge lags behind the drawer.
  revalidatePath("/", "layout");
}

/** Drops a guest cookie that no longer points at a cart. Safe to call always. */
async function clearStaleGuestCookie(identity: CartIdentity) {
  if (!identity.guestToken) return;
  if (await getCartRepository().isGuestCartGone(identity)) await clearGuestToken();
}

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

export async function updateQuantity(productId: string, quantity: number) {
  const identity = await getCartIdentity();
  const repo = getCartRepository();
  // A signed-in shopper writes to their own cart, never the pending guest one.
  const scoped: CartIdentity = identity.userId
    ? { userId: identity.userId, guestToken: null }
    : identity;

  if (quantity <= 0) await repo.removeItem(scoped, productId);
  else await repo.setQuantity(scoped, productId, quantity);

  await clearStaleGuestCookie(identity);
  await revalidateCartSurfaces();
}

export async function removeFromCart(productId: string) {
  const identity = await getCartIdentity();
  const scoped: CartIdentity = identity.userId
    ? { userId: identity.userId, guestToken: null }
    : identity;

  await getCartRepository().removeItem(scoped, productId);
  await clearStaleGuestCookie(identity);
  await revalidateCartSurfaces();
}

/**
 * Applies the shopper's chosen merge resolution and clears the guest cookie —
 * the cookie is cleared ONLY as part of an applied resolution, never
 * speculatively.
 */
export async function resolveMergeAction(resolution: string) {
  if (!isMergeResolution(resolution)) throw new Error(`Unknown merge resolution: ${resolution}`);

  const identity = await getCartIdentity();
  if (!identity.userId || !identity.guestToken) return;

  await getCartRepository().applyMerge(identity, resolution);
  await clearGuestToken();
  await revalidateCartSurfaces();
}
