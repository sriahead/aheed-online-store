"use client";

import { useRef, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * The shop page's one horizontal-scroll affordance (#511).
 *
 * Extracted from `DepartmentScroller`, which was the only row on `/categories`
 * that scrolled while the two product rows and the bundle row were wrapping
 * grids — so the page read as two designs meeting rather than one page. This
 * holds the behaviour (arrow buttons driving `scrollBy`, a hidden scrollbar,
 * native touch/trackpad scrolling as the no-JS fallback) and nothing about what
 * is being scrolled.
 *
 * A client component because the arrows need `useRef` and a click handler.
 * Items arrive as `children`, rendered on the server and passed through the
 * boundary, so `ProductRow` and `BundleRow` stay server components and no card
 * is pulled into the browser bundle by this.
 */
export function HorizontalScroller({
  children,
  itemLabel,
  as = "div",
  step,
  itemWidthClassName,
  arrowPositionClassName = "top-1/2 -translate-y-1/2",
}: {
  children: ReactNode;
  /**
   * What is being scrolled, for the arrows' accessible names — "departments",
   * "products", "bundles". Required rather than defaulted: two rows on the same
   * page whose only controls are both called "Scroll right" are indistinguishable
   * to a screen reader.
   */
  itemLabel: string;
  /**
   * The track element. `ul` when the children are `<li>` (BundleCard renders
   * one), `div` otherwise. The scroll container and the items' parent have to be
   * the same element, so this cannot be solved by nesting a list inside a div.
   */
  as?: "div" | "ul";
  /**
   * Pixels per arrow press. Omitted, it scrolls ~90% of the visible width, which
   * adapts to card size and viewport. `DepartmentScroller` passes its original
   * 260 so its feel is unchanged by this extraction.
   */
  step?: number;
  /** Per-caller item sizing, applied to direct children so cards need no width of their own. */
  itemWidthClassName?: string;
  /** Vertical placement of the arrows; departments sit theirs against the icon row. */
  arrowPositionClassName?: string;
}) {
  // Callback ref rather than `useRef<HTMLDivElement>`: the track is a `ul` or a
  // `div` depending on the children, and `scrollBy` lives on Element, so typing
  // it as HTMLElement avoids a cast at the render site.
  const trackRef = useRef<HTMLElement | null>(null);

  const nudge = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const distance = step ?? Math.max(200, Math.round(track.clientWidth * 0.9));
    track.scrollBy({ left: direction * distance, behavior: "smooth" });
  };

  const trackClassName = [
    "no-scrollbar flex items-stretch gap-4 overflow-x-auto scroll-smooth",
    itemWidthClassName ?? "",
  ]
    .join(" ")
    .trim();

  const setTrack = (element: HTMLElement | null) => {
    trackRef.current = element;
  };

  const arrowClassName = `absolute z-10 flex h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-white text-primary shadow hover:bg-surface-muted ${arrowPositionClassName}`;

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Scroll ${itemLabel} left`}
        onClick={() => nudge(-1)}
        className={`left-0 -translate-x-1/2 ${arrowClassName}`}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>

      {as === "ul" ? (
        <ul ref={setTrack} className={trackClassName}>
          {children}
        </ul>
      ) : (
        <div ref={setTrack} className={trackClassName}>
          {children}
        </div>
      )}

      <button
        type="button"
        aria-label={`Scroll ${itemLabel} right`}
        onClick={() => nudge(1)}
        className={`right-0 translate-x-1/2 ${arrowClassName}`}
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
