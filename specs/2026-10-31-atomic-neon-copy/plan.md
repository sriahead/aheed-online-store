---
id: p1333-atomic-neon-copy-plan
title: "Atomic apply for migrate-to-new-neon (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-31
visibility: internal
summary: "#1333: scripts/migrate-to-new-neon.ts --apply writes the whole copy inside one interactive transaction, so a failure part-way rolls the target back to its freshly migrated state and a re-run is safe. Unblocks the #1341 production copy."
tags: [migration, neon, prisma, transaction, merqify, p12]
related: [env-setup, architecture]
---

# Atomic apply for migrate-to-new-neon (plan)

**Goal:** make `scripts/migrate-to-new-neon.ts --apply` all-or-nothing. If any write fails, the
target goes back to the state `prisma migrate deploy` left it in, and running the same command
again is safe. That is the condition for running the copy against the real `Shoplocal` production
database in `#1341`. That database is a root branch, so Neon's "Reset from parent" cannot undo a
half-finished copy there.

## Background

`#1323` built the script (`specs/2026-10-29-merqify-platform-move/`, R7–R18) and listed "no atomic
apply" under "Deliberately not done". Today `--apply` makes these writes as separate statements
(`scripts/migrate-to-new-neon.ts`, the `if (apply)` block):

1. It deletes the migration-seeded vendor (`SEEDED_VENDOR`) when the target is `seeded-only`.
2. It runs `createMany` for every model in `plan.order`, in chunks of 500.
3. It runs `createMany` for the generated `VendorDomain` rows (`plan.domains`).

A failure after step 1 leaves a target with no seeded vendor and some copied rows. A re-run then
either refuses because a copied vendor now makes the target `occupied`, or half-succeeds. The
header comment and the runbook (`env-setup.md`, "Merqify account", step 3) say "reset, do not
re-run".

## Scope (this slice)

- **New `scripts/lib/neon-migration-apply.ts`, with no imports.** It exports:
  - `applyPlan(client, plan, options)`: performs exactly steps 1–3 above, in the same order and with
    the same 500-row chunks. If `options.simulateFailure` is set, it throws `SimulatedFailure` after
    the last write. It catches nothing.
  - `SimulatedFailure`, an `Error` subclass.
  - `APPLY_TRANSACTION_OPTIONS = { maxWait: 30_000, timeout: 600_000 }`.

  `client` is a function from a model name to an object with `createMany` and `deleteMany`. The
  module never sees a Prisma type, so a unit test can drive it with a recording fake.
- **The script calls it inside one interactive transaction:**
  `targetDb.$transaction((tx) => applyPlan((m) => delegate(tx, m), plan, …), APPLY_TRANSACTION_OPTIONS)`.
  - `targetDb` is already built on `PrismaNeon` (the WebSocket adapter), the client `CLAUDE.md`
    requires for an interactive `$transaction`. No client changes.
  - The script itself makes no target write outside that callback.
- **Output.**
  - On success it prints `committed: <n> ms`.
  - On any error from the transaction it prints a line starting `ROLLED BACK:` with the error
    message, then sets a non-zero exit. It runs neither `verifyCounts` nor `copyImages` after a
    failure.
- **`--simulate-failure`, a validation aid.**
  - It is valid only with `--apply`, and is refused (`REFUSING:`, exit 1) before any env file is
    read when `--apply` is absent or `--verify-only` is present.
  - It makes `applyPlan` throw after every write. The live check of R9 is impossible without it, as
    explained under "Why a flag, not a planted row".
- **Unchanged and outside the transaction:**
  - the pre-write guards: same-host refusal, `assertNotDeployedDatabase`, the occupancy check and
    the seeded-vendor dependents check;
  - `buildPlan` and every copy rule in `scripts/lib/neon-migration-plan.ts`;
  - the post-commit `verifyCounts`;
  - the R2 `copyImages`. Object storage cannot join a database transaction. Its puts are by key and
    idempotent, so a re-run completes them.
