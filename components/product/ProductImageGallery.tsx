"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
          // at high priority — the rest are below it and lazy-load.
          <img
            key={image.storageKey}
            src={composePublicUrl(cdnBaseUrl, image.storageKey)}
            alt={image.alt}
            width={800}
            height={800}
            loading={index === 0 ? "eager" : "lazy"}
            fetchPriority={index === 0 ? "high" : undefined}
            className="aspect-square w-full rounded-2xl object-cover"
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
          <div key={image.storageKey || index} className="relative h-full w-full shrink-0 aspect-square">
            <img
              src={composePublicUrl(cdnBaseUrl, image.storageKey)}
              alt={image.alt}
              width={800}
              height={800}
              loading={index === 0 ? "eager" : "lazy"}
              fetchPriority={index === 0 ? "high" : undefined}
              className="h-full w-full object-cover select-none pointer-events-none"
              draggable={false}
            />
          </div>
        ))}
      </div>

      {/* Navigation arrows (only if multiple images) */}
      {hasMultiple && (
        <>
          <button
            type="button"
            onClick={goToPrev}
            onKeyDown={handleButtonKeyDown}
            aria-label="Previous product image"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-primary shadow-md backdrop-blur-xs transition hover:bg-white hover:scale-105 active:scale-95 motion-reduce:hover:scale-100 motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={goToNext}
            onKeyDown={handleButtonKeyDown}
            aria-label="Next product image"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-primary shadow-md backdrop-blur-xs transition hover:bg-white hover:scale-105 active:scale-95 motion-reduce:hover:scale-100 motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
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
