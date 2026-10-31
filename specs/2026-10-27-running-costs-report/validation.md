# Running costs report for platform admins (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Risk profile: a new page that shows internal financial information (access control matters), one
read-only database aggregate (existing), and pure calculation code whose numbers the owner will rely
on. No schema, payment, email or external call. Money arithmetic and the "never show a guess as a
fact" rule are the risks that deserve exact-value tests.

1. **Unit** - the registry invariants and `buildCostReport` with exact expected numbers (R1-R8), the
   service function (R9).
2. **Integration** - the page rendered with mocked auth and a mocked usage read (R10-R14), including the
   four access cases (R11).
3. **System / E2E** - `npm run preview` as three different accounts (R19), then one unauthenticated
   request against staging after deploy (R20).
4. **Regression** - the repo's own structural tests that a new platform page must satisfy (R15-R17).
5. **Security** - platform-admin-only access, and no registry value in a refused response (R11, R19).

## Setup (for the live rows R19 and R20)

1. Read CLAUDE.md "Config & secrets": check `DIRECT_URL` and `DATABASE_URL` **one at a time** (a
   per-variable loop with `printenv "$v" >/dev/null 2>&1`, host only, never branch on `printenv`'s exit
   code) and confirm `.dev.vars` names the **dev** Neon host before starting.
2. `npm run preview`; wait for `Ready on http://127.0.0.1:8787`.
3. Send every request to `http://127.0.0.1:8787` with `-H "Host: localhost:8787"`, `-H "Origin: http://localhost:8787"`
   and `-H "x-forwarded-proto: http"` for sign-in, and prefix curl with `MSYS_NO_PATHCONV=1` in Git Bash
   (`docs/developer-portal/local-dev-playbook.md`, sign-in notes). Sign in with a cookie jar to
   `/api/auth/sign-in/email` as each of: `demo-admin@example.com` (platform admin),
   `demo-store-admin@example.com` (vendor ADMIN) and `demo-staff@example.com` (vendor STAFF). The
   shared demo password is in `docs/developer-portal/env-setup.md` / the seed notes; never write it into
   a spec or a commit. A `429` means wait about 30 seconds and retry.
