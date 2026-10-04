# #964, #966, #968 — Mobile tap targets, postcode autofill, discount-code copy (requirements / acceptance criteria)

These close **#964** (the 44px `tap` token on the remaining storefront controls, a follow-up to
`#961`), **#966** (the header postcode input has no `autocomplete` token, a follow-up to `#958`) and
**#968** (the shopper guide says codes are applied in the cart). They are slice 4 of the mobile
programme from the seventh Discover pass, approved at `/propose` on 2026-10-04.

In one line: below `lg`, every control in the nine surfaces in `plan.md` section 1 is at least
44×44 CSS px, with desktop sizes unchanged. The header postcode input autofills, and the guide
names the right page. Read `plan.md` sections 1–3 before validating. Section 3 explains the
baseline that R11 and R12 compare against.

**Definitions used below:**

- **`M`** means `npx tsx scripts/verify-mobile-layout.ts`. It prints one JSON object per width.
  In Git Bash, pass `--path` and `--then` values **without** a leading slash.
- **Aheed** is `http://localhost:8787` and **SriMart** is `http://srimart.localhost:8787`, both
  under `npm run preview` (never `npm run dev`).
- **Below `lg`** means under 1024px wide.
- **Passes 44** means an entry has `width` ≥ 44 and `height` ≥ 44.
- **Displayed entries** means the `tapTargets` entries with `displayed: true`.
- **Baseline** means the JSON lines `build-notes.md` records under "Baseline". Build measures them
  after the R1–R4 hooks and script changes exist, and before any class change (`plan.md`
  section 3).
- **Runs**, each at the widths the requirement names:
  - **A-cat**: `M --base http://localhost:8787 --path "categories/fruit-veg?inStock=1"`
  - **S-cat**: `M --base http://srimart.localhost:8787 --path "categories/sri-electronics?inStock=1"`
  - **A-search**: `M --base http://localhost:8787 --path search`
  - **A-cart**: `M --base http://localhost:8787 --path categories/fruit-veg --add-first --then cart`
  - **A-loc**: `M --base http://localhost:8787 --path categories/fruit-veg --open-location`

## Measuring instrument

R1. Every object `scripts/verify-mobile-layout.ts` prints carries a `tapTargets` key. It is an
    array, in document order, with one `{ surface, name, width, height, displayed }` per element
    that matches `a`, `button`, `summary` or `input:not([type=hidden])` and either carries
    `data-tap-surface` or has an ancestor that does.
    - `surface` is the value of the nearest `data-tap-surface`, the element's own included.
    - `name` is the `aria-label`, else the trimmed text, else the `name` attribute.
    - `width`/`height` are the rounded `getBoundingClientRect()` size.
    - `displayed` follows the script's existing rule: false when the computed `display` is `none`
      or the rect has zero width.

    The array is empty when the page has no such element.
R2. Every printed object carries `firstCardTop`: the first `[data-product-grid]` child's
    `getBoundingClientRect().top + window.scrollY`, rounded. It is `null` when there is no such
    child. It is read at scroll 0, before the script's existing `scrollTo`.
R3. The script accepts `--open-location`. Before measuring each width, it calls `showModal()` on
    the first `dialog[data-location-dialog]` whose `parentElement` is displayed (same rule as R1),
    then waits at least 200 ms. Without the flag, behaviour is unchanged. The script still adds no
    package to `package.json` and exits 0 when every page loaded. The header comment documents the
    three additions.

## Hooks

R4. These `data-tap-surface` values exist in exactly these files, on an element that contains (or
    is) the controls named in `plan.md` section 1's table:

    | Value | File |
    |---|---|
    | `location` | `components/layout/LocationControl.tsx` (the header controls, not the dialog) |
    | `location-dialog` | `components/layout/LocationControl.tsx` (inside the `<dialog>`) |
    | `filter-chips` | `components/product/FilterChips.tsx` |
    | `filter-panel` | `components/product/FilterPanel.tsx`, on the mobile `<summary>` itself |
    | `subcategories` | `components/product/SubcategoryLinks.tsx` |
    | `collections` | `components/product/CollectionNav.tsx` |
    | `pagination` | `app/(storefront)/categories/[slug]/page.tsx` and `app/(storefront)/search/page.tsx` |
    | `cart-line-controls` | `components/cart/CartContents.tsx`, once per line, around decrease, increase and remove only |
    | `scroller-arrow` | `components/layout/HorizontalScroller.tsx`, on each of the two arrow buttons |

    The `<dialog>` in `LocationControl.tsx` carries `data-location-dialog`.