- **Docs.**
  - The script's header comment replaces "A failed `--apply` leaves a partial target: reset the
    branch and re-migrate, do not re-run" with the rollback behaviour, and documents
    `--simulate-failure`.
  - `env-setup.md` step 3 replaces its "Reset it, do not re-run it" bullet the same way. A failure
    during `--copy-images` (after the commit) is also re-run safe. The re-run then refuses at the
    occupancy check, because the rows are committed, so images are completed by hand or the target
    is reset. That is stated plainly.

## Timeout rationale

- The plan is small. The runbook's expected staging plan is about 248 products plus their child
  rows and store settings; the issue estimates ~600 rows.
- Prisma's default interactive timeout (5 s) and `maxWait` (2 s) are too tight for a network copy
  from a laptop. Ten minutes leaves two orders of magnitude of headroom.
- The transaction holds locks only on a database nothing else is using: a fresh target that no
  Worker points at yet.
- R10 records the measured duration, so the next copy, or a second cell, can see whether the
  headroom still holds.

## Why a flag, not a planted row

The approved proposal preferred planting a conflicting row in the target over adding a test-only
flag. A planted row cannot produce the failure that matters:

- **A vendor-owned row is refused before the transaction.** The seeded-vendor dependents check
  rejects any row that references the seeded vendor, and the occupancy check rejects any other
  vendor.
- **The other copied models fail too early, or not at all.** Those are `User`, `Account` and
  `Theme`. `insertOrder` visits models alphabetically, depth first, so `User` is the **first** model
  written. Old staging's only users are `@example.com` accounts, which the `User` filter drops, so
  `User` may carry zero rows and never collide.

The proof that matters is that the seeded-vendor delete and many committed-looking chunks across
many models all roll back. That needs a failure **after the last write**, which only the flag
gives deterministically. The flag cannot do harm: it can only abort a transaction.

**The proof of a clean rollback is the clean re-run.** After the simulated failure, a plain
`--apply` against the same target must succeed with `OK: every copied model matches the plan.`:

- A copied row left behind would collide on its original primary key and fail the insert.
- A leftover row the plan would not re-insert would show up as a `MISMATCH` in `verifyCounts`.
- A missing seeded vendor would print `target vendors: empty` instead of `seeded-only`.

## Validation target (precondition)

`scratch` can no longer give a clean target. New staging is now filled, so "Reset from parent" on
`scratch` produces a filled database that the occupancy check refuses. Live validation needs a
**fresh database**:

- A new, empty database (suggested name `validate_1333`) on `Shoplocal Staging` → branch
  `scratch`.
- The owner creates it in the Neon console. An agent must not create infrastructure.
- Its direct URL goes in a git-ignored `secrets/validate-1333.vars` with one `DIRECT_URL` line.
- `migrate deploy` runs into it, then the database is dropped after Validate.

The source is old staging (`secrets/staging.vars`), the same source `#1323` used. The live rows
depend on it still being readable. If the Nocaped staging database returns HTTP 402 (as old
production does), the live rows are UNVERIFIED and blocked, not passed.

## Deliberately excluded

- **Any change to what is copied or how ids are remapped** (`neon-migration-plan.ts`).
- **Image copy changes**, including making `--copy-images` resumable on its own.
- **Protecting the NEW staging/production hosts in `protected-hosts.ts`.** That guard covers only
  the old databases. Adding the new ones is a separate decision, because the script must be able to
  write to new production in `#1341`. The validator checks the target host by hand (R9).
- **A real Postgres error injected mid-transaction live.** The rollback path is the same for any
  error thrown inside the callback. R4 proves a rejected write propagates without being swallowed,
  and R9 proves the rollback live.
- **The `#1341` production run itself.**

## Open items carried forward

- The owner creates the validation database (see "Validation target").
- `#1341` uses this for the production copy.
