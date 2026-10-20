import { cache } from "react";
import { getUserId } from "@/lib/cart-identity";
import { getFavouritesRepository } from "@/lib/favourites-service";
import type { FavouriteState } from "@/lib/favourites";

/**
 * Request-memoised favourite lookup for the product grids (#232).
 *
 * MIRRORS `lib/cart-summary.ts` EXACTLY, and for the same reason: three surfaces render
 * `ProductCard` (`/categories/[slug]`, `/search` and every `ProductRow`), and a page can render
 * several rows. Without `cache()`, a homepage with four product rows would issue four identical
 * favourite queries per request. With it, the first caller pays and the rest are free — the same
 * bargain `getRequestCartQuantities` already makes.
 *
 * RETURNS A RESOLVER, NOT A SET, so a page awaits once and then calls a plain function per card.
 * Handing out the set instead would make every call site re-derive "no user means signed-out, not
 * simply empty" — the distinction the card's three-state prop exists to carry, and the one thing a
 * caller could get wrong in a way that looks fine (a guest's cards would read "off", offering a
 * toggle that cannot work).
 *
 * Lives beside `lib/favourites-service.ts` rather than inside it: the service is the per-call
 * facade, this is the per-request memo. Splitting them is the shape `cart-service` /`cart-summary`
 * already uses, and it keeps `cache()` out of the facade, which must stay constructible fresh per
 * call.
 */
export const getRequestFavouriteState = cache(
  async (): Promise<(productId: string) => FavouriteState> => {
    const userId = await getUserId();
    // No session means no favourites to read, and issuing the query anyway would cost a round trip
    // to learn that. Matches `getRequestCartSummary`'s own guard.
    if (!userId) return () => "signed-out";

    const ids = await getFavouritesRepository().listProductIds(userId);
    return (productId: string) => (ids.has(productId) ? "on" : "off");
  },
);
