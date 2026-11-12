---
id: 2026-11-12-landing-promotions-search-placeholder-plan
title: "Every live promotion on the landing page; plainer staff search placeholder (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-11-12
visibility: internal
summary: "Raises the landing hero's promotion limit from 3 to 12 so every live promotion rotates, and makes the staff Products search placeholder plainer."
tags: [storefront, promotions, staff-panel]
related: [2026-11-12-catalogue-copy-to-production-plan]
---

# Every live promotion on the landing page; plainer staff search placeholder (plan)

Owner request, 2026-11-12, after the production activation (#1523 follow-up). There were two problems:

- **Only 3 promotions showed.** Production has 7 live promotions, but the landing hero shows 3.
  `getLivePromotionsForStorefront` (`lib/promotions-service.ts`) defaults to `limit = 3`, and the
  landing page calls it without an argument. No spec chose 3. `PromotionHero` is already a rotating
  slideshow with dots, so it handles any count.
- **The search placeholder named PLU and barcode.** On `/staff/products` it read "Search by
  product name, PLU or barcode". The owner wants the placeholder plainer. Matching is unchanged.

## Scope

- Add `HERO_PROMOTION_LIMIT = 12` and make it the default limit. Promotions still come in priority order.
- Change the placeholder to "Search your favourite products…".

## Not changed

- The repository query, the promotion ordering and the hero component.
- Multi-buy imagery. Banners are already uploaded in Staff → Promotions → a promotion → "4. Promotional Banner &
  Creative", and product photos on the product's staff page.
