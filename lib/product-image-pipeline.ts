import { getProductMetadataService } from "./product-metadata";
import { getImageGenerationService } from "./image-generation";
import { getStorage } from "./storage";
import { buildProductImageKey, IMAGE_CONTENT_TYPE } from "./product-image";

export interface PipelineResult {
  imageKey: string;
  needsReview: boolean;
}

export interface PipelineOptions {
  /**
   * Whether to consult Open Food Facts before falling back to AI generation.
   * Defaults to true, preserving the pipeline's original behaviour for any
   * caller that doesn't pass it.
   *
   * The operator switch behind this (#502) exists because Open Food Facts'
   * keyword ranking returns the same hit for similarly-named products. The
   * relevance check in `lib/product-metadata.ts` rejects the clearly-wrong ones,
   * but an operator watching a run produce images they don't want needs to be
   * able to skip the source outright without waiting for a deploy — which is
   * why this is a per-run argument rather than validated config.
   */
  useOpenFoodFacts?: boolean;
}

export async function runProductImagePipeline(
  productId: string,
  productName: string,
  barcode?: string | null,
  options: PipelineOptions = {},
): Promise<PipelineResult | null> {
  const { useOpenFoodFacts = true } = options;
  const aiSvc = getImageGenerationService();
  const storage = getStorage();

  let imageBuffer: ArrayBuffer | null = null;
  let contentType = IMAGE_CONTENT_TYPE;

  // 1. Try Open Food Facts, unless the operator switched it off for this run.
  if (useOpenFoodFacts) {
    const offUrl = await getProductMetadataService().fetchImageUrl(productName, barcode);
    if (offUrl) {
      const res = await fetch(offUrl);
      if (res.ok) {
        imageBuffer = await res.arrayBuffer();
        contentType = res.headers.get("content-type") || IMAGE_CONTENT_TYPE;
      }
    }
  }

  // 2. Fallback to AI
  if (!imageBuffer) {
    const prompt = `Product photo of ${productName} on a plain white background, studio lighting, top quality, centered.`;
    imageBuffer = await aiSvc.generateImage(prompt);

    if (!imageBuffer) {
      // Both failed or AI not configured
      return null;
    }

    contentType = "image/png"; // Workers AI generally returns PNG or JPEG binary
  }

  // 3. Upload to R2.
  //
  // #364 — the key now carries the image's REAL extension. It used to always
  // suffix `.webp` while these bytes are whatever Workers AI returned (PNG) or
  // whatever Open Food Facts served, so every generated key asserted a format
  // its object was not. Nothing rendered wrong — the object is stored with its
  // true content type and the CDN answers on that — but the key was a lie, and
  // this repo's rule is that image keys are meaningful.
  const key = buildProductImageKey(productId, contentType);
  await storage.putObject(key, imageBuffer, contentType);

  return {
    imageKey: key,
    /**
     * True on BOTH source paths, not just AI (#502).
     *
     * This used to be set only for an AI-generated image, which had the rule
     * exactly backwards: a third-party photo matched on a keyword search is the
     * result MOST likely to be the wrong product, and it was the one written
     * without the "Image Needs Review" flag the admin list already renders.
     * Every image this pipeline produces is a guess made by something that has
     * never seen the product, so every image it produces is flagged.
     */
    needsReview: true,
  };
}
