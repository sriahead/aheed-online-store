"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { categoryIcon } from "@/components/product/category-icon";
import { formatPrice } from "@/components/product/format-price";
import { composePublicUrl } from "@/lib/storage";

/**
 * P8.5b (#346) — the homepage's department hero.
 *
 * Replaces `PromoCarousel`. Departments, their names and their order all come
 * from `listTopLevel()`, and each panel's price callout names a real product at
 * its real price. Nothing here is hardcoded copy: #239 is the precedent, where
 * a hero literal ("Free Delivery Over £30") was accidentally true for the
 * vendor it was written for and wrong for the other, so the string was hiding a
 * data bug rather than merely a copy one.
 *
 * IMAGE-OPTIONAL BY DESIGN. `Category` has no image field, and #279 records
 * that no vendor artwork exists at all — so a photographic hero could not ship
 * today. Each panel falls back to `categoryIcon()`'s existing slug-to-lucide
 * mapping, which already handles unknown slugs. `imageKey` is accepted now so
 * that adding `Category.imageKey` later needs no change to this component.
 *
 * ACCESSIBILITY (WCAG SC 2.2.2) IS CARRIED FROM PromoCarousel, NOT FROM THE
 * PROTOTYPE. `docs/ui-ref-revised/src/components/FlipBookHero.tsx` auto-advances
 * every 5.5s and pauses on hover only — no pause control, no keyboard handling,
 * no reduced-motion support. Hover is not reachable by keyboard, so that fails
 * the criterion outright. This component keeps the contract PromoCarousel
 * established: an always-visible pause control with an accessible name,
 * rotation paused on hover AND on keyboard focus, and no rotation at all under
 * `prefers-reduced-motion`. No lint rule checks any of this.
 */

export interface HeroDepartment {
  id: string;
  slug: string;
  name: string;
  /** Reserved for a future `Category.imageKey`; the icon renders when absent. */
  imageKey?: string | null;
  /** Alt text for `imageKey`, when one exists. */
  altText?: string | null;
  spotlight?: {
    name: string;
    slug: string;
    basePrice: number;
    originalPrice: number | null;
    unitLabel: string;
  } | null;
}

const ROTATE_MS = 6000;

/**
 * Cycled per panel so consecutive departments differ. All three are semantic
 * tokens that `brandStyle()` overrides per vendor and clamps for AA against
 * white, so the panel text is guaranteed readable for any vendor palette —
 * which a hardcoded emerald, as in the prototype, would not be.
 */
const PANEL_TONES = ["bg-primary", "bg-action", "bg-accent"] as const;

