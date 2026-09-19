"use client";

import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * A stacked-card slider: one card in front, the rest fanned behind it, advanced by drag,
 * arrow buttons or the keyboard.
 *
 * DELIBERATELY GENERIC. It knows nothing about what a card contains — no feedback, no
 * ratings, no reviews, no `lib/` import of any kind. `components/storefront/
 * CustomerFeedbackCards.tsx` supplies the content; this file supplies the behaviour. That
 * separation is a requirement of #818 (R32/R34), not a stylistic preference: the next thing
 * that wants a card stack should not have to disentangle it from feedback.
 *
 * WHY NO LIBRARY. The design reference is Swiper-based, and Swiper is a real client bundle
 * on a landing page whose LCP was fought from roughly 12s down to a 2.5s target (#243). The
 * behaviour here is CSS transforms plus Pointer Events, which also keeps full control of
 * focus order and the reduced-motion path — the two things a wrapper usually takes away.
 *
 * `itemLabel` is REQUIRED, following `components/layout/HorizontalScroller.tsx`: two stacks
 * on one page whose only controls are both called "Previous" are indistinguishable to a
 * screen reader.
 *
 * ACCESSIBILITY, stated here because most of it is invisible in the markup:
 * - Every card stays in the DOM and readable, in source order. Cards behind the front one
 *   are moved with `transform` and dimmed, never `display: none` and never `aria-hidden` —
 *   a screen-reader user reads the whole set regardless of which card is in front.
 * - THE STACK ITSELF takes focus (`tabIndex={0}`) and arrow keys drive it; the cards do
 *   not. #818's R40 originally asked for every card to be individually tabbable, which on
 *   inspection specifies an anti-pattern: the cards hold static text, making static text
 *   focusable is a known screen-reader nuisance, and cards fanned behind the front one are
 *   visually hidden, so tabbing would land focus on something the sighted user cannot see.
 *   R40 was amended during build to the standard focusable-container pattern — recorded in
 *   the build notes rather than changed quietly.
 * - Position changes are announced through a polite live region.
 * - Nothing advances on a timer, so there is no pause control to need.
 * - Under `prefers-reduced-motion: reduce` the whole stack becomes a plain scrollable row.
 *   That is done with a real CSS media query in `globals.css` (`.card-stack` /
 *   `.card-stack-item`) rather than a JS check, because the class-scoped opt-out this
 *   project already had was found missing 24 utility transforms — a media query cannot
 *   forget a transform the way an opt-out class can.
 */

/** How far back each card behind the front one sits, in pixels and degrees. */
const OFFSET_PX = 14;
const SCALE_STEP = 0.04;
/** Drag distance, in pixels, past which a pointer release advances the stack. */
const SWIPE_THRESHOLD_PX = 60;

export function CardStack({
  children,
  itemLabel,
}: {
  children: ReactNode[];
  /**
   * What is being stacked, for the controls' accessible names — "customer feedback",
   * "offers". Required rather than defaulted, for the reason in the docstring above.
   */
  itemLabel: string;
}) {
  const [active, setActive] = useState(0);
  const dragStartX = useRef<number | null>(null);
  const liveRegionId = useId();

  const count = children.length;
  if (count === 0) return null;

  const go = (delta: number) => {
    setActive((current) => {
      const next = current + delta;
      if (next < 0) return count - 1;
      if (next >= count) return 0;
      return next;
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      go(1);
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragStartX.current = event.clientX;
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = dragStartX.current;
    dragStartX.current = null;
    if (start === null) return;

    const travelled = event.clientX - start;
    if (Math.abs(travelled) < SWIPE_THRESHOLD_PX) return;
    go(travelled < 0 ? 1 : -1);
  };

  return (
    <div className="relative">
      {/*
        eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions --
        Both this rule and no-noninteractive-tabindex below are false positives for this
        element, and the second is the interesting one.
        Under `prefers-reduced-motion: reduce` this container becomes a horizontally
        SCROLLABLE region (see .card-stack in globals.css). A scrollable region must be
        reachable and operable by keyboard — WCAG 2.1.1 — and `tabIndex={0}` on a scroll
        container is the recommended way to provide that, not something to avoid. Removing it
        to satisfy the linter would make the reduced-motion path unreachable by keyboard,
        which is the opposite of what the rule exists to protect. The keyboard listener is
        paired with the visible previous/next buttons below, so the behaviour is also
        available through ordinary interactive controls.
      */}
      <div
        className="card-stack"
        role="group"
        aria-roledescription="carousel"
        aria-label={itemLabel}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- see the comment above
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragStartX.current = null;
        }}
      >
        {children.map((child, index) => {
          // Distance from the front card, wrapping, so the stack fans in one direction and
          // the card just behind the last one is the first, not a gap.
          const depth = (index - active + count) % count;
          const isFront = depth === 0;

          return (
            <div
              // Index is a stable key here: the array is a fixed, ordered set for the life
              // of the render, and nothing reorders or splices it.
              key={index}
              className="card-stack-item"
              style={{
                // Inline because the values are computed per card from `depth`; a Tailwind
                // class cannot express an arbitrary per-item transform. Colour and radius
                // still come from tokens inside the card itself.
                transform: `translateX(${depth * OFFSET_PX}px) scale(${1 - depth * SCALE_STEP})`,
                zIndex: count - depth,
                opacity: depth > 2 ? 0 : 1,
                pointerEvents: isFront ? "auto" : "none",
              }}
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${count}`}
            >
              {child}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label={`Previous ${itemLabel}`}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white text-primary shadow-sm transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>

        <p className="text-sm font-medium text-primary-muted tabular-nums">
          {active + 1} / {count}
        </p>

        <button
          type="button"
          onClick={() => go(1)}
          aria-label={`Next ${itemLabel}`}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white text-primary shadow-sm transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/*
        Polite, not assertive: a position change is a confirmation of something the user just
        did, not an interruption worth cutting across whatever they are reading.
      */}
      <p id={liveRegionId} aria-live="polite" className="sr-only">
        {`${itemLabel} ${active + 1} of ${count}`}
      </p>
    </div>
  );
}
