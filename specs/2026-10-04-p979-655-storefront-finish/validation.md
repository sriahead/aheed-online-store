# #979, #655 — Storefront finish: remaining tap targets and image fallbacks (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
> 
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Every feature should have appropriate **Unit** and **Integration** testing, followed by relevant validation testing. Broader testing mainly happens before release. However, testing is risk-based: features involving auth, payments, UI changes, performance-sensitive APIs, databases, or external dependencies require additional relevant testing earlier.

1. **Unit Testing**
   - *When needed:* Every feature.
   - *Purpose:* Test isolated business logic, utilities, and components.
2. **Integration Testing**
   - *When needed:* Every feature. (Includes Contract testing).
   - *Purpose:* Verify the component works with its immediate dependencies (e.g., database, external services).
3. **System / End-to-End Testing**
   - *When needed:* For critical user journeys and validation testing.
   - *Purpose:* Validate that the feature works correctly in the real system.
4. **Regression & Acceptance Testing**
   - *When needed:* Mainly before release, or when changing core flows. (Includes Smoke and Sanity testing).
   - *Purpose:* Ensure existing functionality remains unbroken and acceptance criteria are met.
5. **Performance & Resilience Testing**
   - *When needed:* Mainly before release, or for performance-sensitive APIs. (Includes Load, Stress, and Spike testing).
   - *Purpose:* Ensure the system meets throughput/latency targets and degrades gracefully.
6. **Security & Accessibility Testing**
   - *When needed:* Mainly before release, or earlier for features involving auth, payments, or UI changes.
   - *Purpose:* Ensure the system is safe and accessible to all users.

---

## Validation Steps

