import { composePublicUrl } from "@/lib/storage";
import type { ProductImageSummary } from "@/lib/repositories/products";

export function ProductImageGallery({
  images,
  cdnBaseUrl,
}: {
  images: ProductImageSummary[];
  cdnBaseUrl: string;
}) {
  if (images.length === 0) {
    return <div className="aspect-square w-full rounded-md bg-surface-muted" />;
  }

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
          className="aspect-square w-full rounded-md object-cover"
        />
      ))}
    </div>
  );
}
