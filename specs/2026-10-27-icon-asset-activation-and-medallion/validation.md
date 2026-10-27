# Icon assets: deactivation, circular medallion, and the AI-replaceable icon inventory (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Risk profile: a staff mutation route plus a DB transaction (integration), a UI change on every
storefront page (both vendors, visual), and an AI-cost surface (no new bulk path). No auth, payment or
schema change.

1. **Unit** — repository functions with a mocked `$transaction`, the slot registry, prompt builders,
   `IconMedallion` resolution.
2. **Integration** — the deactivate/generate route handlers with mocked auth and repository.
3. **System / E2E** — `npm run preview` on two vendor hosts, driven with `curl` (no browser needed).
4. **Regression** — structural source scans (R15, R16, R18) that keep the medallion rule true for
   future code.
5. **Security & accessibility** — ADMIN-only mutation (R3, R7); decorative medallions stay
   `aria-hidden`, labelled ones keep `role="img"` (covered inside the R13 test).

## Setup (for the live rows R6, R28, R29)

1. Read CLAUDE.md "Config & secrets": check `DIRECT_URL` and `DATABASE_URL` **one at a time** and
   confirm `.dev.vars` names the **dev** Neon host before starting.
2. `npm run preview`; wait for `Ready on http://127.0.0.1:8787`.
3. Aheed host: `localhost:8787`. SriMart host: `srimart.localhost:8787`. Send every request to
   `http://127.0.0.1:8787` with `-H "Host: <host>"` (and `-H "Origin: http://<host>"` for sign-in);
   prefix curl with `MSYS_NO_PATHCONV=1` in Git Bash.
4. Sign in as the demo ADMIN for the Aheed vendor with a cookie jar, as described in
   `docs/developer-portal/local-dev-playbook.md` (vendor hosts / signing in locally). Credentials come
   from `.dev.vars`; never paste them into a spec file.
