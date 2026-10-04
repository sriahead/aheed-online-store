# #979, #655 — Storefront finish: remaining tap targets and image fallbacks (requirements / acceptance criteria)

These close **#979** (the storefront controls `#964` left out get the 44px `tap` size below `lg`)
and **#655** (storefront images of a stored object degrade to their no-image look instead of a
broken-image icon). They are slice 5 of the mobile programme, approved at `/propose` on 2026-10-04.

In one line: below `lg`, every control in the six new surfaces is at least 44×44 CSS px, with
desktop sizes and the product grid's position unchanged. With the CDN blocked, no storefront page
shows a broken image. **Read `plan.md` section 1 before validating.** It corrects facts in both
issue bodies (the search form has no submit button, and the scroller arrows are on `/categories`).
Section 3 explains the baseline.

**Definitions used below:**

- **`M`** means `npx tsx scripts/verify-mobile-layout.ts`. It prints one JSON object per width. In
  Git Bash, pass `--path` and `--then` values **without** a leading slash. For the root path use
  `MSYS_NO_PATHCONV=1 M … --path /`.
- **Aheed** is `http://localhost:8787` and **SriMart** is `http://srimart.localhost:8787`, both
  under `npm run preview` (never `npm run dev`).
- **`CDN`** is the `storage.cdnBase` value from `curl -s http://localhost:8787/api/health`, and
  **`BLOCK`** is `--block-urls "<CDN>/*"`.
- **`<P>`** is the Aheed dev product slug recorded in `build-notes.md` under "Product page slug",
  for a product with at least one image.
- **Below `lg`** means under 1024px wide. **Passes 44** means an entry has `width` ≥ 44 and
  `height` ≥ 44. **Displayed entries** means `tapTargets` entries with `displayed: true`.
- **Baseline** means the JSON lines in this folder's `baseline/<run>.jsonl`, one file per run below,
  at every width any requirement uses for that run. Build measured them at the commit that has
  the R1–R7 hooks and script changes and no class or component change (`plan.md` section 3).
  `build-notes.md` names that commit.
  _Amended at Build (2026-10-04): there are two script-only commits. `a-cat` and `s-cat` were
  measured at `20ea79c`, every other run at `fa6454f`. They differ only in `cardsWithoutImage`
  (R18a), which only `a-cat` and `s-cat` use. `<baseline commit>` in `validation.md` means
  `20ea79c`._
- **Runs** (widths are given per requirement):
  - **A-cat**: `M --base <Aheed> --path "categories/fruit-veg?inStock=1"`
  - **S-cat**: `M --base <SriMart> --path "categories/sri-electronics?inStock=1"`
  - **A-filters**: `M --base <Aheed> --path "categories/fruit-veg?inStock=1" --open-filters`
  - **S-filters**: `M --base <SriMart> --path "categories/sri-electronics?inStock=1" --open-filters`
  - **A-drawer**: `M --base <Aheed> --path categories/fruit-veg --add-first --open-cart`
  - **A-qv**: `M --base <Aheed> --path categories/fruit-veg --open-quick-view`
  - **A-shop**: `M --base <Aheed> --path categories`
  - **I-home**: `MSYS_NO_PATHCONV=1 M --base <Aheed> --path / BLOCK`
  - **I-cat**: `M --base <Aheed> --path categories/fruit-veg BLOCK`
  - **I-shop**: `M --base <Aheed> --path categories BLOCK`
  - **I-bundles**: `M --base <Aheed> --path bundles BLOCK`
  - **I-product**: `M --base <Aheed> --path products/<P> BLOCK`
  - **I-qv**: `M --base <Aheed> --path categories/fruit-veg --open-quick-view BLOCK`
  - **I-cart**: `M --base <Aheed> --path categories/fruit-veg --add-first --then cart BLOCK`
  - **I-drawer**: `M --base <Aheed> --path categories/fruit-veg --add-first --open-cart BLOCK`

## Measuring instrument

R1. `scripts/verify-mobile-layout.ts` accepts `--open-filters`. Before measuring each width, it sets
    `open` on every `details` element that contains a `[data-tap-surface="filter-panel"]` element,
    then waits at least 200 ms.
    _Amended at Build (2026-10-04): the first baseline showed the closed panel's form as
    displayed. Chrome lays out a closed `<details>`' content (`content-visibility: hidden`) with a
    real box, so the script's `displayed` rule now also requires `checkVisibility()` to be true.
    This applies to every "displayed" check in the script, `#964`'s surfaces included._
