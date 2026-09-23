---
id: kms-enforcement-foundation-plan
title: "KMS enforcement foundation (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-22
visibility: internal
summary: "Repairs the three broken KMS enforcement controls — the machine-dependent walker, visibility-blind assembly and non-exhaustive track derivation — resolves U7, and lands the coverage ratchet before the section 24 migration is specified."
tags: [kms, governance, ci, documentation]
related: [kms-strategy-evaluation, kms-pilot-orders-fulfilment-plan, sdd-workflow]
---

# KMS enforcement foundation (plan)

Closes `#861`.

## Goal

Repair the three KMS enforcement controls that do not currently work, resolve unresolved decision
**U7**, and land the coverage ratchet — **before** the restructuring migration is specified.

The KMS strategy (`specs/2026-09-22-kms-pilot-orders-fulfilment/kms-strategy-evaluation.md`, v2.0.0)
section 24 step 8 is explicit that the ratchet "lands at step 6, not step 10 — it must guard the
migration, not follow it". The Steps 1 to 4 analysis run on 2026-09-22 at `b889d04` found that the
controls it would guard with are themselves broken. A migration validated against a broken router
proves nothing, so the controls are repaired first.

**This slice restructures no documentation and changes no document body.** The only edits to
existing documents are the removal of front-matter blocks from 18 slice-local files (R4), which is
the U7 decision being applied, not a content change.

## Scope

### 1. The walker is machine-dependent

`kms/schema/repo.ts`'s exclusion list does not mention `graft/`. That directory is gitignored
(`.gitignore` line 38) and untracked — `git ls-files graft/` returns nothing — so it exists on a
developer machine that has run the graft indexer and never exists on a CI checkout.

Measured at `b889d04`: `npm run kms:validate` scans 1,281 files locally and reports 1,069 without
front-matter, of which **653 are `graft/` cards**. The same command on a CI runner scans roughly 628
files. Any baseline, count or ratchet derived from that walker is therefore a different number in
the two places it matters, which makes the ratchet unimplementable until it is fixed.

### 2. Assembly ignores `visibility` entirely

`kms/scripts/assemble.ts` chooses a destination with `trackFor(fm)` and then filters on
`dest.site !== visibility`, where `visibility` is the command-line flag naming the site being built.
It **never reads the document's own `visibility` field**. The field the schema comment calls out as
the one that must never default is not consulted at the only point where it would have an effect.

Live consequence: `docs/operations-research/order-fulfilment-core.md` declares
`visibility: internal` with `audience` including `shopper`. `trackFor()` tests for customer
audiences first, returns `customer-help`, and the document is routed to the **public** site. Verified
by search: no `order-fulfilment-core.mdx` exists anywhere under `kms/site-internal/content/`. The
canonical orders document produced by the `#851` pilot is absent from the only deployed KMS surface
and is queued for a public surface it is not cleared for. Nothing has leaked only because the public
site has no application, no build and no deploy workflow.

### 3. Track derivation is not exhaustive and picks the wrong winner

`trackFor()` returns the **first** matching branch rather than the most restrictive track its
audience list touches, which is what strategy section 4.2 requires. `platform-admin` appears in the
`Audience` enum and in no branch at all, so `docs/platform-admin-guide/platform-admin-guide.md`
falls through to `internal-eng` — the fall-through the strategy names as problem 5 in section 2.3.

The corrected precedence is **`staff-ops` then `internal-eng` then `customer-help`**: a document
reaches the public surface only when it touches no internal audience whatsoever. Measured against
all 212 covered documents, this moves exactly four:

| Document | Current | Corrected |
| :--- | :--- | :--- |
| `docs/operations-research/order-fulfilment-core.md` | customer-help | staff-ops |
| `specs/2026-09-22-kms-pilot-orders-fulfilment/plan.md` | customer-help | staff-ops |
| `docs/platform-admin-guide/platform-admin-guide.md` | internal-eng | staff-ops |
| `docs/business-analysis/business-case.md` | internal-eng | staff-ops |

Every one of the four is a correction. The resulting distribution is internal-eng 195, staff-ops 16,
customer-help 1 — and the single customer-help document is `docs/shopper-help/shopping-guide.md`,
the one document in the repository carrying `visibility: public`.

**That alignment is what makes requirement R9 safe to land as a hard failure**: after this change,
every document's derived track agrees with its declared visibility, so a check that fails on
disagreement passes on day one and can only ever catch a regression.

The alternative precedence — engineering first — was rejected: it sends `order-fulfilment-core.md`
into the `dev/` section, which reaches the site but files a staff operations document under
engineering.

### 4. U7 — the 403 slice-local files

`specs/templates/feature-spec/build-notes.md` states the rule in its own body: *"No front-matter —
like `requirements.md` and `validation.md` this is slice-local, not a KMS artifact, and it does not
get an `ARTIFACT_INDEX.md` entry."* `specs/sdd-workflow.md` lines 291 to 294 says the same, and
under strategy section 11.3 `sdd-workflow.md` is **authoritative** for delivery process.

So the 403 files are a **deliberate exclusion, not a coverage gap**, and strategy section 2.3
problem 1 mischaracterises them. This slice applies the authoritative rule in code:

- `kms:validate` reports slice-local files as their own expected category, not as warnings.
- `kms:validate` **fails** when a slice-local file carries front-matter, so the rule is enforced in
  both directions rather than merely tolerated in one.
