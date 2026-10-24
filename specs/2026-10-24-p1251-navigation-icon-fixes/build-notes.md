---
id: p1251-navigation-icon-fixes-build-notes
title: "Fix Quick Shop mobile visibility, icon sizes, user profile icon and navigation drill-down (build notes)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-24
visibility: internal
summary: Build notes for Issue 1251.
tags: [navigation, quick-shop, 3d-icons, storefront, header, mobile-ux, accessibility]
---

# Build Notes: Issue #1251

## Overview
Built and validated fixes for the four user-reported storefront issues on Issue `#1251`:
1. **Quick Shop Visibility & Positioning:** Moved `ShoppingListLink` into `Main Navigation` directly alongside `Shop`, providing consistent side-by-side positioning across all screen sizes (mobile, tablet, desktop) and giving the mobile search bar full width.
2. **Icon Sizing & Tooltips:**
   - Enlarge `FloatingContact` 3D icon from `size={28}` to `size={38}` to fill the circular action button prominently.
   - Enlarge Header `Shop` and `Quick Shop` 3D icons from `size={20}` to `size={24}`.
   - Enlarge `CartDrawerShell` 3D cart icon from `size={24}` to `size={28}`.
   - Enlarge `RewardsLauncher` 3D coin icon from `size={20}` to `size={24}`.
   - Added descriptive, user-friendly `title` tooltips to all interactive action buttons.
3. **User Profile Icon:**
   - Added dedicated `user-profile` 3D icon definition to `lib/icons-3d/catalog.ts` (catalog total: 20 icons).
   - Replaced the plain letter initial in `Header.tsx` with `<Icon3D name="user-profile" size={24} />`.
4. **Reliable Drill-Down Navigation:**
   - Added `prefetch={false}` to `Shop` and `Quick Shop` links to eliminate stale/partial App Router flight cache corruption across route groups.
   - Added scroll-to-top fallback handler on click when already on destination page.

## What changed and why
- `components/layout/Header.tsx`: Moved `ShoppingListLink` into Main Navigation alongside `Shop`, replaced letter avatar with `<Icon3D name="user-profile" size={24} />`, added `prefetch={false}`, and enlarged `Shop` icon to 24px.
- `components/layout/ShoppingListLink.tsx`: Enlarged icon to 24px, added `prefetch={false}`, and added scroll-to-top fallback handler.
- `components/layout/FloatingContact.tsx`: Enlarged 3D contact icon from 28px to 38px and enhanced tooltip text.
- `components/rewards/RewardsLauncher.tsx`: Enlarged 3D coin to 24px and updated tooltip.
- `components/cart/CartDrawerShell.tsx`: Enlarged cart icon to 28px and added descriptive tooltip.
- `lib/icons-3d/catalog.ts`: Added `user-profile` 3D vector definition.

## Deviations from the spec
None. All four reported items were addressed and validated.

## Known-shaky areas
None. All 319 test suites and 4,560 tests pass cleanly without regressions.

## Decisions taken during the build
1. **Placement in Main Navigation:** Placing `ShoppingListLink` inside `<nav aria-label="Main Navigation">` directly adjacent to `Shop` ensures symmetric, intuitive UX on all viewports. On mobile viewports, both buttons render compact 44×44px touch targets with clean 3D icons; on tablet and desktop, both render icons and text labels.
2. **3D User Profile Art:** Rather than a simple flat outline, authored a multi-layered 3D circular avatar bust with soft gradient, glossy rim, and golden membership emblem, harmonising with the existing 3D storefront aesthetic.
3. **Route Group Navigation Stability:** App Router route group crossing from `app/(landing)` to `app/(storefront)` causes client transitions to stall if partial prefetch payloads are cached. Setting `prefetch={false}` ensures complete, fresh server rendering on every navigation.
