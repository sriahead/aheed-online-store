# P9.2 — Remaining non-operational gaps (build notes)

Written at the end of Build, **before** the Clear. Issue **#644**; branch
`feature/p9-2-non-operational-gaps`; spec commit `a4fde12`, implementation commit `d379b9f`.

## What changed and why

**`#621` — `readOptional` moved from a private helper to `lib/config.ts`.** The defect is that
`app/api/webhooks/stripe/route.ts` read `STRIPE_WEBHOOK_SECRET` through a bare `getPaymentEnv()`.
That accessor's zod `superRefine` throws whenever the value is absent and
`process.env.NODE_ENV === "production"` — unconditionally true in every **built** Worker, `npm run
preview` included, because `next build` bakes it in regardless of deploy target. So the route's own
`if (!STRIPE_WEBHOOK_SECRET) return new Response("Webhook not configured", { status: 500 })` could
never execute, and an unset secret produced an uncaught `ZodError` (a bare 500 with no body) instead
of the considered response the route was written to give.

The route's contract is unchanged on purpose — same 500, same body, same `console.error` beside it.
Only its *reachability* changed. This slice was making a documented behaviour real, not redesigning
it, and a validator comparing the route against its own docstring should find them agreeing now.

The helper is **exported from `lib/config.ts` rather than copied**. `#618` left it as a local,
unexported function inside `app/api/jobs/reconcile-payments/route.ts`, and that is precisely why the
identical defect in the webhook route went unnoticed for as long as it did: a private copy is not
findable. Its docstring in `lib/config.ts` carries the full reasoning, because the next person to
write `const { X } = getXEnv(); if (!X)` needs to understand why that shape does not work here.

**`#94` — the guest-cart reaper.** `deleteAbandonedGuestCarts` in `lib/repositories/cart.ts`,
`lib/guest-cart-reaper-service.ts` as the request-scoped facade, `app/api/jobs/reap-guest-carts/route.ts`
as the entry point, and the path added to `workers/scheduler/src/index.ts`'s `JOBS` literal.

The retention window is **30 days, and it is derived rather than tuned**:
`lib/cart-identity.ts:54` sets the `CART_COOKIE` `maxAge` to `60 * 60 * 24 * 30`. The guest token
naming a cart exists in exactly one place — that cookie. Once it expires the row is unreachable by
everyone, the shopper included, because there is no other index into it. Reaping at the cookie's own
lifetime therefore deletes rows that have already stopped being carts, which is a defensible
retention position rather than an arbitrary age at which to destroy something a shopper could still
return to. `tests/guest-cart-reaper.test.ts` pins the constant against the cookie's value so the two
cannot drift apart silently, since neither file can import from the other.

Two statements rather than one, because `deleteMany` has no `take`: candidate ids are selected under
a limit first, so a single tick can never delete an unbounded number of rows. `CartItem` declares
`onDelete: Cascade`, so no second delete is needed and an interruption between the two statements
cannot orphan items.

**`#437` (code tail only) — `ErrorEvent` becomes readable.** `countRecentErrorEvents` in the
repository, a pure `lib/error-rate.ts` holding the threshold decision, `lib/error-rate-service.ts`
joining them, and `app/api/jobs/check-error-rate/route.ts` as the scheduled entry point. Rows have
been written by `instrumentation.ts` since `#508` and read by nothing except `/staff/errors`, so a
spike was visible only to someone who happened to open that page.

**No delivery channel is chosen, and that is the substance of the carve-out rather than an
omission.** The obvious channel is email via `lib/email.ts`, and it does not work: Resend rejects
recipients on unverified domains and `#104` (the verified sending domain) is unresolved. An email
alert shipped now would look delivered and never fire — the same trap `JOB_INVOCATION_TOKEN` is
already in, where a scheduler Worker sits deployed with a live cron trigger invoking a job that
refuses every tick. The breach is emitted as one structured `console.error` line and returned in the
response body, which `workers/scheduler` already logs verbatim for every job. No new mechanism, and
nothing claiming a reliability it does not have.

**`#505` (code half) — one env-file parser.** `parseEnvFile` existed as four private copies across
`scripts/copy-product-images.ts`, `fill-product-images.ts`, `remove-vendor-domains.ts` and
`restore-placeholder-images.ts`; three were byte-identical and the fourth differed by a single
comment line. Consolidated to `scripts/lib/env-file.ts`.

**The parser is kept, not replaced by `dotenv`** — see Decisions below.

**`#472` (partial) — required status checks.** Added a `required_status_checks` rule to both
`protect-main` (`20494938`) and `protect-staging` (`22085177`) via
`PUT /repos/.../rulesets/<id>`, naming `docs-gates`, `quality / kms` and `quality / quality`, with
`strict_required_status_checks_policy: false`.

