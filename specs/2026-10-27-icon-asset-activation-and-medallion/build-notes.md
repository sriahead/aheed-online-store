# Icon assets: deactivation, circular medallion, and the AI-replaceable icon inventory (build notes)

Written at the end of Build, **before** the Clear. Issue `#1288`, branch
`feature/1288-icon-asset-medallion` (from `staging` at `e95b6ad`). Commits: `38f0d7c` (spec),
`f1640aa` (spec corrections), `ec056bc` (build), then the CHANGELOG normalisation and these notes.

Built in the same context that wrote the spec (Opus). Validation has **not** run; nothing here was
exercised under `npm run preview` or in a browser. Local gates at `ec056bc`: `lint` 0, `typecheck` 0,
`format:check` clean, `npx vitest run --maxWorkers=4` **338 files / 4767 tests passed**, `npm run build`
0, `icons:build` no diff, `kms:validate` 0 failing, `kms:check-generated` current.

## What changed and why

**A. Deactivate (R1–R7).**
- `lib/repositories/category-assets.ts`: `selectCategoryAsset` rewritten and `deactivateCategoryAsset`
  added. Each does all its reads and writes on the `tx` client of ONE `prismaWs.$transaction(async (tx) => …)`
  (shared `toSummary`/`ASSET_INCLUDE` helpers). Deactivating a category asset sets `Category.imageKey = null`.
- `lib/category-assets-service.ts`: `deactivateCategoryAssetForVendor`.
- `app/api/admin/category-images/deactivate/route.ts`: a copy of the select route with the facade swapped
  (same ADMIN gate, status codes and `revalidatePath` set).
- `components/staff/IconGalleryClient.tsx`: `handleDeactivate`; the active card's static "Active" label is
  now a `Deactivate` button; the preview modal gains `Deactivate Asset`. New required prop `canManage`;
  when false, the generator panel and every Activate/Deactivate/Delete control are hidden and the
  sentence "Only an admin can generate or change visual assets." is shown.
- `app/(admin)/staff/icons/page.tsx`: passes `canManage={auth.via !== "STAFF"}` (platform admin and vendor
  ADMIN can manage). The page's `requireVendorRole("STAFF", "ADMIN")` and nav tier are unchanged.
- `components/staff/CategoryImageManager.tsx`: `handleDeactivate`; the active candidate's "Active" label is a
  `Deactivate` button; after it, the main preview shows the category's built-in glyph with the caption
  "Built-in artwork". New optional `slug` prop (passed by `CategoryForm`) picks that glyph via
  `categoryIconName`; without it the glyph is `folder-tree`.

**B. Slot registry (R8–R12).** `lib/icon-slots.ts` — `ICON_3D_SLOTS` (15, hand-written with `surfaces`),
`FLAT_ICON_SLOTS` (derived from `ICON_REGISTRY` where `provider === "noto"`: 81 at this commit, including
`featured-star` and `heart-outline`), `DEPARTMENT_3D_NAMES` (8), and helpers `isIconSlotId`, `getIconSlot`,
`slotIdForIcon3D` (`cart-add` → `cart-floating`), `slotIdForIconName` (undefined for functional icons).
The gallery's local `SYSTEM_SLOTS` is gone; the generate route returns 400 `Unknown slot` before the AI
meter is created. No Prisma change.

**C. `components/icons/IconMedallion.tsx` (R13, R14).** Client component; resolution photo → ai → static →
vector, reported in `data-medallion-source`; `data-medallion-slot` carries the resolved slot.
`Icon3D` gained `data-icon3d` on all three of its root branches.

**D. Call sites (R15–R19).** Every `<Icon3D>` outside `components/icons/` and every ≥ 32 px decorative
`<Icon>` now renders `IconMedallion`. `DepartmentScroller` and `DepartmentGlyph` were rewritten so every
branch is a medallion (single `action` tint). The 14 empty-state/heading sites were converted by a
one-off script; `ErrorPanel` and the landing feature cards by hand.

**E. Prompts (R20–R23).** `lib/category-image.ts`: `PromptPalette`, `CIRCULAR_FRAMING_CLAUSE`,
`SLOT_SUBJECTS` (what to draw, no colours), and both builders now take `(…, style, palette)` and end with
the clause. `lib/category-image-pipeline.ts` builds the palette from `fetchVendorProfile(vendorId).primitives`
(`green`, `orange`).

