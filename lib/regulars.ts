/**
 * Regulars (#1186).
 *
 * The page at `/account/regulars` is a placeholder, and deliberately so: "regularly ordered" has no
 * definition yet, and the data cannot be queried without one. A derivation needs a threshold (how
 * many orders make a regular), a window (all time, or rolling — without one, a product bought
 * weekly for a year and then abandoned stays "regular" forever), vendor scoping (per ADR-004 a
 * shopper may hold orders with more than one vendor, so it is per `vendorId`), a ruling on which
 * order states count (`#795` found a cancelled-but-unrefunded order drops money that is still in
 * the bank; the same question applies to a line item), and somewhere to bound or cache a
 * per-shopper aggregate over order history. All five are out of this slice's scope and need their
 * own `/propose` before anything reads `OrderItem`.
 *
 * This module exists now so the derivation has a home later, and so the one string the page renders
 * lives in one place.
 */

/**
 * Shown on `/account/regulars` until a derivation exists.
 *
 * Exported so the page and its test assert against one string rather than two copies of it, the
 * same reason `FAVOURITES_EMPTY_MESSAGE` is exported from `lib/favourites.ts`. Names no vendor and
 * no product category, per the standing vendor-neutral copy rule — Aheed sells groceries and
 * SriMart electronics, and "once you start shopping" is true for both.
 *
 * The page is authenticated-only, so this is never shown to a guest: a signed-out visitor is
 * redirected to `/login` and never reads an empty state that implies they have no regulars.
 */
export const REGULARS_PLACEHOLDER_MESSAGE =
  "Your regularly ordered items will appear here once you start shopping.";