**The premise this issue rested on was false and nobody had rechecked it.** `#472` and `CLAUDE.md`
both recorded that required protection "needs a paid plan for private repos"; the repository is
**public** (`gh api repos/sriahead/aheed-online-store --jq .visibility` → `"public"`). The recorded
422 was against *environment reviewer* protection specifically, and never applied to rulesets. The
API accepted both PUTs first time.

**`#541` and `#101` closed**, each with a comment recording the reasoning, and `CLAUDE.md` updated so
a future session reads the conclusion rather than reopening the question.

**Persistent doc updated on this branch:** `specs/tech-stack.md` said "branch protection prepared for
later" — stale the moment the rulesets landed. Now describes the actual configuration, bumped to
`1.5.0`.

## Decisions taken during the build

**Keep the hand-rolled `parseEnvFile`; do not adopt `dotenv` for these four call sites.** The six
other scripts importing `dotenv` directly are right to: they load `.env` into their own
`process.env` and never look at another file. These four read a *named* file chosen at runtime
(`--env-file secrets/staging.vars`) to resolve which environment they are about to touch.
`secrets/*.vars` are gitignored, hand-maintained, and will never be seen by a linter, a formatter or
a review — so tolerating their formatting is a real requirement, not a workaround to delete. The
duplication was the defect `#505` named, not the parser. Rejected: deleting it in favour of `dotenv`
and normalising the files first, because the normalisation cannot be done by any PR (the files are
gitignored and hold live credentials) and would have to be repeated in every working checkout,
including ones not visible from here.

**Per-vendor delete cap, not a shared one.** `PER_VENDOR_LIMIT = 500` in the reaper service applies
to each vendor rather than the whole tick. A shared cap lets one vendor with a backlog consume the
entire budget and starve every other vendor indefinitely — that is `#619`, an open defect in the
payment sweep's own batching, and there was no reason to reproduce it in a second job.

**Threshold `>=`, not `>`.** A threshold of ten means ten is already too many, which is how anyone
tuning the constant later will read it. Pinned by a test at exactly the boundary.

**The error-rate window is derived; the threshold is not, and says so.** The window equals the
scheduler's 15-minute cron interval so consecutive ticks neither double-count nor leave a gap. The
threshold (10) has no principled derivation available yet and is a named constant whose comment
records that, to be tuned once `#246` confirms log retention long enough to establish a baseline.
Writing a tuned-looking number with no basis would have been false precision.

**Log only on breach, never on a quiet tick.** A line every fifteen minutes is noise that trains a
reader to ignore it, which is worse than no line at all.

