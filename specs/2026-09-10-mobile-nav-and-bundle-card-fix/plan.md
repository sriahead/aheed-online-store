---
id: mobile-nav-and-bundle-card-fix-plan
title: "Mobile nav visibility and Value Bundles card size (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-10
visibility: internal
summary: Fix two owner-reported staging regressions — Shop/Shop List/the delivery-postcode badge are unreachable below the lg breakpoint on every route, and Value Bundles cards render nearly double the width of the page's other cards.
tags: [storefront, layout, mobile, header, bundles]
---

# Mobile nav visibility and Value Bundles card size (plan)

Closes `#718` and `#719`. Both owner-reported live against staging, with URLs, after the
`social-contact-surface` slice shipped — neither is caused by that slice; both predate it (confirmed
via `git log` on the touched files), just surfaced now because the owner was reviewing staging.

**Goal:** restore reachability of three header controls on phone-width viewports, and bring
`Value Bundles` card width in line with the rest of `/categories`. No behaviour change beyond
visibility/size — no new routes, no new data, no schema.

**Scope (this slice):**
- `components/layout/Header.tsx`: the "Shop" (`/categories`) and "Shop List"
  (`/shop-your-list`) nav links are `hidden lg:flex` — absent below 1024px on every route, with
  no mobile equivalent anywhere. Follow the pattern the account/sign-in control and cart trigger
  already use in the same file: icon always visible, text label hidden below `sm` (640px)
  via `hidden sm:inline`, rather than hiding the whole control. Tighten horizontal padding at
  mobile widths (`px-2 sm:px-3`) and the nav row's gap (`gap-1.5 sm:gap-2`) to keep the row
  compact with the extra visible controls.
- `components/layout/PostcodeChecker.tsx`: the `badge` variant (used on every non-landing route)
  is `hidden lg:inline-flex` — same defect. It is already compact (an icon plus a short postcode),
  so no icon-only intermediate step is needed; just remove the breakpoint gate.
- `components/bundle/BundleRow.tsx`: `itemWidthClassName` is `[&>*]:w-72 [&>*]:shrink-0
  sm:[&>*]:w-80` (288px/320px). `components/product/ProductRow.tsx` — the page's other card row,
  `New Arrivals`/`Featured Products`, on the same `/categories` page — uses `[&>*]:w-40
  [&>*]:shrink-0 sm:[&>*]:w-44 lg:[&>*]:w-52` (160px/176px/208px). Match it exactly.

**Deliberately excluded:**
- **No change to `BundleCard`'s internal layout.** Its content padding (`p-3.5`) already matches
  `ProductCard`'s. At the narrower width its constituent-item list and "Add all N to basket" button
  may wrap onto more lines — expected (the card grows taller to fit its own content, which carries
  more text than a product card), not a regression, and not something this slice rewrites.
- **No new mobile navigation surface** (bottom nav bar, hamburger menu). The fix reuses the
  icon-always pattern this file already established for account/cart rather than introducing a new
  mechanism — a genuinely new nav surface is a bigger decision than a same-session bug fix should
  make.
- **No change to the landing page's mobile row** (the `sm:hidden` block holding the full postcode
  checker / search form) — it is unaffected by either fix.

**Open items carried forward:** neither fix has been visually confirmed against a real mobile
viewport — no browser tool was available in the session that built it. Both `validation.md` rows
say so explicitly rather than claiming a check that didn't happen.