4. When finished, kill the whole `node`/`workerd` chain (CLAUDE.md, Windows), then confirm none remain.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `npx vitest run tests/running-costs.test.ts --maxWorkers=4` passes. Also `head -3 lib/running-costs.ts` shows no `"use client"`/`"use server"`, and `grep -nE 'from "(react\|next/\|@/lib/db\|@prisma/)' lib/running-costs.ts` prints nothing. The test imports `RUNNING_COST_ITEMS`, `buildCostReport` and `formatCostStatus` by name. |
| R2  | Unit | Same test file: a loop over `RUNNING_COST_ITEMS` asserts every invariant in R2 (unique ids, integer non-negative `amountCents` or null, `period` null exactly when `amountCents` null, `currency` `"USD"`, date formats, `priceChange` only on `year` items with a positive integer `toCents` and `effectiveOn <= renewsOn`, `actual` never `not-confirmed`). To prove it can fail, in a scratch copy of the test pass an item with `amountCents: 12.5` and one with a duplicate `id` and confirm the loop's assertion fails for each (print which assertion failed before reading the result). |
| R3  | Unit | Same file asserts the 11 ids, and for each its `costStatus`, `basis`, `amountCents`, `period`, `renewsOn`, `autoRenew` and `priceChange` against the table in R3, the three domain `role` strings, `note` containing `#1289` on `neon`, and "Verisign" in both `.com` `priceChange.note`s. Cross-check by reading `lib/running-costs.ts` against `requirements.md` R3 line by line. |
| R4  | Unit | Same file: every non-null `limits` has an `https://` `sourceUrl`, a non-empty `allowance`, a boolean `confirmedByOwner`, and none is `true`. Then open the `sourceUrl` of **two** items that have `limits` in a browser or with `curl -sL <url>` and confirm the recorded allowance text matches what the provider page says; report any mismatch as a failure. If an item has `limits: null`, confirm the page text for it is "Limits not recorded". |
| R5  | Unit | Same file: `buildCostReport(RUNNING_COST_ITEMS, new Date("2026-10-27"))` returns `current` `{7046, 587}`, `withPlanned` `{8622, 719}`, `atRenewal` `{8764, 730}`. Additional cases with small injected registries: a `planned`-only item changes `withPlanned` but not `current`; an `estimate` or `unverified` item with `amountCents: null` changes no total; a `month` item contributes `amountCents * 12` to the annual figure. |
| R6  | Unit | Same file: at `now` 2026-10-27 `attention` equals exactly the three `{id, kind}` pairs in R6 (order-insensitive); at `now` 2027-07-20 it is exactly `domain-nocaped` `auto-renew-off` and `domain-nocaped` `renewal-soon` (no `price-change-soon`); boundary cases with injected items: a `renewsOn` exactly 60 days out is included, 61 days out is not, yesterday is not; `autoRenew: null` produces nothing. |
| R7  | Unit | Same file: `renewals` equals `[{ id: "domain-nocaped", renewsOn: "2027-08-15", amountCents: 1117 }]` for the R3 registry; with two injected items it is sorted ascending by `renewsOn`; an item with `renewsOn` but no `priceChange` reports its own `amountCents`. |
| R8  | Unit | Same file: `unpriced` equals `["workers-ai","stripe","cloudflare-email"]` (order-insensitive) for the R3 registry; a registry of only `amountCents: 0` items gives `current.annualCents === 0`. |
| R9  | Unit | `npx vitest run tests/ai-usage-service.test.ts --maxWorkers=4` (or the existing file that tests `lib/ai-usage-service.ts`, found with `git grep -l ai-usage-service -- tests`): mocking `getPrisma`, `getAiEnv` and `sumPlatformMilliNeuronsSince` to return `12500` and `"paid"`, `getPlatformAiNeuronsToday()` resolves `{ plan: "paid", neurons: 12.5 }`, and `getPrisma` is called once per call of the function (not cached). `git diff --stat origin/staging...HEAD -- lib/repositories` prints nothing. |
| R10 | Integration | `npx vitest run tests/running-costs-page.test.tsx --maxWorkers=4`: with the usage read mocked to `{ plan: "free", neurons: 4200 }` the `workers-ai` row contains `4,200`, `10,000` and "Free"; with `{ plan: "paid", neurons: 12000 }` it contains "Paid" and `$0.03` (`estimatedPaidChargeCents(12000)` is 3 cents: 2,000 over at 11 cents per 10,000, rounded up); with the read rejecting it contains "Usage unavailable" and does **not** contain "0 of" or a neuron count; every other `data-costs-item` contains "Usage not monitored". |
| R11 | Integration | Same file, access cases with `requireVendorRole` mocked: platform admin (`via: "platform-admin"`) renders the report; vendor ADMIN (`via` not `"platform-admin"`) renders `PanelRefusal` with "Platform admin only" and the rendered output contains none of `$70.46`, `data-costs-item`, `domain-nocaped`; STAFF-style refusal (`ok: false, status: 403`) renders the same refusal; `ok: false, status: 401` calls `redirect("/login")`. Then `grep -nE 'dynamic *= *"force-dynamic"' "app/(admin)/staff/platform/costs/page.tsx"`, `grep -n 'title: "Running Costs"'` and `grep -n 'width="wide"'` on the same file each match, and `grep -nE '@/lib/db\|@prisma' "app/(admin)/staff/platform/costs/page.tsx"` prints nothing. |
| R12 | Integration | Same file, platform admin render with the real registry and `Date` mocked to 2026-10-27: assert the six `data-costs-total` values are `$5.87`, `$70.46`, `$7.19`, `$86.22`, `$7.30`, `$87.64`; 11 `data-costs-item` elements; `data-costs-attention` has 3 entries naming `domain-nocaped` and `domain-merqify`; `data-costs-renewals` has 1 entry containing `2027-08-15` and `$11.17`; `data-costs="currency-note"` contains "US dollars" and "pounds". |
| R13 | Integration | Same file: with `RUNNING_COST_ITEMS` mocked to only free items, `data-costs="zero-notice"` exists with the text "Nothing is currently billed." and every item row is still rendered; with the real registry that element does not exist. |
| R14 | Integration | Same file, per item in the real registry: status text is `Actual`/`Planned`/`Estimate`/`Unverified` per R3 (`domain-merqify` shows `Planned`, `stripe` `Unverified`, `workers-ai` `Estimate`); the `cloudflare-workers` row contains `$5.00/month`; `domain-nocaped` contains `$10.46/year`, "Auto-renew off", `$11.17` and `2026-11-01`; `domain-merqify` and `domain-aheedfoodcentre` contain "Not yet registered"; `stripe` contains "Not priced"; a row with `limits` contains its source host, `retrievedOn` and "Not confirmed by the owner"; a row with `limits: null` contains "Limits not recorded". |
| R15 | Regression | `grep -n -B1 -A5 '"/staff/platform/costs"' components/staff/platform-nav-items.ts` shows `label: "Running Costs"`, `icon: "coins"` and a description. `git grep -n '/staff/platform/costs' -- components/staff/nav-items.ts components/staff/PanelNav.tsx "app/(admin)/staff/page.tsx"` prints nothing. Open the hub at `/staff` as `demo-admin` in the preview (R19 session) and confirm a "Running Costs" card appears under "Platform Administration" and links to the page; as `demo-store-admin` the section is absent. |
| R16 | Regression | `grep -n '"costs"' tests/operator-doc-coverage.test.ts` and `grep -n 'platform/costs/page.tsx' tests/page-container.test.ts` match; `git diff --stat origin/staging...HEAD -- tests/staff-nav-parity.test.ts` prints nothing; `npx vitest run tests/operator-doc-coverage.test.ts tests/page-container.test.ts tests/staff-nav-parity.test.ts --maxWorkers=4` passes. To show the doc test can fail, temporarily rename the guide heading to drop `` `/staff/platform/costs` ``, run it (it must fail naming the route), then revert and re-run to green. |
| R17 | Review | `head -12 docs/platform-admin-guide/platform-admin-guide.md` shows `version: "1.3.0"` and `updated: "2026-10-27"` (or unquoted, matching the file's style). Read the new section: the heading contains `/staff/platform/costs`; it has the seven labelled parts; "Who can access" is exactly "Platform admins only"; it states that figures come from `lib/running-costs.ts` and are changed by editing it, that only Workers AI usage is live, what Actual/Planned/Estimate/Unverified mean, and what "Needs attention" lists. Per CLAUDE.md no test checks a documented capability exists, so trace **each sentence** to an element in the page (R12/R14) and report any sentence with no matching control. |
| R18 | Regression | `git diff --stat origin/staging...HEAD -- prisma package.json package-lock.json lib/config.ts .github/workflows` prints nothing. `git diff --name-only origin/staging...HEAD \| grep -iE '^(lib\|app)/.*(email\|notification\|alert)'` prints nothing. `grep -n 'fetch(' lib/running-costs.ts "app/(admin)/staff/platform/costs/page.tsx"` prints nothing. |
| R19 | E2E | Preview (Setup). Sign in as `demo-admin`, then `MSYS_NO_PATHCONV=1 curl -s -b jar.txt -H "Host: localhost:8787" -H "x-forwarded-proto: http" http://127.0.0.1:8787/staff/platform/costs > costs-admin.html`. Confirm HTTP 200, `grep -c 'data-costs-item=' costs-admin.html` is 11, the file contains `data-costs-total="current-annual"` near `$70.46`, and the `workers-ai` item contains a neuron count or "Usage unavailable". Repeat as `demo-store-admin`, `demo-staff` and with no cookie: each response (follow no redirects, record the status) contains none of `$70.46`, `data-costs-item`, `domain-nocaped`. Record the four statuses. Visual: open the page in a browser as `demo-admin`, confirm it is readable at phone width (no horizontal page scroll) and that nothing looks like a live provider figure that is really a registry value; record a screenshot in the Validate notes. |
| R20 | E2E | Only after Ship merges to `staging` and `deploy-staging` succeeds: `curl -s -i https://staging.aheedfoodcentre.nocaped.com/staff/platform/costs` (no `-o`, which Git Bash rewrites, per CLAUDE.md) and confirm the response is a redirect or a refusal and the body contains no `data-costs-item`. Then read `/api/health` on that host and confirm `commit` is the merge commit. Mark unverified if staging has not deployed yet. |
| R21 | Unit | `git ls-files tests/running-costs.test.ts tests/running-costs-page.test.tsx` lists both; the page test contains the four access cases named in R11; the R9 test exists (R9 row); `npx vitest run --maxWorkers=4` (run alone, not beside a build) passes. If an unrelated test times out under load, re-run that file alone before judging (CLAUDE.md; `#1294` tracks `tests/icon-imports.test.ts`), and say so. |
| R22 | Review | `git diff origin/staging...HEAD -- CHANGELOG.md` shows a `#1295` entry; `git show HEAD:CHANGELOG.md \| file -` does not report CRLF; `grep -cP '\x08' CHANGELOG.md` prints 0. |
| R23 | CI | The PR's `gates` workflow is green (CI is ground truth). Locally: `npm run lint`, `npm run typecheck`, `npx vitest run --maxWorkers=4` (alone), `npm run format:check`, `npm run kms:validate`, `npm run kms:check-generated` and `npm run build` each exit 0. After editing `docs/` or `specs/` also run `npm run kms:assemble:internal` and a real Next build in `kms/site-internal` (CLAUDE.md: `gates` does not build the docs site). |
