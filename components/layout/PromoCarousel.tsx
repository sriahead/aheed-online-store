"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import type { Promotion } from "@/lib/repositories/promotions";
import { composePublicUrl } from "@/lib/storage";

/**
 * The homepage hero's promotions carousel (P7.5c+f, #233).
 *
 * Replaces `PromoSlider`, which held a hardcoded array of three invented offers
 * ("20% off all fresh produce") that rendered for EVERY vendor and advertised
 * discounts nothing in the discounts engine backed. Everything shown here comes
 * from that vendor's own `VendorPromotion` rows.
 *
 * TOKENS, NOT LITERALS. The old component used raw Tailwind gradients
 * (`from-amber-500`, `from-emerald-600`), so it ignored vendor branding
 * entirely. Slide backgrounds now cycle through the semantic tokens, which means
 * they follow each vendor's palette — and, since P7.5c+f, are contrast-clamped,
 * so white slide text is guaranteed AA against all three.
 *
 * ACCESSIBILITY IS THE REASON THIS IS NOT A COPY OF THE OLD FILE. `PromoSlider`
 * auto-advanced every 5s with no way to stop it, failing WCAG 2.2 SC 2.2.2
 * (moving content lasting more than five seconds needs a pause/stop/hide
 * mechanism). Carrying that into a new component immediately after the phase
 * that put jsx-a11y at `error` would be knowingly shipping a known defect. So:
 * a real pause control with an accessible name, rotation paused on hover and on
 * keyboard focus, and no rotation at all for `prefers-reduced-motion`. No lint
 * rule checks SC 2.2.2 — `npm run lint` passing does not prove this.
 */

const ROTATE_MS = 6000;

/** Semantic background tokens, cycled per slide. All three are AA against white. */
const SLIDE_TONES = ["bg-primary", "bg-action", "bg-accent"] as const;

export function PromoCarousel({
  promotions,
  cdnBaseUrl,
}: {
  promotions: readonly Promotion[];
  cdnBaseUrl: string | null;
}) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const reducedMotion = useRef(false);

  const count = promotions.length;

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

  // The parent decides whether to render this at all; guarding here too keeps
  // the component safe to reuse and avoids an empty bordered box.
  if (count === 0) return null;

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-black/10 shadow-lg"
      role="region"
      aria-roledescription="carousel"
      aria-label="Promotions"
      onMouseEnter={() => setInteractionPaused(true)}
      onMouseLeave={() => setInteractionPaused(false)}
      onFocus={() => setInteractionPaused(true)}
      onBlur={() => setInteractionPaused(false)}
    >
      <div
        className="flex transition-transform duration-700 ease-in-out"
        style={{ transform: `translateX(-${current * 100}%)` }}
      >
        {promotions.map((promo, index) => {
          const imageUrl =
            promo.imageKey && cdnBaseUrl ? composePublicUrl(cdnBaseUrl, promo.imageKey) : null;

          return (
            <div
              key={promo.id}
              className={`w-full shrink-0 ${SLIDE_TONES[index % SLIDE_TONES.length]} flex items-center justify-between gap-4 p-6 md:p-8`}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${count}`}
              aria-hidden={index !== current}
            >
              <div className="text-white">
                <h3 className="mb-2 text-xl font-bold md:text-2xl">{promo.title}</h3>
                <p className="mb-4 max-w-lg text-sm text-white/90 md:text-base">
                  {promo.description}
                </p>
                <Link
                  href={promo.linkUrl}
                  tabIndex={index === current ? undefined : -1}
                  className="inline-block rounded-xl bg-white px-4 py-2 text-sm font-bold text-primary shadow-sm transition-transform hover:bg-surface-muted active:scale-95"
                >
                  Shop now
                </Link>
              </div>

              {imageUrl && (
                // A plain <img>: next/image adoption is still #46, and every
                // other storefront image is a plain tag. An empty alt is the
                // correct treatment for a promo whose row supplies none — the
                // title and description beside it already carry the meaning.
                <img
                  src={imageUrl}
                  alt={promo.altText ?? ""}
                  className="hidden h-32 w-32 shrink-0 rounded-xl object-cover sm:block"
                />
              )}
            </div>
          );
        })}
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur transition-colors hover:bg-black/50"
            aria-label="Previous promotion"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur transition-colors hover:bg-black/50"
            aria-label="Next promotion"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2">
            {/* SC 2.2.2. Deliberately always visible, not revealed on hover:
                a control a keyboard or touch user cannot find does not satisfy
                the criterion. */}
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur transition-colors hover:bg-black/50"
              aria-label={paused ? "Resume promotion rotation" : "Pause promotion rotation"}
            >
              {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            </button>

            {promotions.map((promo, index) => (
              <button
                key={promo.id}
                type="button"
                onClick={() => setCurrent(index)}
                className={`h-2 rounded-full transition duration-300 ${
                  index === current ? "w-4 bg-white" : "w-2 bg-white/50 hover:bg-white/80"
                }`}
                aria-label={`Show promotion ${index + 1}`}
                aria-current={index === current}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
