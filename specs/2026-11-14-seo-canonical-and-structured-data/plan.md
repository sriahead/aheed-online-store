---
id: 2026-11-14-seo-canonical-and-structured-data-plan
title: "Canonical Domain (www.aheedfoodcentre.co.uk), Decommission Nocaped SEO & Structured Data (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-11-14
visibility: internal
tags: [seo, canonical, structured-data, sitemap, robots, migration]
summary: "Establish https://www.aheedfoodcentre.co.uk as the single preferred indexed domain in Google Search, eliminate SEO signals on aheedfoodcentre.nocaped.com, and add Schema.org LocalBusiness and Product JSON-LD structured data."
---

# Canonical Domain (`www.aheedfoodcentre.co.uk`), Decommission Nocaped SEO & Structured Data (plan)

## Objective

Establish `https://www.aheedfoodcentre.co.uk` as the primary, indexed, and preferred canonical domain for Aheed Food Centre in Google Search. Remove all SEO-related signals and indexing from the legacy development domain `aheedfoodcentre.nocaped.com`, configure 301 redirects, and introduce Schema.org `GroceryStore` and `Product` structured data.

## Problem Statement

1. Google continues to associate Aheed Food Centre with `aheedfoodcentre.nocaped.com` because the legacy deployment serves HTTP 200, an indexable `robots.txt` (`Allow: /`), and a sitemap listing `nocaped.com` URLs.
2. Canonical tags in `lib/page-metadata.ts` dynamically derive their URL from the incoming `Host` header instead of the vendor's canonical host, so crawling `nocaped.com` causes the site to self-certify as canonical on `nocaped.com`.
3. The root layout and static storefront pages lack `<link rel="canonical">` tags entirely.
4. The storefront lacks structured data (JSON-LD) for `GroceryStore`, `LocalBusiness`, and `Product`, missing rich snippets in Google search results.

## Scope

1. **Canonical URLs & Metadata**:
   - Set root `metadataBase` to `new URL("https://www.aheedfoodcentre.co.uk")` in `app/layout.tsx` with default `alternates: { canonical: "/" }`.
   - Update `lib/page-metadata.ts` to build canonical URLs using the vendor's canonical domain (`www.aheedfoodcentre.co.uk`), regardless of which host the request arrived on.
   - Add canonical alternates to all static storefront pages.
2. **Decommission Nocaped SEO**:
   - In `app/robots.ts`, explicitly disallow crawling on any `*.nocaped.com` domain:
     ```ts
     if (host.endsWith("nocaped.com")) {
       return { rules: { userAgent: "*", disallow: "/" } };
     }
     ```
   - In `app/sitemap.ts`, ensure all URLs use `canonicalHost`, never `nocaped.com`.
   - Set up 301 redirects from `aheedfoodcentre.nocaped.com/*` to `https://www.aheedfoodcentre.co.uk/*`.
3. **Structured Data (JSON-LD)**:
   - Inject `GroceryStore` / `LocalBusiness` JSON-LD schema on the storefront layout with verified address, telephone, opening hours, geo coordinates, and logo.
   - Inject `Product` and `Offer` JSON-LD schema on `/products/[slug]`.
4. **Testing & Quality Assurance**:
   - Author `tests/seo-canonical-domains.test.ts` to test canonical derivation, robots.txt disallow for nocaped, sitemap generation, and JSON-LD validity.
