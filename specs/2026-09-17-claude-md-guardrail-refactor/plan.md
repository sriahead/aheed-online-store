---
id: claude-md-guardrail-refactor-plan
title: "CLAUDE.md guardrail refactor — reduce always-loaded context (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-17
visibility: internal
summary: Reduce CLAUDE.md from 149,380 characters to under 10,000 by relocating every rule to six existing and three new authoritative documents under a line-by-line migration ledger, repointing every inbound reference, and reconciling five false statements.
tags: [documentation, guardrails, kms, context-cost]
---

# CLAUDE.md guardrail refactor — reduce always-loaded context (plan)

**Goal:** cut the fixed per-session context cost of `CLAUDE.md` from **149,380 characters to under
10,000**, without losing a single rule, and correct five statements in it that are false against the
repository. Every session pays this file's full size before any work begins, regardless of the task.

Issue: **#786**. Implements the resolutions for **#584** and **#546**, which are closed at Ship.

## Why this is not a tidy-up

`CLAUDE.md` is read every session and treated as authoritative. Its size is one problem; its
**accuracy decay** is the more serious one. Five statements in it are currently false, and one of
them — "Currently at Milestone 0 (walking skeleton) — no features until M0 is green" — is the second
paragraph of the file. `specs/roadmap.md` records M0 as closed on **2026-08-06**; the project is at
**P10**, with work promoted to production as recently as 2026-09-16.

The file also has a structural cause for its growth, which this slice addresses directly: roughly
40k of it duplicates documents that already own the material, and the rest is incident-derived
operational knowledge with **no other home**. Without creating those homes, the same accumulation
restarts the day after this slice ships.

## Scope (this slice)

**1. Reduce `CLAUDE.md` to under 10,000 characters.** It keeps only what a session needs before it
knows what it is working on: project identity, runtime/hosting constraints, the database rules that
fail silently, schema/storage/config rules in summary, commands, branch and CI rules, the SDD gates,
short named sections for each subsystem, and hard stops. Everything else becomes a plain pointer
naming the document to read when that area becomes relevant.

**2. Relocate every rule first, remove second — with completeness measured by line, not by bullet.**
Six existing documents take the material they already own; three new documents are created for the
classes that genuinely have no owner:

- `docs/developer-portal/runtime-pitfalls.md` — code that passes `lint`, `typecheck`, `test` and
  `build` and still fails at runtime on Workers.
- `docs/developer-portal/app-conventions.md` — per-layer authoring invariants and the tests that
  enforce them.
- `docs/developer-portal/local-dev-playbook.md` — working on this repo on Windows, and proving
  something live without a browser.

