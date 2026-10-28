# RBAC four views (build notes)

Written at the end of Build, before the Clear. Implementation commit: `a73ef4b`. Spec: `a033bf7`.
Branch: `feature/1319-rbac-four-views`. It was cut from the local `docs/carry-forward-1313`, so it
also carries `ef1c182`, the unpushed `#1313` Document pass. Its PR to `staging` lands that pass too.

## What changed and why

- **`lib/auth-landing.ts` (new, pure, no imports).**
  - `safeNextPath` accepts only a path that starts with `/`, whose second character is not `/` or
    `\`, and that has no control characters (codes below 32, and 127).
  - `landingPath` returns that safe path, or a default for the access level.
- **`app/(storefront)/signed-in/route.ts` (new).**
  - `GET` calls `requireVendorRole("STAFF", "ADMIN")`. That is the same gate, and the same resolution
    of the store from the host, as the staff panel, so "store" access here means exactly what
    `/staff` will admit.
  - A 401 goes to `redirect("/login")`. Otherwise it calls `redirect(landingPath(access, next))`,
    where `next` comes from `new URL(request.url).searchParams`.
- **`features/auth/signed-in-path.ts` (new).** `signedInPath(next)` builds
  `/signed-in?next=<encoded>`. It is shared by `LoginForm` (its `router.push`) and
  `GoogleSignInButton` (its `callbackURL`).
- **Sign-in components.** Both take an optional `next` prop. `app/(storefront)/login/page.tsx` is
  now `async`, reads `searchParams.next` (a string only), and passes it to both. `/register` still
  renders `<GoogleSignInButton />` with no `next`, so a new Google user goes through `/signed-in` to
  `/account`.
- **`scripts/demo-accounts.ts`.**
  - `demo-admin` is now `platformRole: "CUSTOMER"`, still with `vendorRole: "ADMIN"`.
  - `demo-platform-admin@example.com` ("Demo Platform Admin") is `platformRole: "ADMIN"` with no
    `vendorRole`, and is second in the roster.
  - The doc comment is rewritten. No logic changed: `addDemoAccounts` already ran `user.update` with
    the roster role on every run, which is what demotes an existing `demo-admin`.
- **`app/(admin)/staff/platform/page.tsx` (new).**
  - It uses the same gate and refusal markup as `platform/settings/page.tsx`.
  - It shows the seven `fetchPlatformOverviewMetrics()` figures (`data-platform-metric`) and the
    `PLATFORM_NAV_ITEMS` minus itself (`data-platform-link`), all inside one `data-platform-home`
    wrapper.
- **`components/staff/platform-nav-items.ts`.** The new first entry is `/staff/platform`, "Platform
  overview", with icon `shield-check` (already used by the hub's platform section).
- **`components/staff/PanelNav.tsx`.** `isRouteActive` is now exported and uses an
  `EXACT_MATCH_HREFS` set (`/staff`, `/staff/platform`).
- **`tests/rbac-gate-matrix.test.ts` (new).** It is an AST walk, described in its header. It has
  91 tests on this tree, one per discovered file plus a count test.
- **Docs.**
  - `docs/developer-portal/env-setup.md` lists the six-account roster, where each lands, and the
    one shared password.
  - `docs/platform-admin-guide/platform-admin-guide.md` (now 1.6.0) adds a landing paragraph under
    "Global Roles vs Vendor Roles" and a `/staff/platform` section.
  - `scripts/provision-aheedsuperstore-staging.ts` changes its comment only.
- **Registries other tests own.**
  - `tests/page-container.test.ts` gains a row for the platform home (wide).
  - In `tests/staff-nav-parity.test.ts`, `/staff/platform` is added to `EXCLUDED`, with the reason
    that platform pages are registered in `platform-nav-items.ts`. It is also added to PanelNav's
    allowed literals, because it appears only in the exact-match set.
- **New tests.** `tests/auth-landing.test.ts` covers R4 plus `signedInPath`, and
  `tests/panel-nav-active.test.ts` covers R15. `tests/demo-accounts.test.ts` is updated with the
  roster, the count of six, one platform admin, three store admins, and the demotion case.

## Decisions taken during the build

- **The `next` value is encoded by `signedInPath` and vetted only in `/signed-in`.** The client never
  follows `next` itself, so the one safety check sits on the server.
- **The platform home reuses `fetchPlatformOverviewMetrics`** rather than adding a query. The
  settings page already shows the same figures.
- **`/staff/platform` is excluded from the vendor nav module** (`STAFF_NAV_GROUPS`), like every other
  platform page, and lives only in `PLATFORM_NAV_ITEMS`.
- **The guide correction.** "Global Roles vs Vendor Roles" claimed platform admins had "global user
  management". That does not exist (`#1320`), and `CLAUDE.md` asks that every capability sentence be
  traced to a real control, so the sentence was corrected.
