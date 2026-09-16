---
id: business-case-kms-plan
title: "Living stakeholder business case as a milestone-reviewed KMS artifact (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-16
visibility: internal
summary: Adds a stakeholder-facing business case to the KMS business-analysis section, and makes reviewing it part of the existing milestone close rather than a second documentation process, with a machine check behind it.
tags: [business-case, kms, sdd, stakeholder, process]
---

# Living stakeholder business case as a milestone-reviewed KMS artifact (plan)

Closes `#777`.

## The problem

Everything a stakeholder would need to judge this platform commercially already exists in the
repository — `specs/roadmap.md`, `specs/architecture.md`, the six ADRs, 51 migrations, 135 spec
slices, a 5,405-line `CHANGELOG.md`. None of it is a commercial argument. There is no single place
that answers what was built, what it costs to run, what it saves against the obvious alternative,
what it could earn, or what remains to be invested.

**The risk is not the missing document. It is the document going quietly wrong.** A business case
written once will, within two milestones, claim capabilities that were descoped, carry pricing that
has moved, and give a reader no way to tell which figures were measured and which were assumed.
This repository has an unusually well-documented history of exactly that failure — `CLAUDE.md`
records four separate cases of a doc asserting a property the code did not have, and the fix in
every case was a mechanical check rather than better prose.

So the deliverable is two things, not one: the document, and the mechanism that keeps it honest.

## What already exists (verified, not assumed)

**The KMS needs no registration step.** `kms/schema/repo.ts`'s `walk()` scans the whole repository
for `.md`/`.mdx`, excluding `node_modules`, `.git`, build output, `.claude/` and
`specs/templates/`. Anything whose front-matter passes `kms/schema/frontmatter.ts` is picked up by
`kms/scripts/build-index.ts`, which writes both `ARTIFACT_INDEX.md` (front-matter only) and
`app/(admin)/staff/runbook/docs.ts` (full body); `kms/scripts/assemble.ts` then copies it into the
internal Nextra site under its derived track. A correct front-matter block **is** the registration.

**Three routing facts decide placement:**

- `trackFor()` (`kms/schema/frontmatter.ts:42`) derives track from `audience`. `staff`, `admin`,
  `store-admin` and `operations` route to `staff-ops`; `customer`/`shopper` to `customer-help`;
  everything else — including `product` and `platform-admin` — to `internal-eng`.
- `/staff/runbook` narrows by audience exactly once, in `lib/runbook-audiences.ts`: `staff` and
  `store-admin` for any viewer who passes the page's role gate, plus `platform-admin` only when
  `auth.via === "platform-admin"`.
- `summary` is capped at 300 characters and `id` must match `^[a-z0-9-]+$`. Both fail only in CI's
  `quality/kms` job, never in `lint`/`typecheck`/`test`/`build`.

**The milestone hook already exists.** `specs/sdd-workflow.md`'s *Milestone close (Discover, then
Learn)* is a five-step sequence run whenever a phase closes, mirrored in
`.claude/commands/document.md` (step 9) and `.claude/commands/learn.md`. `docs/research/` is the
working precedent for what is being asked here: append-only KMS artifacts on a milestone cadence,
with versioned front-matter bumped as part of the close.

## Decisions

**Location: `docs/business-analysis/business-case.md`.** The existing business/stakeholder section,
alongside `product-requirements.md` and `gap-register.md`.

Rejected — `specs/business-case.md`: that tree is the plan of record (mission, architecture,
roadmap, ADRs, slice specs). A stakeholder pitch is not a spec, and putting it there dilutes what
`specs/` means. Rejected — a new `docs/stakeholder/` directory: a second business section when one
already exists, which is precisely the "parallel documentation process" `#777` rules out.

**Audience: `[product, platform-admin]`, visibility `internal`.** This routes the document to the
`internal-eng` track, so it appears in `ARTIFACT_INDEX.md` and in the internal docs site's `/dev`
section, and `lib/runbook-audiences.ts` surfaces it at `/staff/runbook` **only** to a platform
admin.

