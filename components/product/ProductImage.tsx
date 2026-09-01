"use client";

import { useState } from "react";

/**
 * A product image that degrades to the same grey box a product with no image
 * gets, rather than the browser's broken-image icon (#502).
 *
 * WHY THIS IS A CLIENT COMPONENT. `ProductCard` is a Server Component and stays
 * one — this is the smallest possible boundary around the one thing the server
 * cannot know: whether the object a `ProductImage.storageKey` names actually
 * exists in this environment's bucket. The DB row and the stored object are
 * written by different systems, so a row can outlive its object; staging spent
 * this whole slice's lifetime referencing `products/gen-<subcategory>/main.svg` keys that
 * returned 404, and every card rendered a broken-image icon with alt text
 * sitting where the photo should be.
 *
 * Fixing the staging bucket removes today's instance. This removes the failure
 * MODE: whatever the bucket state, in any environment, a missing object now
 * looks like a product without a photo instead of like a broken page.
 *
 * The fallback markup is deliberately identical to `ProductCard`'s own
 * no-image branch, so the two states are indistinguishable to a shopper.
 */
export function ProductImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) return <div className="h-full w-full bg-surface-muted" />;

  return (
    // P7d (#218/#46): intrinsic dimensions so the browser can reserve the box before
    // the bytes land. CSS still drives layout (w-full/h-full inside the aspect-4/3
    // container) — these attributes only supply the aspect ratio.
    <img
      src={src}
      alt={alt}
      width={400}
      height={300}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
