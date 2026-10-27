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

/**
 * Builds an immutable relative storage key for system icon slot assets:
 * `icons/{vendorId}/{slot}-{random}{ext}`
 */
export function buildSlotAssetKey(
  vendorId: string,
  slot: string,
  contentType: string = IMAGE_CONTENT_TYPE,
): string {
  const safeSlot = slot
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-");
  const randomSuffix = crypto.randomUUID().slice(0, 8);
  const ext = imageExtensionForContentType(contentType);
  return `icons/${vendorId}/${safeSlot}-${randomSuffix}${ext}`;
}

/**
 * Constructs an AI generation prompt for UI system icon assets.
 */
export function buildSlotAssetPrompt(slot: string, style: CategoryImageStyle = "3d-icon"): string {
  const slotDescriptions: Record<string, string> = {
    "delivery-van": "modern refrigerated grocery delivery van in white and fresh green livery",
    storefront:
      "friendly modern grocery storefront entrance with clean glass windows and welcome sign",
    "quick-shop":
      "grocery shopping wire basket loaded with fresh colorful fruits and bread with quick lightning badge",
    "user-profile": "stylized professional customer avatar bust with smooth premium finish",
    "cart-floating": "chrome wire grocery shopping trolley filled with fresh groceries and produce",
    "secure-checkout": "metallic security shield with brass padlock ensuring encrypted payments",
    "order-updates": "golden notification bell with postal delivery envelope",
    "view-shopper": "grocery paper shopping bag with fresh organic baguette and greens",
    "view-staff": "retail supermarket store counter with cash register and barcode scanner",
    "view-admin": "polished platinum security shield with administrative key",
  };

  const subject = slotDescriptions[slot] || slot.replace(/-/g, " ");
  return buildCategoryImagePrompt(subject, style);
}
