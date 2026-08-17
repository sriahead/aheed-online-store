---
id: p6-7-closeout-promotion-plan
title: "P6.7 closeout & catch-up promotion (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-17
visibility: internal
summary: Provisions the missing store-admin demo account, walks P6.7's role-hierarchy validation live on staging, smoke-checks four slices that reached staging by direct push, and promotes 51 commits to production.
tags: [p6.7, rbac, validation, promotion, demo-accounts]
related: [p6-7-team-role-management, demo-accounts-tool, sdd-workflow]
---

# P6.7 closeout & catch-up promotion (plan)

**Goal:** close #186 honestly — prove P6.7's role hierarchy works through real signed-in sessions,
not just at the repository level — and get the five staging-only slices into production, chief
among them the #187 connection-exhaustion fix that production is currently running without.

## Why this slice exists

P6.7 shipped to `staging` on 2026-08-13 by direct push, with no PR and no `gates` run, and its
issue was closed the same day. PR #188 (2026-08-17) retro-validated it structurally: it found and
fixed a real TOCTOU race in the self-lockout guard, added `tests/roles.test.ts`, and cleared the
branch-wide gate breakage that the ungated period had left behind. #186 was reopened with two
boxes still unchecked — **a live multi-role walk**, and **promotion to `main`**. This slice closes
both.

