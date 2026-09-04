# P2.6 slice 5 — search autocomplete and filter panel with chips and drill-down (validation)

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

## Before you start

**Every live row below runs against `npm run preview`** (OpenNext + local Workers/Miniflare) on
`http://127.0.0.1:8787`, **never `npm run dev`** — plain `next dev` cannot load
`@prisma/client/wasm` and silently renders an error state on any DB-touching route (CLAUDE.md,
Database).

Two rows (**R30**, and the confirmation half of **R5**/**R35**) cannot be satisfied under local
preview and say so explicitly in their own row.

Confirm `.env` and `.dev.vars` against `secrets/staging.vars` and `secrets/production.vars` before
any live-DB row, per CLAUDE.md's Config section — two files agreeing tells you nothing about
*which* database they agree on.

Stopping preview leaves orphaned `node.exe`/`workerd.exe` children holding `.open-next\assets`; kill
the whole chain before re-running (CLAUDE.md, Windows shell).

`npx vitest run`'s summary must be read for its **file and test counts**, not just its exit code —
a shortfall against the current baseline means files silently never ran. Build updates that
baseline in `CLAUDE.md`; compare against the value there, not against memory.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `npx vitest run tests/filter-panel.test.tsx` passes, asserting two rendered `ProductFilterForm` instances, one inside a `details` with `md:hidden`, one inside a container with `hidden` and `md:block`. Then `grep -c "use client" components/product/FilterPanel.tsx` prints `0`. |
| R2  | Unit | `grep -n "FilterPanel" "app/(storefront)/search/page.tsx" "app/(storefront)/categories/[slug]/page.tsx"` shows an import and use in each, and `grep -n "ProductFilterForm"` on those same two files returns no match. |
| R3  | E2E | With preview running: `curl -s http://127.0.0.1:8787/search?q=rice \| grep -o "<details[^>]*>"` — every match is free of an `open` attribute. Repeat against `/categories/<a-real-slug>`. |
| R4  | Unit | `grep -nE "aria-modal\|usePathname\|Escape" components/product/FilterPanel.tsx` returns no match. |
| R5  | Security & Accessibility | Load `http://127.0.0.1:8787/search?q=rice` in Chrome at a 375px viewport with JavaScript blocked for the origin (DevTools, Settings, Disable JavaScript). Expand the filter disclosure, tick "In stock only", press Apply, and confirm the URL gains `inStock=1` and the grid changes. If the Chrome extension is unavailable, the fallback proof is `curl -s` on the same URL showing the `details` element and a complete `form method="GET"` with its controls present in the **server-rendered** HTML — record which of the two was actually run. |
| R6  | Unit | `npx vitest run tests/filter-chips.test.ts` passes. |
| R7  | Unit | Covered by the same run: a case per filter parameter asserting the removed key is absent, every other active key is present, `q` survives, and neither `cursor` nor `back` appears. |
| R8  | Unit | Same run: `clearAllHref("/search", {...all filters set, q set, cursor set})` returns a path carrying `q` alone. |
| R9  | Unit | Same run: `activeFilterChips` with no filters returns `[]`. Then, live, `curl -s http://127.0.0.1:8787/search?q=rice \| grep -c "Clear all"` prints `0`. |
| R10 | E2E | `curl -s "http://127.0.0.1:8787/search?q=rice&inStock=1&isHalal=1"` contains a chip anchor for each of the two filters and one "Clear all" link. |
| R11 | Unit | `npx vitest run tests/search-repository.test.ts` passes, including new cases asserting `buildFilterWhere({categoryIds: ["a","b"]})` emits `categoryId: { in: ["a","b"] }` and that `buildFilterWhere({})` and `buildFilterWhere({categoryIds: []})` both emit no `categoryId` key. |
| R12 | Unit | Same run: a case calling `listProductsByCategory` with a spy client, passing a conflicting `categoryIds` in `filters`, asserting the `where.categoryId.in` the client receives is the page's category list, not the filter's. |
| R13 | E2E | Against preview, pick a real department slug from `curl -s http://127.0.0.1:8787/categories`. Compare `/search?category=<slug>` against `/search` — the former returns a strict subset, and every product on page 1 also appears under `/categories/<slug>`. Repeat with `q=` absent (browse mode) and present (search mode). |
| R14 | E2E | `/search?q=<term>` returns set A, `/search?category=<slug>` returns set B, `/search?q=<term>&category=<slug>` returns only products present in both. Record the three product-name lists. |
| R15 | E2E | `curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:8787/search?category=definitely-not-a-real-slug"` prints `200`, and the body's product count equals that of `/search` with no `category` at all, with no category chip rendered. |
| R16 | E2E | `curl -s http://127.0.0.1:8787/search?q=rice` contains an anchor per top-level category with `category=` set and `q=rice` preserved and no `cursor`. Fetching one of those URLs then additionally lists that category's children. |
| R17 | E2E | `curl -s "http://127.0.0.1:8787/search?q=rice&category=<slug>"` contains a chip anchor whose href carries `q=rice` and no `category`. |
| R18 | Unit | `npx vitest run tests/products-repository.test.ts` passes, including a case asserting `getAvailableSpecialities` forwards term groups, category ids, price bounds and the in-stock flag into each probe's `where`. |
| R19 | Unit | Same run: a case asserting none of the three probes' `where` carries `isHalal`, `isFresh` or `isOrganic` even when all three are set in the passed context. |
| R20 | Unit | `grep -n "export function buildDirectSearchWhere" lib/repositories/products.ts` matches once. `tests/search-repository.test.ts` compares `searchProducts`'s composed `where` against that function's real output (never a hand-written copy), and the facet test asserts the probe's term predicate is that same function's output. |
| R21 | E2E | Find a query whose matches all lack one speciality (e.g. a query matching only non-organic products). `curl -s "http://127.0.0.1:8787/search?q=<that term>"` shows no Organic checkbox, while `/search` with no query still shows it. Record the query used and both outcomes. |
| R22 | Unit | `test -f "app/api/search/suggest/route.ts"` and `grep -c "export const runtime" app/api/search/suggest/route.ts` prints `0`. |
| R23 | Integration | Against preview: `curl -s -H "Host: no-such-vendor.example" -o /dev/null -w "%{http_code}" "http://127.0.0.1:8787/api/search/suggest?q=rice"` prints `200`, and the body parses to all three arrays empty. |
| R24 | Integration | `curl -s "http://127.0.0.1:8787/api/search/suggest?q=e"` returns all three arrays empty. Confirm no query was issued by querying the local Worker's own log store — `POST http://127.0.0.1:8787/cdn-cgi/local/explorer/api/local/observability/query` with a `sql` body over the `logs` table — for the request, and by a unit case in `tests/search-suggest-route.test.ts` asserting the Prisma spy was never called. |
| R25 | Unit | `npx vitest run tests/search-suggest-route.test.ts` passes: the composed `where` touches `name` only (no `description` key anywhere), ANDs every term, and includes each term's approved alias variants. |
| R26 | Integration | `curl -s "http://127.0.0.1:8787/api/search/suggest?q=rice"` returns at most 6 products, 3 categories and 3 terms, with products in `rankSearchCandidates` order (assert the order in the same unit run against a fixed candidate set). |
| R27 | Unit | `grep -nE "take: [A-Z_]+" app/api/search/suggest/route.ts` shows the `take` bound to a named constant declared in that module, and that constant's value is at most 30. |
| R28 | Integration | Record `SearchQueryLog` row count against the dev database, issue 10 requests to the suggest route, re-count — unchanged. Use a committed `npx tsx scripts/<name>.ts` script, not `npx tsx -e` (which fails silently on this Windows setup once it imports a package), and do not pipe its output through `head`. |
| R29 | Integration | `curl -s -D - -o /dev/null "http://127.0.0.1:8787/api/search/suggest?q=rice" \| grep -i "^cache-control"` shows `public` and a non-zero `max-age`. |
| R30 | Integration | **Deployed environment only — not provable under local preview.** After the branch is on `staging`, `curl -s "https://staging.aheedfoodcentre.nocaped.com/api/search/suggest?q=rice"` and `curl -s "https://srimart-staging.nocaped.com/api/search/suggest?q=rice"` return each vendor's own products. Repeat both twice and check `cf-cache-status` — a `HIT` on the second must still return that host's own products, never the other's. This is the row that proves per-host cache isolation; `#502` is the standing reason it cannot be checked against dev. |
| R31 | Unit | `grep -c "use client" components/layout/SearchSuggest.tsx` prints `1`; `grep -n "method=\"GET\"" components/layout/Header.tsx` still shows `action="/search"` on the enclosing form. |
| R32 | Security & Accessibility | `npx vitest run tests/search-suggest.test.tsx` passes, asserting `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-autocomplete="list"` on the input, `role="listbox"` on the list and `role="option"` on each suggestion. |
| R33 | Security & Accessibility | Same run: keyboard cases for ArrowDown/ArrowUp updating `aria-activedescendant`, Enter activating the active option, and Escape closing the list without a form submit. Then confirm once by hand in Chrome against preview, keyboard only. |
| R34 | Unit | Same run: with fake timers, three keystrokes inside the debounce window issue one `fetch`; a fourth keystroke while a request is in flight calls `abort` on the previous controller. |
| R35 | E2E | With JavaScript blocked for the origin, type into the header search box and press Enter — the browser navigates to `/search?q=…` and results render. Fallback if the Chrome extension is unavailable: `curl -s http://127.0.0.1:8787/ \| grep -o '<form method="GET" action="/search"'` matches; record which was run. |
| R36 | Unit | `grep -nE "#[0-9a-fA-F]{3,6}" components/product/ProductFilterForm.tsx` returns no match, and the submit button's class list contains the action token. |
| R37 | Regression | `git diff --stat origin/staging -- prisma/schema.prisma` is empty and `git status --porcelain prisma/migrations/` shows no new directory. |
| R38 | Regression | `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts` passes. |
| R39 | Regression | `npm run kms:validate` exits 0, then `npm run kms:assemble:internal && (cd kms/site-internal && npx next build --webpack)` exits 0 — read the real exit status, do not pipe it through `tail` (that reports the pipe's status, not the build's). |
| R40 | Regression | `git diff origin/staging -- CHANGELOG.md` shows this slice's entry. |
| R41 | Regression | `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run format:check` each exit 0. Read vitest's file/test totals against the baseline in `CLAUDE.md`, not just its exit code. CI on Linux is the authority for all four. |