- The 18 files that already stray into carrying front-matter have it removed. Verified: **zero
  inbound `related` references** to any of their ids, so no link breaks, and every one of the 150
  slice directories keeps its `plan.md` entry, so no slice loses its only index entry.

`ARTIFACT_INDEX.md` goes from 212 to 194 artifacts and `app/(admin)/staff/runbook/docs.ts`
regenerates to match.

### 5. The coverage ratchet

A checked-in baseline records the count of uncovered files per directory; CI fails when the real
count and the baseline disagree, and an update flag rewrites the baseline deliberately. This is the
same ergonomic contract as `kms:check-generated`, which this repository already runs and trusts.

Failing on **any** mismatch rather than only on an increase is a deliberate strengthening of
strategy section 19.2. An increase-only check lets a reduction be silently given back later; making
every change to the baseline an explicit, reviewed commit is what "each reduction locked in"
actually requires, and it matches how the generated artifacts are already governed here.

After items 1 and 4 the real backlog is **15 files in 8 directories**, not 1,042 — which is what
makes the ratchet meaningful rather than a warning that has already been emitted a thousand times.

Two of those 15 sit inside dated slice directories and are deliberately **not** treated as
slice-local: `specs/2026-08-19-p7-closeout/rls-experiment.md` and
`specs/2026-09-17-claude-md-guardrail-refactor/migration-ledger.md`. The slice-local predicate is
exactly the three template filenames and nothing else, because widening it to "any file in a slice
directory" would also swallow `kms-strategy-evaluation.md`, which is a real indexed KMS document
living in the pilot's slice folder. Those two files stay in the baseline at one each, which is the
honest record: they are uncovered documents that a later migration slice can either cover or accept.

## Deliberately excluded

- **Any front-matter migration** of the 43 living documents or the 169 slice documents. That is
  section 24 step 6 and it is gated on the strategy being approved.
- **Any file move, rename or deletion.** The pilot's R8 constraint holds permanently.
- **Amending `kms-strategy-evaluation.md`.** It stays `status: review`. Three of its figures are
  wrong — `owner` is 0 of 212 and not 1, because the measuring grep matched the document's own
  section 10.3 worked example; the 1,042 baseline is machine-dependent; and section 2.3 problem 1
  mischaracterises the slice-local files. Shipping R3 and R4 puts working code in contradiction with
  that document, which under strategy section 11.2 is recorded rather than silently reconciled.
  **Deferred to its own docs slice, to land before the strategy is approved** — see "Deferred" below.
- **`restricted` as a third visibility value (U2).** The enum stays two-valued. Adding it is cheap
  once assembly reads the field at all, which is what R7 delivers, but it is a schema change and is
  not needed by anything in this slice.
- **A fourth `client` track (strategy section 4.2).** Three tracks are kept; the client surface is
  U5 and is still a design.
- **The owner registry (U8), the security source (G1), any Start Here page, the public help centre
  (U5), the `doc`-to-`reference` taxonomy change, and the 2.56 MB `docs.ts` payload.**
- **`#857`** (gitignore misses assembled content) and **`#685`** (pre-commit cannot tell a generated
  artefact from source). Both out of scope by explicit instruction.

## Deferred, with a home

| Item | Where it goes |
| :--- | :--- |
| Correcting strategy sections 2.2 and 2.3 and recording U7's resolution in it | its own docs slice, before the strategy is approved |
| U8 (KMS owner), G1 (security source), U2, U3, U5 | strategy approval, then section 24 step 5 |
| Front-matter migration of the 43 living documents | section 24 step 6, domain by domain |
| `2026-08-21-view-switcher` has no `validation.md` | detectable-missing check, strategy section 19.3 |
| Two competing gap registers; two architecture surfaces | section 24 step 6 |

## Persistent documentation

**No persistent document needs updating for this slice**, and that is a finding rather than an
omission. Searched at `b889d04`: `specs/architecture.md` contains no KMS section, `specs/tech-stack.md`
mentions the KMS only as a CI status-check name, and `docs/developer-portal/repo-structure.md`
mentions it only as a future user guide. The KMS routing and visibility rules are documented
nowhere except the schema file's own comments, so that file's comments are the permanent home and
are updated in place alongside the code.

U7 needs no persistent-doc change either: `specs/sdd-workflow.md` already states the rule this slice
enforces, and this slice makes the code agree with it rather than changing it.

That the KMS has no entry in any architecture document is itself a gap. It belongs to the section 24
step 6 migration, not here.

## Rationale

The ordering is forced. Items 1 and 4 set the denominator; item 5 cannot be written until that
denominator is the same on both machines. Items 2 and 3 are the access control the migration will
be validated against; repairing them after the migration would mean the migration was checked
against a router that could not tell an internal document from a public one.

Everything here is inside `kms/`, plus two checked-in generated artifacts, one workflow file and one
test file. No application code, no schema, no migration.

## Risks

- **The diff looks larger than the change.** `ARTIFACT_INDEX.md` and
  `app/(admin)/staff/runbook/docs.ts` are checked-in generated files; removing 18 documents and
  re-routing 4 rewrites a lot of lines in both. Neither is hand-edited.
- **`tests/kms-frontmatter.test.ts` currently asserts the behaviour being corrected.** It states that
  a `dev` plus `customer` audience derives `customer-help`. Under the new precedence that is
  `internal-eng`. The test is updated as the visible statement of the change (R14), not deleted.
- **The internal docs site gains two documents and moves two between sections.** That is the intended
  outcome, and `deploy-docs-internal` must be watched on the merge.