R2. In every printed object, `tapTargets` also covers `select` elements, using the same surface rule
    as `#964`'s R1 (the element carries `data-tap-surface` or has an ancestor that does). For an
    `input` of type `checkbox` or `radio` that has an ancestor `label`, the entry's `width` and
    `height` are that label's rounded `getBoundingClientRect()` size, and the entry carries
    `hitArea: "label"`. Its `name` is the label's trimmed text. Every other entry is computed exactly
    as before.
R3. The script accepts `--open-cart`. Before measuring each width, it clicks the `button` with
    `aria-haspopup="dialog"` whose `aria-label` starts with `Cart,`. It then waits until a
    `[data-tap-surface="cart-drawer-close"]` element is displayed, for at most 5 s, and exits 1
    with a reason if none is. It can be combined with `--add-first`.
R4. The script accepts `--open-quick-view`. Before measuring each width, it clicks the first
    `[data-product-grid]` child's `button` whose `aria-label` starts with `Quick view `. It then
    waits until a `[data-tap-surface="quick-view-close"]` element is displayed, for at most 10 s,
    plus 1000 ms, and exits 1 with a reason if none is.
R5. The script accepts `--block-urls <pattern>`. Before the first navigation, it blocks requests
    matching the pattern through the DevTools protocol (`Network.setBlockedURLs`). Before measuring
    each width, it sets `loading="eager"` on every `img` and waits at least 2000 ms. Every printed
    object carries `brokenImages`, an array of `{ alt, src }`, one per `img` element in the
    document whose `src` is non-empty, whose `complete` is true and whose `naturalWidth` is 0.
    Without the flag, `brokenImages` is still printed, and nothing is blocked.
R6. Every printed object carries `scrollerArrows`, one entry per displayed
    `[data-tap-surface="scroller-arrow"]` element, as `{ name, circleCentreOffset }`. `name` is the
    `aria-label`. `circleCentreOffset` is the rounded distance from the top of the element's
    `parentElement` to the vertical centre of the element's first element child (the visible
    circle).
    The header comment documents R1–R6. The script still adds no package to `package.json`, and
    exits 0 when every page loaded.

## Hooks

R7. These `data-tap-surface` values exist in exactly these files, on the element named:

    | Value | File | Element |
    |---|---|---|
    | `search` | `components/layout/SearchSuggest.tsx` | the search `<input>` |
    | `filter-form` | `components/product/ProductFilterForm.tsx` | the `<form>` |
    | `cart-drawer-close` | `components/cart/CartDrawerShell.tsx` | the close button |
    | `quick-view-close` | `components/product/QuickViewDrawer.tsx` | the close button |
    | `gallery-arrow` | `components/product/ProductImageGallery.tsx` | each carousel arrow button |
    | `quick-view-add` | `components/cart/AddToCartButton.tsx` | the `drawer` variant's element wrapping its minus, plus and Add buttons |

## Sizes below `lg` (#979)

R8. At widths `360,390`, every displayed entry with each surface below passes 44, and the runs show
    at least one displayed entry of that surface:

    | Run | Surfaces |
    |---|---|
    | A-cat, S-cat | `search` |
    | A-filters, S-filters | `filter-form`. The entries include the Apply button and, on A-filters, at least one entry with `hitArea: "label"` |
    | A-drawer | `cart-drawer-close` |
    | A-qv | `quick-view-close`, `quick-view-add` (its minus and plus, if the product is in stock), and `gallery-arrow` **only if** that run shows one (if not, `build-notes.md` says the product had one image) |
    | A-shop | `scroller-arrow`, with an entry named `Scroll departments right`, an entry for the bundle row and at least one for a product row (on Aheed dev: `Scroll value bundles right`, `Scroll new arrivals right`, `Scroll featured products right`) |

    _Amended at Build (2026-10-04): the A-shop names said `Scroll products right` and
    `Scroll bundles right`. Each row's arrow is named after its heading, so those names never
    exist._

R9. In every R8 run at widths `360` and `390`, `viewportWidth` and `documentScrollWidth` both equal
    the requested width.

R10. **A-shop**: each `scrollerArrows` entry named `Scroll departments left` or
    `Scroll departments right` has a `circleCentreOffset` at width `390` within ±2 of the same
    entry's value at width `1280`.

## What must not change

R11. **A-cat** and **S-cat** at widths `360,390,768`: `firstCardTop` equals (±1) the baseline's
    `firstCardTop` for the same run and width. The search input's growth costs no grid height.
