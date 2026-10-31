/**
 * Category image rules and prompt construction (pure, DB-free, session-free).
 *
 * Implements standard prompt formulas adhering to:
 * - docs/client-help-centre/category-image-standards.md (photo style)
 * - docs/client-help-centre/icon-and-visual-asset-standards.md (3D icon style)
 */

import { IMAGE_CONTENT_TYPE, imageExtensionForContentType } from "./product-image";
import { getIconSlot } from "./icon-slots";

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
 * The vendor's own colours, passed into every prompt (#1288 R20/R23). Built by the pipeline from the
 * vendor's `BrandPrimitives` (`green` → `primary`, `orange` → `accent`), so no vendor's palette is
 * hardcoded here (ADR-004).
 */
export interface PromptPalette {
  primary: string;
  accent: string;
}

/**
 * Appended to EVERY prompt (#1288 R20): each generated image is shown inside the circular
 * `IconMedallion`, which crops a photo or AI asset to a circle and multiplies its white background
 * into the vendor's tint — so the subject must sit well inside the frame on plain white.
 */
export const CIRCULAR_FRAMING_CLAUSE =
  "Framing: the image will be cropped to a circle, so keep the whole subject centred inside the " +
  "middle 70% of a square 1:1 frame, with nothing touching or crossing the edges, on a plain flat " +
  "pure white background (#ffffff) with no border, no vignette, no text and no watermarks.";

function paletteClause(palette: PromptPalette): string {
  return `Use the store's brand colours as accents: primary ${palette.primary} and accent ${palette.accent}.`;
}

/**
 * Constructs an AI generation prompt for category imagery based on the requested visual style.
 */
export function buildCategoryImagePrompt(
  categoryName: string,
  style: CategoryImageStyle,
  palette: PromptPalette,
): string {
  const cleanName = categoryName.trim();

  const lead =
    style === "3d-icon"
      ? `3D rendered commercial app icon of ${cleanName}. ` +
        `Clay-smooth tactile plastic and metallic materials, glossy specular highlights, studio ambient lighting ` +
        `with a soft contact shadow directly underneath, isometric 45-degree angle, high detail, vibrant retail colours.`
      : // Default: Commercial studio product photography
        `Commercial studio grocery photography of fresh appetizing ${cleanName}, realistic retail presentation, ` +
        `soft studio ambient lighting, genuine product photography, high resolution, sharp focus.`;

  return `${lead} ${paletteClause(palette)} ${CIRCULAR_FRAMING_CLAUSE}`;
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
 * The subject of each 3D slot's icon (#1288): WHAT to draw, with no colours of any vendor — the
 * palette and the circular framing are added by `buildSlotAssetPrompt`. Keyed by `ICON_SLOTS` id.
 */
const SLOT_SUBJECTS: Record<string, string> = {
  "delivery-van":
    "a sleek modern refrigerated grocery delivery van, isometric 3/4 front perspective, clean white body, glossy headlights",
  storefront:
    "a charming miniature grocery store boutique with a striped awning, a neat glass window and paper shopping bags out front",
  "quick-shop":
    "a dynamic shopping cart with a 3D lightning bolt bursting forward through it, chrome wheels",
  "user-profile":
    "a sleek minimalist glossy avatar bust, smooth stylised human profile silhouette, no clothing details",
  "cart-floating":
    "a chrome wire grocery shopping trolley filled with fresh groceries: lettuce, tomatoes, apples, bananas and a baguette, 3/4 isometric perspective",
  "secure-checkout":
    "a polished metallic security shield with an embossed padlock and a security checkmark",
  "order-updates":
    "a gleaming notification bell with a postal delivery envelope and an alert badge",
  "view-shopper": "a brown paper grocery bag filled with a baguette, leafy greens and apples",
  "view-staff": "a modern retail point-of-sale register terminal and a handheld barcode scanner",
  "view-admin": "a polished security badge with a master administrative key",
  "rewards-coin": "an embossed golden loyalty coin with a star emblem",
  "halal-certified":
    "a halal certification rosette medal badge with a ribbon and a clean geometric emblem",
  "postcode-search": "a 3D location map pin with a magnifying glass lens",
  "contact-follow": "a speech bubble beside a smartphone, suggesting contact and social follow",
  "rewards-gift":
    "an open gift box tied with a satin ribbon, a small golden trophy rising out of it",
};

function slotSubject(slot: string): string {
  const known = SLOT_SUBJECTS[slot];
  if (known) return known;
  const entry = getIconSlot(slot);
  if (entry?.kind === "flat") return `a ${entry.notoId.replace(/-/g, " ")}`;
  return `a ${slot.replace(/[-_:]+/g, " ").trim()}`;
}

/**
 * Constructs an AI generation prompt for a UI icon slot (`ICON_SLOTS`, #1288): the slot's subject,
 * the vendor's palette and the circular framing clause, readable at 24px.
 */
export function buildSlotAssetPrompt(
  slot: string,
  style: CategoryImageStyle,
  palette: PromptPalette,
): string {
  const subject = slotSubject(slot);
  const lead =
    style === "photo"
      ? `Commercial studio photograph of ${subject}, realistic materials, soft studio lighting, sharp focus.`
      : `Commercial 3D rendered UI app icon of ${subject}, clay-smooth and glossy materials, soft contact shadow ` +
        `directly underneath, crisp silhouette, high contrast, clearly readable at 24px.`;
  return `${lead} ${paletteClause(palette)} ${CIRCULAR_FRAMING_CLAUSE}`;
}