**3. Repoint every inbound reference.** 14 documentation references point into sections being moved,
two of them **circular** (`specs/architecture.md` §3.1 and `docs/business-analysis/gap-register.md`
both defer the raw-SQL exception's scope to "CLAUDE.md's schema rules", which cites §3.1 back).

**4. Preserve every section name cited from source.** 93 source files carry 207 mentions of
`CLAUDE.md`, many naming a specific section. Source is **not edited** in this slice, so each cited
name must survive as a real heading carrying one to three lines plus a pointer. This is why the
reduced file keeps several short named sections rather than one merged block — a
citation-preservation constraint, not a stylistic choice.

**5. Reconcile five false statements, each from repository evidence.** Recorded with the command
that establishes the truth, so a fresh-context validator can re-derive it rather than trust this
file.

## Ownership boundary after this slice

> **`CLAUDE.md` answers one question: what would a session get wrong in its first five minutes, on
> any task, if nobody told it?**

A rule belongs there only if it is unpredictable from training defaults, applies regardless of which
subsystem is in play (or names the document to open), and fits in one to three lines. Evidence,
incident narrative, issue archaeology, reproduction steps and command recipes belong at the
destination, not in the always-loaded file.

The three new documents are separated by **when a reader needs them**, which is what keeps them from
becoming a second overlapping layer:

| Document | The reader's situation |
|---|---|
| `runtime-pitfalls.md` | "It is broken and nothing warned me." |
| `app-conventions.md` | "I am writing a file in this layer." |
| `local-dev-playbook.md` | "I am running something on this machine." |

A fact that fits two of these means the boundary is drawn wrong; it gets re-cut, not cross-posted.

## Target structure for the reduced `CLAUDE.md`

The builder does not need to re-derive this. Section names marked **cited** are named from source
code and must survive verbatim enough to satisfy `R7`; the character figures are the budget the
Gate 1 estimate was built on, not a requirement.

| Section | Budget | Notes |
|---|---|---|
| front-matter | 400 | `id: claude-md` unchanged; version 2.0.0 |
| Title, read-first line, pointer table | 750 | The table naming which document to open per area |
| What this project is | 300 | Carries the P10 correction |
| Runtime and hosting | 550 | Kept substantially verbatim — highest value per character in the file |
| Database and Prisma | 1,350 | **cited.** The seven silent-failure rules, nothing else |
| Schema and data rules | 500 | **cited.** Points at `specs/architecture.md` §3.1 |
| Storage | 300 | **cited.** Points at ADR-003 |
| Config and secrets | 600 | **cited.** Points at `env-setup.md` |
| Commands | 500 | New — currently scattered through prose and never listed together |
| Branch strategy and CI | 550 | **cited.** Points at the operator runbook |
| The four SDD gates | 1,000 | Gates, loop names, two machine checks, the two user-invoked rules |
| Dependency discipline | 350 | **cited.** Pins, no forced audit fix, no mid-stream majors |
| Server Actions | 200 | **cited** (11 mentions — the most-cited section in the repo) |
| Repository layer | 250 | **cited** |
| Staff panel pages | 220 | **cited** |
| Design tokens and branding | 200 | **cited** |
| React and Next.js Hooks | 130 | **cited** |
| Windows and local dev | 300 | Three imperatives only |
| Live validation | 150 | Pointer to the playbook |
| Hard stops | 450 | Kept verbatim |
| `nextjs-agent-rules` block | 678 | Kept verbatim — `next dev` rewrites it if removed |

Estimated total **approximately 9,700**, inside `R1`'s ceiling of 10,000. The ceiling is the
requirement; this table is the plan for meeting it.

## Where each of the 23 current sections goes

| Current section | Chars | Disposition | Destination |
|---|---|---|---|
| What this project is | 255 | Compress, correct | — |
| Runtime and hosting | 537 | Keep | — |
| Database (Neon + Prisma) | 7,050 | Compress | `architecture.md` §3.0, `runtime-pitfalls.md` |
| There are TWO databases | 4,113 | Compress, fold into Database | `architecture.md` §3.0, `env-setup.md` |
| Schema rules | 7,636 | Compress | `architecture.md` §3.1 |
| Storage (ADR-003) | 4,537 | Compress | ADR-003, `env-setup.md`, `runtime-pitfalls.md` |
| Cloudflare edge caching | 1,559 | Move | `runtime-pitfalls.md` |
| Config and secrets | 13,182 | Compress | `env-setup.md` |
| Branch strategy and CI/CD | 12,298 | Compress | `sdd/operator-runbook.md` |
| The four SDD gates | 6,860 | Compress | `sdd-workflow.md` |
| Windows shell and encoding | 23,497 | Compress, largest delete | `local-dev-playbook.md` |
| Dependency discipline | 8,186 | Compress | `tech-stack.md`, `runtime-pitfalls.md` |
| Server Actions | 1,967 | Compress | `app-conventions.md` |
| Repository layer | 9,728 | Compress | `app-conventions.md` |
| Staff panel pages | 7,325 | Compress | `app-conventions.md` |
| KMS docs | 5,323 | Compress | `sdd-workflow.md` (Spec stage) |
| Design tokens and branding | 7,236 | Compress | `design-system.md` |
| Workers AI | 2,563 | Move | `runtime-pitfalls.md` |
| Local Stripe webhook testing | 4,546 | Move | `env-setup.md` (existing Stripe section) |
| Live-testing server actions | 12,243 | Move | `local-dev-playbook.md` |
| Better Auth | 4,260 | Compress | `runtime-pitfalls.md` |
| React and Next.js Hooks | 771 | Compress | `app-conventions.md` |
| Hard stops | 950 | Keep | — |

This table is the shape of the work. `migration-ledger.md` is the proof, at a finer grain than the
section.

## Why the ledger counts lines, not bullets

The first draft of this spec proposed inventorying rules by extracting lines beginning `- `. That
extractor returned 130 rows across 23 sections and looked authoritative. It was not: it is blind to
every rule expressed in any other Markdown form, and an audit of the pre-change file found that the
blind spot contains some of the most important content in it.

| Lines | Form | What the bullet extractor could not see |
|---|---|---|
| 592–595 | numbered list | **The four SDD gates** — the most load-bearing block in the file |
| 596 | prose | The per-PR requirements line, which is `#546`'s subject |
| 43–44 | nested bullets | The `getPrisma()` / `getPrismaWs()` hybrid-client split |
| 598–619 | prose | The ten-stage loop, the two Clears, the three milestone stages |
| 653–656 | prose | Gate 4 landing in `/build-notes`; the two machine checks |
| 668–675 | prose | The delivery board, including the "status only" claim (`#724`) |
| 16–23 | prose | The read-first instruction and the project identity paragraph |
| 467, 472 | nested numbered | The two branch-protection controls |
| 1073, 1078 | nested bullets | The two repository-layer halves and the tests enforcing them |

The census is 130 top-level bullets against 4 nested bullets, 6 numbered items and 83 left-margin
prose lines. A bullet count can never prove nothing was lost, because a rule can vanish simply by
not having been a bullet.

So the unit of account is the **line**. Every non-blank line below the front-matter — 1,599 of them,
lines 14 through 1651 — must be claimed by exactly one ledger row (`R5`). Markdown form stops
mattering, because form is no longer what is counted.

To keep that from inflating the inventory with examples and history, a `DELETE` row must classify
itself as either `DUPLICATE` — naming where the rule is already stated — or `NARRATIVE` — naming the
ledger row whose rule it evidences (`R6`). Narrative is **accounted for**, never **counted as a
rule**, and a `NARRATIVE` row may not be the only row covering a rule. That is what stops "it was
only history" from becoming the route by which a guardrail disappears.

## Ship and Document obligations (deliberately not Gate-3 requirements)

Issue closure needs a PR identity that does not exist during validation, and gating Gate 3 on it
would make a passing slice unverifiable until after it merged. Validation therefore proves the
*implementation* that resolves each issue — `R14` for `#546`, `R15` for `#724`'s overlap, `R16` for
`#584`, `R13` for `#505`'s overlap — and the following happen at Ship and Document, after validation
passes:

- Close **#584** with a comment naming this slice's PR and stating that the baseline was removed
  rather than relocated or re-enforced.
- Close **#546** with a comment naming the PR and stating that the label requirement was dropped,
  not satisfied by creating labels.
- Comment on **#724** recording that only the `CLAUDE.md` "status only" claim was corrected, and
  that `.claude/commands/orient.md` and `specs/roadmap.md` remain. Leave it **open**.
- Comment on **#505** recording that only the `CLAUDE.md` prose was corrected, and that the two
  spaced keys in the env files remain. Leave it **open**.

## The five reconciliations

| Finding | Repository evidence | Correction |
|---|---|---|
| Milestone 0 | `specs/roadmap.md` change log: M0 closed 2026-08-06; 2026-09-16 rows show P10 delivery cluster and reference data in production. `#113` and `#104` confirmed OPEN | State P10; M0 through P9 shipped; the platform has never traded, gated on `#113` and `#104` |
| `@prisma/adapter-neon` version | Installed, declared and asserted by `tests/dependency-pins.test.ts` as **7.9.1**; the Database section says `6.19.3` while the dependency section says 7.9.1 | Correct to 7.9.1; record the 6.x-client / 7.x-adapter straddle as deliberate, tracked by `#560` |
| `.env` format | Census of all four env files: 19–22 keys use `KEY=value`; exactly two use the spaced form, the same two everywhere (`UK_LOCATION_REF_DATABASE_URL`, `UK_LOCATION_REF_DIRECT_URL`, added by `#764`) | The no-spaces rule **stands**. Replace the over-generalisation with the surviving lesson: two keys carry spaces, so an env-rewriting script must tolerate both — an anchored substitution on the unspaced form silently matches nothing. Cross-reference `#505` |
| PR labels (`#546`) | `gh label list` returns only `gate:4` and `phase:P9.2` | Drop the label clause; `Closes #NN` plus the CHANGELOG entry remain. The board's Phase field and the GitHub milestone already carry phase. Closed at Ship |
| Delivery board (`#724`) | `gh project field-list 2` shows `Priority` as a real single-select field | Correct the "status only" claim. `#724` **stays open** for its `.claude/commands/orient.md` and `specs/roadmap.md` halves |

## The vitest baseline (`#584`)

The hardcoded suite baseline is **deleted, not relocated**. Its only job was spotting a silent
forks-pool shortfall, and it has drifted roughly twenty times — each time quietly disabling the
detection it existed to provide. Re-running the same tree establishes a shortfall without any
recorded number: a second run reporting fewer files than the first is the trap. No manually
maintained count is introduced anywhere, in `CLAUDE.md` or at a destination. `#584` is closed
at Ship, once a PR identity exists.

## Deliberately excluded

- **Any application source, behaviour, config or environment change.** `git diff --stat` must show
  no file outside `*.md` except the two generated artifacts named in `R19`. This is also why the 207
  source citations are handled by preserving headings rather than by editing comments.
- **Editing `.env`, `.dev.vars` or `secrets/*.vars`.** Normalising the two spaced keys is `#505`'s
  own half — a live-config change with real breakage risk, no part of a documentation refactor.
- **`.claude/commands/orient.md` and `specs/roadmap.md` Priority handling.** `#724`'s remaining
  half; widens scope into command behaviour.
- **Creating `phase:*` / `gate:*` labels.** The rule is dropped instead, per the Gate 1 decision.
- **`@path` imports.** They would relocate the context cost rather than remove it, which is the
  entire objective.
- **A fourth new document.** Three is the ceiling. A fact that will not sit in one of them means a
  boundary is wrong and gets re-cut.
- **Rewriting the relocated prose for elegance.** Content moves substantially verbatim so the move
  is reviewable as a diff rather than as a rewrite. Compression happens in `CLAUDE.md`, not at the
  destination.

## Open items carried forward

- **`#724`** — board Priority field: `CLAUDE.md`'s half corrected here; the command and roadmap
  halves remain open.
- **`#505`** — two env keys use the spaced form: prose corrected here; the files are untouched.
- **`#560`** — the Prisma client/adapter major straddle: recorded accurately, not resolved.
- **`#423` / `#712`** — the docs-site build dirties `kms/site-internal/next-env.d.ts`, which can
  trip `sdd:preclear`'s clean-tree check after `R18`'s build. Known, handled at build-notes time.
