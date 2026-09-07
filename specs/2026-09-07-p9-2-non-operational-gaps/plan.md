---
id: p9-2-non-operational-gaps-plan
title: "P9.2 — Remaining non-operational gaps (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-07
visibility: internal
summary: Closes every remaining P9.2 item that repo work can close — a guest-cart reaper, the webhook's unreachable unset-secret branch, a readable ErrorEvent signal, one shared env-file parser, and required status checks on both branch rulesets.
tags: [p9-2, jobs, retention, config, ci, governance]
---

# P9.2 — Remaining non-operational gaps (plan)

**Goal:** leave P9.2 holding only work that needs a human at a console. Every item here is closeable
by a change in this repository; everything that needs a credential rotated, a domain verified, a
restore performed or a dashboard configured stays open and is named explicitly below.

Approved at `/propose` (2026-09-07) as **one combined slice**, tracked by **#644**.

## Why one slice, and what that costs

A two-slice split — application code, then repo governance — was recommended and declined. The
accepted cost is the one the admin-panel slice already carried: a failed `/validate` row anywhere
blocks the whole batch, and this batch is heterogeneous. Application code, repository settings, CI
semantics and issue bookkeeping fail for unrelated reasons and are verified by unrelated means.

Two mitigations are built into the sequencing rather than left to care:

1. **The ruleset change (`#472`) lands last**, as the final commit before `/ship`. It is the only
   item that can block every future merge if it is wrong, and it must not be able to strand the
   rest of the slice mid-flight.
2. **The three code items are genuinely cohesive**, not merely bundled. `#94`, `#437`'s code tail
   and `#621` all sit on the jobs-and-config layer `#618` built, and two of the three add a job to
   the same scheduler.

## Scope (this slice)

### 1. `#621` — the Stripe webhook's unset-secret branch is dead code

`app/api/webhooks/stripe/route.ts:63` calls `getPaymentEnv()` bare and then checks
`if (!STRIPE_WEBHOOK_SECRET)` at `:64`. That check can never run. `lib/config.ts`'s `paymentSchema`
carries a zod `superRefine` that adds an issue whenever the value is absent and
`process.env.NODE_ENV === "production"` — and `NODE_ENV` is unconditionally `"production"` in every
**built** Worker this route runs in, `npm run preview` included, because `next build` bakes it in
regardless of deploy target. So `getPaymentEnv()` throws a `ZodError` first and the route's own
handled response is unreachable, producing a bare 500 with no body instead.

The identical defect was live-confirmed and fixed for `app/api/jobs/reconcile-payments/route.ts` at
`#618`'s `/validate`. **The fix there is a local, unexported `readOptional()` at `route.ts:34`** —
so closing this correctly means *extracting* that helper to `lib/config.ts` and having both routes
import it, not pasting a second copy. A second copy is how the first one stopped being findable.

The route's existing contract is preserved exactly: still a 500, still the body
`Webhook not configured`, still the `console.error` beside it. Only its reachability changes. This
is deliberate — the slice is making a documented behaviour real, not redesigning it.

### 2. `#94` — reap abandoned guest carts

Guest carts are created lazily on first add and keyed by an opaque cookie token. Nothing has ever
reaped them. Volume is near zero today, but the row is weakly personal data (it links a browser to a
set of product interests), so this is a retention decision and not only a data-growth one.

**The retention window is 30 days, and it is principled rather than tuned.**
`lib/cart-identity.ts:54` sets the guest cart cookie's `maxAge` to `60 * 60 * 24 * 30`. Once that
cookie expires, the token naming the cart is gone from the only place it ever existed, so the row is
structurally unreachable by anyone — the shopper included. Reaping at exactly the cookie lifetime
deletes rows that have already stopped being carts. The constant is defined once with a comment
citing that line, so a future change to the cookie lifetime has somewhere obvious to propagate to.

