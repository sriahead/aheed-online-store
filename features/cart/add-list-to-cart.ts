"use server";

import { redirect } from "next/navigation";
import { getCartRepository } from "@/lib/repositories/cart";
import { getUserId, issueGuestToken, type CartIdentity } from "@/lib/cart-identity";
import type { MergeLine } from "@/lib/cart-rules";
import { MAX_LINE_QUANTITY } from "@/lib/shopping-list";
import { revalidateCartSurfaces } from "./shared";

/**
 * "Shop your list" step 2 (P3d, #114): add the reviewed lines to the cart.
 *
 * The review step is stateless, so the form submits a productId and quantity
 * per confirmed line. Those ids are UNTRUSTED — the repository resolves stock
 * scoped to the current vendor, so an id belonging to another vendor (or to
 * nothing) has no row, resolves to stock 0, and is skipped. Nothing here
 * re-derives that check.
 *
 * The two fields are read positionally: every rendered line emits BOTH inputs
 * or neither, so the arrays stay aligned. An unresolved ambiguous line emits an
 * empty productId and is dropped.
 */
export async function addListToCart(formData: FormData) {
  const productIds = formData.getAll("productId");
  const quantities = formData.getAll("quantity");

  const lines: MergeLine[] = [];
  for (const [index, rawId] of productIds.entries()) {
    const productId = typeof rawId === "string" ? rawId.trim() : "";
    if (productId.length === 0) continue; // ambiguous line left unresolved

    const rawQuantity = quantities[index];
    const quantity = Number(typeof rawQuantity === "string" ? rawQuantity : "");
    if (!Number.isFinite(quantity) || quantity < 1) continue;

    lines.push({ productId, quantity: Math.min(Math.trunc(quantity), MAX_LINE_QUANTITY) });
  }

  if (lines.length > 0) {
    const userId = await getUserId();
    // Only now — on a real add — does a guest get a token, matching add-to-cart.
    const identity: CartIdentity = userId
      ? { userId, guestToken: null }
      : { userId: null, guestToken: await issueGuestToken() };

    await getCartRepository().addItems(identity, lines);
    await revalidateCartSurfaces();
  }

  redirect("/cart");
}
