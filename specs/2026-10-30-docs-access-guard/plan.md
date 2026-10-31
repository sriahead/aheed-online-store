---
id: p1328-docs-access-guard-plan
title: "Docs Access guard and the docs-shoplocal.merqify.com host (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-10-30
visibility: internal
summary: "#1328: deploy-docs-internal refuses to deploy unless a Cloudflare Access app guards every docs route host, then proves signed-out requests are sent to the Access login. The internal docs host becomes docs-shoplocal.merqify.com."
tags: [kms, security, cloudflare-access, ci, merqify, p12]
related: [roadmap, architecture, env-setup]
---

# Docs Access guard and the `docs-shoplocal.merqify.com` host (plan)

Issue `#1328`, part of P12 workstream A (`#1336`). Gate 1 approved by the owner on 2026-10-30
("check before and after"), with a scope addition the same day: the host is
`docs-shoplocal.merqify.com`, not `docs.merqify.com`.

## Why this slice exists

The internal docs site (`kms/site-internal`) serves ADRs, `CLAUDE.md` and operator runbooks. It has
**no authentication of its own**: a Cloudflare Access application in front of its host is the only
gate. `.github/workflows/deploy-docs-internal.yml` runs `wrangler deploy` on **every push to
`staging` or `main`**, using the `staging` GitHub environment's `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID`, and `kms/site-internal/wrangler.toml` routes the host as a custom domain.

Today the only protection is the runbook's order of steps ("create the Access application before
repointing the secrets", `docs/developer-portal/env-setup.md`, "Merqify account") and a comment.
The moment the owner runs `configure-env` for staging against the Merqify account (`#1339`), the
next push would publish the internal docs to the open internet if that Access application were
missing or mis-scoped. Nothing in CI would notice.

**State on 2026-10-30, measured:** the `staging` environment's `CLOUDFLARE_*` secrets were last
updated 2026-08-08 and 2026-09-08, so they still name the Nocaped account, and the docs deploy fails
there. Nothing is exposed yet. **This slice must reach `staging` before those secrets are
repointed.**

## Goal

The docs deploy cannot publish the site unless Access guards every route host, and after each
deploy CI proves that a signed-out visitor is sent to the Access login.

## Scope (this slice)

1. **Host rename.** `kms/site-internal/wrangler.toml` routes exactly one host,
   `docs-shoplocal.merqify.com` (`custom_domain = true`, `workers_dev = false` kept). The route test
   from `#1323` (`tests/worker-routes.test.ts`, its R4) moves to the new host; this amends `#1323`'s
   R4, whose dated spec text is left as written. `docs.merqify.com` was never deployed, so there is
   nothing to take down.
2. **`scripts/verify-docs-access.ts`**, one script with two modes. The hosts it checks are **read
   from the route patterns in `kms/site-internal/wrangler.toml`**, never hardcoded, so a later host
   change is guarded automatically.
   - **`--pre` (before the deploy; a failure means no deploy).** Lists the account's Access
     applications (`GET /accounts/{CLOUDFLARE_ACCOUNT_ID}/access/apps`, paginated) and requires,
     for every host, at least one `self_hosted` application covering the whole host, with no policy
     that lets everyone in. Any API failure **fails closed**. A 403 says which token permission is
     missing ("Access: Apps and Policies Read").
   - **`--post` (after the deploy; a failure means a red job).** For every host, a signed-out GET of
     `/` and of a deep link must answer with a redirect whose `Location` host ends in
     `.cloudflareaccess.com`. A `2xx` is an immediate failure: it means content is being served
     openly. Network errors are retried for about two minutes, because a first custom-domain deploy
     takes a moment to get a certificate.
   - Decision logic lives in exported pure functions, so it can be unit-tested; `main()` only does
     I/O. Progress and verdicts go to stderr, and the token is never printed.
3. **Workflow wiring.** `deploy-docs-internal.yml` runs `--pre` straight after the root `npm ci`
   (before the build and before `wrangler deploy`) and `--post` after the deploy step, both with the
   same `CLOUDFLARE_*` secrets. A static test pins that order and `workers_dev = false`.
4. **Docs.** The runbook (hosts table, owner step 2, cut-over step 7, a short description of the
   guard and the token permission), `specs/architecture.md`, the handoff note, and the comments in
   the workflow and the docs `wrangler.toml` name the new host and the guard.

### What "covers the host" means

An application covers host `H` when one of its hostnames (`domain`, any `self_hosted_domains`
entry, or any `destinations` entry of type `public`, read as `uri`) is exactly `H`, `H/*`, or a
one-label wildcard `*.<parent>` where `H` is `<label>.<parent>`. An application scoped to a path
(`H/admin`) does **not** cover `H`, because it would leave every other path open. Matching ignores
case and a leading `https://`.

### What "lets everyone in" means

A covering application fails if any of its policies has decision `bypass`, or decision `allow` with
an `include` rule `{ "everyone": {} }`, or if it has **no** `allow` policy at all. `deny` and
`non_identity` policies are ignored. This is a floor, not a policy review: it does not judge whether
an allow-list names the right people.

### Expected effect on merge

While the `staging` environment's secrets still name Nocaped, `--pre` finds no Access application
for `docs-shoplocal.merqify.com` in that account and refuses, so `deploy-docs-internal` stays red on
`staging` and `main` pushes, as it already is (it fails today on the Nocaped plan). That red run is
the guard working, not a regression. It turns green only once the owner's Merqify setup (`#1339`) is
in place and the secrets are repointed.

## Deliberately excluded

- **Undoing a deploy automatically when `--post` fails.** Removing a custom domain needs the
  dashboard or a further API call with write permissions. The owner chose a loud red job; the
  failure message says what to remove. The `--pre` check is what keeps the docs from being published
  in the first place.
- **Reviewing who an allow policy admits** (emails, groups, identity providers). Owner territory.
- **Re-checking between deploys.** If someone deletes the Access application later, nothing notices
  until the next push. A scheduled probe is filed as `#1352` (P10, Backlog) for a later `/propose`.
- **The token permission itself.** Adding "Access: Apps and Policies Read" to the staging token is
  an owner step in `#1339`.
- **Removing the old Nocaped Access application and the `nocaped` text** in `kms/site-internal`'s
  README: `#1346` and `#1350`.
- **Guarding the app Workers.** They have their own auth; this guard is only for the docs site.

## Open items carried forward

- **The positive live run is owner-gated.** `--pre` exiting 0 needs the Access application for
  `docs-shoplocal.merqify.com` in the Merqify account and the token permission (`#1339`); `--post`
  exiting 0 needs a real deploy there. Until then those rows are reported **UNVERIFIED**, and the
  negative live rows (the guard refusing against real accounts and real hosts) carry the proof.