- **Not corrected:** the guide's "Store Impersonation (Dev/Support)" section claims a View Switcher.
  I did not trace it, because it is outside this slice. Validation does not need it.
- **`demo-store-admin` is kept** although it now duplicates `demo-admin`, because demo accounts are
  kept until every phase is complete.

## Deviations from the spec

- **R5: `route.ts`, not `page.tsx`.** `tests/page-container.test.ts` requires every `page.tsx` to
  render `PageContainer`, and `/signed-in` only redirects. A route handler's `redirect()` answers 307
  just as a page's does (Next's `redirect` docs list Route Handlers). `requirements.md` R5,
  `validation.md` R5 and `plan.md` are amended, each saying so.
- **R18 is tightened to a per-function hop.** As first written, an imported identifier passed when
  its source module contained any gate call. R21's first mutation (deleting the gate line in
  `app/(admin)/staff/team/page.tsx`) still passed under that rule. The page calls `getVendorTeam`,
  and `lib/roles-service.ts` gates only its sibling `setVendorRole`. The test now resolves the
  imported name (through `import { a as b }`) to that function in its source and checks that
  function's body. `requirements.md` R18 is amended.
- **R20: no code fixes were needed.** Every discovered page, route and action was already gated, and
  every platform-only file already refuses a store admin.

## Known-shaky areas

- **R21 at Build:** all four mutations fail the matrix, each failing in its own `describe` (R17a,
  b, c, d), and the restored tree passes 91/91. Re-run them at Validate; they are cheap.
- **The live walk (R22-R24) has not been run.** It needs `npm run demo:accounts -- add` against the
  **dev** database first, to create `demo-platform-admin` and demote `demo-admin`.
  - Check `DIRECT_URL` and `DATABASE_URL` one at a time, host only, against `secrets/`. Auto mode
    may block a dev database write; if so, hand the user a `! ` command.
  - **Until it runs, dev's `demo-admin` is still a platform admin, and the R23 `demo-admin` rows
    will fail for that reason, not because of the code.**
- **R24 on the SriMart host:** `local-dev-playbook.md` records that `demo-srimart-admin`'s dev
  password differs, so this walk uses `demo-admin` instead. If dev's `demo-admin` happens to hold a
  SriMart membership from an earlier manual grant, R24 fails on data. Check with a read-only query
  before blaming the code.
- **The Google sign-in path** (`callbackURL: /signed-in`) is unexercised. Google is configured only
  where `GOOGLE_CLIENT_ID` is set. Better Auth must accept a relative callback that carries a query
  string; the old `/account` callback was relative too.
- **The full vitest run on a loaded machine** (with `--maxWorkers=4`) failed 6 tests in 5 files,
  with durations in the thousands of seconds, and 2 files' workers failed to start. All 7 files
  passed when re-run alone (107 tests). This is the `CLAUDE.md` loaded-machine pattern. Re-run the
  suite alone at Validate, ideally with a lower worker count.
- **Production:** production's `demo-admin` stays a platform admin until the owner runs the tool
  there, after `#1289`.

## Validation record

**Pass 1, 2026-10-28, NOT independent.** It ran in the same Opus 5.5 context that built the slice:
the owner continued without `/clear` (the standing "validate in place under 60% context" preference).
Commit under test: `2243291`.

### Pre-flight

- `npm run lint`, `npm run format:check` and `npx tsc --noEmit` exit 0.
- `npx vitest run --maxWorkers=2`, run alone, passes 359 files and 5,158 tests. This clears the
  loaded-machine failures noted above.
- `npm run build` (run by `npm run preview`) exits 0. `/signed-in` and `/staff/platform` are listed
  as dynamic routes.
- The internal KMS site build passed at Build Notes, and no `docs/` file has changed since.

### Rows R1-R21 and R26-R29

- **R1, R2, R4:** `tests/auth-landing.test.ts` passes, covering every listed input including `/a`
  plus a newline plus `b`, and DEL.
- **R3:** the grep prints nothing.
- **R5:** the route handler matches the amended R5.
- **R6, R7: pass in substance; spec-wording defect.**
  - `router.push` and `callbackURL` both call `signedInPath(next)` from
    `features/auth/signed-in-path.ts`, which builds `/signed-in` and `?next=`.
  - The "no `/account`" counts are 0.
  - The rows' greps expect the `/signed-in` literal in the component files, but it lives in the
    shared helper. The behaviour is proved by R22.
- **R8:** `next` is passed to both components, and `/register` has no diff.
- **R9, R10:** `tests/demo-accounts.test.ts` passes. **R11:** the roster comment and `env-setup.md`
  are correct.
