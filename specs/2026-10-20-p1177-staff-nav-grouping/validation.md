# Grouped staff panel navigation from one shared nav module (validation)

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

## Before the live rows (R6, R7, R8, R9, R10, R11, R12, R15)

This slice writes to no database, but every `/staff/*` page is behind auth, so the live rows need a
signed-in session. Read this section first — three of these cost an hour if rediscovered.

- **Run preview, not dev.** `npm run dev` cannot load the WASM engine and silently renders an error
  state (`CLAUDE.md`). First run `printenv DIRECT_URL DATABASE_URL`; **if either is set, start as
  `env -u DIRECT_URL -u DATABASE_URL npm run preview`**. At this slice's Orient the session
  environment exported the **production** `DIRECT_URL`, so expect to need the prefix.
- **Hosts.** Aheed is `localhost:8787`. Reach SriMart as `Host: srimart.localhost:8787` against
  `127.0.0.1:8787`.
- **Signing in with `curl`** (`docs/developer-portal/local-dev-playbook.md`): POST to
  `127.0.0.1:8787/api/auth/sign-in/email` with `-H "Host: <vendor-host>"`,
  `-H "Origin: http://<vendor-host>"` **and `-H "x-forwarded-proto: http"`** — without the last one
  `resolveAuthOrigin` infers `https` and returns `403 INVALID_ORIGIN`. Send the returned
  `better-auth.session_token` back as a `Cookie` header, with `x-forwarded-proto: http`, on every
  later request. Better Auth rate-limits after a few attempts (`429`); about 30 seconds clears it,
  so sleep rather than trying header variants.
