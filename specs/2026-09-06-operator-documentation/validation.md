# Operator documentation — runbook role delivery, guide accuracy, per-menu-item coverage (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid
> testing the same behaviour multiple times at different levels unless doing so provides additional
> confidence.
>
> **The Main Principle:**
>
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

1. **Unit Testing** — *When needed:* Every feature.
2. **Integration Testing** — *When needed:* Every feature.
3. **System / End-to-End Testing** — *When needed:* Critical journeys and validation testing.
4. **Regression & Acceptance Testing** — *When needed:* Mainly before release, or when changing core flows.
5. **Performance & Resilience Testing** — *When needed:* Mainly before release.
6. **Security & Accessibility Testing** — *When needed:* Mainly before release, or earlier for auth or UI changes.

This slice changes **which documents a given role can read** and **what those documents claim about
permissions**, so its security rows are walked at Validate rather than deferred. It ships no schema
change, no migration and no repository change, so there are no database-integrity rows.

---

## Before any live row: confirm which database you are pointed at

`npm run preview` reads `.dev.vars`, not `.env` (the Cloudflare request context wins). Two files
drifting into agreement on the **wrong** target is a documented failure here — at P5a's validation
both agreed and both pointed at production.

```bash
grep -E '^(DATABASE_URL|DIRECT_URL)=' .dev.vars .env
grep -E '^(DATABASE_URL|DIRECT_URL)=' secrets/staging.vars secrets/production.vars
```

Confirm the `.dev.vars` host is the **dev** Neon host and matches neither `secrets/production.vars`
nor `secrets/staging.vars`. A "staging-sounding" filename is not evidence; only the host is.

## Getting the two sessions the live rows need

Three rows below need a real session: R8 and R18 need a **vendor store admin**, R6 needs a
**platform admin** (`User.role === "ADMIN"`). No browser extension is required — `/staff/runbook` is
a read-only page, so a plain `curl` fetch with a session cookie is sufficient.

```bash
# Vendor store admin.
curl -s -c admin.txt -X POST http://127.0.0.1:8787/api/auth/sign-in/email \
  -H 'Content-Type: application/json' -H 'Origin: http://127.0.0.1:8787' \
  -d '{"email":"<seeded store admin email>","password":"<password>"}'

# Platform admin (a different account: User.role === "ADMIN").
curl -s -c platform.txt -X POST http://127.0.0.1:8787/api/auth/sign-in/email \
  -H 'Content-Type: application/json' -H 'Origin: http://127.0.0.1:8787' \
  -d '{"email":"<platform admin email>","password":"<password>"}'

curl -s -b admin.txt    http://127.0.0.1:8787/staff/runbook > runbook-admin.html
curl -s -b platform.txt http://127.0.0.1:8787/staff/runbook > runbook-platform.html
```

If no platform-admin account exists in the dev database, R6 is verified by reading the code path plus
one negative live check (the vendor-admin fetch contains no platform-admin document) — record that in
`build-notes.md` rather than silently skipping the row.

---

## Validation Steps

