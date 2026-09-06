# Stranded payment sweep — scheduled reconciliation of lost webhooks and abandoned checkouts (build notes)

Written at the end of Build, before the Clear. `#618`, absorbing `#101` and `#94`.

## What changed and why

**The slice adds a caller, not a payment engine.** Every piece of resolution machinery already
existed and had been exercised live at `#454`: `releaseOrder` (restock, reverse the loyalty
redemption, free the discount-code use, write the status event, all guarded on
`status: "PENDING_PAYMENT"` so it is idempotent), `confirmPayment`, `failPayment`,
`cancelUnpaidOrder`, and `retrieveSession` on the `PaymentService` port. What was missing was a
clock, and a caller willing to ask the provider before deciding.

- **`workers/scheduler/`** (new Worker: `wrangler.toml` + `src/index.ts`). Exists because
  `.open-next/worker.js` is generated, gitignored, and exports only `fetch` plus three Durable
  Object classes — there is no `scheduled` export for a Cron Trigger to attach to, and editing the
  generated entry is pointless because the next build overwrites it. It holds a literal `JOBS`
  array, issues one authenticated `POST` per entry, and logs. No Prisma, no repository import, no
  vendor knowledge, so it cannot disagree with the application about any of them, and the
  unanswered question of whether Prisma's WASM query compiler loads outside OpenNext never has to
  be asked.

- **`lib/payment-sweep.ts`** (new). The decision table. Its two imports are `import type` and
  therefore erased, so the module has **zero runtime imports** and every dependency arrives as a
  parameter. This is the single most load-bearing shape decision in the slice: it is why
  `tests/payment-sweep.test.ts` contains no `vi.mock` call at all, where every other
  repository-adjacent suite in this repo must stub `@/lib/db` and `@/lib/config` before it can even
  import the module under test.

- **`lib/payment-sweep-service.ts`** (new, not in the spec — see Deviations). Resolves the live
  Prisma clients, the payment service and the order service, and joins them to the pure sweep.

- **`app/api/jobs/reconcile-payments/route.ts`** (new). POST-only. Proves the caller with a shared
  secret, refuses the two unsafe configurations, calls the service, returns counts.

- **`lib/repositories/orders.ts`** — one appended export, `listStalePendingOrders`, plus its
  `StalePendingOrder` type. The `where` matches the **already-existing**
  `@@index([vendorId, status, createdAt])`, which is why this slice needed no migration and the
  GAP-011 `DROP INDEX` trap could not fire. The diff against `origin/staging` is a **single
  append-only hunk at line 1710**; nothing in the payment transition path is touched.

- **`lib/repositories/vendor.ts`** — `listActiveVendorIds`. `Vendor` carries no `vendorId` column,
  so it is not a tenant-scoped model and this needs no vendor parameter; it enumerates tenants
  rather than reading inside one.

- **`lib/config.ts`** — `getJobsEnv()`, required in production, matching `paymentSchema`'s shape.

- **Both deploy workflows** — one additive `wrangler deploy --config workers/scheduler/wrangler.toml`
  step, ordered **after** the application deploy so the scheduler never schedules calls against a
  bundle that does not serve them yet.

- **`docs/developer-portal/env-setup.md`** (1.10.0) and **`specs/decisions/ADR-005`** (1.8.0) —
  see Persistent docs below. **`specs/roadmap.md`** — the P9.2 scope-list correction found at
  `/orient`. **`CLAUDE.md`** — vitest totals `97/1200` → `100/1221`.

### The two hazards the design is actually built around

Neither is visible from the requirements alone, and both were found during Spec's adversarial pass
rather than during coding.

**Release is gated on the session's own state, never on elapsed time.** This is what makes a
30-minute candidate cutoff safe rather than reckless: a session the provider has not expired
yields "do nothing" however old the order is. The short cutoff buys recovery latency for the
shopper who *paid* into a lost webhook — the worst state in this feature — without buying any risk
of cancelling a live checkout.

**An asynchronous payment whose outcome webhook is lost leaves the session `complete` and
`unpaid` forever.** A rule keyed only on `expired` defers such an order on every run until the end
of time — this feature's own failure mode, reintroduced one branch over. It cannot be released on
sight either, because `complete` plus `unpaid` is also what a still-settling payment looks like.
It resolves on the long cutoff, unified with the no-stored-session case.

## Decisions taken during the build

**`getWebhookOrderService()` rather than `getOrderRecoveryService()`.** Both reach the same
unchanged `confirmPayment`/`failPayment`, but only the former persists a `PaymentBindingRefusal`
row on a loud refusal. `getOrderRecoveryService`'s own docstring explains it deliberately does not,
because a staff recovery click that legitimately fails is "the control working, not a new webhook
anomaly," and recording one per click would bury the real rows. A **sweep** refusal is the opposite
case — unattended, with nobody watching — so persisting it is right, and it satisfies R31 by reuse
with no new model and no migration.

**A binding refusal counts as `unresolved`, not `deferred`.** R32 fixes the summary at five keys,
so refusals had to land in one of the existing counters. `unresolved` is the honest reading: this
run did not resolve the order. `already-processed` counts there too and stays silent in the log,
mirroring the webhook route's own rule exactly — though in practice it is rare from the sweep,
because a resolved order stops being a candidate at all.