- **Which account for which vendor.** Use `demo-admin` (a **platform admin**) for both hosts.
  `demo-srimart-admin` answers `401` on dev — its password is not `DEMO_ACCOUNT_PASSWORD`, so a
  SriMart *store-admin* sign-in is unproven locally (measured at `#1135`'s Validate, 2026-10-19).
  `demo-admin` reading SriMart's panel is the proven path and is what R15 uses.
- **Getting the staff tier without a STAFF account.** `app/(admin)/layout.tsx:28-36` and
  `app/(admin)/staff/page.tsx:65-71` both read an `admin-tier` cookie: send
  `Cookie: admin-tier=staff` alongside the session token and **both** surfaces render the staff
  tier. That is the designed preview mechanism — use it for R7 and R11's staff rows. Omit the
  cookie (or send `admin-tier=admin`) for the admin rows.
- **Git Bash rewrites a bare `/staff/...` argument** into `C:/Program Files/Git/staff/...`. Prefix
  such commands with `MSYS_NO_PATHCONV=1`.
- **The browser rows (R8, R9, R10)** run in headless Chrome over the DevTools protocol — a throwaway
  Node script in the scratchpad using `--remote-debugging-port`, `/json/new` and `Runtime.evaluate`;
  the pattern is in the playbook. The session cookie goes in via `Network.setCookie`.
- **Stopping preview.** Use the playbook's PowerShell line. Stopping `npm run preview` does not stop
  it — the orphaned `node`/`workerd` chain holds file locks and the next build fails with `EBUSY`.
- **Run `npx vitest run` alone**, not beside or straight after a build: its forks pool silently
  fails to start workers and whole files never execute, sometimes still exiting 0.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `npx vitest run tests/staff-nav-parity.test.ts` passes its module-shape cases. Independently: `node -e "const m=require('esbuild-register');"` is not needed — instead `grep -n "use server" components/staff/nav-items.ts` prints nothing, and the rewritten test asserts every group has a unique `id`, a unique `label`, a non-empty `items`, and that every item carries `href`, `label`, `description`, `icon` and a `tier` of `"staff"` or `"admin"`. A failure names the offending group or item. |
| R2  | Integration | The rewritten test derives the expected set by reading directory names under `app/(admin)/staff/` that contain a `page.tsx`, removing `errors`, and comparing to the module's hrefs. Confirm independently: `ls "app/(admin)/staff"` lists 25 directories with a `page.tsx`; the module must carry 24 hrefs and no `"/staff"`. Deliberately break it once — add a bogus `app/(admin)/staff/zzz-probe/page.tsx` containing `requireVendorRole("ADMIN")`, re-run **only this test file**, see it **fail** naming `/staff/zzz-probe`, then delete the probe and re-run green. (`tests/operator-doc-coverage.test.ts` will also fail while the probe exists — that is expected, and is why the probe run is scoped to one file. Delete the probe before any other command.) Without this step the row proves the test ran, not that it checks anything. |
| R3  | Integration | The same test reads each page's own `requireVendorRole(...)` arguments and asserts `tier === "staff"` exactly when the arguments include `"STAFF"` (excluding any page refusing on `auth.via !== "platform-admin"`). Confirm the count directly: `grep -l '"STAFF"' app/\(admin\)/staff/*/page.tsx \| wc -l` prints **12**, and those twelve are `attributes, brands, bundles, categories, feedback, inventory, net-content, orders, products, promotions, runbook, search-synonyms`. Note `/staff/payments` is **ADMIN-only** today despite the old test's prose. |
| R4  | Unit | The test asserts the six group labels in order and each group's exact member set, as literals, against `STAFF_NAV_GROUPS`. Read the failure output on a deliberate reorder to confirm it is order-sensitive, then restore. |
| R5  | Integration | `grep -nE '"/staff(/[a-z-]+)?"' components/staff/PanelNav.tsx "app/(admin)/staff/page.tsx"` prints exactly two lines: `"/staff"` in `PanelNav.tsx` and `"/staff/errors"` in the hub. Both files show an import from `./nav-items` / `@/components/staff/nav-items`. The rewritten test asserts the same thing so it cannot regress. |
| R6  | E2E | Under preview, signed in as `demo-admin` on `localhost:8787` **without** the `admin-tier` cookie, `curl` any panel page (e.g. `/staff/products`) and extract every `href` beginning `/staff` inside the `nav[aria-label="Store admin"]`. Expect **25 distinct** values: `/staff` plus the 24 module routes, and no `/staff/errors`. Count the group `<button>` triggers in that nav: **6**. Because closed panels are hidden rather than unmounted, all 25 appear in this one response — if fewer do, the build conditionally unmounted the panels and R6 fails. |
| R7  | E2E | Same request, adding `Cookie: admin-tier=staff` to the session cookie. Expect **13 distinct** hrefs — `/staff` plus `attributes, brands, bundles, categories, feedback, inventory, net-content, orders, products, promotions, runbook, search-synonyms` — and **5** group triggers. Assert the response contains **no** occurrence of `/staff/storefront`, `/staff/team`, `/staff/ai-usage`, `/staff/delivery-areas`, `/staff/loyalty`, `/staff/discounts`, `/staff/reports`, `/staff/customers`, `/staff/faqs`, `/staff/assistant`, `/staff/fulfilment` or `/staff/payments`, and no "Store setup" string. |
| R8  | E2E | `grep -n "Scroll left\|Scroll right" components/staff/PanelNav.tsx` prints nothing. In headless Chrome signed in as admin on `/staff/products`, at `Emulation.setDeviceMetricsOverride` **1280x900**: on `nav[aria-label="Store admin"]` and its inner track, `el.scrollWidth <= el.clientWidth` is `true`; screenshot and view it — seven items on one line, no clipped label. Then at **390x844 with `mobile: true`**: every trigger is reachable (each `getBoundingClientRect().width > 0`, and if the track scrolls, the last trigger can be scrolled to); open *Catalogue* and assert `document.documentElement.scrollWidth <= document.documentElement.clientWidth`. A panel that pushes the page sideways on a phone fails this row even though the desktop half passed. |
| R9  | Security & Accessibility | In headless Chrome, signed in as admin: (a) every group trigger is a `BUTTON` with an `aria-expanded` of `"false"`; (b) `Input.dispatchMouseEvent` a real click on *Catalogue* — its `aria-expanded` becomes `"true"` and its six links are visible (`getBoundingClientRect().height > 0`); (c) click *Offers & Loyalty* — exactly one trigger has `aria-expanded="true"`, and it is not Catalogue; (d) `Input.dispatchKeyEvent` `Escape` — no trigger has `aria-expanded="true"`, and `document.activeElement` is the trigger just closed; (e) reopen, then click at coordinates outside the panel — it closes. Each sub-step is a separate assertion; report them individually. |
| R10 | E2E | **The accepted `#1144` risk — prove it, do not read it.** In headless Chrome, signed in as admin on `/staff/products`: open *Catalogue*, click its `/staff/brands` link, wait for the URL to become `/staff/brands`, then assert **no** trigger has `aria-expanded="true"`. Repeat once more from the destination page (open *Offers & Loyalty*, click `/staff/bundles`) to catch a close that only works on first navigation. Separately, read the `useEffect` in `PanelNav.tsx`: its dependency array must contain the pathname and **must not** contain the open-group state, with the specific `react-hooks/exhaustive-deps` disable comment present. Both halves must pass. |
| R11 | E2E | `curl` `/staff` as admin: the page contains six `<h2>` headings with the six group labels in `STAFF_NAV_GROUPS` order, each followed by that group's cards, and the `/staff/errors` card renders after all six. Repeat with `Cookie: admin-tier=staff`: five headings, **no** "Store setup" heading and no card from it. Confirm the `/staff/errors` card is still present for `demo-admin` (a platform admin) and reason about the vendor-admin case from `auth.via` rather than claiming it — the panel refuses a non-platform admin by the same check it did before this slice. |
| R12 | Regression & Acceptance | In the R6 response, the `/staff/orders` link's text is `Orders` and the `/staff/runbook` link's text is `Runbook`, in **both** the admin and the staff-tier responses (so the old "Fulfillment & Orders" and "Internal Operational Runbook" strings appear nowhere: `grep` the two responses for them and expect no hits). The `/staff/categories` link contains `svg.lucide-folder-tree`. `grep -niE "aheed|srimart" components/staff/nav-items.ts` prints nothing, and a read of the file's 24 labels and descriptions finds no vendor name and no example naming a specific kind of goods (the labels describe panel functions, which is what makes them vendor-neutral). |
| R13 | Unit | `npx vitest run tests/staff-nav-parity.test.ts tests/operator-doc-coverage.test.ts tests/panel-token-purity.test.ts tests/panel-refusal-coverage.test.ts` exits 0, run on its own (not after a build). `grep -n 'currentTier === "staff"\|") : ("' tests/staff-nav-parity.test.ts` prints nothing. `grep -n "nav-items" tests/staff-nav-parity.test.ts` shows the module import. |
| R14 | Regression & Acceptance | Read the "Your core operational pages are…" paragraph in `docs/staff-playbook/staff-tabs-guide.md`: the group names it lists match the five groups a staff viewer sees in R7, and Bundles and Promotions are no longer listed under Catalogue. `grep -n "^#### " docs/staff-playbook/staff-tabs-guide.md docs/store-admin-guide/admin-tabs-guide.md` prints no line that this slice added (a `####` inside a section terminates it for `operator-doc-coverage`'s parser). R13's run of that test confirms nothing broke. |
| R15 | Regression & Acceptance | Read `CLAUDE.md`'s "Staff panel pages (`app/(admin)/staff/*`)" section and the staff-surface bullets in `docs/developer-portal/app-conventions.md` (around line 214). Both must name `components/staff/nav-items.ts` as where a new page is registered, and neither may still tell a reader to add a link to `components/staff/PanelNav.tsx` or `app/(admin)/staff/page.tsx`. `grep -n "PanelNav" CLAUDE.md docs/developer-portal/app-conventions.md` — every remaining mention must be describing the renderer, not an edit site. Then `npm run kms:validate` and `npm run kms:check-generated` exit 0, and `npm run kms:assemble:internal` followed by a real `next build` in `kms/site-internal` succeeds (`gates` never builds the docs site). |
| R16 | Security & Accessibility | Repeat R6's request against `Host: srimart.localhost:8787` signed in as `demo-admin`, and confirm the same 25 destinations and 6 triggers. In headless Chrome on the SriMart host, screenshot the open *Catalogue* panel and view it beside Aheed's: the trigger's active underline and the panel's accents are **SriMart's** colours, not Aheed's. If a token looks right on Aheed only, check whether `brandStyle()` injects a competing inline custom property — inline beats `:root`. `grep -rnE '\[#[0-9a-fA-F]{3,8}\]' components/staff/ "app/(admin)/"` prints nothing outside the generated `runbook/docs.ts`; R13's `panel-token-purity` run is the mechanical form of the same check. |
| R17 | Regression & Acceptance | `git diff origin/staging --stat -- CHANGELOG.md` shows the file changed on this branch, and the new entry names `#1177`. |
| R18 | Regression & Acceptance | `npm run lint`, `npm run typecheck`, `npm run format:check` each exit 0, and `npx vitest run` (alone, after the others finish) exits 0 with no file reporting zero executed tests. CI on the PR is the ground truth — a local green does not substitute for `quality / quality` passing. |