`/orient` on 2026-08-17 also established that `origin/main` sits 51 commits behind `origin/staging`
at `2f8ae5b` (PR #178, P6b2). Five slices — P6.5, P6.6, P6.6c, P7a, P6.7 — plus the #187 fix have
never been promoted.

## The blocker nobody had noticed

`specs/2026-08-14-p6.7-team-role-management/validation.md` §1.2 asks the validator to "Sign in as a
Store Admin user (an `ADMIN` but not `platform-admin`)". **No such account can exist today.**

`scripts/demo-accounts.ts:39-43` gives `demo-admin@example.com` both `platformRole: "ADMIN"` and
`vendorRole: "ADMIN"`. But `lib/auth-rbac.ts:63` returns early for any platform admin:

```ts
if (platformRole === "ADMIN") {
  return { ok: true, user, vendorId, via: "platform-admin" };
}
```

so that account always resolves as `via: "platform-admin"` and its `vendorRole` is never read. The
two guards that define the hierarchy — `lib/repositories/roles.ts:42` (only a platform admin may
grant `ADMIN`) and `roles.ts:64` (a store admin may not touch a platform admin's privileges) — both
fire only when `auth.via === "ADMIN"`, as does the `isSelfDemotion` branch of the self-lockout
guard. All three have unit coverage; none has ever run against a real session. Issue **#190** tracks
this; the fix is a prerequisite for the walk, so it lands here rather than separately.

## Scope (this slice)

**1. Provision the missing role (#190).** A fourth entry in `DEMO_ACCOUNTS` —
`demo-store-admin@example.com`, platform `CUSTOMER`, vendor `ADMIN`. `addDemoAccounts` already
reconciles both `User.role` and the `VendorMembership` row idempotently
(`scripts/demo-accounts.ts:114-146`), so this is a roster addition, not a behaviour change.
`tests/demo-accounts.test.ts:73` asserts the roster with `toEqual` against an exact array, so that
assertion is updated in the same commit — the test fails otherwise.

**2. Live walk on staging (#186).** Every row of P6.7's `validation.md` §1.1–§1.4 and §2, in a real
browser against `staging.aheedfoodcentre.nocaped.com`, across four accounts. Staging rather than
local `npm run preview` because **#176** rejects real-browser sign-in on port 8787 and would
require an uncommitted patch to `lib/auth-origin.ts`; staging runs on the default port with
Cloudflare setting `x-forwarded-proto` correctly, so the bug is not reachable there.

**3. Audit trail (§2).** A live read of `VendorRoleAuditLog` after the walk — one row per action,
with `actorId`, `oldRole`, `newRole`, `vendorId` matching what was actually done.

**4. Smoke pass on the four unvalidated slices.** P6.5, P6.6, P6.6c and P7a all reached staging by
direct push and never had a gated validation. This slice does **not** walk their specs; it runs a
targeted smoke check (storefront + cart/checkout, admin panel transitions, cookie consent and legal
pages, the staff inventory view) and records explicitly what was and was not covered. That trade is
deliberate and was approved at Propose — the alternative was holding the #187 fix out of production
for a multi-session validation effort.

**5. Promotion PR `staging → main`.** 51 commits, five slices.

**6. Reconciliation carried on this branch.** Per the workflow's carry-forward rule:
- The delivery board disagrees with reality in five places (#183, #184, #187 sit in `Backlog`
  despite being merged; **#185 is marked `Done` but its fix is in the unpromoted range**, so it is
  not in production; #176 is a stale `In Progress`; P6.6 / PR #182 has no board item at all).
- Two roadmap change-log rows cite numbers that don't exist as claimed — the P6.5 row cites
  "Issue #180" (actually the production bucket CORS issue) and the P7a row cites "PR #183"
  (actually an issue, and P7a was a direct push). Neither slice's `plan.md` names any issue, so
  there is no correct number to substitute; the correction records that they shipped ungated.
- `specs/Validation.md` — a manual regression-test register added during the ungated period — has
  no front-matter, is absent from `ARTIFACT_INDEX.md`, and its name collides conceptually with
  every slice-local `validation.md`. It moves to `docs/regression-tests.md` with front-matter,
  alongside `docs/gap-register.md`. It never tripped CI because `kms:validate` reports missing
  front-matter as a warning, not a failure (`kms/schema/validate.ts:7`).

## Sequencing

The demo-account fix is a Node script run locally against staging's `DIRECT_URL` — it does not
require a deploy, so the walk can begin as soon as the account exists:

```
R1-R2 (local edit) → R3 (run demo:accounts at staging) → R4-R9 (walk) → R10 (smoke)
   → R11-R16 (docs, board, CHANGELOG) → PR into staging → promotion PR into main
```

## Deliberately excluded

- **Full per-slice validation of P6.5 / P6.6 / P6.6c / P7a.** Smoke only, per the approved trade.
  Anything the smoke pass turns up becomes a Fix or a new issue, not a silent patch here.
- **Fixing #176.** Out of scope; the staging target routes around it entirely.
- **Any new role-management behaviour.** No feature work on `/staff/team`; this slice proves what
  is already there. The deferred items on #136, #160, #161, #162, #169 stay deferred.
- **Retiring `demo-admin@example.com`'s redundant `vendorRole: "ADMIN"`.** It is dead weight given
  `auth-rbac.ts:63`, but removing it is a behaviour question for the demo tool's own spec, not a
  prerequisite for this walk.
- **Backfilling the ungated slices with proper issues.** P6.5 and P7a have no anchoring issue; this
  slice records that fact rather than retrofitting history.

## Open items carried forward

- **Live mutations on a shared environment.** The walk writes real `VendorMembership` and
  `VendorRoleAuditLog` rows to the staging database, and provisions a real account there. Reversible
  via `npm run demo:accounts -- remove` plus a targeted audit-log cleanup, but it is not a dry run.
  Per `CLAUDE.md`, the target host is checked against `secrets/staging.vars` before anything runs —
  a "staging-sounding" file is not evidence the host is staging (R3a).
- **The promotion is hard to reverse and visible to others.** It needs explicit confirmation at
  Ship, separately from this spec's approval — one approval is not blanket permission for the next.
- **`production` has no enforced approval gate** (`CLAUDE.md`: GitHub required-reviewers needs a
  paid plan on a private repo). PR review discipline is the only real gate on this promotion.
- **#190** stays open if the walk reveals the roster needs more than one added account.
