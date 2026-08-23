import { revalidatePath } from "next/cache";
import { getCartRepository } from "@/lib/cart-service";
import { clearGuestToken, type CartIdentity } from "@/lib/cart-identity";

/**
 * Internal helpers shared by the four cart actions (P3a, #93). Not itself a
 * server action file — each action.ts imports from here, matching
 * features/reviews/*'s one-action-per-file shape.
 */

export async function revalidateCartSurfaces() {
  // The header count renders in the storefront layout, so revalidate the layout
  // rather than just the page — otherwise the badge lags behind the drawer.
  revalidatePath("/", "layout");
}

/** Drops a guest cookie that no longer points at a cart. Safe to call always. */
export async function clearStaleGuestCookie(identity: CartIdentity) {
  if (!identity.guestToken) return;
  if (await getCartRepository().isGuestCartGone(identity)) await clearGuestToken();
}

/** A signed-in shopper writes to their own cart, never a pending guest one. */
export function scopedToUser(identity: CartIdentity): CartIdentity {
  return identity.userId ? { userId: identity.userId, guestToken: null } : identity;
}
