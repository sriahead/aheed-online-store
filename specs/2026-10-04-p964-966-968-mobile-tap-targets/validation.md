# #964, #966, #968 — Mobile tap targets, postcode autofill, discount-code copy (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests.
>
> - **Build:** Did we build the component correctly? (`tests/tap-targets.test.ts`, `tests/autocomplete-tokens.test.ts`)
> - **Validate:** Does the feature work correctly in the real system? (`scripts/verify-mobile-layout.ts` against `npm run preview`)
> - **Release:** Is the complete system safe, reliable, and ready for users? (CI, then post-deploy real-device evidence)

This slice is a UI change with no schema, server, auth or payment change. The weight is on
measurement in a real browser (System) plus two source-reading guards (Unit). Accessibility here
means SC 2.5.5 (AAA) target size and SC 1.3.5 (AA) input purpose.

## Before you start

1. `npm run preview` is running, with no stale `node`/`workerd` chain left from an earlier run
   (CLAUDE.md, "Windows shell & local development"). Both `http://localhost:8787` and
   `http://srimart.localhost:8787` load.
2. Read `requirements.md`'s **Definitions** (run names A-cat, S-cat, A-search, A-cart, A-loc) and
   `build-notes.md`'s **Baseline** section.
3. Each run prints one JSON object per width. Pipe it through `node -e` or `jq` to filter
   `tapTargets` by `displayed`. Compare numbers against `requirements.md`, never against a verdict
   the script prints (it prints none).
4. In Git Bash, pass paths without a leading slash and quote any path containing `?`.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit / System | Read `scripts/verify-mobile-layout.ts`: the selector covers `a`, `button`, `summary`, `input:not([type=hidden])`, with the element itself or an ancestor carrying `data-tap-surface`; `surface` comes from `closest("[data-tap-surface]")`; `name` follows aria-label → text → `name`. Run **A-cat** `--widths 390` and confirm every object has a `tapTargets` array with those five keys per entry. |
| R2  | System | Same **A-cat** output: `firstCardTop` is a number. In the script, it is read before `scrollTo` and adds `window.scrollY`. Run `M --base http://localhost:8787 --path cart --widths 390` (empty cart, no grid) and confirm `firstCardTop` is `null`. |
| R3  | System | Run **A-loc** `--widths 390`: `location-dialog` entries are `displayed: true`. Run the same without `--open-location`: those entries are `displayed: false`. `git diff origin/staging -- package.json` shows no added dependency. The script's header comment mentions `tapTargets`, `firstCardTop` and `--open-location`. |
| R4  | Unit | `grep -rn 'data-tap-surface=' components app` lists exactly the values and files in R4's table. `grep -n 'data-location-dialog' components/layout/LocationControl.tsx` hits the `<dialog>`. `grep -n 'data-tap-surface' components/product/FilterPanel.tsx` is on a `<summary>`. In `CartContents.tsx` the hook wraps only the decrease/increase/remove buttons (not the product link). |
| R5  | System | **A-cat** `--widths 360,390`: for each width, the set of `surface` values among displayed entries includes all six named. Every displayed entry has `width >= 44 && height >= 44`. |
| R6  | System | **S-cat** `--widths 360,390`: the same checks for the five named surfaces. If no `subcategories` entry is displayed, `build-notes.md` says SriMart renders none. |
| R7  | System | **A-search** `--widths 360,390`: a displayed entry with `surface: "pagination"` and `name: "Next page"` exists and passes 44. Every displayed entry passes 44. |
| R8  | System | **A-cart** `--widths 360,390`: displayed `cart-line-controls` entries for the first line, named `Decrease quantity of …`, `Increase quantity of …` and `Remove …`, each pass 44. |
| R9  | System | **A-loc** `--widths 360,390`: displayed `location-dialog` entries include `name: "postcode"` and at least two buttons. Every one passes 44. |
| R10 | System | In every output from R5–R9 at `360` and `390`, `documentScrollWidth === viewportWidth`. |
| R11 | System | **A-cat** and **S-cat** `--widths 390`: `firstCardTop` ≤ the `build-notes.md` baseline value for that run at 390, plus 40. Write down both numbers. |
| R12 | System | **A-cat**, **A-search**, **A-cart** `--widths 1024,1280`: for each displayed entry, find the baseline entry with the same `surface` and `name` at the same width. `width` and `height` each differ by at most 1. An entry with no baseline match is a failure, unless `build-notes.md` explains it. |
| R13 | Unit | `npx vitest run tests/tap-targets.test.ts` passes. Read it: it covers every file in R4's table, both pagination pages included, and asserts both the hook and a `tap` utility (or only the hook for `FilterPanel`, if `build-notes.md` records that it already passed 44). |
| R14 | Unit | `grep -n 'postal-code' components/layout/LocationControl.tsx` hits the `name="postcode"` input. `npx vitest run tests/autocomplete-tokens.test.ts` passes and includes `LocationControl.tsx`. |
| R15 | System | `M --base http://localhost:8787 --path categories/fruit-veg --widths 390,768`: in each object, `formInputs.filter(i => i.name === "postcode")` is non-empty and every `autocomplete` is `postal-code`. |
| R16 | Unit | `grep -n -i 'in your cart' docs/shopper-help/shopping-guide.md` finds no sentence about applying a code. The Discounts bullet names checkout. Front-matter `version` > `1.2.0` and `updated` is not `2026-10-03`. `npm run kms:check-generated` reports both files current. |
| R17 | Unit | Read `specs/design-system.md`, "Touch targets": it lists the R4 surfaces and states that `HorizontalScroller` arrows are `tap`-sized below `lg`. Front-matter `version` > `1.14.0`, `updated` changed. |
| R18 | Unit | `npx vitest run tests/vendor-neutral-copy.test.ts` passes. |
| R19 | Unit | `git diff origin/staging -- CHANGELOG.md` shows an entry naming #964, #966 and #968. |
| R20 | Regression | `npm run lint`, `npm run typecheck`, `npm run format:check`, `npx vitest run` (alone, not beside a build), `npm run build`, `npm run kms:validate`, then `npm run kms:assemble:internal` and the Next build in `kms/site-internal`: all exit 0. On the PR, `gh pr checks <N>` shows `quality / quality`, `quality / kms` and `docs-gates` passing. |
