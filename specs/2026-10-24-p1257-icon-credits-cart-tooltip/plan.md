---
id: p1257-icon-credits-cart-tooltip
title: "Plan — Icon credits page, generated icon attribution, and cart tooltip cleanup (#1257)"
audience: [dev, shopper]
type: spec
status: approved
version: "1.0.0"
updated: 2026-10-24
visibility: internal
summary: Clean up cart tooltip to strictly 'My Cart', create dedicated simple icon credits page with all third-party licences, and attribute generated 3D icons as 'Powered by [Platform Name]' via configurable config. Issue 1257.
tags: [icons, credits, licences, tooltips, cart, 3d-icons, legal]
---

# Plan — Icon credits page, generated icon attribution, and cart tooltip cleanup (#1257)

Issue `#1257`, following user request on 2026-10-24.

## Problem & Motivation

1. **Cart Hover Tooltip:** When hovering over the floating shopping cart button on the storefront, browsers display a tooltip stating `"3D Supermarket Trolley"`. This is caused by the browser's native SVG `<title>` tooltip renderer taking precedence over the parent `<button title="My Cart">`. The user explicitly requires removing the `"3D Supermarket Trolley"` tooltip completely and only showing `"My Cart"`.
2. **Icon Credits:** The storefront footer currently links directly to a raw text file (`/third-party-icon-licenses.txt`). The user requested a dedicated, simple, clear, and to-the-point Icon Credits page covering all icon libraries used across the project with required attributions and licence notices.
3. **Generated & Custom Icons:** AI-generated and custom 3D icons must be clearly identified and stated as **“Powered by [Platform Name]”**, where the platform name is fully configurable (via `PLATFORM_NAME` in `lib/config.ts`) and never hardcoded.
4. **Tooltips & Attributions Audit:** Review and verify existing implementations across desktop, tablet, and mobile, removing outdated tooltip copy and ensuring all third-party notices comply with their respective licences.

## Scope & Technical Design

1. **`components/cart/CartDrawerShell.tsx` & `lib/icons-3d/`:**
   - Add `decorative={true}` to `<Icon3D name="cart-add" ... />` inside `CartDrawerShell.tsx` so child `<title>` and `<desc>` tags are suppressed inside interactive buttons that already have `title="My Cart"`.
   - Update `lib/icons-3d/catalog.ts`: rename `cart-add` name from `"3D Supermarket Trolley"` to `"My Cart"`, and remove superfluous `"3D "` prefixes across catalog names.
   - Update `lib/icons-3d/render.ts`: use `label` in `<title>${escapeXml(label)}</title>` when a custom label is passed.
   - Add `decorative={true}` to `<Icon3D name="contact-follow" ... />` in `components/layout/FloatingContact.tsx`.

2. **Dedicated Storefront Icon Credits Page (`app/(storefront)/icon-credits/page.tsx`):**
   - Render inside `PageContainer width="standard"`.
   - Clear sections for:
     - Third-Party Icon Libraries: Lucide (ISC), Google Noto Emoji (Apache 2.0), Phosphor Icons (MIT), Simple Icons (CC0 1.0).
     - Generated & Custom 3D Icons: Delivery Van, Halal Certification Medallion, Postcode Search, My Cart Trolley, Secure Checkout Shield, Notifications, Department Icons, Loyalty & Rewards, Storefront, Quick Shop, Contact Hub, and User Profile.
     - Generated icons attribution stating **“Powered by [Platform Name]”**, reading from `getPlatformBrandingEnv().PLATFORM_NAME` (with fallback to vendor name / platform default).
     - Link to view raw notice file `/third-party-icon-licenses.txt`.

3. **Footer Integration (`components/layout/StorefrontFooter.tsx`):**
   - Update the "Icon credits" link from `/third-party-icon-licenses.txt` to `/icon-credits`.
   - Update `tests/storefront-footer.test.tsx` to assert the link to `/icon-credits`.

4. **Testing & Quality Assurance:**
   - Create `tests/icon-credits-and-tooltips.test.tsx` testing tooltip purity and page rendering with both default and custom `PLATFORM_NAME`.
   - Run `npm run lint`, `npm run typecheck`, `npm run icons:check`, `npm run kms:validate`, and `npx vitest run`.