**F. Docs.** ADR-008 v1.3.0 Decision 6 (and the "AI-generated icons" alternative note); design-system
v1.26.0 "The circular medallion" subsection plus the department-illustration paragraph; standards guide
v1.2.0 "Replaceable icon inventory" (104 rows: 15 + 8 + 81, generated from the registry once; the test in
`tests/icon-slots.test.ts` keeps it in step); staff guide v2.15.0 `/staff/icons` section.
`ARTIFACT_INDEX.md` and `app/(admin)/staff/runbook/docs.ts` regenerated with `kms:build-index`.

**Tests.** New: `category-asset-deactivate.test.ts` (R1–R3), `icon-gallery-deactivate.test.tsx` (R4, R5,
R7, R9), `icon-slots.test.ts` (R8, R26), `icon-medallion.test.tsx` (R13, R14), `icon-medallion-coverage.test.tsx`
(R15–R18), `category-image-prompts.test.ts` (R20–R22), `verify-medallion-markup.test.ts` (R28).
Extended: `category-asset-gallery.test.ts` (R10 + transactional select), `category-image-generation.test.ts`
(R23 via `vi.importActual` of the real pipeline). **Updated** (they pinned the pre-#1288 markup — an inner
`<svg>` per button, square/alternating tiles, 48 px illustrations): `navigation-icon-fixes`,
`3d-icons-expansion`, `floating-buttons-icon`, `icon-credits-and-tooltips`, `category-photography`,
`department-illustrations`, `department-scroller`, `error-boundary` (R5 now checks the danger-tinted
medallion instead of `text-danger`), `header-shopping-list`, `ui-checkout-improvements`. Each edit carries
a `#1288` comment.

**Orient repairs carried on this branch.**
- `specs/roadmap.md` v1.184.0: 11 change-log rows — the 8 `sdd:audit` gaps, promotions #1263 and #1271,
  and a row recording that KMS slices `#1272/#1274/#1276` merged without a `specs/` folder.
  `sdd:audit` now reports exactly one gap: this in-flight slice (expected mid-loop).
