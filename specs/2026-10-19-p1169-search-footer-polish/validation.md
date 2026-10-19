# Search selector, search pills, footer contact icons, payment logos and Quick Shop examples (validation)

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

## Before the live rows (R6–R9, R11, R17)

- **Database target.** Run `printenv DIRECT_URL DATABASE_URL`. This session's environment has
  exported the **production** `DIRECT_URL` before. If either is set, start preview as
  `env -u DIRECT_URL -u DATABASE_URL npm run preview`. `.dev.vars` must name dev
  (`ep-dry-morning-zab7dx08`). This slice writes nothing to any database.
- **Preview.** `npm run preview` serves `localhost:8787`. Reach SriMart by sending
  `Host: srimart.localhost:8787` to `127.0.0.1:8787`; no sign-in is needed for these rows.
  Afterwards, stop only the preview's `node`/`workerd` processes. Killing every `node` process also
  kills MCP servers such as graft.
- **HTML escaping.** In served HTML, `Visit & contact us` appears as `Visit &amp; contact us`,
  `&` in an href as `&amp;`, and U+00A0 may appear as `&nbsp;` or the raw character. Parse the
  HTML (or decode entities) rather than grepping literal text.
- **Pick the departments from the data.** Choose a department with subcategories from the header
  select's own options for each vendor (Aheed: `beverages` had subcategories on 2026-10-19).

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `npx vitest run tests/department-search-bar.test.tsx` passes, with cases asserting the first option is `["", "All"]` and the select's `aria-label` is `Search department`. `grep -n 'ALL_DEPARTMENTS_LABEL = "All";' components/layout/DepartmentSearchBar.tsx` prints one line. |
| R2  | Unit | The same test file has a case with two departments, one with two subcategories. It asserts the option sequence exactly, as (value, text) pairs, with each subcategory text starting with two U+00A0 characters and the department texts carrying none. |
| R3  | Unit | Read `components/layout/Header.tsx`. The value passed as `departments` to every `DepartmentSearchBar` comes from `listTree()`, and `listTopLevel` is not called for it. `grep -n "listTopLevel" components/layout/Header.tsx` prints nothing, unless some other, unrelated use exists that Build names in `build-notes.md`. |
| R4  | Unit | The test file has cases where `useSearchParams` (mocked) returns a department slug, a subcategory slug, and an unknown slug. They assert that the selected option's value is respectively that department slug, that subcategory slug, and `""`. |
| R5  | Unit | `npx vitest run tests/subcategory-links.test.tsx` passes, with existing cases unchanged (hrefs `/categories/<slug>`) plus one case passing the href function and asserting every link uses it. `grep -n "SubcategoryLinks" "app/(storefront)/categories/[slug]/page.tsx"` shows the call with no href prop. |
| R6  | E2E | Under preview, fetch `/search?category=<Aheed department with subcategories>`. Parse the HTML: exactly one `nav[aria-label="Subcategories"]`. Its first `a` has text `All` and `aria-current="page"`. Its link count is 1 plus the number of that department's subcategories (compare with the header select's indented options). Every href starts `/search?` and contains `category=<that pill's slug>`. |
| R7  | E2E | Under preview, fetch `/search?category=<one of those subcategory slugs>`. The same `nav` lists the same links as R6. Exactly one link has `aria-current="page"`: the one whose href contains `category=<that subcategory slug>`. `All`'s href contains `category=<department slug>`. |
| R8  | Unit + E2E | Unit: a test (in `tests/search-href.test.ts` or beside the page's pill wiring) asserts `categoryFilterHref({ q: "juice", category: "beverages", inStock: "1" }, "juices")` contains `q=juice`, `inStock=1` and `category=juices`, and no `cursor`. E2E: fetch `/search?q=juice&category=<dept>&inStock=1&cursor=24`. Every pill href (entity-decoded) contains `q=juice` and `inStock=1` and does not contain `cursor`. |
| R9  | E2E | Under preview: `/search?q=juice` has no `nav[aria-label="Subcategories"]`. `/search?category=no-such-slug` has none. A department with no subcategories, if the select shows one, has none; if none exists, record "not applicable". `/search?category=<dept>` still shows the removable category chip, and its accessible name or text includes the department name. |
| R10 | Unit | `npx vitest run tests/storefront-footer.test.tsx` passes, with a case asserting `getByRole("list", { name: "Contact us" })` is inside `section[aria-label="Visit & contact us"]` and not inside `section[aria-label="Shop with us"]`. The existing link assertions (`/help`, `/help#delivery`, `/terms#refunds`, `/feedback`) still pass. |
| R11 | Unit | Same file: a vendor with no address, phone or email but a Facebook URL renders the `Visit & contact us` section, containing the `Contact us` list. The existing BARE case (no channels either) still finds no such section. |
| R12 | Unit | `npx vitest run` passes a test that reads each of the five files and asserts: `viewBox="0 0 48 30"`, no `<text`, at least one `<path`, an `aria-label` naming the brand and not matching `/placeholder/i`, and a comment containing its Simple Icons slug and `CC0`. Build names the test file in `build-notes.md`. |
| R13 | Unit | `git diff origin/staging -- lib/payment-badges.ts package.json package-lock.json` prints nothing. |
| R14 | E2E | Write a scratch HTML page in the scratchpad (not the repo) showing the five SVGs at 4x size (`<img width="192" height="120">`, `src` an absolute `file:///` path to each repo file). Screenshot it with headless Chrome (`"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless --screenshot=<scratch>.png --window-size=1100,200 file:///<scratch>.html`) and view the PNG. Each tile is white with its brand's mark: the Visa wordmark, the Mastercard circles, American Express, the Apple Pay mark and the Google Pay mark. A blank, broken or text-only tile fails. |
| R15 | Unit | `npx vitest run tests/quick-shop-copy.test.tsx` passes, with the hint finder updated to the new wording. Both branches assert the exact normalised strings in R15. The example branch asserts two `span.font-semibold` elements with texts `2 N` and `N x2`. |
| R16 | Unit | The test named in `build-notes.md` calls `parseListLine` on `2 Apple Juice 1L` and `Apple Juice 1L x2`. It asserts both return `quantity: 2` and equal `terms`, and passes. |
| R17 | E2E | Under preview, for **each** vendor host: fetch `/` (or any storefront page) and check the select's first option is `All` and indented options follow their department (or record that the vendor has no subcategories). Run R6 against one department with subcategories (or record N/A). In the footer HTML, check that `Contact us` sits inside the `Visit & contact us` section. Every badge `img` `src` is one of the five files, and fetching each returns 200 with the new content (no `placeholder`). Fetch `/shop-your-list` and check the hint names one of that vendor's products, not a product from the other vendor. |
| R18 | Unit | `grep -n "PR #1168" specs/roadmap.md` prints a change-log row naming `a182d6d`. `npm run sdd:audit` output has no line matching `PR #1168.*pending`. |
| R19 | Unit | `git diff origin/staging -- CHANGELOG.md` shows an entry citing `#1169`. |
| R20 | Regression | `npm run lint`, `npm run typecheck`, `npm run format:check` and `npm run kms:validate` each exit 0. `npx vitest run`, run alone, exits 0 with no file failing to start. `npm run kms:assemble:internal && (cd kms/site-internal && npx next build --webpack)` exits 0; check its real status, not through `tail`. CI `gates` on the PR is green. |