Shape follows the layering `#618` established, which exists because `app/` may not import
`@/lib/db` (`eslint.config.mjs`'s `no-restricted-imports`, enforcing ADR-004 slice 2):

- `lib/repositories/cart.ts` gains a pure `deleteAbandonedGuestCarts(prisma, olderThan, limit)`
  taking its client explicitly, so a plain `tsx` script can exercise it against a real database.
- `lib/guest-cart-reaper-service.ts` is the request-scoped facade that resolves the live client,
  constructed fresh per call — a cached client pins the first request's I/O objects and throws
  `Cannot perform I/O on behalf of a different request` on Workers.
- `app/api/jobs/reap-guest-carts/route.ts` copies `reconcile-payments`' guard shape exactly: POST
  only, `x-job-token` compared with `timingSafeEqual`, 503 when `JOB_INVOCATION_TOKEN` is unset,
  401 on mismatch, 405 on GET, a JSON summary on success.
- `workers/scheduler/src/index.ts`'s `JOBS` array gains the path. That array is a literal on
  purpose — the file's own docstring explains that a config-driven list would let a typo schedule
  nothing silently — so this is a one-line reviewable diff.

**Two correctness constraints the requirements pin.** The delete must never touch a cart with a
`userId` (a signed-in shopper's cart has no cookie dependency and no expiry), and `CartItem`
already declares `onDelete: Cascade` on its `cart` relation, so deleting the `Cart` row removes its
items without a second statement. `deleteMany` is confirmed safe on the HTTP adapter that
`getPrisma()` returns — unlike `updateMany`/`createMany`, which crash there (`#382`) — so no
`getPrismaWs()` is needed, matching `lib/repositories/auth-rate-limit.ts`'s sweep.

### 3. `#437` (code tail only) — nothing ever reads `ErrorEvent`

`instrumentation.ts`'s `onRequestError` writes a row for every unhandled request error, and
`/staff/errors` renders the most recent ones. But no code anywhere asks *how many, how recently*.
There is no threshold query and no signal, so an error spike is visible only to someone who happens
to open that page.

This slice adds the detection half:

- `lib/repositories/error-events.ts` gains a pure `countRecentErrorEvents(prisma, since)`.
- A pure `evaluateErrorRate` decides whether a count breaches the threshold and returns the summary.
  It lives outside the route and imports no live client, so it is unit-testable with **no stubs at
  all** — the same separation `lib/payment-sweep.ts` exists to provide, and the reason
  `reconcile-payments`' own docstring calls that route "deliberately thin". Putting the threshold
  logic in the handler would mean stubbing `getJobsEnv` and a Prisma client just to test an
  inequality.
- `app/api/jobs/check-error-rate/route.ts` holds the guard and the logging only: it returns
  `evaluateErrorRate`'s summary as JSON and emits **one** structured `console.error` line with a
  fixed greppable prefix when — and only when — the threshold is breached.
- The path joins the scheduler's `JOBS` array.

**The window is derived, not chosen.** It equals the scheduler's cron interval, declared in
`workers/scheduler/wrangler.toml` (`*/15 * * * *`, on all three environments), so consecutive ticks
neither overlap nor leave a gap. The **threshold** is a genuine judgement call with no principled
derivation available yet, so it is a single named constant carrying a comment saying exactly that,
to be tuned once `#246` confirms whether logs are retained long enough to see a real baseline.

**The delivery channel is deliberately not chosen here, and that is the substance of the carve-out
rather than an omission.** The obvious channel is email via `lib/email.ts`, and it would not work:
`#104` (a verified Resend sending domain) is unresolved, and Resend rejects `to` addresses on
unverified domains outright. Shipping an email alert now would produce a path that looks delivered
and can never fire — precisely the `JOB_INVOCATION_TOKEN` trap, where a scheduler Worker sits
deployed with a live Cron Trigger invoking a job that refuses every tick. The honest in-app half is
to make the condition **detectable, queryable and logged**; wiring a channel to it stays on `#437`
with the dashboard work.

The scheduler already logs each job's response body verbatim (`scheduled job <path> ok: ...`), so
the summary reaches the same place a tick's other output does with no extra mechanism.

`ErrorEvent`'s existing probabilistic 30-day retention sweep inside `recordErrorEvent` is left
exactly as it is. This slice reads the table; it does not change how it is written or pruned.

### 4. `#505` (code half only) — two incompatible env-reading strategies in `scripts/`

The repo's own `.env` violates `CLAUDE.md`'s env-format rule — spaces after `=` and trailing
same-line comments, on the connection-string lines. The consequence is already sitting in the tree:
`parseEnvFile` is duplicated **verbatim across four scripts** (`copy-product-images.ts:67`,
`fill-product-images.ts:53`, `remove-vendor-domains.ts:43`, `restore-placeholder-images.ts:50`),
each existing solely to tolerate that formatting, while six other scripts import `dotenv` directly.

**The decision this slice makes: keep the hand-rolled parser, consolidate it to one module, do not
adopt `dotenv` for these call sites.** The reasoning is that `secrets/staging.vars` and
`secrets/production.vars` are gitignored, are hand-maintained, and will never be seen by a linter or
a formatter — so a parser that tolerates their formatting is a genuine requirement and not a
workaround to be removed. Four copies of it is the actual defect. It moves to `scripts/lib/env-file.ts`
and all four scripts import it.

**The file normalisation itself cannot happen in this slice.** `.env`, `.dev.vars` and
`secrets/*.vars` are gitignored and hold live credentials, so they must be corrected by hand in each
working checkout. The shared module's docstring records the required local edit, and `#505` stays
open for it.

### 5. `#472` (partial) — required status checks on both rulesets

**The premise `#472` was filed on no longer holds.**
`gh api repos/sriahead/aheed-online-store --jq .visibility` returns `"public"`. The paid-plan
limitation recorded in that issue — and stated as current fact in `CLAUDE.md`'s branch-strategy
section — does not bind a public repository. Nobody rechecked it, which is the same shape as the
GAP-011 ruling that sat deferred behind a question already answered one document over.

Current state, confirmed 2026-09-07: two active rulesets (`protect-main`, `protect-staging`), each
carrying `deletion`, `non_fast_forward` and `pull_request` and nothing else; both GitHub
environments report `protection_rules: []`.

This slice adds a `required_status_checks` rule to both rulesets so a red `gates` run cannot be
merged — the exact gap that let PRs #464, #465 and #466 reach `main` with nothing able to reject
them.

**Approval gates stay out of scope.** Required reviewers are now available too, but as sole
maintainer the user would be approving their own deploys, which adds a click and no independent
check. Recorded as a decision, not an oversight.

**The check names must be read from a real completed run, never guessed.** A `required_status_checks`
rule naming a context that no workflow ever reports blocks every merge on that branch permanently —
which is exactly why `#539` deferred this. The requirements pin the names to what a real run
actually reported and pin a live PR as the proof.

### 6. `#541` and `#101` — two closures

**`#541` closes as accepted risk.** Today's `deploy-production` run (`34103597181`) did not settle
it: the `kms` job concluded `success`, and `continue-on-error` is inert on a passing job — exactly
what the issue predicted. The alternative was to deliberately push a stale artefact to `main` to
observe the non-blocking branch, which means knowingly shipping a broken artefact to the production
deploy path. The failure direction is safe: a mis-resolved expression leaves the job **blocking**, so
the bad outcome is a deploy that stops rather than drift that passes silently — loud and wrong, not
quiet and wrong. That reasoning goes in `CLAUDE.md` and the issue closes.

**`#101` closes as delivered.** `#618` shipped `app/api/jobs/reconcile-payments/route.ts`, which is
the sweep `#101` asked for. Only `JOB_INVOCATION_TOKEN` remains unset, and that is operational. The
roadmap already notes `#101` was kept listed "for continuity"; this is the bookkeeping.

### 7. `CLAUDE.md` corrections

Three statements in that file are wrong or become wrong with this slice, and it is the file read
every session:

- The branch-strategy section states the paid-plan/private-repo constraint as current fact. The repo
  is public. The 422 recorded there was real when it happened; the constraint it implies is not.
- That section's "no required status check on either branch" becomes false once item 5 lands.
- The vitest baseline (`105 files / 1411 tests`) moves, since this slice adds test files.

## Deliberately excluded

- **`#236` — the ~20-mutation add-to-cart ceiling.** Diagnosing it needs live load generation plus
  enough observability to distinguish a connection limit from a Worker CPU limit (`wrangler.toml`
  sets `cpu_ms = 50`). No repository change closes it. Stays in P9.2 awaiting a measurement session.
- **An approval gate on the `production` environment.** See item 5.
- **A delivery channel for `#437`.** See item 3. The dashboard half and the channel both stay on
  `#437`.
- **Normalising `.env` / `.dev.vars` / `secrets/*.vars`.** Local gitignored files; documented, not
  edited. `#505` stays open for it.
- **Changing `ErrorEvent`'s schema, write path or retention sweep.** This slice only reads the table.
  No migration anywhere in this slice.
- **Adopting `dotenv` in the four consolidated scripts.** See item 4.
- **A retention sweep for signed-in users' carts.** They carry no cookie dependency and no expiry;
  deleting one would destroy live state a shopper can still reach.
- **Fixing the board's `Phase` field.** Its options stop at `P8` (`#513`), so `#644` has no phase
  recorded. Noted twice now, but it is a board-configuration change and not this slice's scope.

## Risks this spec deliberately designs validation around

- **`required_status_checks` may not actually be settable on this plan — this is the slice's single
  biggest unverified premise.** The reasoning that it should be (the repository is public, and the
  recorded 422 was against *environment reviewer* protection specifically, not rulesets) is sound
  but has not been executed against the API, because doing so means mutating a live ruleset and that
  is not a `/spec` action. **Build must confirm it before writing anything else for item 5**, and if
  the API refuses, item 5 becomes a recorded finding on `#472` rather than a silent omission —
  everything else in this slice is independent of it.
- **A `required_status_checks` rule naming a context nothing reports blocks every merge on that
  branch, permanently.** This is why `#539` deferred it. R25 exists specifically to catch it: the
  configured contexts are compared against what a *real completed run* reported, not against what
  the workflow file appears to declare. R26 then proves a green PR still merges. The rule lands last
  so a mistake here cannot strand the rest of the slice.
- **The `#621` live rows require unsetting a secret in two files, not one.** `readEnv` falls through
  to `process.env` per key and `next build` bakes `.env` into the built Worker, so commenting
  `STRIPE_WEBHOOK_SECRET` out of `.dev.vars` alone leaves the route reading `.env`'s copy and R4
  would pass for the wrong reason — the exact false result `#618` hit. R4 names both files, and R5
  is the paired check that the branch is reached *only* on that configuration.
- **The reaper deletes real rows.** R7 pins the negative cases (never a `userId` cart, never a
  recent one) as strongly as the positive one, and R12 exercises all three against a real database
  rather than trusting a stub's recorded `where` clause. `scripts/verify-guest-cart-reaper.ts` seeds
  and removes its own fixtures; `tsconfig.json` includes `**/*.ts`, so it must typecheck or the next
  `next build` fails on it.
- **Neither new job can do anything in production until `JOB_INVOCATION_TOKEN` is set**, which no
  Worker in either environment currently has. Both will refuse every tick with a 503, exactly as the
  payment sweep already does. Correct fail-closed behaviour, but it means "deployed" is not
  "running" for either — recorded so a later reader does not mistake the 503s for a defect.

## Open items carried forward

- **`#505`** stays open for the local file normalisation this slice can only document.
- **`#437`** stays open for the delivery channel and the Cloudflare dashboard wiring.
- **`#236`** stays open, excluded above.
- **`#472`** stays open for the approval-gate half, deliberately declined here.
- **The eight operational P9.2 items**, untouched and each needing a human at a console: `#113`
  (production is still on Stripe **test** keys), `#104` (Resend sending domain), `#227` (Neon plan
  and capacity), `#175` and `#219` (two credential rotations, both from exposure incidents), `#246`
  (persisted Workers Logs), `#436` (a real PITR restore), `#438` (a tested rollback).
- **`JOB_INVOCATION_TOKEN` is set on no Worker in either environment.** Both jobs this slice adds
  will therefore refuse every tick with a 503 in production, exactly as the payment sweep already
  does. That is the correct fail-closed behaviour and it is not a defect in this slice, but it does
  mean neither new job does anything real until that secret is set. Tracked on `#618`'s thread.
