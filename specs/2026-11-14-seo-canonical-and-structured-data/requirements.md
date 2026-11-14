# Canonical Domain (www.aheedfoodcentre.co.uk), Decommission Nocaped SEO & Structured Data (requirements)

Issue #1591. Objective: Establish `https://www.aheedfoodcentre.co.uk` as the primary, indexed canonical domain for Aheed Food Centre, dismantle all search engine indexing on the legacy `aheedfoodcentre.nocaped.com` domain, and provide Schema.org structured data.

## Requirements

### Canonical URLs & Root Metadata

R1. **Root `metadataBase` and default canonical**:
    `app/layout.tsx` must configure `metadataBase: new URL("https://www.aheedfoodcentre.co.uk")` and include default canonical alternate `alternates: { canonical: "/" }`.
R2. **Vendor canonical host derivation in metadata**:
    `lib/page-metadata.ts` must generate canonical URLs (`alternates.canonical`) anchored to the vendor's configured canonical domain (`www.aheedfoodcentre.co.uk`) rather than echoing the incoming request `Host` header.
R3. **Static & Category page canonicals**:
    Category and static storefront pages must have deterministic canonical URLs pointing to `https://www.aheedfoodcentre.co.uk/<path>`.

### Decommission Legacy Nocaped SEO

R4. **`robots.txt` Disallow for Nocaped hosts**:
    `app/robots.ts` must inspect the incoming host header. If the host matches or ends with `nocaped.com` (e.g. `aheedfoodcentre.nocaped.com`), it must return `{ rules: { userAgent: "*", disallow: "/" } }` without advertising any sitemap URL.
R5. **Canonical Sitemap Generation**:
    `app/sitemap.ts` must exclusively emit URLs rooted at `https://www.aheedfoodcentre.co.uk` (or the vendor's canonical domain). URLs referencing `nocaped.com` must never appear in sitemaps.
R6. **301 Redirect Specification**:
    Provide Cloudflare zone redirect rule configuration to return HTTP 301 Permanent Redirect for all requests matching `aheedfoodcentre.nocaped.com/*` pointing to `https://www.aheedfoodcentre.co.uk/$1`.

### Structured Data (Schema.org JSON-LD)

R7. **Storefront `GroceryStore` / `LocalBusiness` JSON-LD**:
    The storefront layout must render Schema.org `@type: "GroceryStore"` JSON-LD containing verified business details:
    - Name: "Aheed Food Centre"
    - Telephone: "01908 239130"
    - Address: "Unit 22-23 Lloyds Court, 11-13 North Tenth Street, Central Milton Keynes, MK9 3EL"
    - Postal code: "MK9 3EL", Locality: "Milton Keynes", Country: "GB"
    - Geo: latitude `52.0438`, longitude `-0.7513`
    - Opening hours specification
    - Canonical URL: `https://www.aheedfoodcentre.co.uk`
R8. **Product Detail `Product` & `Offer` JSON-LD**:
    The product detail page (`app/(storefront)/products/[slug]/page.tsx`) must render Schema.org `@type: "Product"` JSON-LD with:
    - Name, description, image
    - Offer details: price (formatted GBP), priceCurrency ("GBP"), availability ("InStock" / "OutOfStock"), URL.

### Quality & Governance

R9. **Test Coverage**:
    Comprehensive unit/integration tests in `tests/seo-canonical-domains.test.ts` verifying:
    - Canonical URLs consistently point to `https://www.aheedfoodcentre.co.uk` across all helper functions.
    - `robots.ts` disallows `nocaped.com` and allows canonical host with sitemap.
    - `sitemap.ts` never outputs `nocaped.com`.
    - JSON-LD structured data generators produce valid Schema.org objects.
