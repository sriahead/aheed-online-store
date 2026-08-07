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
      {images.map((image) => (
        <img
          key={image.storageKey}
          src={composePublicUrl(cdnBaseUrl, image.storageKey)}
          alt={image.alt}
          className="aspect-square w-full rounded-md object-cover"
        />
      ))}
    </div>
  );
}
