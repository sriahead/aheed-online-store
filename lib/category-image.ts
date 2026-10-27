/**
 * Category image rules and prompt construction (pure, DB-free, session-free).
 *
 * Implements standard prompt formulas adhering to:
 * - docs/client-help-centre/category-image-standards.md (photo style)
 * - docs/client-help-centre/icon-and-visual-asset-standards.md (3D icon style)
 */

import { IMAGE_CONTENT_TYPE, imageExtensionForContentType } from "./product-image";

export type CategoryImageStyle = "photo" | "3d-icon";

/**
 * Builds an immutable relative storage key for category images:
 * `categories/{vendorId}/{slug}-{random}{ext}`
 */
export function buildCategoryImageKey(
  vendorId: string,
  slug: string,
  contentType: string = IMAGE_CONTENT_TYPE,
): string {
  const safeSlug = slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-");
  const randomSuffix = crypto.randomUUID().slice(0, 8);
  const ext = imageExtensionForContentType(contentType);
  return `categories/${vendorId}/${safeSlug}-${randomSuffix}${ext}`;
}

/**
 * Constructs an AI generation prompt for category imagery based on the requested visual style.
 */
export function buildCategoryImagePrompt(
  categoryName: string,
  style: CategoryImageStyle = "photo",
): string {
  const cleanName = categoryName.trim();

  if (style === "3d-icon") {
    return (
      `3D rendered commercial app icon of ${cleanName}, isolated on a pure white background (#ffffff). ` +
      `Clay-smooth tactile plastic and metallic materials, glossy specular highlights, studio ambient lighting ` +
      `with soft contact shadow directly underneath, isometric 45-degree angle. ` +
      `High detail, vibrant retail colors, zero text, zero watermarks, zero background clutter.`
    );
  }

  // Default: Commercial studio product photography
  return (
    `Commercial studio grocery photography of fresh appetizing ${cleanName}, realistic retail food presentation, ` +
    `centered square composition, clean bright neutral background, soft studio ambient lighting, ` +
    `genuine product photography, high resolution, 1:1 aspect ratio, sharp focus, no text, no watermarks.`
  );
}
