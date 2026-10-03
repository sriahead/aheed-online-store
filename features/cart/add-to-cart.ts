"use server";

import { getCartRepository } from "@/lib/cart-service";
import { getUserId, issueGuestToken, type CartIdentity } from "@/lib/cart-identity";
import { isValidAddDelta, type AddOutcome } from "@/lib/cart-rules";
import { revalidateCartSurfaces } from "./shared";

/**
 * #956 — resolves to what the add actually did. `AddOutcome` lives in
 * `lib/cart-rules.ts` because a `"use server"` file may export only async
 * functions (CLAUDE.md).
 */
export async function addToCart(productId: string, delta: number = 1): Promise<AddOutcome> {
  // `delta` arrives from the client, so it is checked before anything is
  // touched — including the guest cookie below.
  if (!isValidAddDelta(delta)) return { kind: "none", reason: "INVALID_QUANTITY" };

  const userId = await getUserId();
  // Only now — on a real add — does a guest get a token, so browsing (including
  // by crawlers) never creates a cookie or a Cart row.
  const identity: CartIdentity = userId
    ? { userId, guestToken: null }
    : { userId: null, guestToken: await issueGuestToken() };

  const outcome = await getCartRepository().addItem(identity, productId, delta);
  await revalidateCartSurfaces();
  return outcome;
}