5. When finished, kill the whole `node`/`workerd` chain (CLAUDE.md, Windows).

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `npx vitest run tests/category-asset-deactivate.test.ts --maxWorkers=4` passes and contains cases for: slot asset → `isSelected:false`; category asset → `category.update` called with `imageKey: null`; already-inactive → `ok:true`; other vendor's id → `ok:false`, `"Asset not found"`, zero writes. |
| R2  | Unit | Same file: with a mocked `prismaWs` whose `$transaction(cb)` invokes `cb(tx)`, assert `$transaction` is called once per call of each function and `prismaWs.categoryAsset.update`, `.updateMany` and `prismaWs.category.update` are called **zero** times (all writes land on `tx`). |
| R3  | Integration | `npx vitest run tests/category-asset-deactivate.test.ts --maxWorkers=4` route cases: refused auth → that status; body `{}` → 400 `Missing assetId`; repo `ok:false` → 404; success → 200 and `revalidatePath` called with `/staff/categories`, `/staff/icons`, `/categories`, `/` (+ `/staff/categories/<id>` for a category asset). `test -f app/api/admin/category-images/deactivate/route.ts` and `grep -n deactivateCategoryAssetForVendor lib/category-assets-service.ts` both succeed. |
| R4  | Unit | `npx vitest run tests/icon-gallery-deactivate.test.tsx --maxWorkers=4`: render `IconGalleryClient` with one active asset and `canManage`, mock `fetch` → 200; click `Deactivate`; assert the POST went to `/api/admin/category-images/deactivate` with that `assetId`, the "Active" badge is gone and an `Activate` button is present. Same for the preview modal's button. |
| R5  | Unit | Same test file renders `CategoryImageManager` with an active candidate: click `Deactivate`, assert the same POST, then no candidate carries the active badge. |
| R6  | E2E | Preview (Setup). Vector/static fallback is proven by R29's second half for a 3D slot. For a category: as ADMIN, POST `/api/admin/category-images/deactivate` with the active asset id of a category that has an `imageKey` (find one via `GET /staff/icons` HTML or the `/api/admin/category-images/assets` route); then `curl -s -H "Host: localhost:8787" http://127.0.0.1:8787/` and confirm that department's tile medallion has `data-medallion-source` of `static` or `vector`, not `photo`. **Re-activate it afterwards** with the select route so dev data is left as found. Flat-slot fallback: covered by R14's unit case "no map entry → vector". |
| R7  | Unit | `npx vitest run tests/icon-gallery-deactivate.test.tsx --maxWorkers=4`: with `canManage={false}` no button named Generate/Activate/Deactivate/Delete exists and the text "Only an admin can generate or change visual assets." is present; with `true` all four are present. `grep -n 'requireVendorRole("STAFF", "ADMIN")' "app/(admin)/staff/icons/page.tsx"` still matches, and `npx vitest run tests/staff-nav-parity.test.ts --maxWorkers=4` passes. |
| R8  | Unit | `npx vitest run tests/icon-slots.test.ts --maxWorkers=4`: asserts the exact 15 3D ids, flat ids == `icon:`+ every noto key of `ICON_REGISTRY` (computed in the test), no duplicates, non-empty `label`/`surfaces`, `cart-floating` → `cart-add`, and {3D `icon3d`} ∪ {8 department names} equals `Object.keys(ICON_3D_DEFINITIONS)`. `head -3 lib/icon-slots.ts` shows no directive; `grep -c "from \"react\"" lib/icon-slots.ts` prints 0. |
| R9  | Unit | `grep -c SYSTEM_SLOTS components/staff/IconGalleryClient.tsx` prints 0. `tests/icon-gallery-deactivate.test.tsx` asserts the target picker has optgroups "3D icons" (15 options) and "Flat icons" (`ICON_SLOTS` flat count), and that the "Flat icons" tab shows an `icon:package` asset and hides a `storefront` asset. |
| R10 | Integration | `npx vitest run tests/category-asset-gallery.test.ts --maxWorkers=4` (extended): `slot: "not-a-slot"` → 400 `Unknown slot` with the AI meter's `check` and the image service **not** called; `slot: "icon:package"` and `slot: "postcode-search"` reach the pipeline. |
| R11 | Regression | `git grep -l runSlotAssetPipeline -- app scripts .github` lists only `app/api/admin/category-images/generate/route.ts`. |
| R12 | Regression | `git diff --stat origin/staging...HEAD -- prisma/` prints nothing. |
| R13 | Unit | `npx vitest run tests/icon-medallion.test.tsx --maxWorkers=4`: root has `data-medallion`, `data-medallion-slot` (`storefront` for `icon3d="storefront"`, `icon:package` for `icon="package"`, absent for `imageUrl`), `rounded-full`, `overflow-hidden`, `bg-action-tint` by default and `bg-danger-tint` with `tint="danger"`, inline width/height = `size`; `active` adds `ring-action`; decorative → `aria-hidden`, `label` → `role="img"` + `aria-label`. `head -1 components/icons/IconMedallion.tsx` is `"use client";`. |
| R14 | Unit | Same file, under `ActiveSlotIconsProvider`: `imageUrl` → `photo`; map `{storefront: U}` + `icon3d="storefront"` → `ai`, `<img src=U>`; map `{"cart-floating": U}` + `icon3d="cart-add"` → `ai`; map `{"icon:package": U}` + `icon="package"` → `ai`; empty map + `icon3d="storefront"` → `static`, an `<img>` with `object-contain mix-blend-multiply` and width `Math.round(size*0.8)`; `Icon3D` rendered with `renderAs="svg"` carries `data-icon3d`; empty map + `icon="package"` → `vector` with an `<svg>` of width `Math.round(size*0.7)`; map `{"icon:chevron-down": U}` + `icon="chevron-down"` → `vector`. `photo`/`ai` `<img>` classes include `h-full w-full object-cover mix-blend-multiply`. |
| R15 | Regression | `npx vitest run tests/icon-medallion-coverage.test.tsx --maxWorkers=4` passes (scans `app`, `components`, `features` `.tsx` excluding `components/icons/` for `<Icon3D`). Cross-check: `git grep -n "<Icon3D" -- app components features ':!components/icons'` prints nothing. |
| R16 | Regression | Same test file scans every `<Icon …/>` element (multi-line aware) outside `components/icons/`; for a large one (definition in requirements.md), fails unless `name` is a string literal of a functional icon. To prove the test can fail, temporarily add `<Icon name="package" className="h-8 w-8" />` to any page, run it (must fail naming that file), then revert. |
| R17 | Unit | `npx vitest run tests/icon-medallion-coverage.test.tsx --maxWorkers=4` render cases: `DepartmentScroller` with a photo category, a 3D category and a glyph category renders three `[data-medallion]` with `bg-action-tint`, the current one with `ring-action`; `DepartmentGlyph` with and without `imageUrl` renders `[data-medallion]`. `grep -c bg-accent-tint components/layout/DepartmentScroller.tsx` prints 0. `grep -c IconMedallion components/staff/IconGalleryClient.tsx components/staff/CategoryImageManager.tsx` is ≥ 1 for each. |
| R18 | Regression | `git grep -l IconMedallion -- components/product` prints nothing. The coverage test also asserts `ProductCard.tsx` and `ProductImageGallery.tsx` do not import it. |
| R19 | Review | Open `build-notes.md` §"Medallion sizes": one line per site changed under R15–R17. For each, `git diff origin/staging...HEAD -- <file>` shows the removed wrapper's `h-N`/`w-N` (N×4 px) or `size={N}` equal to the new `size`. Any mismatch fails. |
| R20 | Unit | `npx vitest run tests/category-image-prompts.test.ts --maxWorkers=4`: for every `ICON_SLOTS` id × `["photo","3d-icon"]` and for `buildCategoryImagePrompt("Bakery", style, p)` × both styles, with `p = {primary:"#123456", accent:"#abcdef"}`: prompt ends with `CIRCULAR_FRAMING_CLAUSE`, contains both hexes; the clause contains "circle" and "white background". |
| R21 | Regression | `grep -noE "#[0-9a-fA-F]{6}" lib/category-image.ts \| grep -viE "#ffffff"` prints nothing; `grep -niE "emerald\|navy\|aheed\|srimart" lib/category-image.ts` prints nothing. |
| R22 | Unit | Same prompts test: `buildSlotAssetPrompt("icon:apple", "3d-icon", p)` contains "red apple"; `icon:package` contains "package". |
| R23 | Unit | `npx vitest run tests/category-image-generation.test.ts --maxWorkers=4` (extended): with `fetchVendorProfile` mocked to return SriMart-like `primitives` (`green:"#1d4ed8"`, `orange:"#f97316"`), the prompt passed to the mocked image service contains `#1d4ed8` and `#f97316`, for both pipelines. |
| R24 | Review | `head -10 specs/decisions/ADR-008-icon-system.md` shows `version: "1.3.0"`, `updated: 2026-10-27`; `grep -n "^## Decision 6" specs/decisions/ADR-008-icon-system.md` matches, and that section states all five points listed in R24. |
| R25 | Review | `grep -n "IconMedallion" specs/design-system.md` matches inside the `## Icons` section, and that section states the 32 px rule, the `action` tint default, the multiply blend and the product-photo exclusion. |
| R26 | Unit | `npx vitest run tests/icon-slots.test.ts --maxWorkers=4` includes a case reading `docs/client-help-centre/icon-and-visual-asset-standards.md`, locating the "Replaceable icon inventory" table, and asserting every `ICON_SLOTS` id and every department name appears in it exactly once. |
| R27 | Review | Read the `/staff/icons` section of `docs/staff-playbook/staff-tabs-guide.md`: it names Deactivate, says the built-in artwork returns, names the "Flat icons" tab, and says STAFF is read-only. Trace each sentence to a control in `IconGalleryClient` (CLAUDE.md: no test checks a documented capability exists). |
| R28 | E2E | Unit first: `npx vitest run tests/verify-medallion-markup.test.ts --maxWorkers=4` feeds the script an HTML fixture with an `[data-icon3d]` inside `[data-medallion]` (exit 0) and one outside (exit 1, output names it). Then preview (Setup), for each host `localhost:8787` and `srimart.localhost:8787`: `MSYS_NO_PATHCONV=1 curl -s -H "Host: <host>" http://127.0.0.1:8787/ > home-<host>.html` and `npx tsx scripts/verify-medallion-markup.ts home-<host>.html` exits 0. Visual: open both hosts in a browser and confirm every header/trust/category icon sits in a circle of the vendor's tint (SriMart's differs from Aheed's); record a screenshot of each in the Validate notes. |
| R29 | E2E | Preview (Setup), signed in as Aheed ADMIN. Generate one `storefront` candidate (`POST /api/admin/category-images/generate` `{ "slot":"storefront", "style":"3d-icon" }`; one AI image, metered) or activate an existing one with the select route; note its `imageUrl`. `curl` the home page: the element with `data-medallion-slot="storefront"` has `data-medallion-source="ai"` and contains that URL. POST the deactivate route with its id; `curl` again: the same element has `data-medallion-source="static"`. If an asset was active before the test, re-activate it so dev data is left as found. |
| R30 | Review | `git diff origin/staging...HEAD -- CHANGELOG.md` shows a `#1288` entry; `git show HEAD:CHANGELOG.md \| file -` does **not** report CRLF, and the entry contains no `\x08` (`grep -cP '\x08' CHANGELOG.md` prints 0). |
| R31 | CI | The PR's `gates` workflow is green (CI is ground truth). Locally: `npm run lint`, `npm run typecheck`, `npx vitest run --maxWorkers=4` (run alone, not beside a build), `npm run format:check`, `npm run icons:build && git diff --exit-code components/icons/generated`, `npm run kms:validate`, `npm run build` each exit 0. |