| Req | Testing Area | How to verify |
| --- | --- | --- |
| R1 | Security | `grep -nE 'audience\.includes|audience\.some|filter\(' components/staff/RunbookClient.tsx` shows no expression narrowing `docs` by audience ahead of the tab selection. Read the component top-to-bottom and confirm the only narrowing applied to `docs` is the user's current tab. |
| R2 | Unit | `grep -nE '"(staff|admin|store-admin|platform-admin)"' components/staff/RunbookClient.tsx` prints no tab-list literal. The tab array is derived from the `docs` prop — read the derivation and confirm it reads `audience` values off the received documents. |
| R3 | Unit | `npx vitest run tests/runbook-audience.test.ts` exits 0, including a case asserting that for any document set, every derived tab other than "All" selects at least one document. |
| R4 | Unit | In the same run, a case asserts the labels: `staff` renders "Staff", `store-admin` renders "Store admin", `platform-admin` renders "Platform admin". |
| R5 | Security | `grep -n 'audience' "app/(admin)/staff/runbook/page.tsx"` shows `staff` and `store-admin` admitted unconditionally after the role gate. R8 proves it live. |
| R6 | Security | `grep -n 'platform-admin' "app/(admin)/staff/runbook/page.tsx"` shows the platform-admin audience admitted only inside an `auth.via === "platform-admin"` comparison. **Live:** `grep -c 'Platform & Technical Admin Guide' runbook-admin.html` prints `0`, and the same grep against `runbook-platform.html` prints a non-zero count. |
| R7 | Unit | `npx vitest run tests/runbook-audience.test.ts` exits 0, including a case that reads the audience values admitted by `app/(admin)/staff/runbook/page.tsx` and asserts each has a label in `components/staff/RunbookClient.tsx`. Confirm the test fails if a label is removed. |
| R8 | E2E | **Live.** `grep -c 'Staff Daily Operations Playbook' runbook-admin.html` and `grep -c 'Store Admin Management Guide' runbook-admin.html` each print a non-zero count. `curl -s -o /dev/null -w '%{http_code}' -b admin.txt http://127.0.0.1:8787/staff/runbook` prints `200`. |
| R9 | Integration | `grep -niE 'refund' docs/store-admin-guide/admin-tabs-guide.md` returns only lines stating refunds are **not** available from the panel. No line claims a refund can be issued there. |
| R10 | Security | `grep -niE 'platform admin' docs/store-admin-guide/admin-tabs-guide.md` shows a statement that granting Store Admin requires a platform administrator, and the Team section states a store admin can grant Staff only. Cross-check against `lib/repositories/roles.ts` — the throw reads `Forbidden: Only a platform-admin can grant the Store Admin role`. |
| R11 | Integration | `grep -niE 'register|already have an account|email address' docs/store-admin-guide/admin-tabs-guide.md` shows the Team section stating the person must already have an account and that roles are assigned by email. Cross-check against `lib/repositories/roles.ts`, which throws `User not found with that email address`. |
| R12 | Integration | `grep -niE 'invite' docs/store-admin-guide/admin-tabs-guide.md` returns nothing, or returns only lines explicitly stating that invitations are not available. |
| R13 | Integration | `grep -niE 'three main tabs|three tabs' docs/staff-playbook/staff-tabs-guide.md` returns nothing. Any tab count the file does state matches the staff-tier links in `components/staff/PanelNav.tsx` plus the hub's staff-visible cards. |
| R14 | Unit | `grep -nE '^(version|updated):' docs/staff-playbook/staff-tabs-guide.md docs/store-admin-guide/admin-tabs-guide.md docs/platform-admin-guide/platform-admin-guide.md` shows each edited file's `version` higher than on `origin/staging` (`git show origin/staging:<path>`) and `updated: 2026-09-06`. |
| R15 | Integration | `npx vitest run tests/operator-doc-coverage.test.ts` exits 0. Its coverage case enumerates `app/(admin)/staff/*/page.tsx` from the filesystem and asserts each route has exactly one documented section. Confirm it fails when a section is deleted. |
| R16 | Integration | In the same run, a case asserts all seven labelled parts are present in every section. Confirm it fails when one part is removed from one section. |
| R17 | Integration | In the same run, a case asserts every `Who can access` value is one of the three permitted strings, failing on any other value. |
| R18 | Security | In the same run, a case parses each page's `requireVendorRole` arguments and the `auth.via` refusal, and compares them to the documented value. **Live cross-check:** fetch `runbook-admin.html` and confirm the Payment Issues section reads `Staff and store admins`, matching `grep -o 'requireVendorRole([^)]*)' "app/(admin)/staff/payments/page.tsx"`. |
| R19 | Integration | `grep -nE '"(brands|bundles|categories|customers|delivery-areas|discounts|errors|inventory|loyalty|orders|payments|products|promotions|reports|runbook|search-synonyms|storefront|team)"' tests/operator-doc-coverage.test.ts` prints no hardcoded route list. Create an empty `app/(admin)/staff/__probe/page.tsx`, re-run the test, confirm it FAILS, then delete the probe and confirm it passes again. |
| R20 | Integration | For each of the four STAFF routes, `grep -c` its section heading in `docs/staff-playbook/staff-tabs-guide.md` prints non-zero; for each of the twelve ADMIN-only routes, the same against `docs/store-admin-guide/admin-tabs-guide.md`; for `errors`, against `docs/platform-admin-guide/platform-admin-guide.md`. R15 proves each appears exactly once overall. |
| R21 | Security | Read each of the 18 sections against its page source. For every capability a section describes, confirm a corresponding control exists on that page (a form, a link, or an action import). Record in `build-notes.md` any section whose claims could not be traced to a control. R9–R13 and R18 cover the specific known-false claims mechanically; this row is the manual sweep for new ones. |
| R22 | Unit | `grep -n '/staff/payments' components/staff/PanelNav.tsx` shows the link inside the `currentTier === "staff"` branch, not only the admin branch. |
| R23 | Security | `npx vitest run tests/staff-nav-parity.test.ts` exits 0, including the new staff-tier case. Confirm it fails if the Payment Issues link is removed from the staff branch. |
| R24 | Regression | `npx vitest run tests/staff-nav-parity.test.ts` exits 0. If any pre-existing assertion changed, its docstring names which surface it covers. `git diff origin/staging -- tests/staff-nav-parity.test.ts` shows additions only, or edits accompanied by that docstring change. |
| R25 | Unit | `npm run kms:validate` exits 0 and prints `invalid front-matter (failing): 0`. |
| R26 | Unit | `npm run kms:build-index` then `npm run kms:check-generated` prints both artefacts current. `git status --porcelain` shows no unstaged change to `ARTIFACT_INDEX.md` or `app/(admin)/staff/runbook/docs.ts` afterwards. |
| R27 | Integration | `npm run kms:assemble:internal` exits 0, then `npx next build --webpack` run inside `kms/site-internal` exits 0. Read the real exit status — do not pipe through `head` or `tail`, which reports the pipe's status rather than the build's. |
| R28 | Acceptance | `git diff origin/staging -- CHANGELOG.md` is non-empty and describes this slice under an appropriate heading. |
| R29 | Regression | `npm run lint`, `npm run typecheck`, `npm run format:check` each exit 0. `npx vitest run` **run alone, with no other build in progress**, exits 0 and reports a file/test count at or above the current `CLAUDE.md` baseline (100 files / 1221 tests) plus this slice's additions. A shortfall is a non-result to re-run, not a pass. |