**The job list is a literal array in the scheduler's source, not an environment variable.** A
config-driven path list turns a typo into a job that silently never runs — no error, no output. As
an array it is a reviewable diff. Rejected the env-var approach for that reason despite it being
the more "configurable" option.

**Sequential job invocation, not `Promise.all`.** The list is short; ordering keeps the log
readable and the load on the application Worker flat.

**Candidates ordered `createdAt: "asc"`.** Not specified. Oldest-first means a backlog larger than
the batch cap drains deterministically across successive ticks instead of the oldest orders
starving behind newer ones forever.

**A `fetch` that throws is caught in the scheduler, not just a non-2xx.** R7 only names the
non-2xx case, but "does not prevent the remaining jobs from being invoked" is not actually true
without it — an unreachable app Worker would throw and abandon the tick.

**`tests/config-jobs.test.ts` rather than `tests/config.test.ts`.** No config suite existed; the
new file is scoped to the accessor this slice adds rather than claiming to cover all of
`lib/config.ts`. `validation.md`'s R13 row was updated to name the real file, so the fresh-context
validator runs a command that exists.

## Deviations from the spec

**One: `lib/payment-sweep-service.ts` exists, and the spec did not list it.**

`plan.md`'s scope said the route would wire real dependencies into the sweep. It cannot.
`eslint.config.mjs`'s `no-restricted-imports` rule forbids anything under `app/` from importing
`@/lib/db` — the compensating control for ADR-004 slice 2, keeping the app layer out of Prisma so
vendor scoping cannot be bypassed by a route resolving its own client. `npm run lint` caught it as
a hard error during this build.

The fix is this repository's own established pattern (`lib/orders-service.ts`,
`lib/data-rights-service.ts`, `lib/vendor-service.ts`): a sibling `lib/<name>-service.ts` facade
holding the live clients, with the route above it holding none. **The net result is better than
the spec described**, which is why it was taken rather than argued: `lib/payment-sweep.ts` keeps
its zero-runtime-import property, so R18's testability claim is demonstrated by
`tests/payment-sweep.test.ts` needing no mocks rather than merely asserted.

No requirement changed. R18 is satisfied more strongly; every other requirement is unaffected.

**Everything else matches the spec as approved.** No requirement was dropped, reinterpreted or
quietly widened.

## Known-shaky areas

**Nothing has run against a real Stripe API or a real database.** Every decision-table requirement
(R19–R22, R24–R26) is proven only against a hand-built fake whose shape came from
`RetrievedSession`'s declared fields. `CLAUDE.md` records this exact failure mode twice — the
`P2002`-vs-`23505` adapter divergence and the Workers AI `result.response` shape — where a double
reproduced the author's assumption rather than the service's real behaviour. **The live rows are
the point of validation here, not a formality.** In particular:

- **The real `status` and `paymentStatus` strings.** The whole table keys on the literals `"paid"`,
  `"expired"`, `"open"` and `"complete"`. These come from Stripe's documented Checkout Session
  vocabulary and from `lib/payments.ts`'s existing mapping, but **no live response has been
  observed in this slice**. If Stripe returns something else for any of them, the sweep silently
  defers forever rather than erroring — the quietest possible failure. Validation's R30 run is the
  first time a real session's fields are seen; read them, do not just check the outcome.
- **The `complete` and unpaid path (R21a) is the least reachable.** Producing a genuine one needs
  an asynchronous payment method. The unit test covers the branch; a live exercise may not be
  practical, and if it is not, say so in the validation record rather than marking the row passed.

**The batch cap interacts with the per-vendor loop in a way one test does not fully cover.**
`remaining` is threaded through `listCandidates` as its `limit`, so a first vendor returning a full
batch means later vendors are never queried on that tick. That is intended — the next tick picks
them up — but it means **a single high-volume vendor can starve another vendor's orders** for as
long as it keeps saturating the cap. Not a correctness bug and not in scope to fix, but worth
knowing before the counts in a live run are read as "nothing to do for vendor two."

**The stub-adapter refusal (R23) is the safety property most worth exercising for real.** It is
belt-and-braces over the `status === "open"` rule, and the reasoning for it is inverted from
`#454`'s — a reviewer who pattern-matches to the existing recovery path will read it as redundant.
It is not: `"unpaid"` authorises *cancellation* here.

**The OpenNext build has not been run.** `tsc --noEmit`, `lint`, `format:check` and the full suite
(100 files / 1221 tests, run alone) are green, but `CLAUDE.md` records that a root `proxy.ts` once
passed all of those and failed only in `opennextjs-cloudflare build`. `workers/scheduler/src/index.ts`
sits inside the root tsconfig's `include`, so the app build type-checks it; that is covered by
`typecheck` passing, but the adapter build itself is unproven.

**Neither deployed environment has `JOB_INVOCATION_TOKEN` yet**, and it is needed on **two**
Workers with the same value. Until a human sets it, the route returns 503 in staging and
production and the sweep does nothing. A mismatch between the two is silent from the outside —
every invocation simply 401s and orders quietly stop being reconciled.
