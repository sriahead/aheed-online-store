/**
 * Campaign banner image key rules (P8.5e, #356) — pure, DB-free, session-free.
 *
 * Same posture as lib/product-image.ts, whose IMAGE_CONTENT_TYPE / MAX_IMAGE_BYTES
 * / MAX_IMAGE_EDGE_PX / IMAGE_QUALITY / fitWithinEdge this slice reuses directly
 * rather than redeclaring — those rules aren't product-specific, and R18
 * requires no duplicate constants. Only the KEY SHAPE differs (category-rooted,
 * not product-rooted), which is what this file adds.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const SUFFIX = ".webp";

/**
 * `categories/{categoryId}/{uuid}.webp` — a NEW key every time, same
 * immutable-key posture CLAUDE.md documents for product images: replacing a
 * banner writes a new object and repoints the row, so no CDN purge is needed.
 */
export function buildCampaignImageKey(categoryId: string): string {
  return `categories/${categoryId}/${crypto.randomUUID()}${SUFFIX}`;
}

/**
 * Is this exactly a key THIS function could have produced for THIS category?
 * Refused, not normalised — see `isProductImageKey`'s identical reasoning in
 * lib/product-image.ts.
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
