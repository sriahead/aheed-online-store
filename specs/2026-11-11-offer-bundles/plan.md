---
id: 2026-11-11-offer-bundles-plan
title: "One-click Buy This Offer: tier-priced bundles, bundle pages, banners that link to them (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-11-11
visibility: internal
summary: "Bundles priced with the same multi-buy tier function the cart uses, a /bundles/[slug] page with a one-click Buy this offer button, promotion banners that link to it, and Aheed's offer bundles and Offer Type filter built from existing data. Staging first."
tags: [bundles, promotions, multi-buy, offers, filters, aheed]
related: [2026-11-11-aheed-catalogue-s1-plan, architecture]
---

# One-click "Buy This Offer" — plan

Issue `#1517` (owner request, 2026-11-11). Acceptance criteria: `requirements.md`.

## Why

The cart and checkout already price a multi-buy (`lib/tier-pricing.ts`, called from
`lib/repositories/cart.ts` and order placement): 4 Medium Chickens charge £18, not £20. A bundle,
though, shows the sum of normal prices (`lib/bundle-pricing.ts` predates tiers, P8.5c vs P8.5d), so a
"4 Medium Chickens" bundle would display £20 and charge £18. And a banner linked to a bundle points
at `/categories?bundle=<slug>`, which no page handles. The owner wants a promotion click to land on
the bundle with a one-click buy.

## Approach

1. `lib/bundle-pricing.ts` prices each constituent line with `tieredLineTotalPence` — the SAME function
   the cart uses — so the card's total is exactly what checkout charges for that bundle added to an
   empty basket. It also reports the normal total and the saving.
2. The bundle repository selects each product's price tier and gains a by-slug read.
3. `BundleCard` shows the offer total, the normal total struck through and "Save £X" when there is a
   saving, a "Buy this offer" button, and links its name to the bundle page.
4. `/bundles/[slug]` renders one bundle with the same card; an unknown or unavailable bundle is a 404.
5. `PromotionHero` sends a bundle-linked promotion (with no explicit link) to `/bundles/<slug>`,
   labels it "Buy This Offer", and prices it with the same function.
6. Data (staging first, all inactive until go-live S1e): one bundle per loaded multi-buy, combined
   packs of related offer products, promotions linked to them, and an `Offer Type` vendor attribute
   (Multi-Buy / Box Offer) so the existing vendor-filter chips (#912) can find box offers too.

## Not changed

Checkout pricing, discount codes, the cart, and the existing filter set.
