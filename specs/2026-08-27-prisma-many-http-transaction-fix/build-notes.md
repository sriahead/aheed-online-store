# updateMany/createMany + direct $transaction HTTP-mode crash fix (build notes)

## What changed and why

Four call sites switched from `getPrisma()` to `getPrismaWs()`:

- `lib/bundles-service.ts`'s `saveBundleForVendor` (calls `upsertBundle`) and
  `saveBundleImageForVendor` (calls `setBundleImage`) — both already imported `getPrismaWs` (used
  for `setBundleItems`), so no new import needed.
- `lib/repositories/discounts.ts`'s `deactivateCodeForVendor` (calls `deactivateCode`) — added
  `getPrismaWs` to the existing `@/lib/db` import.
- `lib/repositories/vendor.ts`'s `updateVendorStorefrontConfig` — changed
  `getPrisma().$transaction(...)` to `getPrismaWs().$transaction(...)` directly; also added
  `getPrismaWs` to the import (the file's other three exports still use `getPrisma()` for plain
  reads/updates and are correctly untouched).

None of the four repository functions' own signatures changed — they already took a generic
`Db`/`AnyDb`-typed client parameter, which was always correct per
`tests/repository-purity.test.ts`'s convention. The defect was entirely in which concrete client
each call site chose to pass in, which is why `plan.md` calls this a "call-site selection" bug
rather than a repository-layer bug.

Added `tests/repository-transaction-safety.test.ts` — see requirements R5/R6 and the test file's
own docstring for the full design rationale (it ended up a two-pass, two-directory check rather
than the single-file lexical check `plan.md` sketched — see Deviations below).

Reverted the `[382-diag*]` diagnostic `console.log` instrumentation in `lib/auth.ts` (two blocks:
the `authDb()` Proxy's `$transaction` trap, and the construction-time log), `lib/db.ts` (the
`PrismaNeonHttp.prototype.connect` monkey-patch that logged every `startTransaction` call), and
`features/admin/bundle-image.ts` (the eight `[382-diag-STEP]` lines in `attachBundleImage`).

Added a `### Fixed` CHANGELOG entry above the (now-resolved) `### Diagnostic` section, and marked
that Diagnostic section `RESOLVED` rather than deleting it — it's the historical record of the
investigation that led here, matching how the rest of this CHANGELOG treats superseded-but-real
prior work.

## Decisions taken during the build

**The regression test's actual design is not what `plan.md` described**, and this is the most
important thing to read before validating R5/R6. `plan.md` sketched a single-file lexical check:
"no `updateMany`/`createMany` outside a `.$transaction(...)` callback, within `lib/repositories/`."
Building that literally and running it against the already-fixed code produced 8 false positives —
`discounts.ts`, `loyalty.ts`, and `orders.ts` all have helper functions (`claimCode`, `spendPoints`-
shaped helpers, etc.) that take an *already-open* `tx` as an explicit parameter from a caller in a
different function (sometimes a different file), so a single-function lexical scan can never see
the `$transaction(` that actually wraps them. Worse, the real bugs (`upsertBundle`,
`setBundleImage`, `deactivateCode`) don't contain `getPrisma()` anywhere in their own file at all —
`lib/repositories/bundles.ts` never calls `getPrisma()`; `lib/bundles-service.ts` does, in a
different file, and passes the result in as a plain parameter. A check scoped to
`lib/repositories/*.ts` alone structurally cannot see that.

The test actually shipped is a two-pass design instead: **Pass 1** (over `lib/repositories/*.ts`)
marks a function name "sensitive" if its body contains an unwrapped `updateMany`/`createMany`
call — this correctly identifies `upsertBundle`/`setBundleImage`/`deactivateCode` without false-
flagging `claimCode`-shaped helpers (their `updateMany` IS lexically wrapped, just by a
`$transaction(` in a different file — Pass 1 doesn't need to see that wrapping to avoid a false
positive, because a function taking `tx` and calling `tx.model.updateMany` is *not* itself
unwrapped-in-its-own-body in a way Pass 1 would flag... see the test file's docstring for the exact
walk). **Pass 2** (over every file directly under `lib/` plus `lib/repositories/`, i.e. everywhere
`getPrisma()`/`getPrismaWs()` can legally be called at all, since `app/`/`features/`/`components/`
are ESLint-forbidden from importing `@/lib/db`) finds every call to a "sensitive" function whose
first argument is a literal `getPrisma()` and reports that call site. This is what actually points
at the fixable location (`bundles-service.ts:73`, not `bundles.ts:224`).

