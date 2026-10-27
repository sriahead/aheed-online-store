---
id: icon-asset-activation-and-medallion-plan
title: "Icon assets: deactivation, circular medallion, and the AI-replaceable icon inventory (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-10-27
visibility: internal
summary: "Let operators set an active category or icon asset back to inactive, render every icon and category tile inside one vendor-tinted circular medallion, and make every 3D and decorative/status icon replaceable with an AI-generated asset (#1288)."
tags: [spec, icons, assets, gallery, design-system, staff-admin, ai-images]
related: [adr-008-icon-system, design-system, icon-and-visual-asset-standards, category-asset-gallery-and-realistic-icons-plan]
---

# Icon assets: deactivation, circular medallion, and the AI-replaceable icon inventory (plan)

Issue `#1288`. Gate 1 approved by the owner on 2026-10-27 as **one slice** covering both the
asset-management fixes (A) and the decorative-icon replacement (B).

**Goal:** an operator can switch any AI asset off again, every icon and category tile looks the same
(a vendor-tinted circle) whichever artwork fills it, and every icon a vendor might want to restyle
(all 15 non-department 3D icons and all 81 Noto decorative/status icons) can be replaced from
`/staff/icons` without a deploy.

## What is broken today (verified 2026-10-27 at `e95b6ad`)

1. **No way back to inactive.** `components/staff/IconGalleryClient.tsx` renders `Activate` only when
   `!asset.isSelected`; an active card shows a static label. `selectCategoryAsset`
   (`lib/repositories/category-assets.ts`) and `POST /api/admin/category-images/select` only ever set
   `isSelected: true`, and nothing clears `Category.imageKey`. `CategoryImageManager` has the same gap.
   Once a vendor activates an asset, the built-in artwork is unreachable.
2. **The select write is not atomic.** `selectCategoryAsset` runs `updateMany` → `update` →
   `category.update` on `getPrismaWs()` outside any `$transaction`; a failure between the first and
   second write leaves the slot/category with nothing selected.
3. **Inconsistent frames.** `DepartmentScroller` draws icons in a tinted `rounded-full` circle that
   alternates between `action` and `accent` tints, but photos in a white `rounded-2xl` square;
   `Header`, `ShoppingListLink` and `ViewSwitcher` use `rounded-xl` squares; cart, rewards, contact,
   location, the trust strip, checkout and the landing page have no frame. AI assets are prompted
   onto a pure-white square, so they read as white squares on tinted surfaces.
4. **Incomplete, triplicated slot list.** The gallery's local `SYSTEM_SLOTS` has 12 entries;
   `ICON_3D_DEFINITIONS` (`lib/icons-3d/catalog.ts`) has 23 names; `postcode-search`,
   `contact-follow` and `rewards-gift` cannot be replaced. The same list is repeated in
   `lib/category-image.ts`'s prompt map. The 81 Noto icons in `components/icons/registry.ts` cannot be
   replaced at all.
5. **Prompts hardcode Aheed's colours** (`#059669`, "emerald green, royal navy, warm gold") in
   `lib/category-image.ts`, so SriMart and every future vendor get Aheed-branded art — an ADR-004
   violation. The prompts are rewritten in this slice anyway (circular framing), so this is fixed here.
6. **Role mismatch.** `/staff/icons` admits `STAFF` (`requireVendorRole("STAFF", "ADMIN")`) but every
   mutation route requires `ADMIN`, so a STAFF user sees Activate/Delete buttons that always fail with
   403.

## Scope (this slice)

### A. Deactivate, transactionally
- New repository export `deactivateCategoryAsset(prismaWs, vendorId, assetId)` and a rewritten
  `selectCategoryAsset`, each doing all its writes inside **one** `prismaWs.$transaction(async (tx) => …)`
  (interactive transaction ⇒ `getPrismaWs()`, per CLAUDE.md). Deactivating a category asset also sets
  `Category.imageKey` to `null`; deactivating is idempotent.
- Facade `deactivateCategoryAssetForVendor` in `lib/category-assets-service.ts`; route
  `POST /api/admin/category-images/deactivate` mirroring the select route (ADMIN, same status codes,
  same `revalidatePath` set).
- `Deactivate` buttons on the active card and in the preview modal of `IconGalleryClient`, and on the
  active candidate in `CategoryImageManager`. After deactivation the surface falls back to its
  built-in artwork: a 3D slot to `ICON_3D_IMAGE_ASSETS`/inline SVG, a flat slot to the build-time
  Noto SVG, a category to its `Icon3D`/illustration/glyph.