export function DepartmentHero({
  departments,
  cdnBaseUrl,
}: {
  departments: readonly HeroDepartment[];
  cdnBaseUrl: string | null;
}) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const reducedMotion = useRef(false);

  const count = departments.length;

  useEffect(() => {
    reducedMotion.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    if (reducedMotion.current) setPaused(true);
  }, []);

  useEffect(() => {
    if (count < 2 || paused || interactionPaused) return;
    const timer = setInterval(() => setCurrent((prev) => (prev + 1) % count), ROTATE_MS);
    return () => clearInterval(timer);
  }, [count, paused, interactionPaused]);

  const go = useCallback(
    (delta: number) => setCurrent((prev) => (prev + delta + count) % count),
    [count],
  );

  // A vendor with no active top-level categories renders no hero at all, rather
  // than an empty bordered well (R6). The parent guards too; this keeps the
  // component safe to reuse.
  if (count === 0) return null;

  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-black/10 shadow-lg"
      role="region"
      aria-roledescription="carousel"
      aria-label="Shop by department"
      onMouseEnter={() => setInteractionPaused(true)}
      onMouseLeave={() => setInteractionPaused(false)}
      onFocus={() => setInteractionPaused(true)}
      onBlur={() => setInteractionPaused(false)}
    >
      <div
        className="flex transition-transform duration-700 ease-in-out"
        style={{ transform: `translateX(-${current * 100}%)` }}
      >
        {departments.map((department, index) => {
          const Icon = categoryIcon(department.slug);
          const imageUrl =
            department.imageKey && cdnBaseUrl
              ? composePublicUrl(cdnBaseUrl, department.imageKey)
              : null;
          const isCurrent = index === current;

          return (
            <div
              key={department.id}
              className={`dept-panel relative w-full shrink-0 ${PANEL_TONES[index % PANEL_TONES.length]} p-6 md:p-10`}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${count}`}
              aria-hidden={!isCurrent}
            >
              {/*
                The chevron cutout. The polygon and its expand-on-hover live in
                app/globals.css (.dept-chevron), not here: an inline clipPath
                style cannot be overridden by a Tailwind hover variant, which is
                how an earlier draft of this ended up with a `group-hover:` that
                had no `group` ancestor and therefore never fired.
              */}
              <div
                className="dept-chevron pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-white/10"
                aria-hidden
              />

              <div className="relative z-10 flex items-center justify-between gap-6">
                <div className="max-w-lg text-white">
                  <p className="mb-2 text-xs font-semibold tracking-wide text-white/80 uppercase">
                    Department {index + 1} of {count}
                  </p>
                  <h2 className="mb-3 text-2xl font-extrabold md:text-4xl">{department.name}</h2>

                  {department.spotlight ? (
                    /*
                      The live price callout. Every value is read from a real
                      product row — no invented offer copy.
                    */
                    <div className="mb-4 inline-flex flex-wrap items-baseline gap-2 rounded-xl bg-black/25 px-3 py-2 backdrop-blur">
                      <span className="text-sm font-semibold">{department.spotlight.name}</span>
                      <span className="text-lg font-extrabold">
                        {formatPrice(department.spotlight.basePrice)}
                      </span>
                      {department.spotlight.originalPrice !== null &&
                        department.spotlight.originalPrice > department.spotlight.basePrice && (
                          <span className="text-xs text-white/70 line-through">
                            {formatPrice(department.spotlight.originalPrice)}
                          </span>
                        )}
                      <span className="text-xs text-white/70">
                        {department.spotlight.unitLabel}
                      </span>
                    </div>
                  ) : (
                    /*
                      A department whose products fall outside the spotlight
                      query's bounded window shows no callout rather than a
                      placeholder price.
                    */
                    <p className="mb-4 text-sm text-white/80">Browse the full range.</p>
                  )}

                  <div>
                    <Link
                      href={`/categories/${department.slug}`}
                      tabIndex={isCurrent ? undefined : -1}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-bold text-primary shadow-sm transition-transform hover:bg-surface-muted active:scale-95"
                    >
                      Shop {department.name}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </div>
                </div>

                <div className="hidden shrink-0 sm:block">
                  {imageUrl ? (
                    // Plain <img> by decision (#46), like every other storefront
                    // image. Empty alt when the row supplies none: the heading
                    // beside it already carries the meaning.
                    <img
                      src={imageUrl}
                      alt={department.altText ?? ""}
                      width={160}
                      height={160}
                      className="h-32 w-32 rounded-2xl object-cover md:h-40 md:w-40"
                    />
                  ) : (
                    <Icon
                      className="h-24 w-24 text-white/85 md:h-32 md:w-32"
                      strokeWidth={1.25}
                      aria-hidden
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            className="absolute top-1/2 left-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur transition-colors hover:bg-black/50"
            aria-label="Previous department"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            className="absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur transition-colors hover:bg-black/50"
            aria-label="Next department"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>

          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2">
            {/* SC 2.2.2. Always visible, never hover-revealed: a control a
                keyboard or touch user cannot find does not satisfy the
                criterion. This is the half the prototype omits entirely. */}
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur transition-colors hover:bg-black/50"
              aria-label={paused ? "Resume department rotation" : "Pause department rotation"}
            >
              {paused ? (
                <Play className="h-3 w-3" aria-hidden />
              ) : (
                <Pause className="h-3 w-3" aria-hidden />
              )}
            </button>

            {/* `width` named explicitly — Tailwind v4's default `transition`
                property list has no `width` (#326). This row is absolutely
                positioned, so animating it cannot move page layout. */}
            {departments.map((department, index) => (
              <button
                key={department.id}
                type="button"
                onClick={() => setCurrent(index)}
                className={`h-2 rounded-full transition-[width,background-color] duration-300 ${
                  index === current ? "w-4 bg-white" : "w-2 bg-white/50 hover:bg-white/80"
                }`}
                aria-label={`Show ${department.name}`}
                aria-current={index === current}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
