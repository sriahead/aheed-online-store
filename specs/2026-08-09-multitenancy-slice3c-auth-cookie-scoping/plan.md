---
id: multitenancy-slice3c-auth-cookie-scoping
title: "ADR-004 slice 3c — data-driven auth cookie scoping (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-09
visibility: internal
summary: Make Better Auth's baseURL, trustedOrigins and cookie domain data-driven per request from the resolved host + VendorDomain table. Isolated (host-only) sessions by default; a config-gated AUTH_COOKIE_FAMILY_DOMAIN arms future subdomain-family SSO, off today.
tags: [multi-tenancy, vendor, auth, cookies, sso]
related: [adr-004-multi-tenancy, multitenancy-slice3b-host-resolver, multitenancy-slice3a-vendor-membership, adr-002-auth-library, architecture]
---

# ADR-004 slice 3c — data-driven auth cookie scoping (plan)

The **last multi-tenancy gate before P3** (issue #74; ADR-004 slice 3, sibling of 3a/3b). Slice 3b
made the *data* per-vendor by host; this makes the *auth origin/cookie* per-vendor by host, so P3's
carts/orders/checkout inherit correct per-vendor sessions instead of baking in a single hardcoded
host. `requirements.md` holds the checkable criteria.

**Goal:** replace the single hardcoded `BETTER_AUTH_URL` baseURL (and the absent `trustedOrigins`)
with per-request resolution of `{ baseURL, trustedOrigins, cookieDomain }` from the request host and
the `VendorDomain` table — **host-only (isolated) cookies by default**, with a config-gated hook for
subdomain-family SSO later. Onboarding a vendor stays data-only (no hardcoded origin, no redeploy).

## Topology reality (why isolated-by-default)

ADR-004 decision 4 assumed a subdomain family (`{slug}.aheedfoodcentre.nocaped.com`) whose members
SSO via a parent-domain cookie. **The deployed topology has no such family:** the two live vendors
sit on distinct hosts — Aheed at the apex `aheedfoodcentre.nocaped.com`, SriMart on its own
`srimart.nocaped.com` (the ADR's "custom domain → isolated session" path). So "family SSO" has
**zero member subdomains** today. Approved direction (this session): **isolated-by-default** — the
safest, cleanest fit for the topology we actually have, keeping the door open for explicit SSO
later. A short breadcrumb is added to ADR-004 recording this (decision 4 unchanged in intent; its
family path becomes a config-gated future, not the default).

## Key design decisions

- **Pure builder + thin async wrapper**, mirroring `buildSocialProviders()`'s split (P1b). A pure
  `buildAuthOrigin({ host, proto, vendorHosts, familyDomain })` computes
  `{ baseURL, trustedOrigins, crossSubDomainCookies? }` with no I/O — unit-testable without a DB.
  `resolveAuthOrigin()` is the async wrapper reading `headers()` + `VendorDomain` + config and calling
  the builder.
- **`getAuth()` becomes `async`.** It must read the request host (`await headers()`) and the vendor
  host list (DB) before constructing Better Auth. Every call site is already inside an `async`
  function that awaits the result, so this is a mechanical `getAuth()` → `await getAuth()` change
  across ~8 files. The **construct-fresh-per-call** rule (CLAUDE.md) is preserved — async does not
  cache; nothing crosses a request boundary.
- **`trustedOrigins` from the DB, host-only cookies by default.** `trustedOrigins` = every
  `VendorDomain.host` as an `https://` origin + the current request origin, so a sign-in POST from any
  live vendor host passes Better Auth's origin/CSRF check while unknown origins are rejected. No
  `advanced.crossSubDomainCookies` is set → Better Auth's default **host-only** cookie, i.e. an
  isolated session per vendor host.
- **`AUTH_COOKIE_FAMILY_DOMAIN` — config-gated family mechanism, off by default.** A new *optional
  platform* env (in `lib/config`). When **set**, a request whose host ends on that suffix (dot
  boundary) gets `crossSubDomainCookies: { enabled: true, domain: <familyDomain> }` (parent-domain
  cookie = SSO across that subdomain family) and a `https://*.<familyDomain>` wildcard added to
  `trustedOrigins`. When **unset** (staging + prod today) → host-only everywhere. A vendor on a
  custom domain (e.g. SriMart) never matches the suffix → stays isolated even when the config is set.
- **baseURL is per-request** (`${proto}://${host}`, proto from `x-forwarded-proto`, default `https`).
  `BETTER_AUTH_URL` is retained in the schema only as a defensive fallback when no host header is
  present; it no longer pins a single production origin.

## Scope (this slice)

- `lib/config.ts`: add optional `AUTH_COOKIE_FAMILY_DOMAIN`; `getEnv()` reads it.
- `lib/auth-origin.ts`: pure `buildAuthOrigin(...)` + async `resolveAuthOrigin()`.
- `lib/auth.ts`: `getAuth()` → `async`, wiring `baseURL` / `trustedOrigins` / `advanced.crossSubDomainCookies`
  from `resolveAuthOrigin()`; drop the hardcoded `baseURL: env.BETTER_AUTH_URL`.
- Update the ~8 `getAuth()` call sites to `await getAuth()` (route handler, `lib/auth-rbac.ts` ×2,
  `features/reviews/{submit,delete}-review.ts`, product + account pages, `components/layout/Header.tsx`).
- `tests/auth-origin.test.ts`: unit-test the pure builder across the config-on/off × family/custom-host matrix.
- **Docs:** ADR-004 breadcrumb (topology + isolated-by-default; version bump); `specs/architecture.md`
  auth-scoping note; `docs/env-setup.md` documents `AUTH_COOKIE_FAMILY_DOMAIN`; `ARTIFACT_INDEX.md`
  regenerated; `CHANGELOG.md` entry (#74).
- **Roadmap catch-up (folds in #65's roadmap-note item):** `specs/roadmap.md` change-log gains entries
  for slices 3a (#68) / 3b (#70) / 4 (#73 + follow-ups #77/#78/#79), the #81 production promotion, and
  this slice 3c.

## Deliberately excluded

- **Cross-registrable-domain federation SSO** (one login spanning Aheed ↔ SriMart, or any two custom
  domains) — needs a federation flow; ADR-deferred, unchanged.
- **Turning the family mechanism on** — no `{slug}.family` vendor exists, so `AUTH_COOKIE_FAMILY_DOMAIN`
  ships **unset**; the mechanism is built and unit-tested but dormant.
- **Canonical-origin 301 redirect** (subdomain → custom domain, ADR decision 3) — separate/deferred.
- **Dropping the superseded `Vendor.customDomain` column** — deferred cleanup (as in 3b).
- **The #65 migration-drift check** — infra-blocked (needs a throwaway shadow Postgres); stays tracked
  under #65. Only #65's *roadmap-note* item closes here.

## Open items carried forward

- **Per-host Google OAuth redirect URIs (human action).** With baseURL now derived per host, the
  Google sign-in callback resolves to `https://<vendor-host>/api/auth/callback/google`. Google's OAuth
  client only accepts pre-registered redirect URIs, so **each new vendor host must be added to the
  OAuth client's Authorized redirect URIs** in the Google console. Aheed and **SriMart are both
  registered** (owner confirmed, 2026-08-09) — no outstanding action for today's vendors; this remains
  a standing onboarding step for the *next* vendor host. Not code.
- Enabling family SSO in a future env is a one-line `AUTH_COOKIE_FAMILY_DOMAIN` set once real
  subdomain-family vendors exist — no code change (the mechanism ships here).
