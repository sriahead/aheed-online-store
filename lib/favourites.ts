/**
 * Favourites types and copy shared between the server action, the card control and the listing page
 * (#232).
 *
 * A PLAIN MODULE, on purpose. `features/favourites/toggle-favourite.ts` is a `"use server"` file and
 * may export only async functions — enforced at runtime, so a stray exported constant there leaves
 * every check green while every action in the file 500s for every caller. Anything that is not an
 * async function therefore lives here.
 *
 * There is no duplicate-key predicate in this file. The guard reuses the shared
 * `isUniqueViolation` from `lib/repositories/prisma-errors.ts`, which already accepts both codes the
 * two adapters report (raw SQLSTATE `"23505"` and Prisma's `P2002`) and already has its own test.
 * That module's docstring records that a second copy of those literals is how two call sites drift.
 */

/**
 * What a toggle did. `signed-out` is a real outcome rather than an error: favourites are
 * authenticated-only, and a guest reaching the action at all means a hand-made POST, which should be
 * refused quietly rather than thrown into the route error boundary.
 */
export type FavouriteToggleResult = { kind: "added" | "removed" | "signed-out" };

/**
 * The three states the card's control can be in, as ONE prop rather than a pair of booleans.
 *
 * `isFavourite` plus `canFavourite` would admit a fourth, meaningless combination — favourited but
 * signed out — that every reader of the component would then have to decide what to do with. One
 * union cannot express it.
 */
export type FavouriteState = "on" | "off" | "signed-out";

/** The accessible name for the control, which is also the only name it has — the icon is decorative. */
export function favouriteControlLabel(state: FavouriteState, productName: string): string {
  if (state === "signed-out") return `Sign in to save ${productName} to your favourites`;
  if (state === "on") return `Remove ${productName} from your favourites`;
  return `Save ${productName} to your favourites`;
}

/**
 * Shown on `/account/favourites` when the shopper has nothing saved.
 *
 * Exported so the page and its test assert against one string rather than two copies of it. Names
 * no vendor and no product category, per the standing vendor-neutral copy rule — Aheed sells
 * groceries and SriMart electronics, and "the heart icon on any product" is true for both.
 */
export const FAVOURITES_EMPTY_MESSAGE =
  "No favourites yet. Tap the heart icon on any product to add it here.";
