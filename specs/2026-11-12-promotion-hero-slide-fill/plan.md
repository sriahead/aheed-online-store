---
id: 2026-11-12-promotion-hero-slide-fill-plan
title: "Landing promotion slides fill the carousel when stacked (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-11-12
visibility: internal
summary: "Removes h-full from each promotion hero slide so short slides stretch to the carousel height instead of leaving a bare band under the photo on narrow screens."
tags: [storefront, promotions]
related: [2026-11-12-landing-promotions-search-placeholder-plan]
---

# Landing promotion slides fill the carousel when stacked (plan)

Owner report, 2026-11-12, with a screenshot of production on a narrower window: the "Fresh Catch Sale" slide's
photo stopped part way down the carousel, with a bare band of panel colour below it.

**Cause.** Below `lg` the hero stacks, so the carousel has only `min-h-[300px]` and no definite height. Each
slide had `h-full`. A percentage height against an indefinite parent behaves as `auto`, and because it is
not literally `auto` it also cancels flex `align-items: stretch`. So each slide was only as tall as its own
copy. The track, and the carousel, were as tall as the tallest slide (the one with a bundle price), and
shorter slides left the difference empty. More live promotions (#1530: 3 → 12) made this far more likely.

**Change.** In `components/layout/PromotionHero.tsx`, the slide drops `h-full` and stretches to the track.
Its copy column swaps `h-full` for `flex-1`, so the CTA still sits at the bottom. On `lg` the track has a
definite height and the result is the same.
