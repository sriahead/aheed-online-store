# Icon assets: deactivation, circular medallion, and the AI-replaceable icon inventory (requirements / acceptance criteria)

Issue `#1288`. Builds on `specs/2026-10-27-category-asset-gallery-and-realistic-icons/` (the
`CategoryAsset` table, `/staff/icons`, `ActiveSlotIconsProvider`) and ADR-008 (icon system). In one
line: an operator can switch any active asset off again; every icon and category image renders inside
one vendor-tinted circle (`IconMedallion`); all 15 non-department 3D icons and all 81 Noto
decorative/status icons are AI-replaceable from one canonical registry; prompts are tuned for the
circle and use the vendor's own colours. Read `plan.md` for the reasoning and the exclusions.

Terms used below:
- **Slot registry** — `lib/icon-slots.ts`.
- **3D slot ids (exactly 15)** — `delivery-van`, `storefront`, `quick-shop`, `user-profile`,
  `cart-floating`, `secure-checkout`, `order-updates`, `view-shopper`, `view-staff`, `view-admin`,
  `rewards-coin`, `halal-certified`, `postcode-search`, `contact-follow`, `rewards-gift`.
- **Department 3D names (exactly 8, not slots)** — `fruit-veg`, `halal-meat`, `bakery`, `dairy-eggs`,
  `beverages`, `snacks`, `frozen-foods`, `household`.
- **Flat slot ids** — `icon:<name>` for every key of `ICON_REGISTRY` (`components/icons/registry.ts`)
  whose entry has `provider: "noto"` (81 at `e95b6ad`).
- **Large icon** — an `<Icon>` element with `size="xl"` or `size="2xl"`, or whose `className` contains
  an `h-N` or `w-N` utility with N ≥ 8 (≥ 32 px).
- **Functional icon** — an `ICON_REGISTRY` entry with `tier: "functional"`, plus `star`.

## A. Deactivate, transactionally

R1. `lib/repositories/category-assets.ts` exports
    `deactivateCategoryAsset(prismaWs, vendorId, assetId)`. For an asset of that vendor it sets
    `isSelected` to `false`; when the asset has a `categoryId` it also sets that category's `imageKey`
    to `null`. It returns `{ ok: true, asset }` with `asset.isSelected === false`, including when the
    asset was already inactive. For an unknown id, or an id belonging to another vendor, it returns
    `{ ok: false, error: "Asset not found" }` and writes nothing.

R2. `deactivateCategoryAsset` and `selectCategoryAsset` each perform every write through the client
    passed to the callback of a single `prismaWs.$transaction(async (tx) => …)` call. Neither function
    calls `update`, `updateMany` or `category.update` on `prismaWs` directly.

R3. `POST /api/admin/category-images/deactivate` (`app/api/admin/category-images/deactivate/route.ts`)
    calls `requireVendorRole("ADMIN")` and returns that result's `status` when it refuses. It
    returns 400 `{ error: "Missing assetId" }` without a string `assetId`/`id` in the JSON body, 404
    when the repository returns `ok: false`, and 200 with the repository result otherwise. On success
    it calls `revalidatePath` for `/staff/categories`, `/staff/icons`, `/categories` and `/`, plus
    `/staff/categories/<categoryId>` when the asset has a category. It goes through a new facade
    `deactivateCategoryAssetForVendor(vendorId, assetId)` in `lib/category-assets-service.ts`.

R4. In `IconGalleryClient`, an active asset's card and the preview modal for an active asset show a
    `Deactivate` button that POSTs `{ assetId }` to the route in R3. On a 200 the card loses its
    "Active" badge and shows `Activate` again, without a page reload.

R5. In `CategoryImageManager`, the active candidate shows a `Deactivate` button that calls the same
    route. On success, no candidate is marked active and the manager's main preview shows the
    category's built-in artwork.

R6. After deactivation the affected surface renders its built-in artwork: a 3D slot renders
    `Icon3D`'s static asset or SVG (`data-medallion-source="static"` or `"vector"`), a flat slot renders
    the build-time `<Icon>` (`"vector"`), and a category with `imageKey = null` renders its
    `Icon3D`/illustration/glyph and no photo.

