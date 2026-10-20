"use server";

import { revalidatePath } from "next/cache";
import { getUserId } from "@/lib/cart-identity";
import { getFavouritesRepository } from "@/lib/favourites-service";
import type { FavouriteToggleResult } from "@/lib/favourites";

/**
 * Toggle one product's favourite state for the signed-in shopper (#232).
 *
 * THIS FILE MAY EXPORT ONLY ASYNC FUNCTIONS. `FavouriteToggleResult` therefore lives in the plain
 * module `lib/favourites.ts`, not here. CLAUDE.md records that the rule is enforced at RUNTIME, so
 * `build`, `typecheck` and `test` all stay green while every action in the file 500s for every
 * caller — a plain exported type alias would be erased by the compiler, but a value would not, and
 * the distinction is too easy to lose in a later edit to rely on.
 *
 * AUTHENTICATED-ONLY (owner decision, Gate 1, 2026-10-20), and this is the only place that decides
 * it. A signed-out caller gets `{ kind: "signed-out" }` and NOTHING IS WRITTEN — it does not throw,
 * because a thrown error here would reach the route error boundary and replace the page a shopper
 * was reading. The storefront renders a `/login` link instead of a toggle for a guest, so this
 * branch is defence in depth rather than the normal path: it is what a hand-made POST meets.
 *
 * `getUserId` is reused from `lib/cart-identity.ts` rather than re-deriving the session, for the
 * reason that module already records — one place that knows "who is this" beats two that can
 * disagree. Unlike the cart, no guest token is ever issued here.
 *
 * REVALIDATES ONE PATH, NOT THE LAYOUT. `revalidateCartSurfaces()` re-renders `/` as a layout
 * because the header's cart badge has to follow a cart write. No chrome shows a favourite count, so
 * the only server-rendered surface that can go stale is the listing page; the card updates itself
 * optimistically. Revalidating the whole layout on every heart tap would re-render every storefront
 * page for no visible gain.
 */
export async function toggleFavourite(productId: string): Promise<FavouriteToggleResult> {
  const userId = await getUserId();
  if (!userId) return { kind: "signed-out" };

  const outcome = await getFavouritesRepository().toggle(userId, productId);
  revalidatePath("/account/favourites");
  return { kind: outcome };
}