**`deploy` deliberately excluded from the required contexts.** It runs on `push`, not
`pull_request`, so requiring it would block every PR permanently. The three required contexts were
read from the check names real completed runs actually reported (PRs #640 and #643) rather than
inferred from the workflow files — a `required_status_checks` rule naming a context nothing reports
blocks every merge on that branch, which is exactly why `#539` deferred adding one.

**`strict_required_status_checks_policy: false`.** The goal is "a red run cannot merge", not "every
branch must be rebased first". Strict mode would additionally force promotion PRs to be up to date
before merging, which is a workflow change nobody asked for.

**Approval gates not adopted**, though now available. As sole maintainer the user would be approving
their own deploys: a click, and no independent check. Recorded in `CLAUDE.md` as a decision so it is
not re-litigated as an oversight; `#472` stays open carrying it.

**Removed a dead `getEnv` import** from `app/api/webhooks/stripe/route.ts`. `git show
origin/staging:...` confirms it was already unused before this slice — pre-existing `#416` territory,
on a line this slice was rewriting anyway. Disclosed rather than silent.

## Deviations from the spec

**R6's signature changed, and the spec was amended in place rather than built around.** As written,
R6 specified `deleteAbandonedGuestCarts(prisma, olderThan, limit)` — no `vendorId`. That is
unbuildable without weakening a repo invariant: `Cart` is a vendor-scoped model, so an exported
repository function issuing `deleteMany` against it while taking no vendor id fails
`tests/repository-vendor-scoping.test.ts`, whose only escape is an `ALLOWED` entry explicitly
reserved for paths that genuinely have no vendor (the webhook refusal recorder). A guest-cart reaper
is not one of those.

The function now takes `vendorId` and `lib/guest-cart-reaper-service.ts` iterates
`listActiveVendorIds`, which is exactly the shape `lib/payment-sweep-service.ts` already uses.
`requirements.md` carries the amendment as a visible block quote under R6, with its reasoning and
the date — not a silent edit — and R9 was extended to require the per-vendor iteration. This was a
design error in the spec caught at Build, not code drifting from an approved design; leaving R6 as
written would have handed `/validate` a requirement that fails by construction.

**`tests/scheduler.test.ts` was reshaped, which the spec did not anticipate.** Two of its tests
hardcoded `toHaveBeenCalledTimes(1)` and `(2)` against a one-entry `JOBS` array, while the file's own
comment claimed the assertions were "independent of how many jobs happen to be registered today".
They were not, and registering two jobs broke them. They now assert over every call and a separate
test pins the actual path list. Renumbering the constants would have preserved a test asserting
arithmetic it never meant to assert. **Net effect on the suite total is −2 tests in that file**,
which is why the `CLAUDE.md` baseline moved to `107/1431` rather than the `109` a naive count of
added tests would predict.

**One extra module beyond what R14 named.** R14 required a pure module exporting `evaluateErrorRate`;
the build also added `lib/error-rate-service.ts` as the facade joining it to the repository, because
`app/` may not import `@/lib/db`. R9 named the equivalent module for `#94` but the spec omitted the
parallel one for `#437`. No requirement contradicts it and it follows the established pattern.

## Known-shaky areas

**The ruleset change is the highest-risk thing in this slice and cannot be fully proven until the
PR exists.** R24 and R25 were verified directly after the change: both branches report
`required_status_checks`, and the three configured contexts match names from real runs exactly.
**R26 — that a green PR actually merges under the new rule — is unrunnable before `/ship`** and is
marked as such in `validation.md`. If it turns out a required context never reports on this branch's
PR, the symptom is a PR that can never merge; the fix is to remove that context from both rulesets
via the same `PUT`, not to force-merge. Ruleset ids are `20494938` (main) and `22085177` (staging).

**Neither new job can do anything in production.** `JOB_INVOCATION_TOKEN` is set on no Worker in
either environment, so both new routes will refuse every tick with a 503 exactly as the payment sweep
already does. This is correct fail-closed behaviour and is **not** a defect to chase — but it means
"deployed" is not "running" for either job, and a validator seeing 503s on staging should not read
them as a failure.

**`#437`'s live rows need `ErrorEvent` rows that do not naturally exist.** R16 requires observing a
breaching and a non-breaching call. The threshold is 10 errors in 15 minutes and a healthy dev
database has none, so the breaching case needs rows inserted deliberately and deleted afterwards.
There is **no committed script for this** — unlike `#94`, which has
`scripts/verify-guest-cart-reaper.ts`. Validation will need to write one or drive it another way;
that asymmetry is the thinnest part of this slice's verification story.

**`#621`'s R4/R5 need the secret unset in BOTH `.env` and `.dev.vars`, then a preview restart.**
`readEnv` falls through to `process.env` per key and `next build` bakes `.env` into the built Worker,
so commenting `STRIPE_WEBHOOK_SECRET` out of `.dev.vars` alone leaves the route reading `.env`'s copy
and R4 would appear to pass for entirely the wrong reason. That exact false result was hit at
`#618`'s validation. R5 is the paired check that the branch is reached *only* on that configuration
— do not skip it, since R4 alone cannot distinguish "the handled branch works" from "the route
always returns that body".

**`#94`'s live behaviour was verified at Build, which is unusual and worth knowing.**
`scripts/verify-guest-cart-reaper.ts` ran against the dev Neon branch
(`ep-sparkling-paper-za3j7xza`) with all seven checks passing, including the cascade and the
precondition that Prisma honoured an explicit `updatedAt` on create. Re-running it at `/validate` is
still the R12 row — a fresh context should confirm rather than trust this note — but the mechanism is
known to work, so a failure there means something changed rather than something was never tried.
The script refuses staging and production via `lib/db-target-guard.ts`, and **must not be piped to
`head`**: a closed pipe can kill it before its own cleanup runs, which has left fixture rows behind
in this repo before (`#411`/`#412`).

**A scripted rewrite damaged two files mid-build and was caught only by `git diff --numstat`.** A
regex intended to strip `parseEnvFile` over-matched from an earlier `/**` and deleted 84 and 68 lines
from `copy-product-images.ts` and `restore-placeholder-images.ts` — taking their header docstrings
and imports with it. Reverted via `git checkout --` and redone with targeted edits; the final numstat
is `1/29`, `1/20`, `1/21`, `1/29`, which is proportional to removing a ~28-line block and adding one
import. Both files were subsequently typechecked, linted and format-checked clean. Worth a read of
those two diffs specifically at validation, since the damage-and-repair cycle is the kind of thing
that can leave a subtle remnant.

**Not verified anywhere: that `countRecentErrorEvents` and the reaper behave correctly under the
HTTP adapter in a real Worker.** Both use operations documented as safe there (`count`, `findMany`,
`deleteMany` — not `updateMany`/`createMany`, which crash per `#382`), and the reaper was exercised
against real Postgres through a Node client. Neither has been exercised through `getPrisma()` inside
an actual request, which is what R10/R15's `npm run preview` rows do.