- `CHANGELOG.md` (own commit): git classed it as **binary** because a UTF-16 roadmap-style row
  ("2026-09-12 | Documentation handoff for #734…", already in the roadmap) had been appended, adding 113
  NUL bytes — so `.gitattributes` never normalised it and it was stored with CRLF. Row removed; file is now
  `i/lf`. Also repaired PowerShell backtick damage in the `#1287` entry (`` `b`` → backspace) and the
  `#1261` entry (`` `a`` → BEL, `` `f`` → form feed, backticks stripped). Content diff ignoring EOL: 9 lines
  in, 18 out.

### Medallion sizes (R19)

One line per changed site: `file:line — what it replaced — new size`. "Icon box" means the old
`Icon3D size` / `<Icon>` `h-N` the medallion now stands in for.

- `components/layout/Header.tsx:284` — `Icon3D storefront size={24}` — 24
- `components/layout/Header.tsx:299` — `Icon3D user-profile size={24}` (signed in) — 24
- `components/layout/Header.tsx:316` — `Icon3D user-profile size={24}` (sign in) — 24
- `components/layout/ShoppingListLink.tsx:28` — `Icon3D quick-shop size={24}` — 24
- `components/layout/ViewSwitcher.tsx:76` — `Icon3D size={18}` — 18
- `components/layout/ViewSwitcher.tsx:98` — `Icon3D size={20}` — 20
- `components/cart/CartDrawerShell.tsx:123` — `Icon3D cart-add size={28}` — 28
- `components/cart/CartDrawerShell.tsx:170` — `Icon3D cart-add size={24}` — 24
- `components/cart/CartContents.tsx:109` — `Icon3D cart-add size={72}` — 72
- `components/layout/FloatingContact.tsx:154` — `Icon3D contact-follow size={38}` — 38
- `components/layout/LocationControl.tsx:267` — `Icon3D postcode-search size={42}` — 42
- `components/rewards/RewardsLauncher.tsx:116` — `Icon3D rewards-coin size={24}` — 24
- `app/(storefront)/checkout/page.tsx:120` — `Icon3D secure-checkout size={44}` — 44
- `app/(storefront)/icon-credits/page.tsx:169` — `Icon3D size={32}` — 32
- `app/(landing)/page.tsx:129` — `Icon3D delivery-van size={24}` — 24
- `app/(landing)/page.tsx:137` — `Icon3D halal-certified size={24}` — 24
- `app/(landing)/page.tsx:229` — wrapper `w-12 h-12 rounded-xl bg-action-tint/30` (+ `Icon3D size={44}`) — 48
- `app/(landing)/page.tsx:248` — wrapper `w-12 h-12 rounded-xl bg-accent-tint/30` — 48 (`tint="accent"`)
- `app/(landing)/page.tsx:263` — wrapper `w-12 h-12 rounded-xl bg-danger-tint/30` — 48 (`tint="danger"`)
- `components/layout/DepartmentScroller.tsx:62/73/82/94` — tile `h-16 w-16` (photo `rounded-2xl`, others `rounded-full` alternating tint) — 64
- `components/layout/DepartmentGlyph.tsx:34/47/53/65` — `h-24 w-24 md:h-32 md:w-32` (photo box, `Icon3D size={96}`, illustration img, glyph) — 96, `md:!h-32 md:!w-32` (128)
- `components/errors/ErrorPanel.tsx:41` — `rounded-full bg-danger-tint p-4` around `h-8 w-8` (32 + 2×16) — 64
- `components/bundle/BundleCard.tsx:54` — `h-10 w-10` — 40
- `components/staff/StockFileImporter.tsx:167` — `h-10 w-10` — 40
- `components/staff/StockFileImporter.tsx:387` — `h-8 w-8` — 32
- `components/product/QuickViewDrawer.tsx:293` — `h-8 w-8 text-danger` — 32 (`tint="danger"`)
- `app/(storefront)/checkout/[orderNumber]/page.tsx:54/57/60` — `h-8 w-8` (action/accent/danger text) — 32 each, matching tint
- `app/(storefront)/checkout/[orderNumber]/cancel/page.tsx:60` — `h-8 w-8 text-accent` — 32 (`tint="accent"`)
- `h-8 w-8` empty states, all 32: `app/(admin)/staff/bundles/page.tsx:58`, `customers/page.tsx:71`,
  `net-content/page.tsx:113`, `orders/page.tsx:131`, `products/page.tsx:241`, `promotions/page.tsx:73`,
  `search-synonyms/page.tsx:67`, `app/(storefront)/account/orders/page.tsx:51`,
  `components/staff/CategoryListClient.tsx:24`, `components/staff/IconGalleryClient.tsx:495`
- Staff previews (the old square box is **kept**; the medallion sits inside it, so these sizes are new
  choices, not replacements): `IconGalleryClient.tsx:524/533` card 120 (box `aspect-square` card width),
  `:651/658` modal 320 (box `aspect-square`, `max-w-lg`), `CategoryImageManager.tsx:293/301` main preview
  96 (was the `h-24 w-24` box itself — 96, box removed), `:374/382` candidates 88 (box kept).

## Decisions taken during the build

- **Medallion props beyond R13's list:** `animated`, `dataIcon` (keeps the `data-icon` values existing
  selectors use, e.g. `user`, `shopping-cart`, `users`), `loading`, `fallbackIcon` (glyph if a photo fails)
  and `imageFit` (see Deviations). All optional.
- **Root is `flex`, not `inline-flex`,** so the `mx-auto` that empty states relied on still centres it
  (preflight made the old `<svg>` block-level). Every parent is a flex container, so nothing else moves.
- **The medallion renders static 3D cut-outs itself** (an `<img>` at 80 %), and calls `Icon3D` only for
  the vector case with `renderAs="svg"`. So the hidden `sr-only` SVG `Icon3D` emitted beside its image is
  no longer present; decorative medallions are `aria-hidden` anyway. `animated` defaults to `false`
  (Header etc. already passed `false`; checkout/location/landing previously defaulted to animated, but
  those names have static assets, which never animated).
- **One tint per meaning:** landing feature cards keep their old action/accent/danger colours via `tint`;
  checkout result headings map `text-action/accent/danger` to the same tint; everything else is `action`.
- **`canManage = auth.via !== "STAFF"`**, computed on the server page, rather than a client role fetch.
- **The gallery's "System Icons" tab now excludes `icon:` slots**, which have their own "Flat icons" tab.
- **DepartmentScroller hover:** dropped `group-hover:border-action/40` (the medallion has no border);
  kept the scale/translate/ring/shadow hover.
- **R28 checker** is a dependency-free tag-stack walk, not jsdom: `jsdom` is installed but has no
  `@types/jsdom`, and adding a dependency for a script was not worth it.