The `store-admin` audience was considered and rejected on a substantive ground rather than a
stylistic one. This is a multi-tenant platform with a real second vendor (SriMart) whose admins pass
`requireVendorRole("ADMIN")`. The document carries platform cost structure, gross-margin reasoning
and SaaS pricing strategy — commercially sensitive *with respect to the tenants themselves*. The
same reasoning already governs `/staff/errors` (`#508`) and the platform admin guide.

**Update mechanism: extend the existing milestone close.** A review step is added **after `/learn`**
and before the front-matter bump, model switch and `/clear`. Placement matters: Learn is where
"what actually shipped" and "which assumptions held" are established from evidence, so the business
case consumes Learn's output rather than re-deriving it from the same sources and reaching a
different answer.

The same pointer lands in `.claude/commands/document.md` and `.claude/commands/learn.md`. This
repository has paid repeatedly for a ruling that lived in one document — GAP-011 sat deferred for a
phase behind a question `specs/architecture.md` had already answered, because `CLAUDE.md` did not
say so.

**Enforcement: a check inside `scripts/sdd-check.ts`'s `audit()`.** That is the only check in the
loop that runs *after* Ship, at every `/orient`, and it already carries a structurally identical
half — the promotion audit added by `#207`, which exists because every other gate fires at or before
merge. The check compares the document's declared last-reviewed milestone marker against the newest
phase-closure row in the roadmap change log, and reports a gap when a milestone closed afterwards.

Rejected — prose only: the repository's own evidence says an unenforced rule decays. Rejected — a
vitest test: it would run on every pull request and block unrelated work the moment a milestone
closed, which is the wrong pressure point. The review belongs after Ship, not before merge.

**Change recording: an append-only revision-history section inside the document.** Body conclusions
are revised **in place**, so a reader always sees current truth rather than archaeology; the
revision entry names the milestone assessed, what materially changed, and — the part that matters —
what was **withdrawn or corrected**. A separate change-log file was rejected: a stakeholder reading
the case would not open it, and a delta nobody reads is not a record.

## Content discipline

These are requirements on the artifact, not style preferences, and `validation.md` checks them:

- Every capability carries **IMPLEMENTED**, **IN PROGRESS** or **PLANNED**, and cites a file, schema
  model, route or issue. Planned functionality is never written as implemented.
- Every derived number is labelled `ESTIMATE` with its assumption stated where it is used, not in a
  footnote.
- Every external price carries its source and retrieval date, and is re-researched at each review.
- Written as business outcomes. A stakeholder should not need to know what a driver adapter is.

## Two constraints that shape the whole artifact

**There is no trading data.** `#113` is open: production runs Stripe **test-mode** keys and the
storefront has not opened to customers. `#104` is open: Resend has no verified sending domain, so no
customer email can be delivered in any environment. Every saving in this document is therefore
**modelled at stated order volumes** and must never read as realised. A business case that implies
revenue this platform has not earned is worse than no business case.

**There are no invoices in the repository.** Operating costs are modelled from published vendor
pricing, retrieved 2026-09-16 and cited. Replacing them with actual spend is recorded as an open
item for a later review rather than quietly estimated forever.

## Scope

| Change | File |
| --- | --- |
| The artifact | `docs/business-analysis/business-case.md` (new) |
| Process | `specs/sdd-workflow.md` — milestone-close step |
| Process | `.claude/commands/document.md`, `.claude/commands/learn.md` |
| Enforcement | `scripts/sdd-check.ts` — `audit()` staleness check |
| Enforcement | `tests/business-case-review.test.ts` (new) |
| Generated | `ARTIFACT_INDEX.md`, `app/(admin)/staff/runbook/docs.ts` |

## Out of scope

- Any change to the four SDD gates. The review is part of milestone close, which is explicitly not
  a gate — the same reasoning that keeps Discover and Learn non-gating: evidence a merge depends on
  gets written to pass rather than to be true.
- A public-facing version of this document. `visibility: internal` throughout.
- Actual spend instrumentation or a cost dashboard.
