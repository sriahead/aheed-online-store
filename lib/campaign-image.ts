/**
 * Campaign banner image key rules (P8.5e, #356) — pure, DB-free, session-free.
 *
 * Same posture as lib/product-image.ts, whose IMAGE_CONTENT_TYPE / MAX_IMAGE_BYTES
 * / MAX_IMAGE_EDGE_PX / IMAGE_QUALITY / fitWithinEdge this slice reuses directly
 * rather than redeclaring — those rules aren't product-specific, and R18
 * requires no duplicate constants. Only the KEY SHAPE differs (category-rooted,
 * not product-rooted), which is what this file adds.
 */

import { IMAGE_CONTENT_TYPE, imageExtensionForContentType } from "./product-image";
import { storeDescriptionPromptLine } from "./store-description";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const SUFFIX = ".webp";

/**
 * `categories/{categoryId}/{uuid}.{ext}` — a NEW key every time, same
 * immutable-key posture CLAUDE.md documents for product images: replacing a
 * banner writes a new object and repoints the row, so no CDN purge is needed.
 *
 * The extension follows the image's ACTUAL content type (#364), defaulting to
 * WebP. The browser-upload path is WebP end to end and its keys are unchanged;
 * `POST /api/admin/campaign-images/generate` passes what Workers AI actually
 * returned, which is PNG, instead of writing PNG bytes under a `.webp` key.
 */
export function buildCampaignImageKey(
  categoryId: string,
  contentType: string = IMAGE_CONTENT_TYPE,
): string {
  return `categories/${categoryId}/${crypto.randomUUID()}${imageExtensionForContentType(contentType)}`;
}

/**
 * Is this exactly a key THIS function could have produced for THIS category?
 * Refused, not normalised — see `isProductImageKey`'s identical reasoning in
 * lib/product-image.ts.
 *
 * DELIBERATELY STILL WEBP-ONLY after #364 widened the builder. This guards one
 * path: the browser upload, whose presigned PUT is pinned to
 * `IMAGE_CONTENT_TYPE` and whose attach step re-checks `headObject`'s content
 * type. Server-generated keys never pass through here, so accepting other
 * extensions would widen what a client can claim while buying nothing.
 */
export function isCampaignImageKey(key: string, categoryId: string): boolean {
  const parts = key.split("/");
  if (parts.length !== 3) return false;

  const [prefix, id, file] = parts;
  if (prefix !== "categories") return false;
  if (id !== categoryId) return false;
  if (!file.endsWith(SUFFIX)) return false;

  return UUID_PATTERN.test(file.slice(0, -SUFFIX.length));
}

/**
 * #1030 — the Workers AI prompt for a department campaign banner.
 *
 * It used to describe every vendor as "a UK grocery store" with "appetising" light, so SriMart's
 * electronics banners were prompted as food photography. Now it has the same shape as #905's text
 * prompts: a neutral first line, then the vendor's own description as the second line when it has
 * one (`storeDescriptionPromptLine`, inserted as quoted data), then neutral photographic direction.
 * Pure, so `tests/store-description-prompts.test.ts` reaches it directly — a route file may export
 * only its handlers.
 */
export function buildCampaignImagePrompt(
  categoryName: string,
  headline: string | null,
  subtitle: string | null,
  storeDescription: string | null,
): string {
  const copy = [headline, subtitle].filter((part) => part && part.trim() !== "").join(". ");
  const subject = copy === "" ? categoryName : `${categoryName}: ${copy}`;
  const describe = storeDescriptionPromptLine(storeDescription);

  return [
    `Photographic marketing banner for a shop's ${subject}.`,
    ...(describe ? [describe] : []),
    "Natural daylight, shallow depth of field, clean uncluttered composition with space for text " +
      "overlay. No text, no words, no logos.",
  ].join("\n");
}
