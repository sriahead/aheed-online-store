# Header: Collect/Delivery dropdown, Shopping List beside search, new search placeholder (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Every feature should have appropriate **Unit** and **Integration** testing, followed by relevant validation testing. Testing is risk-based: UI changes, and anything touching delivery and fulfilment, need extra relevant testing earlier.

1. **Unit Testing** — every feature: isolated logic and components.
2. **Integration Testing** — every feature: the component with its immediate dependencies.
3. **System / End-to-End Testing** — critical journeys, in the real system.
4. **Regression & Acceptance Testing** — when changing core flows.
5. **Security & Accessibility Testing** — earlier for UI changes.

---

## Setup for the live rows

**Reading the table:** a Markdown table cell cannot hold a bare pipe, so every `\|` in a command below
stands for a single `|` (a shell pipe or a regex alternation). Type it without the backslash.
Commands are written for Git Bash. Under Git Bash pass `--path` without a leading slash, or set
`MSYS_NO_PATHCONV=1`, or the script reports a rewritten Windows path.

1. `npm ci`, then `npm run db:generate`.
2. Confirm the target is the **dev** database and neither staging nor production: compare the host
   in `.env` and `.dev.vars` with `secrets/staging.vars` and `secrets/production.vars` by reading
   single keys (`grep '^DIRECT_URL=' <file>`). **Never `source` an env file**: it executes comment
   and URL lines and echoes secrets. If the host is not dev, stop.
3. **Check the starting state before the first row**: the five departments may be hidden or visible
   (slice A left them hidden), and the placeholder may be either value. Record both. Nothing in
   this slice depends on the departments, but a row that curls a department page does.
4. Kill any running `node`/`workerd`, then `npm run preview`. Aheed is `http://localhost:8787`;
   SriMart is `http://srimart.localhost:8787`. Use `curl` for the local server.
5. Staff and shopper sign-in for browser rows: the demo accounts in `.env`/`.dev.vars`. Read the
   password with a single-key `grep`; do not repeat it in the report.
6. Browser rows use a real browser (Claude in Chrome or desktop Chrome). A result inferred from the
   HTML does not satisfy a row that says "in a browser".
