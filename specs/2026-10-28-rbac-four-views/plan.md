---
id: rbac-four-views-plan
title: "RBAC four views: role landing, demo-admin as store admin, platform home, gate matrix (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-28
visibility: internal
summary: "Separates the four experiences on the existing RBAC: role-based landing after sign-in, demo-admin demoted to store admin with a new demo-platform-admin, a /staff/platform home, and a test pinning every staff page, route and action to its gate."
tags: [auth, rbac, staff-panel, platform-admin, demo-accounts]
related: [architecture, app-conventions, platform-admin-guide]
---

# RBAC four views (plan)

Issue `#1319`. Follow-up `#1320` (platform-wide user management).

**Goal:** make four experiences visibly separate on top of the access control that already exists:
Shopper, Staff, Store Admin and Platform Admin. `demo-admin` stops being a platform admin, and a
dedicated `demo-platform-admin` account takes that role. CI then proves that every staff page, API
route and server action checks a role on the server.

## What already exists, and why this slice adds no new auth system

The RBAC this brief asks for is largely built. This slice extends it rather than rebuilding it.

- **Platform role.** `User.role` (`CUSTOMER` / `STAFF` / `ADMIN`), where `ADMIN` is the platform
  admin. ADR-004 slice 3a.
- **Store role.** `VendorMembership.role` (`STAFF` / `ADMIN`), one row per user per store.
- **Gates.** `lib/auth-rbac.ts` holds the three gates:
  - `requireRole`;
  - `requireVendorRole`, which a platform `ADMIN` passes at every store as `via: "platform-admin"`;
  - `requirePlatformAdmin`.

  They are called from 108 files. The six `/staff/platform/*` pages, `/staff/errors`, and the costs
  action and export additionally refuse unless `auth.via === "platform-admin"`.
- **Store isolation.** The store is resolved from the request host (`getCurrentVendorId()`), and
  every repository takes `vendorId` as a parameter. `tests/repository-purity.test.ts` and
  `tests/repository-client-injection.test.ts` enforce that. A store admin of Aheed is therefore
  refused on SriMart's host, because they hold no membership there.
- **Refusals render** `PanelRefusal` (`tests/panel-refusal-coverage.test.ts`), so a refusal is never
  just a hidden link.
- **Sessions.** Better Auth has no `cookieCache` in `lib/auth.ts`, so `session.user.role` is read
  from the database on each request. Demoting `demo-admin` takes effect on its next request, with no
  sign-out needed.

**Gaps this slice closes:**

1. **Everyone lands on `/account` after sign-in.** `LoginForm` pushes `/account`, and
   `GoogleSignInButton` uses `callbackURL: "/account"`.
2. **`demo-admin` is a platform admin.** In `scripts/demo-accounts.ts` it is `platformRole: "ADMIN"`,
   and no account is a platform admin only.
3. **There is no platform admin home.** `/staff/platform` has no `page.tsx`, so the six platform
   pages are reachable only through the hub's platform section and the panel nav.
4. **Server-side enforcement is checked only for pages' refusal markup.** Nothing fails CI when a new
   server action or `app/api/admin` route forgets its gate.

## Scope (this slice)

### 1. Role landing after sign-in (owner decision: one login)

