"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A stored image that shows its surface's own no-image look, not the browser's broken-image icon,
 * when the object fails to load (#655, generalising #502's `ProductImage`).
 *
 * A row naming a storage key and the object it names are written by different systems, so the row
 * can outlive the object in any environment (`docs/developer-portal/runtime-pitfalls.md`). The server
 * cannot know which; only the browser finds out, which is why this is the one client boundary every
 * storefront image of a stored object renders through. `tests/storefront-image-fallback.test.ts`
 * keeps it that way.
 *
 * `fallback` is required, and each caller passes the markup its own no-image branch already
 * renders, so a missing object and an absent image look the same. `null` is a valid fallback for a
 * decorative image whose surroundings already stand on their own.
 *
 * Plain `<img>` by decision (#46): Image Transformations are not enabled on the zone.
 */
export function ImageWithFallback({
  src,
  alt,
  fallback,
  width,
  height,
  loading,
  decoding,
  fetchPriority,
  draggable,
  className,
  sources,
}: {
  src: string;
  alt: string;
  fallback: ReactNode;
  width?: number;
  height?: number;
  loading?: "eager" | "lazy";
  /** #1223 R47 — the department illustrations decode off the main thread. */
  decoding?: "async" | "sync" | "auto";
  fetchPriority?: "high" | "low" | "auto";
  draggable?: boolean;
  className?: string;
  /**
   * #1069 — art-direction alternatives, rendered as `<source>`s in a `<picture>` ahead of the
   * `<img>`. The browser fetches ONLY the candidate whose `media` matches, so a header that shows a
   * mark on phones and a logo from `md` never downloads the hidden one. `src` is the fallback when
   * no `media` matches. A failure of whichever candidate was chosen fires the `<img>`'s error event,
   * so the fallback behaviour is unchanged.
   */
  sources?: readonly { media: string; srcSet: string }[];
}) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // An image that fails BEFORE hydration fires its `error` event before React has attached
  // `onError`, so the handler never runs. Measured, not guessed: with the CDN blocked, every
  // product card on a category page kept its broken-image icon although `ProductImage` had
  // `onError` (specs/2026-10-04-p979-655-storefront-finish/build-notes.md). So on mount, a
  // finished load with no pixels counts as a failure too. Per the HTML spec a lazy image that has
  // not started loading reports `complete === false`, so it is not mistaken for a broken one.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, [src]);

  if (failed) return <>{fallback}</>;

  const img = (
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      decoding={decoding}
      fetchPriority={fetchPriority}
      draggable={draggable}
      className={className}
      onError={() => setFailed(true)}
    />
  );

  if (!sources || sources.length === 0) return img;

  // `contents`: the <picture> box disappears from layout, so the <img> stays the flex item its
  // caller's classes were written for.
  return (
    <picture className="contents">
      {sources.map((source) => (
        <source key={source.media} media={source.media} srcSet={source.srcSet} />
      ))}
      {img}
    </picture>
  );
}
