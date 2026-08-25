"use server";

import { redirect } from "next/navigation";
import { getCartRepository } from "@/lib/cart-service";
import { getBundleForCurrentVendor } from "@/lib/bundles-service";
import { getUserId, issueGuestToken, type CartIdentity } from "@/lib/cart-identity";
import type { MergeLine } from "@/lib/cart-rules";
import { availableBundleItems, isBundleItemAvailable } from "@/lib/bundle-pricing";
import { UNAVAILABLE_SEPARATOR } from "@/lib/bundle-notice";
import { revalidateCartSurfaces } from "./shared";

/**
 * "Add all N to basket" (P8.5c, #347) — expand a curated bundle into ordinary
 * cart lines.
 *
 * THE WHOLE POINT OF THIS ACTION IS THAT IT ADDS ALMOST NOTHING. It resolves the
 * bundle's constituents into `MergeLine[]` and hands them to the existing
 * `addItems`, which already runs one transaction for the whole list and already
 * collapses duplicates through `sumLinesByProduct` — so a bundle naming a
 * product the shopper already has in their cart needs no special case here, and
 * a bundle naming the same product twice is impossible by schema anyway.
 *
 * The bundle id is UNTRUSTED. `getBundleForCurrentVendor` scopes the lookup to
 * the resolved vendor, so another vendor's id (or a random uuid) yields null and
 * this returns having written nothing — the same posture that makes P3d's review
 * form ids safe. Nothing here re-derives that check.
 *
 * WHY AVAILABILITY IS RESOLVED HERE, ABOVE THE CART:
 * `addCartItems` filters out-of-stock lines and returns `void`
 * (lib/repositories/cart.ts) — it cannot tell a caller that two of four items
 * were unavailable, and a shopper who clicks "Add all 4" and silently receives 2
 * has been misled. The alternative was changing `addCartItems` to return a
 * result, but `addListToCart` and the merge path also depend on it, so that
 * would reshape a shared transaction-carrying write path to serve one new
 * caller's reporting need. This action already reads the bundle's constituents
 * to build the lines, and their stock comes back in the same query, so doing it
 * here costs nothing extra and leaves the cart write path untouched.
 *
 * THE ACCEPTED IMPRECISION: stock is read before the write, so between the read
 * and the transaction another shopper can take the last unit. The write path
 * still clamps, so no overselling becomes possible — but the message shown can
 * be marginally optimistic in that race. That is a deliberate trade against the
 * blast radius above, for a message that is advisory rather than load-bearing.
 */
export async function addBundleToCart(formData: FormData) {
  const bundleId = String(formData.get("bundleId") ?? "").trim();
  if (bundleId === "") redirect("/cart");

  const bundle = await getBundleForCurrentVendor(bundleId);
  // Another vendor's bundle, a deleted one, or an unresolved host: write
  // nothing, and don't render an error page for what is not a shopper's fault.
  if (!bundle) redirect("/cart");

  const available = availableBundleItems(bundle.items);
  const unavailable = bundle.items.filter((item) => !isBundleItemAvailable(item));

  if (available.length > 0) {
    const lines: MergeLine[] = available.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    }));

    const userId = await getUserId();
    // Only now — on a real add — does a guest get a token, matching
    // add-to-cart and add-list-to-cart. Rendering bundles creates no state.
    const identity: CartIdentity = userId
      ? { userId, guestToken: null }
      : { userId: null, guestToken: await issueGuestToken() };

    await getCartRepository().addItems(identity, lines);
    await revalidateCartSurfaces();
  }

  // Names travel in the URL rather than a flash cookie so the notice survives
  // the redirect with no new state to store or expire, and so a headless check
  // can read it straight off the response (validation.md R21).
  if (unavailable.length > 0) {
    const names = unavailable.map((item) => item.name).join(UNAVAILABLE_SEPARATOR);
    redirect(`/cart?unavailable=${encodeURIComponent(names)}`);
  }

  redirect("/cart");
}
