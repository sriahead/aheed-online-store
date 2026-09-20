"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * A 3D stacked-card carousel: one card in front, the rest fanned behind it in 3D perspective,
 * advanced smoothly by pointer drag, arrow buttons or keyboard in an infinite loop.
 *
 * DELIBERATELY GENERIC. It knows nothing about what a card contains — no domain-specific
 * metrics, scores, opinions or entries, and no `lib/` import of any kind. Storefront callers
 * supply the content; this file supplies the behaviour. That separation is a requirement of #818
 * (R34), not a stylistic preference: any future feature that wants a card stack should not have
 * to disentangle it from domain models.
 *
 * ANIMATION & INTERACTION:
 * - 3D Card Peel Effect: Cards are arranged with CSS 3D perspective (1200px) and depth in Z.
 * - When advancing to the next card, the front card peels out to the side with 3D rotation
 *   and translation, while the cards behind it smoothly step forward in the stack.
 * - Infinite Loop: Cards cycle continuously without rewinding; exiting cards cycle to the
 *   back of the deck to advance endlessly.
 * - Interactive Drag: Pointer events track dragging in real time with proportional 3D tilt.
 *
 * ACCESSIBILITY:
 * - Every card stays in the DOM and readable in source order, never `display: none` and never
 *   `aria-hidden` — screen readers read the full set regardless of which card is in front.
 * - The stack itself takes focus (`tabIndex={0}`) with visible focus rings, driven by arrow keys.
 * - Position changes are announced through a polite live region.
 * - No timer auto-advance (front card never changes without user interaction).
 * - Under `prefers-reduced-motion: reduce` the whole stack becomes a plain scrollable row with
 *   zero transform animations.
 */

/** Visual geometry parameters for the 3D stack */
const OFFSET_X_PX = 16;
const OFFSET_Z_PX = -40;
const ROTATE_Y_DEG = 3.5;
const SCALE_STEP = 0.045;
const SWIPE_THRESHOLD_PX = 45;
const ANIMATION_DURATION_MS = 400;

