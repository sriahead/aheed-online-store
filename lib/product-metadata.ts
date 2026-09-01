/**
 * ProductMetadataService port.
 * Fetches product metadata (specifically an image) from Open Food Facts API.
 *
 * Complies with vendor-agnostic architecture using standard fetch.
 */

export interface ProductMetadataService {
  /** Returns an image URL if found on Open Food Facts, or null */
  fetchImageUrl(productName: string, barcode?: string | null): Promise<string | null>;
}

/**
 * Words that carry no identifying information about WHICH product this is, so
 * two names sharing only these are not a match. Sizes and pack counts are
 * handled by the length rule below rather than listed here — "500g" and "2kg"
 * are already excluded for being mostly digits.
 */
const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "pack",
  "of",
  "size",
  "new",
  "fresh",
  "premium",
  "extra",
  "golden",
  "everyday",
  "traditional",
  "original",
  "classic",
]);

/**
 * Tokens worth matching on: three or more characters, not a stop word, not a
 * pure quantity. Exported only through `isRelevantMatch`; the tokenizer itself
 * is an implementation detail of that rule.
 */
function significantTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(
        (token) =>
          token.length >= 3 &&
          !STOP_WORDS.has(token) &&
          // "500g", "2kg", "80pk" — a quantity, not an identity.
          !/^\d/.test(token),
      ),
  );
}

/**
 * Does this Open Food Facts hit actually describe the product we asked about?
 * (#502)
 *
 * WHY THIS EXISTS. The text search below asks for `page_size=1` and the original
 * code returned `products[0]` unconditionally — whatever came back, however
 * weak the match. Open Food Facts ranks on keyword overlap, so every product
 * whose name contains "Paneer" resolves to the SAME top hit: "Golden Paneer
 * 500g", "Premium Paneer 500g" and "Fresh Paneer 250g" all received one
 * identical image. That is the "we are not getting the image we expect and it
 * keeps repeating" this slice was opened for.
 *
 * The rule is deliberately weak — one shared significant token is enough. It is
 * a floor that rejects an unrelated product, not an attempt to judge which of
 * two plausible hits is better; Open Food Facts' own ranking is better placed to
 * do that, and a stricter rule here would reject good matches to avoid bad ones.
 * Anything that survives this is still written with `needsReview` set, so a
 * human confirms it either way.
 *
 * Pure and exported so the rule is unit-testable without a network call.
 */
export function isRelevantMatch(productName: string, candidateName: string): boolean {
  const wanted = significantTokens(productName);
  if (wanted.size === 0) return false;
  for (const token of significantTokens(candidateName)) {
    if (wanted.has(token)) return true;
  }
  return false;
}

export function getProductMetadataService(): ProductMetadataService {
  return {
    async fetchImageUrl(productName, barcode) {
      if (barcode) {
        // Open food facts API by barcode. A barcode IS the identity, so no
        // relevance check applies — an exact-code lookup cannot be a near miss
        // the way a keyword search can.
        const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}`);
        if (res.ok) {
          const data = (await res.json()) as any;
          if (data.product && data.product.image_url) {
            return data.product.image_url;
          }
        }
      }

      // Fallback to text search
      const res = await fetch(
        `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(productName)}&search_simple=1&action=process&json=1&page_size=1`,
      );
      if (res.ok) {
        const data = (await res.json()) as any;
        const candidate = data.products?.[0];
        if (candidate && candidate.image_url) {
          // A hit sharing no significant token with what we asked for is a
          // ranking artefact, not a match — refuse it and let the caller fall
          // through to AI generation rather than storing someone else's photo.
          const candidateName: string = candidate.product_name ?? "";
          if (isRelevantMatch(productName, candidateName)) {
            return candidate.image_url;
          }
        }
      }
      return null;
    },
  };
}