Rule B (no literal `getPrisma().$transaction(` in the repository layer) needed no redesign — it
was always self-contained and had no false positives.

**Sensitive-function detection uses the whole function body, not just the first parameter's
receiver.** A stricter version would check that the `updateMany`/`createMany` call's receiver
chain actually roots at the function's declared first parameter (rather than "anywhere in the
body"). Rejected as unnecessary precision for this codebase: every current write function's client
parameter is genuinely its first argument (documented convention, repeated across multiple module
docstrings), and a looser check that's simpler to read was preferred — this is a test, and
`repository-purity.test.ts` sets the precedent that "good enough and legible" beats "maximally
precise."

## Deviations from the spec

**R5's implementation shape differs from `plan.md`'s sketch** (single-file lexical check →
two-pass, two-directory check), for the reasons above. The *requirement itself* — R5a/R5b as
stated in `requirements.md` — is unchanged and fully satisfied; only the internal mechanism
changed, discovered while building because the literal spec'd design produced false positives
against real, already-correct code. `requirements.md` was written at a level (two named rules,
not an implementation) that doesn't need updating; `plan.md`'s more implementation-specific
sketch is superseded by the shipped test's own docstring, which is now the authoritative
explanation.

No other deviations. All four call sites named in `plan.md`/`requirements.md` R1-R4 were fixed
exactly as scoped; no additional call sites were touched.

## Known-shaky areas

**R7-R10 (the live staging checks) have not been run yet** — by this stage's own instructions,
live validation happens at `/validate` from a fresh context, not here. `/validate` should treat
R7 (bundle image upload, 5 consecutive attempts) as the highest-value check, since it's the one
crash actually reproduced live this session; R8-R10 (bundle save, discount deactivation,
storefront config save) have only been verified by reading the code and confirming the call-site
fix, tracing each function's actual runtime caller by hand — not by an end-to-end live attempt.

**The regression test's own correctness was verified by temporarily reverting the fix in the
working tree and re-running it (R6), then restoring the fix** — this was done once, by hand, this
session, and is not itself re-run by any automated check. If `/validate` wants to re-confirm R6
independently (recommended, since it's cheap and this is the test's entire value proposition),
the exact commands are in `validation.md`'s R6 row.

**`tests/repository-transaction-safety.test.ts` took ~5s to run in isolation but timed out against
vitest's default 5000ms per-test timeout when run as part of the full 707-test suite** (CPU
contention from the many parallel forked workers, not a logic issue — an isolated clean re-run of
the full suite afterward passed all 707 tests, including this one, with no timeout). If `/validate`
sees this test time out again, re-run the full suite alone (nothing else competing for CPU) before
assuming it's a real regression — this session's own experience is that it isn't, but the test
doesn't currently set an explicit longer timeout, so a genuinely slower CI runner could hit this for
real. Worth a `{ timeout: ... }` bump if it recurs.

**`updateVendorStorefrontConfig` takes `data: any`** — pre-existing, unrelated to this bug, not
touched (noted in `plan.md`'s Deliberately Excluded section already).

## Fix pass (post-/validate)

`/validate`'s pre-flight `npm run format:check` failed on `tests/repository-transaction-safety.test.ts`
(two long function signatures Prettier wraps that the file, hand-written during Build, didn't).
Verified this was real drift, not the Windows/autocrlf false-positive CLAUDE.md warns about — diffed
the committed blob against `prettier --config .prettierrc.json`'s own output directly, which showed
the same two wrapping diffs independent of any checkout/line-ending state. Fixed with
`npx prettier --config .prettierrc.json --write` on that one file; the diff is pure line-wrapping
(a return-type annotation, one `if` condition) with no logic change. Re-ran `lint`, `typecheck`, and
the full `vitest` suite (707/707) after — all still green. No CHANGELOG entry: this fix has no
observable behaviour change.

R7-R10 (the live staging checks) were reported at `/validate` as unverified, not failed — this
branch is unpushed (5 commits ahead of `origin/staging`), so the staging URL doesn't run this fix
yet, and local `.dev.vars` points at a third, separate dev-only Neon DB lacking the staging seed
data (`demo-admin@example.com`, the "Kitchen Pack" bundle) the repro steps name. That's expected at
this stage per `sdd-workflow.md`'s Validate section, not something to fix here — those four rows are
Ship's live-check responsibility once the branch is pushed and staging has the fix deployed.