**Setup, once:** `npm run build` (pinned `--webpack`), then `npm run preview` (never `npm run dev`).
Confirm that `curl -s http://localhost:8787/api/health` and
`curl -s http://srimart.localhost:8787/api/health` both return `"status":"ok"`. Read `CDN` from the
first one's `storage.cdnBase`, and `<P>` from `build-notes.md` ("Product page slug"). Run every `M`
command **alone**, never beside `npx vitest run` or a build. If a run's output is short or Chrome
reports an error page, restart `npm run preview` (kill the whole `node`/`workerd` chain first) and
rerun. Never judge partial output. Run names, `M` and `BLOCK` are defined in `requirements.md`. A
small helper that reads the JSON lines and prints the fields a row names is fine. Keep each run's raw
output in the validation notes. `<baseline commit>` is the commit `build-notes.md` names.

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Integration  | Run **A-filters** at `--widths 390`. It exits 0, and `tapTargets` includes displayed `filter-form` entries. Run **A-cat** at `--widths 390` (no flag): every `filter-form` entry has `displayed: false`. Read the script: `--open-filters` sets `open` on `details` elements containing `[data-tap-surface="filter-panel"]` and then waits at least 200 ms. |
| R2  | Integration  | In **A-filters** at `390`, at least one entry has `hitArea: "label"`, and its `height` is the label's height, not the checkbox's own 13px box. If the panel renders a `select`, there is an entry for it. In **A-cat** at `390`, every displayed entry of `#964`'s surfaces (`location`, `filter-chips`, `filter-panel`, `subcategories`, `collections`) still passes 44 and has no `hitArea` key. |
| R3  | Integration  | Run **A-drawer** at `--widths 390`. It exits 0, and a displayed `cart-drawer-close` entry is printed. Then run `M --base http://localhost:8787 --path api/health --widths 390 --open-cart`. The JSON endpoint has no cart button, so it exits 1 with a reason within about 5 s. |
| R4  | Integration  | Run **A-qv** at `--widths 390`. It exits 0, and a displayed `quick-view-close` entry is printed. Read the script: the click target is the first `[data-product-grid]` child's `button` whose `aria-label` starts with `Quick view `, and a drawer that never appears exits 1 after about 10 s. |
| R5  | Integration  | Run **I-cat** at `--widths 390`: the object has a `brokenImages` array. Run **A-cat** at `--widths 390` (no `BLOCK`): `brokenImages` is present and is `[]`. Read the script: `Network.setBlockedURLs` is sent before the first `Page.navigate`, and before each measurement every `img` gets `loading="eager"` followed by a wait of at least 2000 ms. `git diff origin/staging -- package.json` adds no dependency. |
| R6  | Integration  | Run **A-shop** at `--widths 390`. `scrollerArrows` has one entry per displayed `scroller-arrow`, each with a `name` and a numeric `circleCentreOffset`. The script's header comment mentions `--open-filters`, `--open-cart`, `--open-quick-view`, `--block-urls`, `brokenImages`, `hitArea` and `scrollerArrows`. |
| R7  | Unit         | `git grep -n 'data-tap-surface="search"' -- components/layout/SearchSuggest.tsx` prints a line on the `<input>`. Likewise `filter-form` on the `<form>` in `components/product/ProductFilterForm.tsx`, `cart-drawer-close` on the close button in `components/cart/CartDrawerShell.tsx`, `quick-view-close` on the close button in `components/product/QuickViewDrawer.tsx`, `gallery-arrow` on both carousel arrows (two matches) in `components/product/ProductImageGallery.tsx`, and `quick-view-add` on the `drawer` variant's wrapper in `components/cart/AddToCartButton.tsx`. Read the lines around each match to confirm the element. |
| R8  | E2E          | Run each run in R8's table at `--widths 360,390`. For each listed surface, at least one displayed entry exists, and every displayed entry of it has `width` ≥ 44 and `height` ≥ 44. A-filters and S-filters include the Apply button's entry, and A-filters includes an entry with `hitArea: "label"`. A-shop includes `Scroll departments right`, `Scroll products right` and `Scroll bundles right`. A-qv includes `quick-view-add` entries named `Decrease quantity of …` and `Increase quantity of …` (or `build-notes.md` says the product was out of stock). If A-qv shows no `gallery-arrow`, `build-notes.md` says the product had one image. |
| R9  | E2E          | In every R8 run's output at `360` and `390`, `viewportWidth` and `documentScrollWidth` both equal the requested width. |
| R10 | E2E          | Run **A-shop** at `--widths 390,1280`. For `Scroll departments left` and `Scroll departments right`, `circleCentreOffset` at `390` is within ±2 of its value at `1280`. |
| R11 | Regression   | Run **A-cat** and **S-cat** at `--widths 360,390,768`. For each run and width, `firstCardTop` equals (±1) the value at the same width in `baseline/a-cat.jsonl` or `baseline/s-cat.jsonl`. |
| R12 | Regression   | Run **A-cat**, **A-filters**, **A-drawer**, **A-qv** and **A-shop** at `--widths 1024,1280`. For every displayed `tapTargets` entry, find the entry with the same `surface` and `name` in the same run's baseline at the same width. `width` and `height` match within ±1. An entry with no baseline match fails the row. |
| R13 | Unit         | `npx vitest run tests/tap-targets.test.ts` passes. Read it: R7's six files are in its table, each with its `data-tap-surface` value and the `tap`-utility assertion. `git diff origin/staging -- tests/tap-targets.test.ts` only adds entries; no `#964` assertion is removed or weakened. |
| R14 | Unit         | Read `components/ui/ImageWithFallback.tsx`. Its first line is `"use client"`. It exports `ImageWithFallback`. `fallback` is a required prop in its type. `src`, `alt`, `width`, `height`, `loading`, `fetchPriority`, `draggable` and `className` reach the `<img>`. After an error it returns `fallback` and no `<img>`. `npm run typecheck` exits 0. |
| R15 | Unit         | `npx vitest run tests/image-with-fallback.test.tsx` passes. Read it: `// @vitest-environment jsdom` is at the top, and it covers R15's three bullets. |
| R16 | Regression   | Read `components/product/ProductImage.tsx`: it imports and renders `ImageWithFallback`, and its props are still `src`, `alt` and `className`. `git diff origin/staging -- tests/product-card-image.test.tsx` prints nothing. `npx vitest run tests/product-card-image.test.tsx` passes. |
| R17 | Unit         | `npx vitest run tests/storefront-image-fallback.test.ts` passes. Read it: the directories and the `components/staff/` exclusion match R17, the pattern is `^\s*<img\b` with the multiline flag, the only allowed file is `components/ui/ImageWithFallback.tsx`, and the import check names `ProductImageGallery.tsx`, `CartContents.tsx`, `BundleCard.tsx`, `DepartmentHero.tsx` and `Header.tsx`. Cross-check: `git grep -nE '^\s*<img\b' -- components 'app/(storefront)' 'app/(landing)'` prints only `components/ui/ImageWithFallback.tsx` and files under `components/staff/`. |
| R18 | E2E          | Run every **I-** run at `--widths 360,390`. In every printed object, `brokenImages` is `[]`. |
| R19 | E2E          | For each I- run, read its baseline file (`baseline/i-home.jsonl`, `i-cat`, `i-shop`, `i-bundles`, `i-product`, `i-qv`, `i-cart`, `i-drawer`) at width `390`: `brokenImages` is non-empty. `build-notes.md` lists, per run, the surfaces the baseline showed broken, and names any surface from `plan.md` section 2's #655 table that no baseline reached. |
| R20 | Unit         | Read `specs/design-system.md`, "Touch targets". R7's six surfaces are listed. "Still outside the rule" no longer names the filter panel's controls or the cart drawer's close button, and it does name the gallery dots and Quick View's body controls with `#981`. `git diff origin/staging -- specs/design-system.md` shows `version` bumped and `updated` changed. |
| R21 | Unit         | Read `docs/developer-portal/runtime-pitfalls.md`'s `#502` bullet: it names `components/ui/ImageWithFallback.tsx` and `tests/storefront-image-fallback.test.ts`. `git diff origin/staging -- docs/developer-portal/runtime-pitfalls.md` shows `version` bumped and `updated` changed. |
| R22 | Unit         | `npx vitest run tests/vendor-neutral-copy.test.ts` passes. |
| R23 | Unit         | `git diff origin/staging -- CHANGELOG.md` adds an entry naming `#979` and `#655`. |
| R24 | Regression   | `npm run lint`, `npm run typecheck`, `npm run format:check`, `npx vitest run` (alone), `npm run build`, `npm run kms:validate` and `npm run kms:check-generated` each exit 0. `npm run kms:assemble:internal`, then `npx next build --webpack` inside `kms/site-internal`, exits 0. Read the real exit status, not one piped through `tail`. On the PR, `quality / quality`, `quality / kms` and `docs-gates` are green. |