R7. `/staff/icons` passes the viewer's role to `IconGalleryClient`. For a `STAFF` viewer the gallery
    renders no Generate, Activate, Deactivate or Delete controls and shows the sentence "Only an
    admin can generate or change visual assets." An `ADMIN` viewer sees all four controls. The page's
    `requireVendorRole("STAFF", "ADMIN")` call and its `nav-items.ts` tier are unchanged.

## B. Canonical slot registry

R8. `lib/icon-slots.ts` exists, has no `"use client"`/`"use server"` directive and imports no React. It
    exports `ICON_SLOTS` containing exactly the 15 3D slot ids with `kind: "3d"` and exactly the flat
    slot ids with `kind: "flat"`, with no duplicate id. The flat entries are computed from
    `ICON_REGISTRY` at module load, not listed by hand. Every 3D entry has a non-empty `label`, a
    non-empty `surfaces` array and an `icon3d` that is a key of `ICON_3D_DEFINITIONS`;
    `cart-floating`'s `icon3d` is `cart-add`. The set {3D entries' `icon3d`} ∪ {the 8 department
    names} equals the set of `ICON_3D_DEFINITIONS` keys (23).

R9. `components/staff/IconGalleryClient.tsx` declares no slot list of its own (the identifier
    `SYSTEM_SLOTS` no longer appears in it). Its generator target picker lists every `ICON_SLOTS`
    entry, grouped under the headings "3D icons" and "Flat icons", and its filter tabs include a
    "Flat icons" tab showing only assets whose `slot` starts with `icon:`.

R10. `POST /api/admin/category-images/generate` returns 400 `{ error: "Unknown slot" }` for a `slot`
     that is not an `ICON_SLOTS` id, before calling the AI meter or the image service. `icon:package`
     and `postcode-search` are accepted.

R11. `runSlotAssetPipeline` is called from exactly one route file,
     `app/api/admin/category-images/generate/route.ts`. No route, script or scheduled workflow
     generates more than one slot asset per request.

R12. `prisma/schema.prisma` and `prisma/migrations/` are unchanged by this slice.

## C/D. The medallion and where it is used

R13. `components/icons/IconMedallion.tsx` exists, starts with `"use client"`, and exports
     `IconMedallion` taking `size` (outer diameter in px, required) and exactly one of `icon3d`
     (an `Icon3DName`), `icon` (an `IconName`) or `imageUrl` (string), plus optional `slot` (an
     `ICON_SLOTS` id that overrides which slot is looked up), `tint` (`"action" | "accent" |
     "danger"`, default `"action"`), `active`, `label`, `decorative` and `className`. Its root element
     carries `data-medallion`, `data-medallion-slot` (the resolved slot id, omitted when there is
     none), the classes `rounded-full`, `overflow-hidden` and `bg-<tint>-tint`, and inline
     `width`/`height` equal to `size`. `Icon3D`'s root element additionally carries
     `data-icon3d="<name>"`.

R14. `IconMedallion` resolves content in this order and reports it in `data-medallion-source`:
     `imageUrl` → `"photo"`; the URL that `useActiveSlotIcons()` holds for the slot (the `slot` prop,
     else the 3D slot whose `icon3d` is the given name, else `icon:<icon>`) → `"ai"`; for `icon3d`, a
     name in `ICON_3D_IMAGE_ASSETS` → `"static"`; otherwise `"vector"`. An `icon` that is a functional
     icon is never looked up in the active map. `photo` and `ai` content is an `<img>` with the classes
     `h-full`, `w-full`, `object-cover` and `mix-blend-multiply` (it fills the circle; the white
     background the prompts ask for takes on the tint). `static` content (the transparent cut-outs in
     `public/images/icons-3d/`) is an `<img>` with `object-contain` and `mix-blend-multiply` at
     `Math.round(size * 0.8)` px. `vector` content is rendered at `Math.round(size * 0.7)` px.

R15. Outside `components/icons/`, no `.tsx` file under `app/`, `components/` or `features/` contains
     the JSX tag `<Icon3D`.

