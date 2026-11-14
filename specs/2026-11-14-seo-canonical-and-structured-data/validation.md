# Canonical Domain (www.aheedfoodcentre.co.uk), Decommission Nocaped SEO & Structured Data (validation)

| Req | How to verify |
| --- | --- |
| R1, R2, R3 | `tests/seo-canonical-domains.test.ts`: `buildProductMetadata` and `buildCategoryMetadata` emit canonical URLs pointing to `https://www.aheedfoodcentre.co.uk` even when given a `nocaped.com` request host. Root layout exports `metadataBase` and default canonical alternate. |
| R4 | `tests/seo-canonical-domains.test.ts`: `robots()` returns `{ rules: { userAgent: "*", disallow: "/" } }` and no sitemap when `host: "aheedfoodcentre.nocaped.com"`. Returns `disallow: "/admin/"` and canonical sitemap when `host: "www.aheedfoodcentre.co.uk"`. |
| R5 | `tests/seo-canonical-domains.test.ts` & `tests/sitemap.test.ts`: `sitemap()` produces URLs beginning with `https://www.aheedfoodcentre.co.uk` and contains zero occurrences of `nocaped.com`. |
| R6 | Documentation in `build-notes.md` / deployment verification plan for Cloudflare 301 Redirect Rule on `nocaped.com` zone. |
| R7, R8 | `tests/seo-canonical-domains.test.ts`: Schema.org generator functions output valid `GroceryStore` and `Product` JSON-LD schemas matching specification requirements. |
| R9 | `npx vitest run tests/seo-canonical-domains.test.ts tests/sitemap.test.ts tests/robots.test.ts`. |
| Quality Gates | `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run kms:validate`. |
