/**
 * Per-page metadata helpers for the storefront's two detail routes (#996).
 *
 * WHY THIS EXISTS. Neither `/products/[slug]` nor `/categories/[slug]` had a `generateMetadata`,
 * so both fell through to the vendor-level metadata in `app/layout.tsx` and every product page on
 * a vendor shared one `<title>` and one `<meta name="description">` — roughly 80 of them on the
 * first vendor in production. `#955` makes those pages reachable and lists them in a sitemap;
 * pages that are reachable and listed but indistinguishable still compete with each other for
 * every query, which is why this is part of the same slice rather than a later polish.
 *
 * PURE, AND TAKING ITS INPUTS EXPLICITLY, so both builders can be exercised from a plain test
 * without a request context or a database. The routes resolve the product/category and the vendor
 * profile themselves and pass the results in.
 */

/** Matches what a crawler will actually display; longer descriptions are truncated by the engine. */
const DESCRIPTION_MAX = 160;

/**
 * Truncate at a WORD boundary, with an ellipsis, never mid-word.
 *
 * A hard `slice(0, 160)` is what makes a generated description read as machine output, ending
 * mid-word. The ellipsis is included in the budget, so the result is never longer than
 * `DESCRIPTION_MAX` — a caller asserting the limit would otherwise be off by one.
 */
export function truncateForDescription(text: string, max: number = DESCRIPTION_MAX): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;

  const budget = max - 1; // room for the ellipsis
  const clipped = collapsed.slice(0, budget);
  const lastSpace = clipped.lastIndexOf(" ");
  // A single word longer than the budget has no space to break on — clip it rather than return "…".
  const body = lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped;
  return `${body.trimEnd()}…`;
}

/**
 * The metadata shape both detail routes return.
 *
 * `canonical` is ABSOLUTE, and that is a hard requirement rather than a preference: no
 * `metadataBase` is configured anywhere in this app, and in this version of Next a relative value
 * in a URL-based metadata field without `metadataBase` is a BUILD ERROR, not a silent fallback.
 * It is built from the REQUESTING host, so each vendor's pages are canonical to themselves.
 */
export interface DetailPageMetadata {
  title: string;
  description: string;
  alternates: { canonical: string };
}

/**
 * NO VENDOR NAME OR PRODUCT-CATEGORY NOUN IS WRITTEN HERE. `vendorName` is required — not
 * defaulted — because a default is worse than a literal: every caller that forgot the argument
 * would silently advertise one vendor on every other storefront, which is exactly the `#729`
 * defect (`buildShareLinks`' old `storeName = "Aheed Food Centre"`). The caller passes
 * `getCurrentVendorProfile()`'s name, and when no vendor resolves the route returns no metadata at
 * all rather than naming one — see each route's `generateMetadata`.
 */
export function buildProductMetadata({
  host,
  slug,
  name,
  description,
  vendorName,
}: {
  host: string;
  slug: string;
  name: string;
  description: string;
  vendorName: string;
}): DetailPageMetadata {
  return {
    title: `${name} — ${vendorName}`,
    description: truncateForDescription(description),
    alternates: { canonical: `https://${host}/products/${slug}` },
  };
}

/**
 * `Category` has no description column (`prisma/schema.prisma`), so a category's description is
 * composed from its own name and the vendor's. The wording names no product category, per the
 * vendor-neutral copy rule: vendors here do not sell the same kinds of things.
 */
export function buildCategoryMetadata({
  host,
  slug,
  name,
  vendorName,
}: {
  host: string;
  slug: string;
  name: string;
  vendorName: string;
}): DetailPageMetadata {
  return {
    title: `${name} — ${vendorName}`,
    description: truncateForDescription(`Browse ${name} at ${vendorName}.`),
    alternates: { canonical: `https://${host}/categories/${slug}` },
  };
}