- Mutating controls (Generate, Activate, Deactivate, Delete) render only for `ADMIN`; `STAFF` gets the
  gallery read-only with a one-line explanation. The page's tier stays `staff`.

### B. One canonical slot registry — `lib/icon-slots.ts`
- Plain TypeScript module (no React, no `"use server"`). Exports `ICON_SLOTS`, the `IconSlot` type and
  lookup helpers.
- **15 `kind: "3d"` slots**: the 12 existing ids unchanged (so every existing `CategoryAsset.slot` row
  keeps working, including `cart-floating`, which maps to the `cart-add` 3D icon) plus
  `postcode-search`, `contact-follow`, `rewards-gift`. Each carries `label`, `icon3d` and a
  human-readable `surfaces` list.
- **81 `kind: "flat"` slots**: id `icon:<name>` for every `ICON_REGISTRY` entry whose
  `provider === "noto"`, derived from the registry, not hand-copied. The Lucide rating `star` and all
  30 functional Lucide icons are not slots.
- The 8 department 3D names (`fruit-veg`, `halal-meat`, `bakery`, `dairy-eggs`, `beverages`, `snacks`,
  `frozen-foods`, `household`) stay category-managed and are deliberately **not** slots;
  15 + 8 = 23 = every `ICON_3D_DEFINITIONS` key.
- The gallery, the generate route's validation and the prompt map all read this module; the gallery's
  local `SYSTEM_SLOTS` is deleted. The generate route rejects a slot id not in the registry (400).
- No migration: `CategoryAsset.slot` is already free text.

### C. `IconMedallion` — the one circular frame
- `components/icons/IconMedallion.tsx` (`"use client"`, because it reads `useActiveSlotIcons()`, the map
  both `app/(admin)/layout.tsx` and `StorefrontChrome` already load once per request).
- Renders a `rounded-full overflow-hidden` span of the given diameter on a **vendor-themed tint**
  (`bg-action-tint` default; `accent` and `danger` available for status meaning) with
  `ring-1 ring-black/5`, and an optional `active` ring (`ring-2 ring-action`).
- Content resolution, first match wins: an explicit `imageUrl` (category photo) → the vendor's active
  AI asset for the slot → for a 3D slot, `Icon3D` (which already prefers its static asset, then SVG) →
  for a flat slot, the build-time `<Icon>`.
- **Photos and AI assets** fill the circle with `object-cover` and `mix-blend-multiply`, so the white
  studio background every prompt asks for takes on the tint and every medallion reads as one family
  regardless of source. **Static 3D assets** are transparent cut-outs, so they are inset to 80 %
  (`object-contain`) rather than cropped; **vector content** is inset to 70 %.
- Exposes `data-medallion`, `data-medallion-slot` and `data-medallion-source="photo|ai|static|vector"`,
  and `Icon3D` gains `data-icon3d`, so tests and a small HTML checker
  (`scripts/verify-medallion-markup.ts`) can prove no 3D icon escapes the frame on a live page.

### D. Where the medallion is used (the inventory the owner asked for)
- **Rule 1 — every `Icon3D` render goes through `IconMedallion`.** After this slice, `Icon3D` JSX
  appears only under `components/icons/`. Today's sites: `app/(landing)/page.tsx` (trust strip + 3
  feature cards), `app/(storefront)/checkout/page.tsx`, `app/(storefront)/icon-credits/page.tsx`,
  `components/cart/CartContents.tsx`, `components/cart/CartDrawerShell.tsx` (2),
  `components/layout/DepartmentGlyph.tsx`, `DepartmentScroller.tsx`, `FloatingContact.tsx`,
  `Header.tsx` (3), `LocationControl.tsx`, `ShoppingListLink.tsx`, `ViewSwitcher.tsx` (2),
  `components/rewards/RewardsLauncher.tsx`. Each site's old square wrapper (`rounded-xl` +
  background) is removed and the medallion takes the wrapper's former outer size, so layout does not
  shift.
- **Rule 2 — the minimum-size rule for flat icons: 32 px.** A decorative/status `<Icon>` whose declared
  size is ≥ 32 px (`size="xl"|"2xl"`, or an `h-8`/`w-8` class or larger) renders through
  `IconMedallion`; below 32 px it stays a plain inline glyph and is never AI-replaced, so body text,
  buttons and status chips do not sprout circles. At `e95b6ad` the ≥ 32 px sites are 24 literal sites in
  17 files (staff empty states, checkout result pages, `ErrorPanel`, `QuickViewDrawer`, `BundleCard`,
  `StockFileImporter`, account orders) plus `DepartmentGlyph`'s dynamic-name fallback.
