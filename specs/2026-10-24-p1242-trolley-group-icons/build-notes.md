# Trolley icon for checkout and group icon for contact cluster (build notes)

Issue `#1242`. Builds on `specs/2026-10-24-p1242-trolley-group-icons/plan.md` and `specs/decisions/ADR-008-icon-system.md`.

## Summary

Updated the storefront's two persistent floating buttons per owner feedback:
1. **Checkout / Basket button:** Changed from gift shopping bags (`shopping-bag` -> Noto `shopping-bags` 🛍️) to a supermarket trolley (`shopping-cart` -> Noto `shopping-cart` 🛒), matching British grocery shopping conventions.
2. **Contact cluster launcher ("grouping tab"):** Changed from technical share node (`share` -> Lucide `share-2` 🔗) to community group (`users` -> Noto `busts-in-silhouette` 👥), clearly representing the WhatsApp community group, customer channels, and direct contact options.

## Changes Made

- **`components/icons/registry.ts`:**
  - Added `"shopping-cart": { tier: "decorative", provider: "noto", id: "shopping-cart" }`.
- **`components/cart/CartDrawerShell.tsx`:**
  - Updated floating cart button and drawer header to render `<Icon name="shopping-cart" className="h-5 w-5" />`.
- **`components/cart/CartContents.tsx`:**
  - Updated empty cart illustration to render `<Icon name="shopping-cart" className="mb-3 h-16 w-16 text-primary-subtle" />`.
- **`components/layout/FloatingContact.tsx`:**
  - Updated floating contact cluster launcher button to render `<Icon name="users" className="h-5 w-5" />`.
- **`components/icons/generated/icon-data.ts`:**
  - Regenerated via `npm run icons:build`.
- **Tests:**
  - Added `tests/floating-buttons-icon.test.tsx` asserting `CartDrawerShell` renders `data-icon="shopping-cart"` and `FloatingContact` renders `data-icon="users"`.
  - Updated `tests/icon-lucide-manifest.test.ts` to include `shopping-cart` in `allowedAdditions`.
  - Updated `tests/icon.test.tsx` to assert `shopping-cart` renders colourful multi-path SVG without root fill clobbering.
  - Added 30s block timeout to child process test suites in `tests/icon-generator.test.ts` and `tests/verify-icon-markup.test.tsx` for Windows child process stability under load.
- **KMS & Docs:**
  - Added front-matter to `plan.md`, updated `ARTIFACT_INDEX.md` and `docs.ts` via `npm run kms:build-index`.