- **Prompt subjects** for the 15 3D slots were rewritten colour-free from the old themed prompts
  (`SLOT_SUBJECTS`); `postcode-search`, `contact-follow` and `rewards-coin` got new subjects
  (`rewards-coin` previously reused the trophy/gift prompt).
- **ADR-008's front-matter summary** had to be rewritten (≤ 300 chars, quoted): an unquoted ` #1288`
  was read by YAML as a comment and truncated it.
- **Follow-up issues filed:** `#1289` production Neon quota outage (P10, owner action), `#1290` deleting
  the active asset auto-activates another candidate (P11), `#1291` 24 px staff-hub/quick-shop card icons
  are below medallion size (P11).

## Deviations from the spec

- **R23 / plan §E named `getVendorBranding`**, which returns the raw nullable branding row with no
  `primitives`. Built against `fetchVendorProfile(vendorId).primitives` (falls back to
  `DEFAULT_BRAND_PRIMITIVES`, same source `brandStyle()` uses). The spec text was corrected in `f1640aa`
  before the build commit, and validation row R23 mocks `fetchVendorProfile`.
- **R13 prop list:** the extra optional props listed under Decisions. Nothing in R13 is missing.
- **R14 for illustrations:** department illustrations are transparent SVG art, so they are passed as
  `imageUrl` with `imageFit="inset"` and render like a static cut-out (`object-contain mix-blend-multiply`
  at 80 %) while still reporting `data-medallion-source="photo"`. R14's "`photo` → `object-cover`" holds
  for every real photo (the default `imageFit="cover"`).
- **R28's validation row says the script reuses `tests/verify-icon-markup.test.tsx`'s parsing helper.**
  It does not (that helper only inventories `<svg>`s); it has its own tag-stack walk, unit-tested in
  `tests/verify-medallion-markup.test.ts`.
- **R15/R17 coverage test is `tests/icon-medallion-coverage.test.tsx`** (renders JSX), not `.ts`;
  validation.md was corrected in `f1640aa`.

## Known-shaky areas

- **Nothing ran live.** No `npm run preview`, no browser. R6, R28 and R29 are untested. In particular:
  - Interactive `$transaction` for select/deactivate on the real `getPrismaWs()` (PrismaNeon). The pattern
    matches `lib/repositories/cart.ts`, but only mocked here.
  - Dev DB must have the `CategoryAsset` table (staging migration `20261027080000_category_and_system_assets`).
    Check `prisma migrate status` against **dev** before R29 (CLAUDE.md: check `DIRECT_URL`/`DATABASE_URL`
    one at a time).
  - R29 generates one real AI image (metered) unless an existing `storefront` candidate is reused.
- **Visual, unverifiable in jsdom:** `mix-blend-multiply` on photos and AI art over each vendor's tint
  (SriMart's tint differs; several checks false-positive on Aheed); the white-background-to-tint effect
  assumes white backgrounds; `md:!h-32 md:!w-32` beating the inline size on `DepartmentGlyph`; 18–24 px
  medallions inside Header/ViewSwitcher pills (a circle inside a rounded pill); illustrations at 80 % in
  64 px tiles (were 48/64 = 75 %).
- **Existing AI assets were generated with the old white-square prompts**; they are now cropped to a
  circle with `object-cover`, so edge detail can be clipped until regenerated.
- **R16's scanner** is regex/brace-based. It catches `className` literals and `size` tokens; a size
  coming from a variable (e.g. `starSizeClass`) is invisible to it by design.
- **Production is down** (`#1289`); this slice cannot be promoted until it is fixed, and staging already
  carries two unpromoted migrations this slice depends on.

## Fix (post-Validate)

- **R18 validation row corrected (the row was wrong, not the code).** It required
  `git grep -l IconMedallion -- components/product` to print nothing, but R16 and `plan.md` §D make
  `QuickViewDrawer`'s `h-8` error `<Icon>` a medallion site, while its photos stay unframed
  (it renders them through `ProductImageGallery`). The row now asserts the real invariant: the only
  medallion in `components/product` is `icon="triangle-alert"`, and none takes an `imageUrl`.
  No source, test or CHANGELOG change: behaviour is unchanged.
- **Not fixed, not code:** R6 and R29 need the dev DB migration `20261027080000_category_and_system_assets`
  applied by the owner; the R28 visual check and CI `gates` are still unverified.
