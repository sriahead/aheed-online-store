"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";
import { composePublicUrl } from "@/lib/storage";
import type { ProductImageSummary } from "@/lib/repositories/products";

export function ProductImageGallery({
  images,
  cdnBaseUrl,
  variant = "stacked",
}: {
  images: ProductImageSummary[];
  cdnBaseUrl: string;
  variant?: "stacked" | "carousel";
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [prevKey, setPrevKey] = useState<string | null>(images[0]?.storageKey ?? null);
  const currentKey = images[0]?.storageKey ?? null;

  // React-recommended pattern: adjust state during render when props change
  if (currentKey !== prevKey) {
    setPrevKey(currentKey);
    setCurrentIndex(0);
  }

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  if (images.length === 0) {
    return <div className="aspect-square w-full rounded-2xl bg-surface-muted" />;
  }

  if (variant === "stacked") {
    return (
      <div className="flex flex-col gap-2">
        {images.map((image, index) => (
          // P7d (#218/#46): intrinsic dimensions for the aspect ratio; CSS still drives layout.
          // The first image is the product page's above-the-fold hero, so it loads eagerly and
          // at high priority — the rest are below it and lazy-load. #655: a missing object shows
          // the same grey square as a product with no image at all.
          <ImageWithFallback
            key={image.storageKey}
            src={composePublicUrl(cdnBaseUrl, image.storageKey)}
            alt={image.alt}
            width={800}
            height={800}
            loading={index === 0 ? "eager" : "lazy"}
            fetchPriority={index === 0 ? "high" : undefined}
            className="aspect-square w-full rounded-2xl object-cover"
            fallback={<div className="aspect-square w-full rounded-2xl bg-surface-muted" />}
          />
        ))}
      </div>
    );
  }

  const hasMultiple = images.length > 1;
  const safeIndex = currentIndex >= images.length ? 0 : currentIndex;

  const goToPrev = () => {
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;

    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX > 0) {
        goToPrev();
      } else {
        goToNext();
      }
    }
  };

  const handleButtonKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      goToPrev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      goToNext();
    }
  };

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Product images"
      onTouchStart={hasMultiple ? handleTouchStart : undefined}
      onTouchEnd={hasMultiple ? handleTouchEnd : undefined}
      className="relative aspect-square w-full overflow-hidden rounded-2xl bg-surface-muted select-none"
    >
      {/* Horizontal sliding track */}
      <div
        className="flex h-full w-full transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{ transform: `translateX(-${safeIndex * 100}%)` }}
      >
        {images.map((image, index) => (
          <div
            key={image.storageKey || index}
            className="relative h-full w-full shrink-0 aspect-square"
          >
            {/* #655: a missing object leaves the slot empty, so the region's own grey shows. */}
            <ImageWithFallback
              src={composePublicUrl(cdnBaseUrl, image.storageKey)}
              alt={image.alt}
              width={800}
              height={800}
              loading={index === 0 ? "eager" : "lazy"}
              fetchPriority={index === 0 ? "high" : undefined}
              className="h-full w-full object-cover select-none pointer-events-none"
              draggable={false}
              fallback={null}
            />
          </div>
        ))}
      </div>

      {/* Navigation arrows (only if multiple images). #979: below `lg` each button is the 44px
          (`tap`) hit area around the same 32px circle, and sits 4px in so the circle's centre stays
          26px from the edge, where `left-2.5`/`right-2.5` put the 32px button. From `lg` the button
          is the circle again (specs/design-system.md, "Touch targets"). */}
      {hasMultiple && (
        <>
          <button
            type="button"
            onClick={goToPrev}
            onKeyDown={handleButtonKeyDown}
            aria-label="Previous product image"
            data-tap-surface="gallery-arrow"
            className="left-1 lg:left-2.5 group/arrow absolute top-1/2 -translate-y-1/2 z-10 flex size-tap items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action lg:size-8"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-primary shadow-md backdrop-blur-xs transition group-hover/arrow:bg-white group-hover/arrow:scale-105 group-active/arrow:scale-95 motion-reduce:group-hover/arrow:scale-100 motion-reduce:group-active/arrow:scale-100">
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </span>
          </button>
          <button
            type="button"
            onClick={goToNext}
            onKeyDown={handleButtonKeyDown}
            aria-label="Next product image"
            data-tap-surface="gallery-arrow"
            className="right-1 lg:right-2.5 group/arrow absolute top-1/2 -translate-y-1/2 z-10 flex size-tap items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action lg:size-8"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-primary shadow-md backdrop-blur-xs transition group-hover/arrow:bg-white group-hover/arrow:scale-105 group-active/arrow:scale-95 motion-reduce:group-hover/arrow:scale-100 motion-reduce:group-active/arrow:scale-100">
              <ChevronRight className="h-5 w-5" aria-hidden />
            </span>
          </button>

          {/* Dots and Counter indicator bar */}
          <div className="absolute bottom-2.5 left-0 right-0 z-10 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 backdrop-blur-xs pointer-events-auto">
              {images.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  onKeyDown={handleButtonKeyDown}
                  aria-label={`Go to image ${idx + 1} of ${images.length}`}
                  aria-current={idx === safeIndex ? "true" : undefined}
                  className={`h-1.5 rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white ${
                    idx === safeIndex ? "w-4 bg-white" : "w-1.5 bg-white/50 hover:bg-white/75"
                  }`}
                />
              ))}
              <span className="ml-1 text-[10px] font-medium text-white/90 tabular-nums" aria-hidden>
                {safeIndex + 1} / {images.length}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
