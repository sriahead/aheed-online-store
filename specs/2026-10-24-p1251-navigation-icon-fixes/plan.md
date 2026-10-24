---
id: p1251-navigation-icon-fixes-plan
title: "Fix Quick Shop mobile visibility, icon sizes, user profile icon and navigation drill-down (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-24
visibility: internal
summary: Fix Quick Shop mobile/tablet visibility and positioning, enlarge 3D icons and improve tooltips, replace user initial with 3D profile icon, and eliminate navigation drill-down failures. Issue 1251.
tags: [navigation, quick-shop, 3d-icons, storefront, header, mobile-ux, accessibility]
related: [p1248-3d-icons-expansion-plan, adr-008-icon-system]
---

# Fix Quick Shop mobile visibility, icon sizes, user profile icon and navigation drill-down (plan)

Issue `#1251`. Approved by owner on 2026-10-24. Addresses four specific user-reported issues on desktop, tablet, and mobile:
1. **Quick Shop Icon:** Not visible or well-positioned on mobile and tablet devices.
2. **Icon Size and Tooltips:** 3D icons appear too small inside circular/action containers; improve size, alignment, and tooltip copy/positioning.
3. **User Icon:** Replace the current letter initial with a proper user/profile icon.
4. **Shop and Quick Shop Navigation:** Clicking Shop or Quick Shop sometimes does not open drill-down content until refreshed.

## Root Cause Analysis

1. **Quick Shop Positioning & Breakpoint Visibility:**
   - In `Header.tsx`, `Shop` is in `<nav aria-label="Main Navigation">`, but `Quick Shop` was placed outside `<nav>` inside a flex container next to the search bar.
   - On mobile/tablet, the search row is pushed into a secondary row, and below `sm` the text label is hidden. On narrow devices, the search input compresses or hides `ShoppingListLink`, disconnecting it from `Shop`.
   - **Fix:** Position `ShoppingListLink` in `<nav aria-label="Main Navigation">` directly beside `Shop`, ensuring consistent side-by-side visibility on all viewports (mobile, tablet, desktop).

2. **Small Icon Sizes & Tooltips:**
   - 3D icons have a 96×96 viewBox where the artwork occupies ~60px.
   - Sizing `FloatingContact` at `size={28}` in an `h-12 w-12` button resulted in a visible artwork footprint of only ~17.5px.
   - Header icons at `size={20}` produced ~12px visible artwork.
   - **Fix:** Enlarge `FloatingContact` icon from `28` to `38`, Header `Shop` and `Quick Shop` from `20` to `24`, and enhance `title` tooltips with clear descriptive copy.

3. **User Initial vs Profile Icon:**
   - `Header.tsx` rendered `{firstName?.charAt(0)}` in a circle for logged-in users.
   - **Fix:** Introduce a dedicated `user-profile` 3D icon in `lib/icons-3d/catalog.ts` and render it for logged-in account and guest login states.

4. **Navigation Drill-down Failure:**
   - Next.js App Router route group transitions between `app/(landing)` and `app/(storefront)` suffer from stale or empty partial flight payload caches when `prefetch` is active.
   - Clicking `Shop` (`/categories`) or `Quick Shop` (`/quick-shop`) from `/` or between route groups causes the client-side router to stall, requiring a hard browser refresh to load the server page.
   - **Fix:** Add `prefetch={false}` to `Shop` and `Quick Shop` navigation links and wire resilient navigation handlers that guarantee instantaneous route transitions and scroll-to-top.
