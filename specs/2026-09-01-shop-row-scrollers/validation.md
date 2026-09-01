# One horizontal-scroll affordance across the shop page (validation)

Run from a fresh context.

> **Testing strategy.** The scroller's behaviour is unit-tested in isolation. **That is not
> sufficient on its own and this slice proves why**: the unit tests passed while two rows on the
> real page carried identically-named arrows, because a per-component test renders one instance.
> R12 is a live render and is the row that catches that class of defect.

## Preconditions

- `/categories` is a DB-touching page, so it must be checked under `npm run preview`, never
  `next dev` (CLAUDE.md — `next dev` cannot load the WASM query engine and renders an error state
  silently).
- After stopping preview, kill the whole process chain: the task-runner kill leaves
  `wrangler`/`workerd` children holding `.open-next\assets`, and the next build fails with `EBUSY`.

| Req | How to verify |
|---|---|
| R1 | Read `components/layout/HorizontalScroller.tsx`: `"use client"`, two `<button>`s, a track rendering `children`. |
| R2 | `npx vitest run tests/horizontal-scroller.test.tsx` — arrows resolve by the names `Scroll products left` / `right`. |
| R3 | Same file: `as="ul"` produces a `<ul>` containing the `<li>` child; the default produces no `<ul>`. |
| R4 | Same file: with `step={260}` the call is `{ left: 260, behavior: "smooth" }` and `{ left: -260, … }`; with no step and a 1000px track, `900`; with a 100px track, the 200px floor. |
| R5 | Read the track's className: `no-scrollbar` and `overflow-x-auto` present. `grep -n "no-scrollbar" app/globals.css` shows the rule still exists. |
| R6 | `grep -rn "scrollBy" components/ app/` returns only `HorizontalScroller.tsx`. Confirm `ProductRow`, `BundleRow` and `DepartmentScroller` each import and render it. |
| R7 | Read `BundleRow`: `as="ul"`. Then in R12's live HTML, confirm the bundles track is the `<ul>`. |
| R8 | Read `DepartmentScroller`: `step={260}` and `arrowPositionClassName="top-8"`. Compare against git history for the pre-slice values. |
| R9 | Read both rows: `itemLabel={title.toLowerCase()}`. Confirmed live by R12. |
| R10 | `git diff origin/staging -- components/product/ProductCard.tsx components/bundle/BundleCard.tsx` produces no output. |
| R11 | `grep -n "take: 8" "app/(storefront)/categories/page.tsx"` shows both product fetches. |
| R12 | **Live.** `npm run preview`, then fetch `http://127.0.0.1:8787/categories` and assert: every `aria-label="Scroll …"` value is unique (expect `departments`, `value bundles`, `new arrivals`, `featured products`); `no-scrollbar` appears 4 times; `<ul class="no-scrollbar` appears exactly once; and the segment between the `New Arrivals` and `Featured Products` headings holds 8 `skew-card-wrap` occurrences. Use Node's `fetch` — `curl` returns `000` from this sandbox. |
| R13 | `git diff origin/staging -- CHANGELOG.md` shows an entry referencing #511. |
| R14 | `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run format:check` all exit 0. CI on the PR is the authority. |

## Notes for the validator

- **R12's distinctness check is the load-bearing one.** During Build, `tests/horizontal-scroller.test.tsx`
  passed while the live page emitted `Scroll products left` twice — once for New Arrivals and once
  for Featured Products. A unit test renders one scroller and cannot see a collision between two
  instances on a page. If this row is skipped, that defect comes back silently.
- **Counting cards by `skew-card-wrap` is approximate** — `BundleCard` uses the same wrapper class,
  and category spotlights render cards further down the page. Scope the count to the segment between
  the two headings, as the row above says; counting the whole document is meaningless.
- Nothing here touches data, and there is no migration.