7. The header and search bar each appear **twice** in the HTML (one hidden by CSS). Count and read
   the **visible** one (non-zero `offsetWidth`).

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `npx vitest run tests/location-control.test.tsx` exits 0 and lists a case that renders `offerCollection` true and finds one `details[data-location-menu]`, no `button` whose name is `Delivery` outside the menu, and no pencil button. Open `components/layout/LocationControl.tsx`: the `offerCollection` false branch is byte-identical to `git show origin/staging:components/layout/LocationControl.tsx` for that branch (diff the two ranges). |
| R2  | Unit | Same file: the summary's text for `COLLECTION`; for `DELIVERY` with a deliverable postcode (`Delivery · MK8 1BS`); and for no deliverable postcode (`Delivery`). `grep -n "aria-label" components/layout/LocationControl.tsx` shows none on the summary, and the summary contains no `hidden sm:inline` span pair. |
| R3  | Unit | Same file: DOM order of the items (collection, delivery, change postcode only with a stored postcode), the form actions and the `fulfilmentMethod` values, the dialog-opening buttons, the check mark and `aria-current` on the current item, that no item has an `aria-label`, and that the `Delivery` item shows `Delivery · <postcode>` under `COLLECTION` too (the #1087 readable-postcode case, kept). |
| R4  | Unit + Regression | The intent cases pass: dialog opened from `Delivery` submits `delivery`, from `Change postcode` submits `edit`, from the single no-collection button submits `delivery`. `git diff origin/staging --stat -- features lib app` lists none of the five files named in R4. `npx vitest run tests/delivery-postcode-intent.test.ts` exits 0 unmodified. |
| R5  | Live | `curl -s http://localhost:8787/` and inspect the visible control's HTML: a `<details` containing a `<form` whose button has `name="fulfilmentMethod"` and `value="COLLECTION"`; with a stored deliverable postcode (send the delivery cookie, or set one in a browser first) also `value="DELIVERY"`. |
| R6  | Unit | Same file: Escape, an outside click and choosing `Change postcode` each close an open menu; the method prop is unchanged after each. |
| R7  | Live | `npx tsx scripts/verify-mobile-layout.ts --base http://localhost:8787 --path / --widths 360,390,768,1280 --open-location-menu` prints the menu box and, per item, whether the element at its centre is that item. At every width `left >= 0`, `right <= viewport`, and every item reports itself. Confirm the flag appears in the script's usage text and header comment. Repeat for `--path /search`. |
| R8  | Unit + Live | `npx vitest run tests/tap-targets.test.ts` exits 0 unmodified. The R7 output shows the summary and every item at least 44 by 44 at 360, 390 and 768. `grep -c 'data-tap-surface="location"' components/layout/LocationControl.tsx` covers the summary and items. |
| R9  | Unit | `grep -n "LocationControl" components/layout/Header.tsx` shows both renders with `postcode`, `deliverable`, `offerCollection` and `method`; `data-header-location` row still present. |
| R10 | Unit | `components/layout/ShoppingListLink.tsx` exists, is not a client component, has `aria-label="Shopping list"`, `href="/shop-your-list"` and the visible text `Shopping List`; `grep -inE "aheed\|srimart" components/layout/ShoppingListLink.tsx` prints nothing. |
| R11 | Unit | `npx vitest run tests/header-shopping-list.test.tsx` exits 0 with `isLanding` true and false: link present, immediately after the search container, not inside `nav[aria-label="Main Navigation"]`, not inside the search `form`. Open `Header.tsx`: the old link block in the nav is gone. |
| R12 | Live | `curl -s http://localhost:8787/ \| grep -c 'href="/shop-your-list"'` is at least 1, same for `/search`. `verify-mobile-layout.ts --path / --widths 360,390` and `--path /search --widths 360,390,768,1280` print the link's box (extend the instrument to print it if it does not, and say so): at least 44 by 44 at 360 and 390, and its top within 2px of the search button's top at every width. |
| R13 | Live | `npx tsx scripts/verify-mobile-layout.ts --base http://localhost:8787 --path /search --widths 360,390,768,1024,1280` (read the JSON; the script measures and does not judge): at 1280 form at least 600 (amended from 640 at Build, see R13) and input at least 400; at 360 and 390 input at least 120; tops within 2px; `documentScrollWidth <= viewportWidth` at all five. Record every number. |
| R14 | Docs + Live | `build-notes.md` records the input width measured at 1024 and the chosen breakpoint. Check `Header.tsx`: if the inline wrapper is `hidden lg:block` the 1024 input in R13 is at least 240; if `hidden xl:block` the recorded measurement is below 240. The two must agree. |
| R15 | Live | From the R13 JSON, `headerHeightAfterScroll` at each width is no greater than 119 (360, 390), 139 (768), 134 (1024) and 89 (1280), or lower where the bar moved inline. |
| R16 | Unit | `npx vitest run tests/apply-department-changes.test.ts` exits 0 and pins `Find your favourites...`. `grep -n "OWNER_SEARCH_PLACEHOLDER =" prisma/department-changes.ts` shows the exact string with three ASCII dots (check with `grep -c "…" prisma/department-changes.ts` printing 0 for that line). `grep -n "DEFAULT_SEARCH_PLACEHOLDER" lib/repositories/vendor.ts` still shows `Search products…`. |
| R17 | Live | Dry run first: `npx tsx scripts/apply-department-changes.ts --vendor aheed-food-centre` lists one `set-search-placeholder` change from the previous value (and nothing else if the departments are already in the target state). Then `--apply`; `curl -s http://localhost:8787/search \| grep -c 'placeholder="Find your favourites..."'` is at least 1; `curl -s http://srimart.localhost:8787/search \| grep -c "Find your favourites"` prints `0`; a second `--apply` reports no changes; `--apply --restore` leaves the placeholder as set. **Writing to the dev database is the validator's deliberate step; write down the starting and final values.** |
| R18 | Unit + Live | The no-collection cases in `tests/location-control.test.tsx` pass unmodified (diff them against `origin/staging`). Live: if no dev vendor has `offerCollection` false, say so and rely on the unit case, reported as partly verified. |
| R19 | Regression + Browser | The four named test files pass with no edit in `git diff origin/staging --stat`. In a browser at 1280px on Aheed, open the menu: choose `Click & Collect`, confirm the summary after reload; set a deliverable postcode via the dialog, choose `Delivery`, confirm `Delivery · <postcode>`; then choose `Click & Collect`, open `Change postcode`, submit a deliverable postcode, and confirm the method is still `Click & Collect`. |
| R20 | Regression | `git diff --quiet origin/staging -- package.json package-lock.json` exits 0. `grep -rnE "runtime *= *.edge." app components lib features` prints nothing. Loop over `git diff origin/staging --name-only -- app components lib features scripts prisma`, counting `^\+.*(queryRaw\|executeRaw\|Prisma\.sql)` per file, and ignore `app/(admin)/staff/runbook/docs.ts` (a generated embed whose prose mentions `$queryRaw`); every other file counts 0. |
| R21 | Unit | `grep -inE "aheed\|srimart\|grocery\|groceries\|halal" components/layout/LocationControl.tsx components/layout/ShoppingListLink.tsx` prints nothing. |
| R22 | Regression | `git diff origin/staging --name-status -- tests/` shows only the three files named in R22 as modified (`M`) plus added files; read each diff and confirm it encodes one behaviour R3, R4, R6, R11 or R16 changes and no assertion was weakened; confirm `build-notes.md` lists them. `git diff origin/staging --stat -- tests/header-brand.test.tsx` is empty. |
| R23 | Docs | `grep -n "toggle\|Shopping List\|Shop List" specs/architecture.md docs/store-admin-guide/admin-tabs-guide.md` reviewed: any sentence naming the Collect/Delivery toggle pair or the link's position is corrected. `npm run kms:validate` prints `invalid front-matter (failing): 0`; `npm run kms:build-index`, `npm run kms:check-generated`, `npm run kms:assemble:internal` exit 0 and `(cd kms/site-internal && npx next build --webpack)` exits 0; `grep -nE "<[0-9]" specs/2026-10-17-p1142-header-dropdown-search-room/plan.md` prints nothing. |
| R24 | Gate 4 | `git diff origin/staging -- CHANGELOG.md` shows an entry naming `#1142` with the dropdown, the Shopping List position and the placeholder, and the script-only rollout. `git log origin/staging..HEAD --format=%B \| grep -inE "(close[sd]?\|fix(e[sd])?\|resolve[sd]?) +#(1137\|1138\|1139\|1140\|1134\|1135)"` prints nothing. Once the PR is open: `GH_TOKEN=$(gh auth token -u sriahead) gh pr view <n> --json baseRefName,body` shows base `staging` and `Closes #1142` and no closing keyword before the six numbers. |
| R25 | Gate 3 | Stop preview first. One at a time, each alone: `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run format:check`, `npm run build`. A failure in `tests/storefront-chrome-rewards-gate.test.tsx` that also fails on a clean `origin/staging` worktree is the known `#1125` flake: rerun the file alone, record it, and do not count it against this slice. CI on the PR (`quality.yml`) is the ground truth. |

<!--
  Final step for the validator, after every row: write down what you changed in the dev database
  (the Aheed search placeholder, and the departments' hidden state if you toggled it) and the
  delivery postcode and fulfilment choice you set in the browser. Do not run anything in this file
  against staging or production.
-->
