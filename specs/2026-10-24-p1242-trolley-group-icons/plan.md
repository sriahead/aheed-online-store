---
id: p1242-trolley-group-icons-plan
title: "Trolley icon for checkout and group icon for contact cluster (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-24
visibility: internal
summary: Update floating checkout button to supermarket trolley (shopping-cart) and floating contact launcher to community group (users). Issue 1242.
tags: [icons, design-system, storefront, noto-emoji, accessibility]
related: [adr-008-icon-system, p1239-noto-emoji-icons-plan]
---

# Trolley icon for checkout and group icon for contact cluster (plan)

Issue `#1242`, owner request on 2026-10-24. Extends `specs/decisions/ADR-008-icon-system.md` and the `#1239` Noto Emoji icon upgrade.

## Context

When reviewing the storefront's floating controls on mobile and desktop, the owner noted two icon improvements:
1. **Checkout / Cart button:** The floating cart trigger at `fixed bottom-6 right-6` and the cart drawer currently render `<Icon name="shopping-bag" />` (Noto Emoji `shopping-bags` 🛍️, two gift/shopping bags). In UK grocery retail, customers shop with a supermarket trolley. The owner requested to use a trolley icon for checkout.
2. **Floating Contact / Grouping cluster button:** The floating contact cluster launcher at `fixed bottom-24 right-6` currently renders `<Icon name="share" />` (Lucide `share-2` icon, three connected circle nodes). The cluster opens vendor channels including the WhatsApp community group, WhatsApp direct chat, help assistant, and social links. The owner requested an appropriate icon for this grouping launcher, selecting `users` (Noto Emoji `busts-in-silhouette` 👥) to represent the WhatsApp community group and customer channels.

## Proposed Changes

1. **`components/icons/registry.ts`:**
   - Add `"shopping-cart": { tier: "decorative", provider: "noto", id: "shopping-cart" },` to `ICON_REGISTRY`.
2. **`components/cart/CartDrawerShell.tsx`:**
   - Update the floating cart trigger button to render `<Icon name="shopping-cart" className="h-5 w-5" />`.
   - Update the drawer header order icon to render `<Icon name="shopping-cart" className="h-5 w-5" />`.
3. **`components/cart/CartContents.tsx`:**
   - Update the empty basket illustration to render `<Icon name="shopping-cart" className="mb-3 h-16 w-16 text-primary-subtle" />`.
4. **`components/layout/FloatingContact.tsx`:**
   - Update the floating contact launcher button from `<Icon name="share" className="h-5 w-5" />` to `<Icon name="users" className="h-5 w-5" />`.
5. **Generator & Builds:**
   - Run `npm run icons:build` to regenerate `components/icons/generated/icon-data.ts`.
   - Run `npm run icons:check` to ensure all generated artifacts are in sync.
6. **Tests:**
   - Update `tests/icon-registry.test.ts`, `tests/icon.test.tsx`, and any other tests verifying icon keys or markup.