- **Rule 3 — every category image surface uses the medallion**: `DepartmentScroller` tiles (photo and
  icon alike, single `action` tint, the alternating tint is dropped), `DepartmentGlyph` hero corner,
  and the staff previews in `IconGalleryClient` and `CategoryImageManager`, so the operator sees what
  the shopper sees.
- **Product photography is excluded**: `ProductCard`, `ProductImageGallery`, `QuickViewDrawer`'s
  product image and anything else keyed by `ProductImage` stay square.
- `docs/client-help-centre/icon-and-visual-asset-standards.md` gains a **Replaceable icon inventory**
  table: every slot id, its kind, and where it appears. A test keeps the table in step with
  `ICON_SLOTS`.

### E. Prompts tuned for the circle, branded per vendor
- `buildSlotAssetPrompt` and `buildCategoryImagePrompt` take a `palette` built from the vendor's
  `BrandPrimitives` (`green`, `orange`) read through `getVendorBranding(vendorId)` in the pipeline;
  no vendor colour or vendor name is hardcoded in `lib/category-image.ts`.
- Every prompt ends with one exported constant, `CIRCULAR_FRAMING_CLAUSE`, asking for a subject
  centred inside the middle 70 % of a square frame on a plain pure-white background with nothing
  touching the edges (it will be cropped to a circle).
- Flat-slot prompts name the subject from the Noto id (`bell`, `package`, `red-apple` → "red apple").

### F. Standing decisions updated
- **ADR-008 → v1.3.0, new Decision 6:** a vendor may override a Noto decorative/status icon with an AI
  raster asset, rendered **only** through `IconMedallion` at ≥ 32 px. `<Icon>` itself is unchanged —
  hook-free, server-renderable, build-time data — and overrides come from the per-request map the
  layouts already load, so there is **no per-icon request**. Functional icons and the rating `star`
  are never overridable.
- **`specs/design-system.md` Icons section:** the medallion is the only frame for icons and category
  imagery; the 32 px rule; the tint choice.

### AI cost
Generation stays one image per explicit `POST /api/admin/category-images/generate`, metered by the
existing `getVendorAiMeter(vendorId, "PRODUCT_IMAGE")` check. No bulk, scheduled or backfill path is
added for slots: 96 slots × N vendors on the shared image quota (discovery log, 2026-09-03) must stay an
operator decision, one icon at a time.

## Deliberately excluded

- **Product photography** in any circle (owner decision, 2026-10-27).
- **Flat icons below 32 px** — never framed, never replaced. The staff hub cards and quick-shop cards
  render 24 px icons and therefore stay plain; enlarging them is a design change, not this slice.
- **The 30 functional Lucide icons and the rating `star`** — controls must stay crisp and
  `currentColor`-themed (ADR-008 Decision 3).
- **Delete auto-promotion.** Deleting the active asset still auto-activates the newest remaining
  candidate (existing `deleteCategoryAsset` behaviour). With Deactivate available the operator can get
  to "no override" explicitly; changing delete semantics is not requested.
- **A dark-mode medallion.** The storefront has no dark theme; `mix-blend-multiply` assumes a light
  tint. If a dark theme ever lands, the medallion needs revisiting (recorded in design-system).
- **Re-generating existing assets** with the new circular prompts — old assets stay as they are; the
  operator regenerates when they choose.
- **Making STAFF able to mutate assets** — the routes stay ADMIN-only; this slice only stops showing
  STAFF buttons that cannot work.
- **Transparent (alpha) generation** — the image service returns opaque PNGs; the multiply blend is
  the chosen workaround.

## Open items carried forward

- **Production is down (Neon 402 quota, found at Orient 2026-10-27)**; nothing here depends on it, but
  this slice cannot be promoted until it is resolved. Staging already carries two unpromoted
  migrations (`20261026150000_category_image_key`, `20261027080000_category_and_system_assets`) that
  this slice's AI-slot features rely on.
- Eight `sdd:audit` roadmap gaps and the damaged `#1287` CHANGELOG entry (CRLF blob, PowerShell
  backtick corruption) were found at Orient; they are repaired on this branch at `/build-notes`
  (post-merge doc changes ride the next slice's branch).