## Sizes below `lg` (#964)

R5. **A-cat** at widths `360,390`: displayed entries include at least one with each `surface`
    `location`, `filter-chips`, `filter-panel`, `subcategories`, `collections` and `scroller-arrow`.
    **Every** displayed entry passes 44.
R6. **S-cat** at widths `360,390`: displayed entries include at least one with each `surface`
    `location`, `filter-chips`, `filter-panel`, `collections` and `scroller-arrow`. Every displayed
    entry passes 44. `subcategories` is required only if SriMart's page renders one. If it does not,
    `build-notes.md` says so.
R7. **A-search** at widths `360,390`: a displayed entry with `surface` `pagination` and `name`
    `Next page` exists. Every displayed entry passes 44.
R8. **A-cart** at widths `360,390`: displayed `cart-line-controls` entries named
    `Decrease quantity of <product>`, `Increase quantity of <product>` and `Remove <product>` each
    exist for the first cart line, and each passes 44.
R9. **A-loc** at widths `360,390`: displayed entries with `surface` `location-dialog` include the
    input named `postcode` and at least two buttons. Every displayed `location-dialog` entry passes
    44.
R10. In every run of R5–R9, at widths `360` and `390`, `documentScrollWidth` equals `viewportWidth`.
    Nothing makes the page scroll sideways.

## What it costs, and what must not change

R11. **A-cat** and **S-cat** at width `390`: `firstCardTop` is at most the baseline's `firstCardTop`
    for the same run and width, plus 40.
R12. **A-cat**, **A-search** and **A-cart** at widths `1024,1280`: each displayed entry's `width`
    and `height` equal (±1) those of the baseline entry with the same `surface` and `name`. Desktop
    sizes are unchanged.
R13. `tests/tap-targets.test.ts` exists and passes. For each file in R4's table it reads the
    source and asserts that:
    - the file's `data-tap-surface` value(s) are present;
    - the file contains at least one of `h-tap`, `w-tap`, `size-tap`, `min-h-tap`, `min-w-tap`.

    Both `pagination` page files are checked. For `filter-panel`, if Build's baseline shows the
    summary already passes 44 below `lg` and the file needs no class change, the test asserts only
    the hook, and `build-notes.md` records the measured size.

## Postcode autofill (#966)

R14. The `<input name="postcode">` in `components/layout/LocationControl.tsx` carries
    `autoComplete="postal-code"`. `tests/autocomplete-tokens.test.ts` asserts it.
R15. `M --base http://localhost:8787 --path categories/fruit-veg --widths 390`: every `formInputs`
    entry whose `name` is `postcode` has `autocomplete` `postal-code`, and there is at least one.
    The same holds at `--widths 768`.

## Documentation (#968 and the standing rule)

R16. In `docs/shopper-help/shopping-guide.md`, the "Discounts" bullet says a code is entered on the
    checkout page. No sentence in the file says a code is applied in the cart. The front-matter
    `version` is bumped and `updated` is changed. `app/(admin)/staff/runbook/docs.ts` is
    regenerated by `npm run kms:build-index`, not hand-edited, and `npm run kms:check-generated`
    reports both generated files current.
R17. `specs/design-system.md`'s "Touch targets" section lists the controls this slice covers
    (R4's surfaces), alongside `#961`'s list. It states that `HorizontalScroller`'s arrows are
    `tap`-sized below `lg` on every row that uses it. The front-matter `version` is bumped and
    `updated` is changed.
R18. `npx vitest run tests/vendor-neutral-copy.test.ts` passes. This slice adds no user-facing
    string that names a vendor, a product or a trade.

## Gates

R19. `CHANGELOG.md` has an entry naming #964, #966 and #968 (Gate 4).
R20. `npm run lint`, `npm run typecheck`, `npm run format:check`, `npx vitest run` (run alone),
    `npm run build`, `npm run kms:validate`, and `npm run kms:assemble:internal` followed by the
    Next build in `kms/site-internal` all exit 0. CI on the PR (`quality / quality`,
    `quality / kms`, `docs-gates`) is green.
