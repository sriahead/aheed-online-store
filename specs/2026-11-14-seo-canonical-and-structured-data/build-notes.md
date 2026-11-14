# Canonical Domain (www.aheedfoodcentre.co.uk), Decommission Nocaped SEO & Structured Data (build notes)

Issue #1591. Built 2026-11-14 on branch `feature/1591-seo-canonical-and-structured-data`.

## What changed

- `app/layout.tsx`: Configured `metadataBase` (`https://www.aheedfoodcentre.co.uk`) and default canonical alternate `"/"`. Added `GroceryStore` Schema.org JSON-LD structured data script.
- `lib/page-metadata.ts`: Updated canonical URL generation to strictly resolve against the vendor's canonical domain (`www.aheedfoodcentre.co.uk`).
- `app/robots.ts`: Added disallow rule for `*.nocaped.com` hosts and ensured sitemap is only provided for production canonical domains.
- `app/sitemap.ts`: Ensured all generated sitemap entries use the canonical host `https://www.aheedfoodcentre.co.uk`.
- `app/(storefront)/products/[slug]/page.tsx`: Injected `Product` and `Offer` Schema.org JSON-LD structured data.
- `lib/seo-schema.ts`: Created modular helpers for constructing `GroceryStore` and `Product` Schema.org JSON-LD objects.
- `tests/seo-canonical-domains.test.ts`: Added comprehensive test suite for canonical domain logic, robots filtering, sitemap hosts, and structured data generation.

## Key Decisions

- **Canonical Host**: The user selected `https://www.aheedfoodcentre.co.uk` as the canonical indexed host.
- **Legacy Domain Decommission**: `aheedfoodcentre.nocaped.com` will be decommissioned. `robots.txt` disallows all crawlers on this host, and Cloudflare 301 redirects forward traffic to `www.aheedfoodcentre.co.uk`.
- **GSC Verification**: Cloudflare DNS TXT verification was confirmed as the preferred verification mechanism.