- **R12 and R27: pass in substance; spec-check defect.** Each grep matches only the added
  `requirements.md` and `validation.md` lines that quote the grep itself. No code line matches.
  This is the absence-grep self-match trap again, as at `#1313` (R2/R36). The fix is to exclude
  `specs/` in the row, not to change code.
- **R13-R16:** the page source, the nav entry and `isRouteActive` are correct. Their tests and
  `operator-doc-coverage` pass, and the guide is at 1.6.0.
- **R17-R20:** `tests/rbac-gate-matrix.test.ts` passes 91/91, and no code fix was needed.
- **R21:** all four mutations fail, each in its own `describe` (R17a, b, c, d). The restored tree
  passes 91/91. Re-run here, with the same results as at Build.
- **R26:** no `prisma/` diff. **R28:** one `#1319` entry in `[Unreleased]`. **R29:** see Pre-flight.

### Live walk, under `npm run preview` (R22-R24)

- **Setup:** `npm run demo:accounts -- add` ran against the dev database after the owner approved
  it (auto mode had blocked it). The host was checked first: `ep-dry-morning`, not staging's
  `ep-empty-scene` or production's `ep-young-glitter`, and no database variable was exported. The
  output shows `demo-admin` as platform CUSTOMER with vendor ADMIN, and `demo-platform-admin` as
  platform ADMIN.
- **Before the roster ran,** the same walk showed dev's still-platform-admin `demo-admin` landing on
  `/staff/platform`. That confirms the landing reads the role live from the database, with no cached
  session role.
- **R22: pass.** `/signed-in` answers 307 to:
  - `demo-customer`: `/account`;
  - `demo-staff`, `demo-admin` and `demo-store-admin`: `/staff`;
  - `demo-platform-admin`: `/staff/platform`.

  `demo-admin` with `next=%2Fcheckout` goes to `/checkout`, and with `next=%2F%2Fevil.example` to
  `/staff`. Signed out, it goes to `/login`.
- **R23: pass, except one link target, which fails on a defect outside this slice.**
  - **Refusals:**
    - `demo-customer`: `/staff` is a staff refusal, and the admin API answers 403.
    - `demo-staff`: `/staff` is 200 with no refusal, `/staff/team` an admin refusal and
      `/staff/platform` a platform refusal. The deactivate POST answers 403.
    - `demo-admin`: `/staff/team` is 200 with no refusal. `/staff/platform`, `/vendors`, `/costs`
      and `/staff/errors` are each a platform refusal with zero `data-platform-home`. The CSV export
      answers 403, and `/dev` shows `Administrators only`.
    - `demo-platform-admin`: `/dev` is 200 with no refusal.
  - **The platform home** is 200 with **1 `data-platform-home`, 7 `data-platform-metric` and 7
    `data-platform-link` elements.** The raw substring counts are 2/14/14, because the RSC payload in
    the page's `<script>` repeats each attribute. Counted as elements, the figures match R23. A
    validator using raw `grep -c` will see double; count elements.
  - **Link targets:** 6 of 7 are 200 with no refusal. **`/staff/platform/onboarding` answers 500
    after about 83 s**, reproduced twice. `git diff origin/staging` is empty for that page,
    `lib/platform-admin-service.ts`, `lib/repositories/platform-admin.ts` and
    `lib/vendor-readiness-service.ts`, so this slice did not cause it. Tracked as **`#1321`** (P10,
    on the board); it is to be checked on staging at Ship.
  - Signed out, `/staff/platform` answers 307 to `/login`.
- **R24: pass.** On the SriMart host (`srimart.localhost:8787` with `x-forwarded-proto: http`),
  `demo-admin` signs in; `/staff` is a staff refusal, the assets API answers 403, and `/signed-in`
  goes to `/account`. `demo-platform-admin` gets `/staff` with 200 and no refusal.
- **Out of the required rows:** `demo-platform-admin`'s assets API answers 500 on both hosts with
  `relation "public.CategoryAsset" does not exist`. The dev database lacks migration
  `20261027080000_category_and_system_assets`, which staging has. This is a known dev-data gap, not
  this slice. The R23 assets rows that are required (403 for customer and staff) refuse before any
  database read.

### Not yet verified

- **R25 (staging): pending until Ship.** It needs `deploy-staging` and the owner's
  `npm run demo:accounts -- add` against staging. Also check `/staff/platform/onboarding` there
  for `#1321`.
- **Google sign-in through `/signed-in`:** not exercised, because Google is not configured in
  preview. No numbered row requires it.

**Verdict: pass, with R25 pending.** R23 has one link target that fails on a defect outside this
slice (`#1321`). Spec-wording defects are recorded for R6, R7, R12 and R27, and R23's marker counts
are recorded as elements. None hides a defect in the artifact.