R16. Outside `components/icons/`, no `.tsx` file under `app/`, `components/` or `features/` contains a
     large `<Icon>` whose `name` is anything other than a string literal naming a functional icon.
     Every such site at `e95b6ad` (the 24 literal sites listed in `plan.md` §D and
     `DepartmentGlyph`'s fallback) renders `IconMedallion` instead.

R17. `DepartmentScroller` renders every category tile, whether it shows a photo, a 3D icon, an
     illustration or a glyph, as an `IconMedallion` with `tint="action"`; the string `bg-accent-tint`
     no longer appears in that file; the current department's tile passes `active`.
     `DepartmentGlyph` renders its photo, 3D icon and glyph branches through `IconMedallion`. The asset
     cards and preview modal in `IconGalleryClient`, and the candidates and main preview in
     `CategoryImageManager`, render their images through `IconMedallion`.

R18. `components/product/ProductCard.tsx`, `components/product/ProductImageGallery.tsx` and every other
     file that renders a `ProductImage` storage key do not import `IconMedallion`.

R19. For every site changed under R15–R17, the `size` passed to `IconMedallion` equals the outer pixel
     size of the wrapper (or icon box) it replaced. `build-notes.md` records each site as
     `file:line — old wrapper classes — new size`, one line per site.

## E. Prompts

R20. `lib/category-image.ts` exports `CIRCULAR_FRAMING_CLAUSE` (a non-empty string containing the
     words "circle" and "white background"). `buildSlotAssetPrompt(slot, style, palette)` and
     `buildCategoryImagePrompt(name, style, palette)` both take a
     `palette: { primary: string; accent: string }` and every prompt they return ends with
     `CIRCULAR_FRAMING_CLAUSE` and contains `palette.primary` and `palette.accent`. This holds for
     every `ICON_SLOTS` id with both styles and for a category name with both styles.

R21. `lib/category-image.ts` contains no six-digit hex colour literal other than `#ffffff`/`#FFFFFF`,
     and none of the words "emerald", "navy", "Aheed" or "SriMart".

R22. A flat slot's prompt contains its Noto id with hyphens replaced by spaces (for `icon:apple`, whose
     Noto id is `red-apple`, the prompt contains "red apple").

R23. `runSlotAssetPipeline` and `runCategoryImagePipeline` build `palette` from the vendor's
     `BrandPrimitives` (`primitives` of `getVendorBranding(vendorId)` in `lib/vendor-service.ts`):
     `primary` = `primitives.green`, `accent` = `primitives.orange`.

## F. Documentation and standing decisions

R24. `specs/decisions/ADR-008-icon-system.md` is at version `1.3.0` with `updated: 2026-10-27` and
     contains a `## Decision 6` section stating: Noto decorative/status icons may be overridden per
     vendor by an AI raster asset; overrides render only through `IconMedallion` at ≥ 32 px;
     `<Icon>` remains hook-free and build-time; overrides come from the per-request map loaded once by
     the layouts, so there is no per-icon data or lookup request (the override image file itself is
     the only fetch); functional icons and `star` are never overridable.

R25. `specs/design-system.md`'s Icons section documents `IconMedallion` as the only frame for icons and
     category imagery, the 32 px rule, the default `action` tint, the multiply blend, and that product
     photography is never framed.

R26. `docs/client-help-centre/icon-and-visual-asset-standards.md` has a "Replaceable icon inventory"
     section whose table lists every `ICON_SLOTS` id exactly once with its kind and where it appears,
     and the 8 department names as "managed per category". A test fails if an `ICON_SLOTS` id is
     missing from that table.

R27. `docs/staff-playbook/staff-tabs-guide.md`'s `/staff/icons` section documents Deactivate (and that
     the built-in artwork returns), the "Flat icons" tab, and that STAFF sees the gallery read-only.

## Live behaviour

R28. `scripts/verify-medallion-markup.ts` exists; given an HTML file path it exits 0 when the file
     contains at least one `data-medallion` element and every element carrying `data-icon3d` has a
     `data-medallion` ancestor, and exits 1 otherwise, naming the offending `data-icon3d` values.
     Under `npm run preview` it exits 0 for the storefront home page HTML of both the Aheed and the
     SriMart vendor host.

R29. Under `npm run preview`, activating a `storefront` slot asset as an ADMIN makes the storefront
     home page's medallion with `data-medallion-slot="storefront"` report
     `data-medallion-source="ai"` and contain the asset's image URL; deactivating it through R3 makes
     the same medallion report `"static"`.

## Gates

R30. `CHANGELOG.md` updated (Gate 4).

R31. `npm run lint`, `npm run typecheck`, `npx vitest run --maxWorkers=4`, `npm run format:check`,
     `npm run icons:build` (leaving no diff), `npm run kms:validate` and `npm run build` all pass
     after this slice.
