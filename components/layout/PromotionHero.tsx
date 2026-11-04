"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/components/product/format-price";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";
import { composePublicUrl } from "@/lib/storage";
import { Icon } from "@/components/icons/Icon";
import type { PromotionRow } from "@/lib/repositories/promotions";

const ROTATE_MS = 5000;

const PANEL_TONES = ["bg-primary", "bg-action", "bg-accent"] as const;

export function PromotionHero({
  promotions,
  cdnBaseUrl,
}: {
  promotions: readonly PromotionRow[];
  cdnBaseUrl: string | null;
}) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [choiceMade, setChoiceMade] = useState(false);
  const reducedMotion = useRef(false);

  const count = promotions.length;

  useEffect(() => {
    reducedMotion.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    if (reducedMotion.current) setPaused(true);
  }, []);

  const rotating = count >= 2 && !paused && (choiceMade || !interactionPaused);

  useEffect(() => {
    if (!rotating) return;
    const timer = setInterval(() => setCurrent((prev) => (prev + 1) % count), ROTATE_MS);
    return () => clearInterval(timer);
  }, [count, rotating]);

  const go = useCallback(
    (delta: number) => setCurrent((prev) => (prev + delta + count) % count),
    [count],
  );

  if (count === 0) return null;

  return (
    <div
      className="relative h-full min-h-[300px] overflow-hidden rounded-3xl border border-black/10 shadow-lg"
      role="region"
      aria-roledescription="carousel"
      aria-label="Promotions carousel"
      onMouseEnter={() => setInteractionPaused(true)}
      onMouseLeave={() => setInteractionPaused(false)}
      onFocus={() => setInteractionPaused(true)}
      onBlur={() => setInteractionPaused(false)}
    >
      <div
        className="flex h-full transition-transform duration-700 ease-in-out"
        style={{ transform: `translateX(-${current * 100}%)` }}
      >
        {promotions.map((promo, index) => {
          const isCurrent = index === current;
          const imageUrl =
            promo.imageKey && cdnBaseUrl ? composePublicUrl(cdnBaseUrl, promo.imageKey) : null;

          // Compute destination link
          let ctaHref = promo.linkUrl;
          if (!ctaHref) {
            if (promo.category) {
              ctaHref = `/categories/${promo.category.slug}`;
            } else if (promo.bundle) {
              ctaHref = `/categories?bundle=${promo.bundle.slug}`;
            } else {
              ctaHref = "/categories";
            }
          }

          // Compute CTA label
          let ctaLabel = promo.callToActionText;
          if (!ctaLabel) {
            if (promo.category) {
              ctaLabel = `Shop ${promo.category.name}`;
            } else if (promo.bundle) {
              ctaLabel = "View Bundle";
            } else if (promo.discountCode) {
              ctaLabel = "Shop with Code";
            } else {
              ctaLabel = "Explore Offers";
            }
          }

          // Bundle price computation if applicable
          let bundleTotalPence: number | null = null;
          if (promo.bundle?.items && promo.bundle.items.length > 0) {
            bundleTotalPence = promo.bundle.items.reduce(
              (acc, item) => acc + (item.product?.basePrice ?? 0) * item.quantity,
              0,
            );
          }

          return (
            <div
              key={promo.id}
              className={`dept-panel relative flex h-full w-full shrink-0 flex-col justify-center overflow-hidden ${PANEL_TONES[index % PANEL_TONES.length]} p-6 md:p-10`}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${count}`}
              aria-hidden={!isCurrent}
            >
              {imageUrl ? (
                <>
                  <ImageWithFallback
                    src={imageUrl}
                    alt={promo.altText ?? promo.headline}
                    className="absolute inset-0 h-full w-full object-cover"
                    fallback={null}
                  />
                  <div
                    className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-black/20"
                    aria-hidden
                  />
                </>
              ) : (
                <div
                  className="dept-chevron pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-white/10"
                  aria-hidden
                />
              )}

              <div className="relative z-10 flex flex-col justify-between h-full max-w-lg text-white space-y-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {promo.badgeText ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 border border-white/30 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white backdrop-blur-sm">
                        <Icon name="sparkles" className="h-3 w-3 text-amber-300" />
                        {promo.badgeText}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold tracking-wide text-white/80 uppercase">
                        Promotion {index + 1} of {count}
                      </span>
                    )}

                    {promo.discountCode && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-black/40 border border-white/20 px-2.5 py-0.5 text-xs font-mono font-bold text-amber-300">
                        Code: {promo.discountCode.code}
                      </span>
                    )}
                  </div>

                  <h2 className="text-2xl font-extrabold md:text-4xl leading-tight">
                    {promo.headline}
                  </h2>

                  {promo.subtitle && (
                    <p className="max-w-md text-sm md:text-base text-white/90 leading-relaxed">
                      {promo.subtitle}
                    </p>
                  )}
                </div>

                {/* Price or Offer Callout */}
                {bundleTotalPence !== null && bundleTotalPence > 0 ? (
                  <div className="inline-flex flex-wrap items-baseline gap-2 rounded-xl bg-black/35 px-3 py-2 backdrop-blur w-fit">
                    <span className="text-xs text-white/80">Bundle from:</span>
                    <span className="text-lg font-extrabold text-white">
                      {formatPrice(bundleTotalPence)}
                    </span>
                  </div>
                ) : promo.discountCode?.minSubtotalPence &&
                  promo.discountCode.minSubtotalPence > 0 ? (
                  <div className="inline-flex flex-wrap items-baseline gap-2 rounded-xl bg-black/35 px-3 py-1.5 backdrop-blur w-fit text-xs text-white/90">
                    <span>
                      Applies on orders over {formatPrice(promo.discountCode.minSubtotalPence)}
                    </span>
                  </div>
                ) : null}

                {/* Action CTA */}
                <div className="pt-2">
                  <Link
                    href={ctaHref}
                    tabIndex={isCurrent ? undefined : -1}
                    className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-primary shadow-md transition-transform hover:bg-surface-muted active:scale-95 motion-reduce:active:scale-100"
                  >
                    {ctaLabel}
                    <Icon name="arrow-right" className="h-4 w-4" />
                  </Link>
                </div>
              </div>

              {/* Pause / Resume Controls & Indicator Dots */}
              {count >= 2 && (
                <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2 bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/10">
                  <button
                    type="button"
                    onClick={() => {
                      setChoiceMade(true);
                      setPaused((prev) => !prev);
                    }}
                    aria-label={paused ? "Resume promotions rotation" : "Pause promotions rotation"}
                    className="text-white/80 hover:text-white"
                  >
                    <Icon name={paused ? "play" : "pause"} className="h-3.5 w-3.5" />
                  </button>
                  <div className="flex gap-1.5">
                    {promotions.map((_, dotIdx) => (
                      <button
                        key={dotIdx}
                        type="button"
                        onClick={() => setCurrent(dotIdx)}
                        aria-label={`Go to promotion ${dotIdx + 1}`}
                        className={`h-2 rounded-full transition-all ${
                          dotIdx === current ? "w-4 bg-white" : "w-2 bg-white/40"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
