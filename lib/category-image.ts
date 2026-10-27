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
 * Constructs an AI generation prompt for UI system icon assets, strictly aligned with
 * the application's commercial theme (emerald green #059669, royal navy #1E3A8A, warm gold #F59E0B)
 * and isolated on pure white with crisp edges so icons remain vivid and clearly readable at 24px.
 */
export function buildSlotAssetPrompt(slot: string, _style?: CategoryImageStyle): string {
  const themedSlotPrompts: Record<string, string> = {
    "delivery-van":
      "Commercial 3D UI app icon of a sleek modern refrigerated grocery delivery van, 3D rendered commercial app icon style, isometric 3/4 front perspective, clean white vehicle body with fresh emerald green accents and royal navy trim, glossy headlights, isolated on pure white background (#ffffff), crisp silhouette, soft contact shadow beneath the tires, high contrast readable at 24px, zero background scenery, no text, no watermarks.",
    storefront:
      "Commercial 3D UI app icon of a charming miniature grocery store boutique, pastel cyan and white striped awning, warm peach stucco facade, neat glass window, colorful paper gift shopping bags sitting neatly out front, isolated on pure seamless white background (#ffffff), crisp silhouette, glossy plastic and smooth clay textures, soft contact shadow directly underneath, high contrast readable at 24px, no street, no sky, no text, no watermarks.",
    "quick-shop":
      "Commercial 3D UI app icon of a dynamic shopping cart with electric speed energy, sleek blue wireframe basket with chrome wheels, an energetic bright golden yellow and magenta gradient 3D lightning bolt bursting forward through the cart, isolated on pure seamless white background (#ffffff), high contrast, crisp silhouette readable at 24px, soft contact shadow, glossy specular highlights, no background scenery, no text, no watermarks.",
    "user-profile":
      "Commercial 3D UI app icon of a sleek minimalist glossy modern avatar bust, smooth stylized human profile silhouette, vibrant iridescent electric gradient from royal blue to deep magenta purple, glossy specular sheen, isolated on pure seamless white background (#ffffff), centered composition, high contrast, crisp edges readable at 24px, soft contact shadow underneath, no background scenery, no clothes details, no text, no watermarks.",
    "cart-floating":
      "Commercial 3D UI app icon of a high-detail chrome wire grocery shopping trolley cart, vibrant orange handle, filled to the brim with fresh colorful supermarket groceries: crisp lettuce, bright red tomatoes, green apples, yellow bananas, golden baguette loaf, isolated on pure seamless white background (#ffffff), soft natural contact shadow directly beneath the wheels, sharp 3/4 isometric perspective, vibrant saturated colors, crisp silhouette readable at 24px, no background room, no floor grid, no text, no watermarks.",
    "cart-add":
      "Commercial 3D UI app icon of a high-detail chrome wire grocery shopping trolley cart, vibrant orange handle, filled to the brim with fresh colorful supermarket groceries: crisp lettuce, bright red tomatoes, green apples, yellow bananas, golden baguette loaf, isolated on pure seamless white background (#ffffff), soft natural contact shadow directly beneath the wheels, sharp 3/4 isometric perspective, vibrant saturated colors, crisp silhouette readable at 24px, no background room, no floor grid, no text, no watermarks.",
    "secure-checkout":
      "Commercial 3D UI app icon of a heavy polished metallic security shield with an embossed brass padlock, glowing emerald green security checkmark accent, deep royal navy border, warm golden specular reflections, isolated on pure seamless solid white background (#ffffff), high contrast, crisp silhouette readable at 24px, soft drop shadow, no food, no background scenery, no text, no watermarks.",
    "order-updates":
      "Commercial 3D UI app icon of a gleaming warm golden notification bell with a crisp white and emerald green postal delivery envelope with an alert badge, isolated on pure seamless solid white background (#ffffff), high contrast, crisp silhouette readable at 24px, soft contact shadow, no background scenery, no text, no watermarks.",
    "view-shopper":
      "Commercial 3D UI app icon of a classic brown paper grocery shopping bag filled with fresh artisan baguette, leafy greens, and red apples, isolated on pure seamless solid white background (#ffffff), crisp edges, high contrast readable at 24px, soft contact shadow, no background scenery, no text, no watermarks.",
    "view-staff":
      "Commercial 3D UI app icon of a modern retail store point-of-sale register terminal and handheld barcode scanner, emerald green and deep navy housing with glowing screen, isolated on pure seamless solid white background (#ffffff), crisp silhouette readable at 24px, soft contact shadow, no supermarket aisle, no background room, no text, no watermarks.",
    "view-admin":
      "Commercial 3D UI app icon of a polished platinum security badge with a golden master administrative key, deep royal navy enamel accents, isolated on pure seamless solid white background (#ffffff), high contrast, crisp edges readable at 24px, soft drop shadow, no background scenery, no text, no watermarks.",
    "rewards-coin":
      "Commercial 3D UI app icon of a celebratory gleaming golden trophy bursting out of an open red gift box tied with shimmering gold ribbons, surrounded by floating miniature 3D golden, cyan, and magenta star particles, isolated on pure seamless white background (#ffffff), soft contact shadow, glossy metallic reflections, clean icon silhouette readable at 24px, zero background scenery, no text, no watermarks.",
    "rewards-gift":
      "Commercial 3D UI app icon of a celebratory gleaming golden trophy bursting out of an open red gift box tied with shimmering gold ribbons, surrounded by floating miniature 3D golden, cyan, and magenta star particles, isolated on pure seamless white background (#ffffff), soft contact shadow, glossy metallic reflections, clean icon silhouette readable at 24px, zero background scenery, no text, no watermarks.",
    "halal-certified":
      "Commercial 3D UI icon of a prestigious golden halal certification rosette medal badge with emerald green ribbon and clean geometric emblem, isolated on pure seamless solid white background (#ffffff), high contrast, crisp silhouette, soft contact shadow, no text, no watermarks.",
  };

  if (themedSlotPrompts[slot]) {
    return themedSlotPrompts[slot];
  }

  const cleanSlot = slot.replace(/[-_]/g, " ");
  return (
    `Commercial 3D UI icon of ${cleanSlot}, vibrant theme colors (emerald green, royal navy, warm gold), ` +
    `isolated on pure white background, crisp silhouette, high contrast, soft subtle contact shadow, ` +
    `centered composition, clean icon render readable at 24px, no background scenery, no text, no watermarks.`
  );
}
