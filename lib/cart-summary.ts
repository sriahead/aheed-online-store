import { cache } from "react";
import { getCartIdentity } from "@/lib/cart-identity";
import { getCartRepository } from "@/lib/cart-service";
import { EMPTY_CART, type CartSummary } from "@/lib/repositories/cart";

/**
 * P8.5a (#345) — one cart read per request, shared by the header and the
 * product grid.
 *
 * WHY THIS EXISTS. `components/layout/Header.tsx` already resolved the cart on
 * every storefront page, to render the drawer. P8.5a's cart-aware product card
 * needs the same data on `/`, `/search` and `/categories/[slug]` — and a Next
 * layout cannot pass props to `children`, so each page has to resolve it
 * independently. Without memoisation that is two identical `getSummary()`
 * round-trips per page render (requirement R9).
 *
 * `cache()` IS NOT A CROSS-REQUEST CACHE. React's `cache()` memoises for the
 * lifetime of a single request render, and nothing survives into the next one.
 * That distinction matters here specifically: `CLAUDE.md` forbids caching a
 * Prisma client across requests ("Cannot perform I/O on behalf of a different
 * request" on Workers), and this does not do that — `getCartRepository()` is
 * still constructed fresh inside the memoised call, and the memo itself is torn
 * down with the request.
 *
 * TAKES NO ARGUMENTS ON PURPOSE. `cache()` keys on argument identity, so a
 * helper taking the `CartIdentity` object would miss whenever two callers built
 * their own copy of an otherwise-equal object. Resolving the identity inside
 * the memoised function is what makes the header and the page actually share
 * one call.
 */
export const getRequestCartSummary = cache(async (): Promise<CartSummary> => {
  const identity = await getCartIdentity();
  // Matches getCartSummary()'s own guard: no identity means no cart to read,
  // and issuing the query anyway would cost a round-trip to learn that.
  if (!identity.userId && !identity.guestToken) return EMPTY_CART;
  return getCartRepository().getSummary(identity);
});

/**
 * Product id -> quantity currently in the cart, for the grid's quantity
 * steppers. Derived from the same memoised summary, so asking for it costs
 * nothing beyond the read the header already performs.
 *
 * Unavailable lines are included deliberately: a product that went out of stock
 * while sitting in the cart is still IN the cart, and the card must show that
 * rather than silently reading as "not added".
 */
export const getRequestCartQuantities = cache(async (): Promise<ReadonlyMap<string, number>> => {
  const summary = await getRequestCartSummary();
  return new Map(summary.lines.map((line) => [line.productId, line.quantity]));
});
