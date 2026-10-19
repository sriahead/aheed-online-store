# Category search heading, compact department selector, Sign In icon and collapsible sidebar (validation)

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

## Before the live rows (R6, R9, R10, R11, R13, R15, R17)

- **Database target.** Run `printenv DIRECT_URL DATABASE_URL`. If either is set, start preview as
  `env -u DIRECT_URL -u DATABASE_URL npm run preview`. This slice writes nothing to any database.
- **Hosts.** Aheed is `localhost:8787`. Reach SriMart with `Host: srimart.localhost:8787` against
  `127.0.0.1:8787`; no sign-in is needed.
- **Server HTML versus the browser.** The selector reads the URL on the client, inside `Suspense`,
  so its server HTML shows a fallback (`docs/developer-portal/local-dev-playbook.md`, "A control
  that reads the URL on the client"). Read R6's measurements in Chrome after hydration, through
  the DevTools protocol, not from served HTML. The `h1`, the nav and the strip are server-rendered,
  so served HTML is fine for R9.
- **The sidebar rows run in Chrome over the DevTools protocol, at two widths.** Use
  `Emulation.setDeviceMetricsOverride` with 1280x900 (`lg`; also 1536 for Compact or Spacious
  `xl`) and 390x844 with `mobile: true`. The grid's column count is
  `getComputedStyle(grid).gridTemplateColumns.split(" ").length`. Each vendor's density is set on
  `/staff/storefront`; record which density each vendor has, and do not change it.
- **Stopping preview.** Use the playbook's PowerShell line, which stops only preview, so other
  Node tools keep running.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `npx vitest run` on the heading function's test file (named in `build-notes.md`) passes. It asserts the three outcomes exactly, including that a query with a category still gives `Results for “<query>”`. `grep -n "All products" "app/(storefront)/search/page.tsx"` prints no hardcoded heading literal (the literal lives in the helper); read the `h1` to confirm it renders the helper's result. |
| R2  | Unit | Read the `CollectionNav` call in `search/page.tsx`: `activeHref` is `undefined` when the category resolved, else the existing featured/`/search` value. R9 checks it live. |
| R3  | Unit | Read the `DepartmentScroller` call in `search/page.tsx`: `activeSlug` is `selectedCategory.parent?.slug ?? selectedCategory.slug` when resolved, else `null`. R9 checks it live. |
| R4  | Unit | `npx vitest run tests/department-search-bar.test.tsx tests/search-departments.test.ts tests/header-shopping-list.test.tsx` passes, with a case asserting the select's `className` contains `department-select` and contains neither `w-24` nor `sm:w-36`. |
| R5  | Unit | Read `app/globals.css`: the `.department-select` rules exist as listed in R5. `grep -nE "#[0-9a-fA-F]{3,8}\b\|rgb\(" app/globals.css` run over only the `department-select` blocks matches no brand colour (a low-alpha black shadow is the only allowed literal). |
| R6  | E2E | Under preview, use a throwaway Node script in the scratchpad (headless Chrome, `--remote-debugging-port`, `/json/new`, `Runtime.evaluate`; the pattern is in the playbook) on `/search` for each vendor host (`--host-resolver-rules` or a `Host`-mapped URL for SriMart, e.g. `http://srimart.localhost:8787/search`). After hydration, read `select.getBoundingClientRect().width` (at most `96` with `All` selected) and `getComputedStyle(select).appearance` (`base-select`). Then click the select with `Input.dispatchMouseEvent` (a real gesture opens the picker), wait, `Page.captureScreenshot`, and view the PNG: a rounded, shadowed panel, indented subcategories, a tick on the selected option, and the vendor's colours. A native-looking OS list in Chrome fails. |
| R7  | Unit | Read the select's `className`: it still has `data-tap-surface="search"` (attribute), `min-h-tap`, `lg:min-h-0` and `focus-visible:ring-2`. Read `app/globals.css`: the fallback `width: 5.5rem` is outside any `@supports` block. |
| R8  | Unit | `grep -n "LogIn" components/layout/Header.tsx` prints nothing. `grep -n "CircleUserRound" components/layout/Header.tsx` shows the import and one use inside the `/login` link with `w-4 h-4 text-primary`. `npx vitest run tests/header-shopping-list.test.tsx` passes, and a test (Build names it) asserts the signed-out `/login` link contains an `svg` with class `lucide-circle-user-round`. |
| R9  | E2E | Under preview, for **each** vendor host, fetch and parse the served HTML. (a) `/search?category=<dept>`: the `h1` text is the department's name, as shown on `/categories/<dept>`. (b) `/search?category=<sub>`: the `h1` is the subcategory's name. (c) `/search?q=<term>&category=<dept>`: the `h1` is `Results for “<term>”`. (d) `/search`: `All products`. On (a) and (b), the `nav[aria-label="Collections"]` has no `a[aria-current="page"]`, and the department strip has exactly one `aria-current="page"` item, whose href is `/categories/<dept>`. The signed-out header has an `svg.lucide-circle-user-round` inside `a[href="/login"]`. Pick `<dept>`/`<sub>` from the header select's options (Aheed: `fruit-veg`/`fresh-fruit`; SriMart: `sri-electronics`/`sri-chargers-cables` on 2026-10-19). |
| R10 | Unit + E2E | Unit: the new component's test (named in `build-notes.md`) renders it and asserts no toggle `button` before the mount effect runs (server render, e.g. `renderToString`). After mount, it asserts a `Hide filters` button with `aria-expanded="true"` and `aria-controls` matching the column's `id`. Clicking gives `Show filters`, `aria-expanded="false"`, with focus on it; clicking again gives back `Hide filters`, with focus on it. E2E at 1280px: same sequence through CDP clicks (`Input.dispatchMouseEvent`), reading `document.activeElement`'s text after each. With JavaScript disabled (`Emulation.setScriptExecutionDisabled`), the page has no `Hide filters` button and the filter form is visible. |
| R11 | E2E | At 1280px after `Hide filters`: the Collections nav and the desktop filter form have `offsetParent === null` (hidden), the `Show filters` button is visible, and `document.documentElement.hasAttribute("data-filters-collapsed")` is `true`. After `Show filters`, all reverse. At 390px with the attribute set by hand (`document.documentElement.setAttribute(...)`): the Collections nav and the mobile `details` are visible exactly as without it. |
| R12 | Unit + E2E | `grep -n "store_filters_collapsed" lib/storage-keys.ts` shows the export. `grep -rn "store_filters_collapsed" app components lib --include=*.ts --include=*.tsx` shows only `lib/storage-keys.ts` (generated `runbook/docs.ts` excepted). Unit test: collapse then show asserts `sessionStorage` gains then loses the key and `localStorage` is untouched; with `sessionStorage.setItem` throwing, toggling raises nothing. E2E: after collapsing, `sessionStorage.getItem("store_filters_collapsed") === "1"` and `document.cookie` does not contain it. |
| R13 | E2E | In one CDP tab at 1280px: collapse, then navigate to another `/search?category=…` URL. Capture `document.documentElement.hasAttribute("data-filters-collapsed")` with `Page.addScriptToEvaluateOnNewDocument` hooked at `DOMContentLoaded`: `true`. A screenshot taken immediately after load shows the rail, not the open column. Read the page source: the inline script is present, wrapped in `try/catch`, and contains the key interpolated from `FILTERS_COLLAPSED_KEY`. |
| R14 | E2E | Fetch `/privacy` on both vendor hosts. The stored-items list contains "Remembers whether you hid the filters, until you close the tab." and "Shown in your browser as store_filters_collapsed". `git diff origin/staging -- components/consent/` prints nothing. |
| R15 | Unit + E2E | Unit: a test reads `app/globals.css` and asserts the six column rules (density x breakpoint) are present under `html[data-filters-collapsed]` and scoped to the layout's data attribute; `npx vitest run tests/product-grid-density.test.ts tests/product-grid-usage.test.ts` passes. E2E at 1280px for each vendor's own density: column count before collapse equals the density's `lg` count, and after collapse it is one more. Then at 1536px (`xl`): Compact 6 to 7, Spacious 4 to 5, Standard 4 to 5. At 1023px or narrower: unchanged by collapsing. `/bundles` with the attribute set: unchanged. |
| R16 | E2E | Signed in as `demo-admin`, fetch `/staff/storefront`. The density form contains a sentence saying a shopper who hides the filter sidebar sees one more product per row on wide screens. Read the source line too. |
| R17 | Unit + E2E | `npx vitest run tests/filter-panel.test.tsx` passes (still no `"use client"`, `details` closed by default), with an added assertion that the `summary` contains an `svg.lucide-sliders-horizontal` and a chevron carrying a `motion-reduce:` class. At 390px through CDP: one `nav[aria-label="Collections"]` in the document, visible above the closed `details`. |
| R18 | Unit | `git diff origin/staging -- CHANGELOG.md` shows an entry citing `#1173`. |
| R19 | Regression | `npm run lint`, `npm run typecheck`, `npm run format:check` and `npm run kms:validate` each exit 0. `npx vitest run`, run alone, exits 0; re-run any failure alone and record it. `npm run build` exits 0. `npm run kms:assemble:internal && (cd kms/site-internal && npx next build --webpack)` exits 0; check its real status. CI `gates` on the PR is green. |
