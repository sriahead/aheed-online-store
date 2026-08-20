import { getProductMetadataService } from "./product-metadata";
import { getImageGenerationService } from "./image-generation";
import { getStorage } from "./storage";
import { buildProductImageKey, IMAGE_CONTENT_TYPE } from "./product-image";
import crypto from "crypto";

export interface PipelineResult {
  imageKey: string;
  needsReview: boolean;
}

export async function runProductImagePipeline(
  productId: string, 
  productName: string, 
  barcode?: string | null
): Promise<PipelineResult | null> {
  const metadataSvc = getProductMetadataService();
  const aiSvc = getImageGenerationService();
  const storage = getStorage();

  let imageBuffer: ArrayBuffer | null = null;
  let needsReview = false;
  let contentType = IMAGE_CONTENT_TYPE;

  // 1. Try Open Food Facts
  const offUrl = await metadataSvc.fetchImageUrl(productName, barcode);
  if (offUrl) {
    const res = await fetch(offUrl);
    if (res.ok) {
      imageBuffer = await res.arrayBuffer();
      contentType = res.headers.get("content-type") || IMAGE_CONTENT_TYPE;
    }
  }

  // 2. Fallback to AI
  if (!imageBuffer) {
    const prompt = `Professional studio photography of fresh grocery item: ${productName}. Shot on a clean, bright, white background. High resolution, appetizing lighting, highly detailed food photography, centered.`;
    imageBuffer = await aiSvc.generateImage(prompt);
    
    if (!imageBuffer) {
      // Both failed or AI not configured
      return null;
    }
    
    needsReview = true;
    contentType = "image/png"; // Workers AI generally returns PNG or JPEG binary
  }

  // 3. Upload to R2
  // We use buildProductImageKey to comply with existing conventions.
  // It appends .webp but the content type is what storage cares about.
  // The app will serve it via CDN.
  const key = buildProductImageKey(productId);
  await storage.putObject(key, imageBuffer, contentType);

  return {
    imageKey: key,
    needsReview
  };
}
