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

/**
 * A 3D stacked-card carousel: one card in front, the rest visibly stacked behind it
 * in 3D perspective, advanced smoothly by clicking, pointer drag/swipe, pagination pills,
 * or keyboard in an infinite loop.
 *
 * DELIBERATELY GENERIC. It knows nothing about what a card contains — no domain-specific
 * metrics, scores, opinions or entries, and no `lib/` import of any kind. Storefront callers
 * supply the content; this file supplies the behaviour. That separation is a requirement of #818
 * (R34), not a stylistic preference: any future feature that wants a card stack should not have
 * to disentangle it from domain models.
 *
 * ANIMATION & INTERACTION:
 * - 3D Card Stack: Cards are stacked with tiered vertical offset (Y) and depth (Z)
 *   so cards behind clearly peek out above the front card, revealing their distinct color
 *   borders and headers.
 * - When advancing, the active card smoothly peels away with 3D rotation and translation,
 *   while the cards behind it glide forward into position.
 * - Infinite Loop: Cards cycle continuously without rewinding; exiting cards cycle to the
 *   back of the deck to advance endlessly.
 * - Direct Interaction: Clicking the active card advances to the next review; clicking
 *   a peeking background card immediately brings it to the front. Pointer drag/swipe
 *   and pagination pills provide tactile direct manipulation.
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
const STACK_OFFSET_Y_PX = -22;
const STACK_OFFSET_Z_PX = -35;
const STACK_SCALE_STEP = 0.045;
const SWIPE_THRESHOLD_PX = 40;
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
  const hasDragged = useRef(false);
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

  const handleCardClick = (depth: number) => {
    if (hasDragged.current || isAnimating.current || count <= 1) return;
    if (depth === 0) {
      go(1);
    } else {
      go(depth);
    }
  };

  const onContainerClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (hasDragged.current || isAnimating.current || count <= 1) return;
    const target = event.target as HTMLElement | null;
    const slideEl = target?.closest("[data-slide-depth]");
    if (slideEl) {
      const d = Number(slideEl.getAttribute("data-slide-depth"));
      if (!Number.isNaN(d)) {
        handleCardClick(d);
      }
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      go(-1);
    } else if (
      event.key === "ArrowRight" ||
      event.key === "ArrowDown" ||
      event.key === " " ||
      event.key === "Enter"
    ) {
      event.preventDefault();
      go(1);
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (count <= 1 || isAnimating.current) return;
    dragStartX.current = event.clientX;
    hasDragged.current = false;
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
    if (Math.abs(dx) > 5) {
      hasDragged.current = true;
    }
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
    <div className="relative w-full overflow-hidden px-1 pt-12 pb-2">
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
        onClick={onContainerClick}
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
              : `transform ${ANIMATION_DURATION_MS}ms cubic-bezier(0.2, 0.9, 0.3, 1), opacity ${ANIMATION_DURATION_MS - 40}ms ease-out`;

          if (isExitingCard) {
            // Card peeling off the front
            const exitDirection = exiting.direction === "next" ? -1 : 1;
            transformStr = `translate3d(${exitDirection * 110}%, -12px, 30px) rotateY(${exitDirection * -26}deg) rotateZ(${exitDirection * -5}deg) scale(0.96)`;
            opacityVal = 0;
            zIndexVal = count + 5;
          } else if (isFront) {
            // Front card (interactive with drag offset)
            if (isDragging && dragOffset !== 0) {
              const dragRotateY = -dragOffset * 0.06;
              const dragRotateZ = dragOffset * 0.02;
              transformStr = `translate3d(${dragOffset}px, 0px, 0px) rotateY(${dragRotateY}deg) rotateZ(${dragRotateZ}deg) scale(1)`;
            } else {
              transformStr = "translate3d(0px, 0px, 0px) scale(1)";
            }
            opacityVal = 1;
            zIndexVal = count + 2;
          } else {
            // Visible stacked cards tiered above and behind
            const dragProgress =
              isDragging && Math.abs(dragOffset) > 0 ? Math.min(Math.abs(dragOffset) / 180, 1) : 0;

            // Step forward proportionally while dragging
            const effectiveDepth = Math.max(0, depth - dragProgress);
            const yOffset = effectiveDepth * STACK_OFFSET_Y_PX;
            const zOffset = effectiveDepth * STACK_OFFSET_Z_PX;
            const scaleVal = 1 - effectiveDepth * STACK_SCALE_STEP;

            transformStr = `translate3d(0px, ${yOffset}px, ${zOffset}px) scale(${scaleVal})`;
            opacityVal = depth > 3 ? 0 : depth === 3 ? 0.65 : depth === 2 ? 0.88 : 0.96;
            zIndexVal = count - depth;
          }

          return (
            <div
              key={index}
              data-slide-depth={depth}
              data-slide-index={index}
              className={`card-stack-item relative overflow-hidden select-none ${
                isFront || depth <= 2 ? "cursor-pointer" : ""
              }`}
              style={{
                transform: transformStr,
                zIndex: zIndexVal,
                opacity: opacityVal,
                pointerEvents: depth <= 2 ? "auto" : "none",
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
                  opacity: isExitingCard ? 0 : Math.min(depth * 0.05, 0.15),
                }}
                aria-hidden="true"
              />
            </div>
          );
        })}
      </div>

      {/* Navigation: pagination indicator pills and "X / total" counter */}
      <div className="mt-5 flex flex-col items-center justify-center gap-2.5">
        {count > 1 && (
          <div
            className="flex items-center justify-center gap-1.5"
            role="tablist"
            aria-label={`${itemLabel} pagination`}
          >
            {Array.from({ length: count }).map((_, idx) => (
              <button
                key={idx}
                type="button"
                role="tab"
                aria-selected={idx === active}
                aria-label={`Go to ${itemLabel} ${idx + 1} of ${count}`}
                onClick={() => {
                  if (idx === active || isAnimating.current) return;
                  const diff = (idx - active + count) % count;
                  go(diff);
                }}
                className={`h-1.5 rounded-full transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-1 ${
                  idx === active ? "w-6 bg-primary" : "w-1.5 bg-primary/25 hover:bg-primary/50"
                }`}
              />
            ))}
          </div>
        )}

        <p className="text-xs font-semibold uppercase tracking-wider text-primary-muted tabular-nums">
          {active + 1} / {count}
        </p>
      </div>

      <p id={liveRegionId} aria-live="polite" className="sr-only">
        {`${itemLabel} ${active + 1} of ${count}`}
      </p>
    </div>
  );
}
