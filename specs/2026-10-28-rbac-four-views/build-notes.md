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