export function CardStack({
  children,
  itemLabel,
}: {
  children: ReactNode[];
  /**
   * What is being stacked, for the controls' accessible names — e.g. "cards",
   * "offers". Required rather than defaulted, for the reason in the docstring above.
   */
  itemLabel: string;
}) {
  const [active, setActive] = useState(0);
  const [exiting, setExiting] = useState<{ index: number; direction: "next" | "prev" } | null>(
    null,
  );
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const dragStartX = useRef<number | null>(null);
  const isAnimating = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveRegionId = useId();

  const count = children.length;

  // Clean up any pending transition timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const go = useCallback(
    (delta: number) => {
      if (count <= 1) return;
      if (isAnimating.current) return;

      const direction = delta > 0 ? "next" : "prev";
      const currentActive = active;
      const nextActive = (currentActive + delta + count) % count;

      isAnimating.current = true;
      setExiting({ index: currentActive, direction });
      setActive(nextActive);

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setExiting(null);
        isAnimating.current = false;
      }, ANIMATION_DURATION_MS);
    },
    [active, count],
  );

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
    if (count <= 1 || isAnimating.current) return;
    dragStartX.current = event.clientX;
    setIsDragging(true);
    setDragOffset(0);
    try {
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    } catch {
      // ignore
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!isDragging || dragStartX.current === null) return;
    const dx = event.clientX - dragStartX.current;
    setDragOffset(dx);
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    } catch {
      // ignore
    }
    const currentOffset = dragOffset;
    setIsDragging(false);
    dragStartX.current = null;
    setDragOffset(0);

    if (currentOffset < -SWIPE_THRESHOLD_PX) {
      go(1);
    } else if (currentOffset > SWIPE_THRESHOLD_PX) {
      go(-1);
    }
  };

  const onPointerCancel = () => {
    setIsDragging(false);
    dragStartX.current = null;
    setDragOffset(0);
  };

  if (count === 0) return null;

  return (
    <div className="relative w-full overflow-hidden px-1 py-2">
      {/*
        eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions --
        Under `prefers-reduced-motion: reduce` this container becomes a horizontally
        SCROLLABLE region (see .card-stack in globals.css). A scrollable region must be
        reachable and operable by keyboard — WCAG 2.1.1 — and `tabIndex={0}` on a scroll
        container provides that accessibility. Paired with visible controls below.
      */}
      <div
        className="card-stack mx-auto w-[calc(100%-2rem)] max-w-2xl"
        role="group"
        aria-roledescription="carousel"
        aria-label={itemLabel}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- see comment above
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {children.map((child, index) => {
          const isExitingCard = exiting !== null && exiting.index === index;
          const depth = (index - active + count) % count;
          const isFront = depth === 0 && !isExitingCard;

          // Compute 3D transforms
          let transformStr = "";
          let opacityVal = 1;
          let zIndexVal = count - depth;
          const transitionStr =
            isDragging && isFront
              ? "none"
              : `transform ${ANIMATION_DURATION_MS}ms cubic-bezier(0.25, 1, 0.5, 1), opacity ${ANIMATION_DURATION_MS - 50}ms ease-out`;

          if (isExitingCard) {
            // Card peeling off the front
            const exitDirection = exiting.direction === "next" ? -1 : 1;
            transformStr = `translate3d(${exitDirection * 108}%, 0px, -60px) rotateY(${exitDirection * -42}deg) rotateZ(${exitDirection * -4}deg) scale(0.94)`;
            opacityVal = 0;
            zIndexVal = count + 5;
          } else if (isFront) {
            // Front card (interactive with drag offset)
            if (isDragging && dragOffset !== 0) {
              const dragRotateY = -dragOffset * 0.08;
              const dragRotateZ = dragOffset * 0.02;
              transformStr = `translate3d(${dragOffset}px, 0px, 0px) rotateY(${dragRotateY}deg) rotateZ(${dragRotateZ}deg) scale(1)`;
            } else {
              transformStr = "translate3d(0px, 0px, 0px) rotateY(0deg) scale(1)";
            }
            opacityVal = 1;
            zIndexVal = count + 2;
          } else {
            // Behind cards in the stack
            const dragProgress =
              isDragging && Math.abs(dragOffset) > 0 ? Math.min(Math.abs(dragOffset) / 200, 1) : 0;

            // Step forward proportionally while dragging
            const effectiveDepth = Math.max(0, depth - dragProgress);
            const xOffset = effectiveDepth * OFFSET_X_PX;
            const zOffset = effectiveDepth * OFFSET_Z_PX;
            const yRotation = effectiveDepth * ROTATE_Y_DEG;
            const scaleVal = 1 - effectiveDepth * SCALE_STEP;

            transformStr = `translate3d(${xOffset}px, 0px, ${zOffset}px) scale(${scaleVal}) rotateY(${yRotation}deg)`;
            opacityVal = depth > 3 ? 0 : depth === 3 ? 0.4 : depth === 2 ? 0.75 : 0.92;
            zIndexVal = count - depth;
          }

          return (
            <div
              key={index}
              className="card-stack-item relative overflow-hidden"
              style={{
                transform: transformStr,
                zIndex: zIndexVal,
                opacity: opacityVal,
                pointerEvents: isFront ? "auto" : "none",
                transition: transitionStr,
              }}
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${count}`}
            >
              {child}
              {/* Depth shadow overlay: dims cards further back in the deck */}
              <div
                className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300"
                style={{
                  backgroundColor: "black",
                  opacity: isExitingCard ? 0 : Math.min(depth * 0.06, 0.18),
                }}
                aria-hidden="true"
              />
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

      <p id={liveRegionId} aria-live="polite" className="sr-only">
        {`${itemLabel} ${active + 1} of ${count}`}
      </p>
    </div>
  );
}
