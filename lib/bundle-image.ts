/**
 * Bundle image key rules (P8.5c, #347) — pure, DB-free, session-free.
 *
 * Same posture as lib/campaign-image.ts (P8.5e) and lib/product-image.ts: only
 * the KEY SHAPE differs (bundle-rooted). The size/content-type/edge constants
 * are NOT redeclared here — `lib/product-image.ts` already owns them and they
 * were never product-specific in logic.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const SUFFIX = ".webp";

/**
 * `bundles/{bundleId}/{uuid}.webp` — a NEW key every time, the immutable-key
 * posture CLAUDE.md documents: replacing an image writes a new object and
 * repoints the row, so a CDN purge is never needed.
 */
export function buildBundleImageKey(bundleId: string): string {
  return `bundles/${bundleId}/${crypto.randomUUID()}${SUFFIX}`;
}

/**
 * Is this exactly a key THIS function could have produced for THIS bundle?
 * Refused, never normalised — a key for another bundle, a missing `.webp`, or
 * an extra path segment all fail (R30).
 */
export function isBundleImageKey(key: string, bundleId: string): boolean {
  const parts = key.split("/");
  if (parts.length !== 3) return false;

  const [prefix, id, file] = parts;
  if (prefix !== "bundles") return false;
  if (id !== bundleId) return false;
  if (!file.endsWith(SUFFIX)) return false;

  return UUID_PATTERN.test(file.slice(0, -SUFFIX.length));
}
