"use server";

import { getCartRepository } from "@/lib/cart-service";
import { getCartIdentity } from "@/lib/cart-identity";
import type { SetNoteOutcome } from "@/lib/repositories/cart";
import { clearStaleGuestCookie, revalidateCartSurfaces, scopedToUser } from "./shared";

/**
 * #1135 — set or clear the shopper's note on a basket line. Exports only async functions
 * (CLAUDE.md): the outcome type lives in `lib/repositories/cart.ts`.
 *
 * `note` arrives from the client, so it is type-checked here and normalised in the repository;
 * the repository refuses a product that is not in the caller's basket or does not take notes.
 */
export async function setCartItemNote(productId: unknown, note: unknown): Promise<SetNoteOutcome> {
  if (typeof productId !== "string" || typeof note !== "string") {
    return { ok: false, reason: "NOT_IN_CART" };
  }
  const identity = await getCartIdentity();
  const outcome = await getCartRepository().setNote(scopedToUser(identity), productId, note);
  await clearStaleGuestCookie(identity);
  if (outcome.ok) await revalidateCartSurfaces();
  return outcome;
}