R12. **A-cat**, **A-filters**, **A-drawer**, **A-qv** and **A-shop** at widths `1024,1280`: each
    displayed `tapTargets` entry's `width` and `height` equal (±1) those of the baseline entry with
    the same `surface` and `name`. Desktop sizes are unchanged.
R13. `tests/tap-targets.test.ts` passes and covers R7's files. For each, it asserts that the
    `data-tap-surface` value is present and that the file contains at least one of `h-tap`,
    `w-tap`, `size-tap`, `min-h-tap`, `min-w-tap`. Its existing assertions for `#964`'s files are
    unchanged.

## Image fallbacks (#655)

R14. `components/ui/ImageWithFallback.tsx` exists. It starts with `"use client"` and exports
    `ImageWithFallback`, which takes a required `fallback` prop and passes `src`, `alt`, `width`,
    `height`, `loading`, `fetchPriority`, `draggable` and `className` through to one `<img>`. After
    that image fails to load, it renders `fallback` and no `<img>`.
R15. `tests/image-with-fallback.test.tsx` exists and passes (jsdom). It asserts that:
    - before any error the `<img>` renders with the passed attributes;
    - after `fireEvent.error` on it, there is no `<img>` and the `fallback` node renders;
    - a `fallback` of `null` renders nothing after the error.
R16. `components/product/ProductImage.tsx` renders through `ImageWithFallback`, keeps its props
    (`src`, `alt`, `className`), and `tests/product-card-image.test.tsx` passes **unmodified**
    (`git diff <baseline commit> -- tests/product-card-image.test.tsx` is empty).
R17. `tests/storefront-image-fallback.test.ts` exists and passes. It reads every `.tsx` file under
    `components/` (excluding `components/staff/`), `app/(storefront)/` and `app/(landing)/`. It
    asserts that **only** `components/ui/ImageWithFallback.tsx` contains a line matching
    `^\s*<img\b` (a JSX `img` tag at the start of a line; comments that mention `<img>` do not
    match). It also asserts that each file in `plan.md` section 2's #655 table imports
    `ImageWithFallback` or `ProductImage`.
R18. In every **I-** run at widths `360,390`, `brokenImages` is an empty array.
R18a. Every printed object carries `cardsWithoutImage`: how many `[data-product-grid]` children
    contain no `img`. In **A-cat** and **S-cat** at widths `360,390,768` (nothing blocked), it
    equals the number of the baseline's `brokenImages` entries at the same width whose `src`
    contains `/products/`. A card loses its `<img>` only where the baseline showed that image
    broken, so no fallback hides an image that loads.
    _Added at Build (2026-10-04): the mount check R14's component gained (`plan.md` section 2,
    "hydration race") could in principle treat an image that loads as failed, and R18 cannot see
    that. Several dev product images, and Aheed's dev logo, genuinely return 404, so the expected
    count is not zero._
R19. The baseline of each I- run, at width `390`, has a non-empty `brokenImages`. It proves the
    block reaches the page. `build-notes.md` lists, per I- run, which surfaces (`plan.md` section 2's
    #655 table, plus product cards) the baseline showed broken. A surface that no baseline reached
    is named there as covered by R15 and R17 only.

## Documentation and copy

R20. `specs/design-system.md`'s "Touch targets" section lists R7's six surfaces alongside `#964`'s.
    Its "Still outside the rule" sentence no longer names the filter panel's controls or the cart
    drawer's close button. It does name the gallery dots and Quick View's body controls, and `#981`, which
    tracks the latter. The front-matter `version` is bumped and `updated` is `2026-10-04`.
    _Amended at Build (2026-10-04): this said `updated` is changed. Slice 4 had already set it to
    `2026-10-04`, today's date._
R21. `docs/developer-portal/runtime-pitfalls.md`'s `#502` bullet states that every storefront image
    of a stored object renders through `components/ui/ImageWithFallback.tsx`, and that
    `tests/storefront-image-fallback.test.ts` guards it. The front-matter `version` is bumped and
    `updated` is changed.
R22. `npx vitest run tests/vendor-neutral-copy.test.ts` passes. This slice adds no user-facing
    string that names a vendor, a product or a trade.

## Gates

R23. `CHANGELOG.md` has an entry naming #979 and #655 (Gate 4).
R24. `npm run lint`, `npm run typecheck`, `npm run format:check`, `npx vitest run` (run alone),
    `npm run build`, `npm run kms:validate`, `npm run kms:check-generated`, and
    `npm run kms:assemble:internal` followed by the Next build in `kms/site-internal` all exit 0.
    CI on the PR (`quality / quality`, `quality / kms`, `docs-gates`) is green.
