import { ImageWithFallback } from "@/components/ui/ImageWithFallback";

/**
 * A product image that degrades to the same grey box a product with no image
 * gets, rather than the browser's broken-image icon (#502).
 *
 * The DB row and the stored object are written by different systems, so a row
 * can outlive its object; staging once spent a whole slice referencing
 * `products/gen-<subcategory>/main.svg` keys that returned 404, and every card
 * rendered a broken-image icon with alt text sitting where the photo should be.
 * Fixing a bucket removes one instance. This removes the failure MODE.
 *
 * Since #655 the behaviour lives in `components/ui/ImageWithFallback.tsx`, which
 * every storefront image of a stored object shares. This keeps the card's own
 * API and output: the fallback is identical to `ProductCard`'s no-image branch,
 * so the two states are indistinguishable to a shopper.
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
  // P7d (#218/#46): intrinsic dimensions so the browser can reserve the box before
  // the bytes land. CSS still drives layout (w-full/h-full inside the aspect-4/3
  // container) — these attributes only supply the aspect ratio.
  return (
    <ImageWithFallback
      src={src}
      alt={alt}
      width={400}
      height={300}
      loading="lazy"
      className={className}
      fallback={<div className="h-full w-full bg-surface-muted" />}
    />
  );
}
