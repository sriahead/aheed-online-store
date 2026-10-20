"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import { toggleFavourite } from "@/features/favourites/toggle-favourite";
import { favouriteControlLabel, type FavouriteState } from "@/lib/favourites";

/**
 * The product card's favourite control (#232).
 *
 * PLACEMENT IS NOT A FREE CHOICE, and this is the whole reason the class list looks odd. The card's
 * top-right corner is ALREADY the below-`sm` quick-view button
 * (`ProductCard.tsx`, `sm:hidden absolute top-0 right-0`), and the top-LEFT holds the
 * Halal/Fresh/Offer badges. So this control sits inboard below `sm` and takes the corner itself
 * from `sm` up (`sm:right-0`), where the quick-view button is hidden because quick view moves into
 * the hover overlay. Changing either half without the other makes two hit areas overlap on a phone,
 * which is invisible in a desktop browser.
 *
 * THE INBOARD OFFSET IS 48px (`right-12`), NOT THE 44px TAP TOKEN, AND THAT IS MEASURED RATHER THAN
 * CHOSEN. `right-tap` (44px) was the obvious value and it was WRONG: validation pass 1 measured
 * both controls at **46px wide**, not 44, because neither sits inside `.skew-card-inner` and the
 * card's skew widens their bounding boxes. At a 44px offset the heart's right edge landed 2px
 * inside the quick-view button (heart left 87 + width 46 = 133; eye left 131), so a tap on the
 * eye's leftmost 2px favourited instead. 48px clears the eye's rendered 46px with 2px to spare.
 * Counter-skewing this control would not have helped — the EYE is the wide one, and it is #961's
 * geometry, deliberately placed. Re-measure with
 * `npx tsx scripts/verify-mobile-layout.ts --widths 360 --measure` if the card's skew ever changes.
 *
 * The 44px box is the HIT AREA; the visible circle inside stays 28px — the same two-layer shape
 * `#961` used for the quick-view button, so the two line up at the corner.
 *
 * `type="button"` plus `preventDefault()` guards against an enclosing `<form>`'s default submit.
 * There is no ancestor anchor to swallow a click any more: since `#955` the card's only link is on
 * the title text, with no `after:inset-0` overlay — see `ProductCard.tsx`'s docstring.
 */
export function FavouriteButton({
  productId,
  productName,
  state,
}: {
  productId: string;
  /** Names the control. Required: never a placeholder, and never a vendor's product. */
  productName: string;
  state: FavouriteState;
}) {
  // The server's view, adopted on every render it changes — the same "adjusting state when a prop
  // changes" pattern `CartQuantityStepper` uses, done during render rather than in an effect so a
  // revalidation does not cascade an extra render per card.
  const [lastServerState, setLastServerState] = useState(state);
  const [displayed, setDisplayed] = useState(state);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  if (state !== lastServerState) {
    setLastServerState(state);
    setDisplayed(state);
    setFailed(false);
  }

  const POSITION =
    "absolute top-0 right-12 sm:right-0 z-20 flex size-tap items-center justify-center rounded-full";

  // A guest gets a LINK, not a disabled button. Favourites are authenticated-only, and "sign in to
  // do this" is a navigation, so the control that performs it should be an anchor a shopper can
  // middle-click and a screen reader announces as a link. The same split `/shop-your-list` makes
  // with its `canSave` prop.
  if (displayed === "signed-out") {
    return (
      <Link
        href="/login"
        data-tap-surface="product-card-favourite"
        aria-label={favouriteControlLabel("signed-out", productName)}
        className={POSITION}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-primary shadow-md backdrop-blur-xs">
          <Heart className="h-4 w-4" aria-hidden />
        </span>
      </Link>
    );
  }

  const on = displayed === "on";

  function onClick(event: React.MouseEvent) {
    event.preventDefault();
    if (pending) return;

    // Optimistic, because a heart that waits for a round trip reads as broken. The revert below is
    // what keeps that honest.
    const next: FavouriteState = on ? "off" : "on";
    setDisplayed(next);
    setFailed(false);

    startTransition(async () => {
      let result: Awaited<ReturnType<typeof toggleFavourite>> | null;
      try {
        result = await toggleFavourite(productId);
      } catch {
        result = null;
      }
      // A rejected call, or a session that expired between render and tap, both land back on what
      // the server last told us rather than stranding a state it does not hold.
      if (!result || result.kind === "signed-out") {
        setDisplayed(lastServerState);
        setFailed(true);
        return;
      }
      setDisplayed(result.kind === "added" ? "on" : "off");
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      data-tap-surface="product-card-favourite"
      aria-pressed={on}
      aria-label={favouriteControlLabel(displayed, productName)}
      className={POSITION}
    >
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-md backdrop-blur-xs transition ${
          on ? "text-action" : "text-primary"
        } ${failed ? "ring-2 ring-danger" : ""}`}
      >
        <Heart className={`h-4 w-4 ${on ? "fill-current" : ""}`} aria-hidden />
      </span>
    </button>
  );
}
