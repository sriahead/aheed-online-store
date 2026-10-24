---
id: p1248-3d-icons-expansion-plan
title: "Expand 3D icon suite across Shop, Quick Shop, Contact and Follow, and Department navigation (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-24
visibility: internal
summary: Expand 3D icon system (#1245) to cover header Shop, Quick Shop, floating Contact and Follow, and department categories. Issue 1248.
tags: [icons, 3d-icons, storefront, design-system, navigation]
related: [p1245-3d-icon-system-plan, adr-008-icon-system]
---

# Expand 3D icon suite across Shop, Quick Shop, Contact and Follow, and Department navigation (plan)

Issue `#1248`. Approved by owner on 2026-10-24. Extends `#1245` (3D Icon Studio & API) and `specs/decisions/ADR-008-icon-system.md`.

## Context

Following the launch of the 3D Icon System in `#1245`, only the shopping cart button and select trust badges on the home page displayed 3D icons. The owner requested expanding 3D icon coverage across key storefront navigation and interaction touchpoints:
1. **Header "Shop" button** (`components/layout/Header.tsx`).
2. **Header "Quick Shop" button** (`components/layout/ShoppingListLink.tsx`).
3. **Floating "Contact and Follow" button** (`components/layout/FloatingContact.tsx`).
4. **Department Categories** (`components/layout/DepartmentScroller.tsx` and `components/layout/DepartmentHero.tsx`).
5. **Rewards Launcher** (`components/rewards/RewardsLauncher.tsx`).

## Architecture & Implementation Plan

### 1. New 3D Icon Definitions in `lib/icons-3d/catalog.ts`
- **`storefront`**: 3D grocery store building with shaded canopy/awning, glass entrance, metallic trim, and vendor primary accent.
- **`quick-shop`**: 3D shopping bag with embossed list badge, glowing sparkles, and metallic handles.
- **`contact-follow`**: 3D social connection badge with chat/people silhouette, metallic ring, and vendor primary accent.

### 2. Department Category 3D Wiring
- Enhance `departmentIllustration` in `components/icons/illustrations.ts` or add `department3DIcon(slug)` so that departments with matching 3D icons in `lib/icons-3d/catalog.ts` (`fruit-veg`, `bakery`, `dairy-eggs`, `halal-meat`, `beverages`, `snacks`, `frozen-foods`, `household`, `groceries`) render 3D icons in `DepartmentScroller.tsx` and `DepartmentGlyph.tsx`.
- Fall back gracefully to existing static SVGs or neutral glyphs for unmapped categories.

### 3. Storefront Surface Upgrades
- `components/layout/Header.tsx`: Replace `<Icon name="store" />` with `<Icon3D name="storefront" size={20} />` for the Shop link.
- `components/layout/ShoppingListLink.tsx`: Replace `<Icon name="shopping-bag" />` with `<Icon3D name="quick-shop" size={20} />` for Quick Shop.
- `components/layout/FloatingContact.tsx`: Replace `<Icon name="users" />` with `<Icon3D name="contact-follow" size={28} />` for the floating contact trigger button.
- `components/rewards/RewardsLauncher.tsx`: Replace `<Icon name="rewards-sparkles" />` with `<Icon3D name="rewards-coin" size={24} />`.

### 4. Verification & Testing
- Unit and integration tests in `tests/3d-icons-expansion.test.tsx` verifying:
  - New 3D icons exist in `ICON_3D_DEFINITIONS` and `/api/icons`.
  - Header links render 3D icons with correct dimensions and accessible labels.
  - Floating contact button renders the 3D contact icon.
  - Department scroller and glyph render 3D icons for mapped departments.
- Full verification suite: `npm run lint`, `npm run typecheck`, `npx vitest run --maxWorkers=4`, `npm run icons:check`.
