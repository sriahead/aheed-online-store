"use server";

import { getCartRepository } from "@/lib/cart-service";
import { clearGuestToken, getCartIdentity } from "@/lib/cart-identity";
import { isMergeResolution } from "@/lib/cart-rules";
import { revalidateCartSurfaces } from "./shared";

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