- **New pure module `lib/auth-landing.ts`:**
  - `safeNextPath(raw)` accepts only a same-origin absolute path. It must start with `/`, must not
    start with `//` or `/\`, and must contain no control characters.
  - `landingPath(access, next)` returns that safe `next` when one is given. Otherwise it maps
    `"platform-admin"` to `/staff/platform`, `"store"` to `/staff` and `"shopper"` to `/account`.
- **New page `app/(storefront)/signed-in/page.tsx`.** It calls `requireVendorRole("STAFF", "ADMIN")`,
  which resolves the store from the host exactly as the panel does, maps the result to an access
  value, and redirects:
  - no session goes to `/login`;
  - `ok` with `via: "platform-admin"` maps to `platform-admin`;
  - `ok` with `via` of STAFF or ADMIN maps to `store`;
  - a 403 (signed in, no membership here) maps to `shopper`.

  It is a server page rather than client logic, so the decision uses the same gate that every staff
  page uses.
- **The login page reads `next`** from its search params and passes it to `LoginForm` and
  `GoogleSignInButton`. Both now go to `/signed-in`, carrying `?next=` when it is present.
  `/register` also uses `GoogleSignInButton`, so a new Google user is sent through `/signed-in` too
  and lands on `/account`.

**Why `next`:** nothing in the app sends `/login?next=` today. Accepting it, validated, means a later
change can return a user to the page that sent them to sign-in without reopening this flow. An
off-site value is ignored, so the parameter cannot be used as an open redirect.

### 2. Demo accounts

- **`DEMO_ACCOUNTS`:**
  - `demo-admin@example.com` becomes `platformRole: "CUSTOMER"` with `vendorRole: "ADMIN"`.
  - New `demo-platform-admin@example.com` ("Demo Platform Admin") is `platformRole: "ADMIN"` with no
    `vendorRole`. A platform admin needs no membership, because `requireVendorRole` admits it at
    every store.
  - The other four accounts are unchanged. `demo-store-admin` now does the same job as `demo-admin`.
    It stays, because demo accounts are kept until every phase is complete.
- **Existing databases.** `addDemoAccounts` already rewrites `User.role` for every roster account on
  each run, so `npm run demo:accounts -- add` demotes an existing `demo-admin` without a new code
  path. It does not remove `demo-admin`'s existing Aheed `ADMIN` membership, which is what it should
  keep.
- **Credentials.** The new account uses the existing `DEMO_ACCOUNT_PASSWORD`, from `.dev.vars` and
  `secrets/<env>.vars`, never committed. No password value appears in the repository.
  `docs/developer-portal/env-setup.md` names the new account and the changed role.
- **`scripts/provision-aheedsuperstore-staging.ts`** links `demo-admin` or `demo-store-admin` to a new
  vendor as `ADMIN`. That is still correct for a store admin, so only its comment changes.

### 3. Platform home at `/staff/platform` (owner decision: keep `/staff/platform`)

- **New `app/(admin)/staff/platform/page.tsx`**, gated exactly like its siblings: `requireVendorRole("ADMIN")`,
  then `auth.via !== "platform-admin"` renders `PanelRefusal` "Platform admin only".
- **Content.** The existing `fetchPlatformOverviewMetrics()` figures (stores, active stores,
  domains, users, products, active products, recent errors), then one card per `PLATFORM_NAV_ITEMS`
  entry.
- **`PLATFORM_NAV_ITEMS`** gains `/staff/platform` ("Platform overview") as its first entry, so the
  hub's platform section and the panel nav both link to it.
- **`PanelNav`'s `isRouteActive`** treats `/staff/platform` like `/staff`, matching only the exact
  path. Without this, a prefix match would highlight it on every platform page.
- **Platform admin guide.** `docs/platform-admin-guide/platform-admin-guide.md` gains a
  `/staff/platform` section. `tests/operator-doc-coverage.test.ts` discovers the new route by
  itself and requires the section to exist. The guide also states where each role lands after
  sign-in.

### 4. Gate matrix test (`tests/rbac-gate-matrix.test.ts`)

An AST test, using the TypeScript parser as `tests/panel-refusal-coverage.test.ts` does, so a
comment that names a gate can never satisfy it. It discovers files from the filesystem and has no
exemption list:

- **Pages.** Every `page.tsx` under `app/(admin)/staff/` calls a gate.
- **Routes.** In every `route.ts` under `app/(admin)/` and `app/api/admin/`, every exported HTTP
  handler calls a gate.
- **Server actions.** In every `"use server"` module under `app/(admin)/` and `features/admin/`, plus
  the three staff order actions (`features/orders/advance-status.ts`, `advance-status-bulk.ts` and
  `cancel-order-staff.ts`), every exported async function calls a gate. It may do so itself, through
  a function declared in the same file, or through a named import whose source module calls one.
  The import case is one hop, and it covers `app/(admin)/staff/team/actions.ts`, which delegates to
  `lib/roles-service.ts`'s `setVendorRole`.
- **Platform-only files.** Every page, route and action under `app/(admin)/staff/platform/` and
  `app/(admin)/staff/errors/` either calls `requirePlatformAdmin` or compares `.via` with
  `!== "platform-admin"`.
- **No vacuous pass.** Minimum discovered counts stop a broken walker from passing on zero files.

**A "gate"** is a call whose callee is `requireVendorRole`, `requirePlatformAdmin` or
`requireRole`.

**If the test finds a real ungated export, the fix to the code is in scope.** It is exactly what the
owner asked to be prevented.

### 5. Live walk

Under `npm run preview`, after `npm run demo:accounts -- add` against the dev database:

- Each account is signed in with `curl`, and `/signed-in` must redirect it correctly.
- A matrix of direct URLs and one admin API per role must return content or a refusal as
  `validation.md` lists.
- `demo-admin`, now an Aheed-only store admin, is refused on the SriMart host. That is the cross-store
  proof, and it was impossible before because `demo-admin` passed every store as a platform admin.

On staging, after deploy and after the owner runs the demo-accounts tool against staging, a subset
of the same walk is repeated.

## Deliberately excluded

- **Platform-wide user management** (`#1320`): listing every user, and granting or revoking
  memberships and the platform role across stores. It is a privilege-escalation surface that needs
  its own spec.
- **Separate login pages per role**, and **a separate `/platform` shell**. The owner chose one login
  and `/staff/platform` on 2026-10-28.
- **Sending `?next=` from the existing `redirect("/login")` calls** in about 30 staff pages. The
  landing accepts `next`, but wiring every gate to send it is a convenience with no security effect,
  and the brief does not ask for it. It is not planned work, so no issue is filed. Adding it later
  changes no contract.
- **The platform `STAFF` value of `Role`.** It is unused by any gate, and removing it would need a
  migration.
- **Changing what a store admin or staff member may do.** Tiers come from each page's existing
  `requireVendorRole` arguments and are unchanged.
- **Production demo accounts.** Production is down (`#1289`), and production commands are run by the
  owner. The tool must be re-run there when it is back.

## Open items carried forward

- `#1320`: platform Users page.
- **Production:** `npm run demo:accounts -- add` must be run against production by the owner once
  `#1289` is fixed. Until then, production's `demo-admin` remains a platform admin.
