---
id: sdd-operator-runbook
title: SDD Operator Runbook
audience: [dev]
type: runbook
status: approved
version: "1.0.0"
updated: 2026-08-25
visibility: internal
summary: Human-executable manual for the SDD delivery loop — Orient, Propose, Spec, Build, Document, Validate, Fix, Ship, Document — covering what each stage does behind the scenes, how to run it by hand, how to verify it worked, and how to diagnose and recover when it doesn't.
tags: [runbook, sdd, workflow, process, operations]
related: [sdd-workflow, onboarding]
---

# SDD Operator Runbook

This is a manual for a human operator, not project documentation for end users. It exists so that
anyone — including a human with no Claude Code session running — can pick up the automated
"SDD loop" (Orient → Propose → Spec → Build → Document → Clear → Validate ⇄ Fix → Ship →
Document → Clear) by hand: run the same commands, read the same files, recognize the same failure
modes, and make the same judgment calls the assistant would.

It is scoped to **this repository's** implementation of the loop. The loop pattern itself
(spec-before-code, validate-from-a-fresh-context, document-before-clearing) is a generic discipline
that would transfer to another project; the concrete commands, script names, board ID, and file
paths below are **this repo's** wiring of it. Where a section is the general pattern, it says so;
where it's this repo's specific instance, it's marked "in this repo" or given as a live example.

**This document is a living artifact.** Whenever `/build-notes` or `/document` surfaces a new
failure mode, diagnostic trick, or decision point, it belongs here — not just in that slice's own
`build-notes.md`. See "Keeping this runbook current" at the end.

The authoritative source this runbook is derived from is `specs/sdd-workflow.md` — read that first
if the two ever disagree; this file explains *how to do the same thing by hand and what to do when
it breaks*, `specs/sdd-workflow.md` is the process definition itself. The individual stage
instructions Claude Code actually runs live in `.claude/commands/stage-name.md`.

---

## The loop, at a glance

```
ORIENT -> PROPOSE -> SPEC -> BUILD -> DOCUMENT (build notes)
                                        |
                                     CLEAR  <- switch to a "fresh" reviewer model/session
                                        |
                                   VALIDATE <-> FIX
                                        | (passes)
                                      SHIP
                                        |
                              DOCUMENT (final, incl. index rebuild)
                                        |
                                     CLEAR  <- switch back, loop to ORIENT
```

**Why it's shaped like this.** A session (human or AI) that just built something is the worst judge
of whether it matches the spec — it remembers the *intent* and reads that intent into the code
instead of checking the artifact against what was actually written down. The loop forces a hard
reset (a context Clear, or literally handing the work to a different reviewer) between "build" and
"validate" so the check runs against the spec-on-disk, which is the only version of the spec a
future maintainer will ever have. **The cost this buys**: everything load-bearing — decisions,
deviations, known-shaky areas, deferred items — must be written to disk *before* the reset. Anything
that only exists in a conversation or in someone's head is gone once the reset happens.

**The four non-negotiable gates**, expanded across this loop's stages:

| Gate | Enforces | Lands at |
|---|---|---|
| 1 — Propose before work | An issue + approval exist before implementation starts | Propose |
| 2 — Spec before code | `requirements.md` exists before source changes | Spec (mechanically checked at commit — see below) |
| 3 — Validate before done | Lint/typecheck/test/build + the spec's own validation table all pass | Validate (mechanically checked in CI) |
| 4 — Changelog before merge | A CHANGELOG entry lands on the branch before it merges | Document (build notes) (mechanically checked at push and in CI) |

## The two machine checks

Two commands turn the loop's two honor-system promises into exit codes. **In this repo**, both live
in one script (`scripts/sdd-check.ts`) and share its base-ref resolution logic with the git hooks
below.

| Command | Runs at | Question it answers |
|---|---|---|
| `npm run sdd:preclear` | End of Document (build notes), before the first Clear | Would clearing right now destroy anything? |
| `npm run sdd:audit` | Start of Orient | Did the *previous* loop's last shipped slice — and last promotion — actually get documented? |

Generic pattern: any project running this loop should have an analogous pair — one gate that blocks
the destructive reset until everything is on disk, one gate that runs *after* the point where every
other check has already fired, because nothing else in the loop checks anything after Ship.

**Neither check is a substitute for judgment.** `sdd:preclear` proves files exist and the tree is
clean — not that the build notes are any good. `sdd:audit` proves a roadmap row *mentions* a slice —
not that the row is worth reading.

### `sdd:preclear` — exact mechanics (this repo)

1. Rebuilds `ARTIFACT_INDEX.md` in memory and diffs it (with the timestamp/commit footer stripped)
   against what's on disk. Stale index = failure. If the only difference *was* the footer, it
   restores the original bytes so a footer-only rebuild doesn't masquerade as real uncommitted work
   in the clean-tree check below.
2. Resolves a base ref: `origin/staging`, else `origin/main`, else "offline, don't block."
3. Diffs `HEAD` against that merge-base to find every `specs/YYYY-MM-DD-slug/` directory touched
   (committed *or* still dirty) on this branch.
4. For each such slice directory, confirms `plan.md`, `requirements.md`, `validation.md`,
   `build-notes.md` all exist, and that `build-notes.md` contains all four required headings
   (`## What changed and why`, `## Decisions taken during the build`, `## Deviations from the spec`,
   `## Known-shaky areas`) — these must match `specs/templates/feature-spec/build-notes.md` exactly,
   because the check does a literal substring match.
5. Confirms `CHANGELOG.md` is in the diff against the base ref (Gate 4).
6. Confirms `git status --porcelain` is empty.

Exit 0 only if all of the above pass. It does **not** check that the build notes say anything
useful, that a persistent doc got updated, that deferred items became issues, or that a worktree's
work is accounted for — those are still on the operator.

### `sdd:audit` — exact mechanics (this repo)

1. Reads a baseline constant (`LOOP_BASELINE_SLICE`, currently `2026-08-10-p3d-shop-your-list`) —
   slices dated on/before it predate this loop and are deliberately not policed.
2. For every `specs/date-*/` directory dated after the baseline: checks `specs/roadmap.md`'s
   change-log table for a row whose text contains the literal string `specs/slice/` (not just the
   slice's name in prose — a row has to cite the *path*), and checks `ARTIFACT_INDEX.md` for
   `specs/slice/plan.md`.
3. Separately, lists every `staging -> main` PR merged since the baseline date (`gh pr list --base
   main --state merged`) and checks the roadmap for a row citing `PR #n` literally. A promotion
   merged *after* the roadmap's last edit is reported as "pending carry-forward," not a failure —
   its row can only land on the next slice's branch. If `gh` is unavailable or unauthenticated, this
   half is **skipped**, not passed — a skip line in the output is not a clean bill of health.
4. Exit 1 if any gap was found; the message says to fix it **on the current branch**, not to note it
   and move on, because this is the only check in the whole loop that runs after Ship — a gap here
   is real undone work, not noise.

## The delivery board

**In this repo**: GitHub Project `#2` "Aheed Online Store — Delivery" (owner `sriahead`), read/write
via `gh project item-*` and `gh issue *`. It is a generated **view**, not a second plan — scope and
acceptance criteria live only in `specs/`; the board holds status only.

The one rule every stage has to respect: **`Done` means in production, not merged.** Slice PRs merge
into `staging`, not the repo's default branch, so a PR's `Closes #NN` does not fire on that merge —
the issue only closes (and the board only shows `Done`) when the work is promoted `staging -> main`.
A staging-only merge should show **In Review**. This is why open issues for already-staging-deployed
work are *expected*, not a backlog leak — and why a board reconciliation pass (Document (final))
exists at all.

| Stage | Board action |
|---|---|
| Propose | Issue added to the project, Phase set, Status left at **Backlog** |
| Build | Move to **In Progress** |
| Ship — merged to staging | Move to **In Review** (never Done yet) |
| Ship — promoted to main | Issue auto-closes → **Done** |
| Document (final) | Reconcile the whole board against reality |

**Observed failure mode (found live during a 2026-08-25 Orient on this repo):** three issues whose
code was already merged to staging — two slices' worth — still showed **Backlog**, and a third
showed **In Progress** despite being fully merged. The board had simply never been reconciled because
the Document (final) pass for those slices hadn't run yet. Nothing enforces this mechanically; a
stale board is only caught by a human or an agent actually comparing `gh project item-list` output
against `git log` / `gh pr list`, which is exactly what Orient step 6 and Document (final) step 4
below exist to do.

## CI ("gates") — what actually runs, and what it does not

**In this repo**, `.github/workflows/gates.yml` runs on every PR into `staging` or `main`: `npm ci`
→ `db:generate` (schema-only, no DB connection) → `lint` → `format:check` → `typecheck` → `test` →
KMS front-matter validation → an ARTIFACT_INDEX staleness re-check (same diff-and-strip-footer logic
as `sdd:preclear`, run independently in CI so a local skip still gets caught) → the Gate 4 CHANGELOG
diff check (against `origin/base-branch`, fetched fresh in CI — this is why a moved PR base can make
a diff that existed locally vanish in CI).

**What it deliberately does not run**, because it would slow down every PR for something only a
minority touch: the internal docs site build (`kms:assemble:internal` + a real Next build in
`kms/site-internal`). A change to `docs/*.md` or `specs/*.md` that breaks that build passes `gates`
clean and only fails on the *next* push, on a separate `deploy-docs-internal` workflow — see the
Validate section's docs-specific note below. (This document is itself one of those files — it goes
through that exact pipeline to reach the internal site you may be reading it on.)

Separately, `deploy-staging.yml` (on push to `staging`) and `deploy-production.yml` (on push to
`main`) each run `prisma migrate deploy` against the **direct** (unpooled) database URL, then build
and `wrangler deploy`. These are the only places a migration actually reaches a shared database in
the normal flow — CI applies migrations, not a developer's machine, not the Worker at request time.

---

## Global cross-cutting gotchas

These aren't tied to one stage — they recur across several and are worth knowing before starting
any of them.

- **A worktree's work is invisible to every check run from the main checkout.** If a Build happened
  in an isolated sub-agent worktree (`.claude/worktrees/id/` in this repo's convention, on its own
  branch), `git status`, `git log`, `sdd:preclear`, and a plain read of the main directory all report
  clean/unaware — none of them look one level down. `git worktree list` is the only thing that
  surfaces it. **First observed 2026-08-25 in this repo**: a fresh Validate context found nothing
  wrong by every check it knew to run, because it never ran `git worktree list`; a human had to name
  the path before the work was found. Run `git worktree list` at the start of Orient and Validate as
  a matter of course, not just when something already looks wrong.
- **A Windows checkout can disagree with Linux CI on formatting/line-endings.** `core.autocrlf`
  rewrites line endings on checkout, which can make `prettier --check` flag files that are genuinely
  fine on the real CI runner. When local and CI disagree, **CI is the authority** — verify by
  diffing the actual committed blob (`git show HEAD:file`) rather than reflexively reformatting.
- **A `.env`/config value can point somewhere different than you expect.** If a project reads config
  from more than one source with a defined precedence (e.g. a deploy-context override vs. a local
  file), a live check can silently validate against the wrong target if you didn't confirm which one
  is actually in effect before starting. Compare *before*, not after a confusing result.
- **A destructive git operation always needs a `git status` first.** Before anything that can
  discard uncommitted work (`checkout`, `restore`, `reset`, `clean`, force-push), check what's
  actually sitting in the tree/worktree first — stash or commit it if it's not obviously disposable.

---

## Stage: Orient

### Purpose
Ground every subsequent decision in the *actual current state* of the repo, not in what a planning
document or the previous conversation assumed. This is a **read-only** stage — nothing gets written
except the operator's own understanding.

### Inputs
- The working tree and its git history/branches.
- `origin/main-line-branches` (fetched fresh — a stale local view of a remote branch is exactly
  the trap this stage exists to avoid).
- Whatever planning docs exist (a roadmap, an architecture doc) — treated as a *hypothesis* to
  verify, not a fact.
- On re-entry after a Clear: the previous loop's spec, build notes, and final documentation, all on
  disk, with no memory of the conversation that produced them.

### What happens behind the scenes
- Reads the actual code/config for the area about to be touched, not just a doc describing it —
  planning docs go stale (a phase-tag can outlive the thing it tagged).
- Checks whether the next roadmap-listed item is *actually* buildable now — i.e. its prerequisites
  genuinely exist in the code/schema, not just "it's next in the list."
- `git fetch`, then measures actual divergence between the relevant long-lived branches
  (`git log base..ahead --oneline`).
- **Divergence alone doesn't prove the commits were reviewed.** Cross-checks the commit range against
  `gh pr list --state all` — commits with no corresponding merged PR were pushed directly, meaning
  CI's gate never ran on them. (Observed once in this repo: six slices' worth of commits after a
  given PR turned out to be direct pushes, and the one PR that *did* run gates in that window had
  failed and been merged anyway.)
- Runs `git worktree list` (see Global gotchas above).
- Runs the audit machine check (`npm run sdd:audit` in this repo).
- Reads the delivery board as the *status* layer only (`gh project item-list id --owner owner
  --format json`) — never as the source of scope.

### Manual procedure
1. `git fetch origin`
2. `git status` and `git branch -vv` — confirm what's actually checked out and how it relates to
   its remote.
3. `git log origin/main..origin/staging --oneline` (or the equivalent pair for your project) —
   read the actual list, don't just eyeball the count.
4. `gh pr list --base main --state all --limit 15` and `gh pr list --base staging --state open` —
   cross-check against step 3's commit range.
5. `git worktree list` — note anything beyond the main checkout.
6. `npm run sdd:audit` (or the project's equivalent) — read every line, not just the exit code.
7. `gh project item-list project-id --owner owner --format json --limit 500` (the default limit
   is often too low to see everything — check the tool's own default and raise it explicitly).
8. Read the last ~10–15 rows of the roadmap/change-log doc directly, to see what the *last*
   documented state actually was, not what a summary claims it was.
9. Read the most recent `specs/date-*/build-notes.md` if one exists and hasn't been superseded.

### Expected results
A short grounding summary the operator can act on: what's actually true (branch state, board state,
audit gaps) vs. what a stale doc or a resumed conversation assumed, with every discrepancy named
explicitly rather than silently corrected.

### Troubleshooting and recovery
| Symptom | Likely cause | What to do |
|---|---|---|
| `sdd:audit` reports gaps | Previous loop's Document (final) never landed | Fix it **on the current branch** — do not note it and proceed; it's real undone work (see the audit's own exit message) |
| Board status contradicts `git log`/`gh pr list` | Document (final) reconciliation step was skipped for a prior slice | Trust the repo, flag the board as needing reconciliation, fix it in the current Document (final) pass |
| `git log origin/main..origin/staging` is huge and unfamiliar | Several slices have shipped to staging without a promotion PR yet | Not itself a problem — but flag it: production is that many slices stale, and any new work should account for what's already queued for promotion |
| A roadmap-listed "next" item won't build | Its prerequisite code/data doesn't exist yet, despite the roadmap ordering suggesting it should | Stop; this is a Propose-stage question (re-sequence, or build the prerequisite first), not something to route around silently |
| `gh` commands fail or hang | Not authenticated, rate-limited, or GitHub itself is degraded | `gh auth status`; check the relevant status page before assuming the repo/tooling is broken (see Ship's note on this below) |

### Where to investigate
The roadmap/change-log doc's tail end (most recent rows), the last few `specs/*/build-notes.md`
files, `git log --oneline -30`, and the audit/board output itself — all of it is already being
generated; this stage is about *reading* it accurately, not producing new records.

### Decision points
None that block progress by themselves — Orient is diagnostic. But anything it surfaces (an audit
gap, a stale board, an unbuildable roadmap item) becomes the thing Propose has to explicitly address
next, not something to quietly work around.

---

## Stage: Propose

### Purpose
Gate 1. Decide *what* is about to be built and get explicit sign-off before any spec or code exists,
calibrated to how big a decision it actually is — not every change deserves a planning session.

### Inputs
Whatever Orient surfaced, plus the operator's own judgment about whether this is routine or a real
fork in approach.

### What happens behind the scenes
- Classifies the work: routine/single-obvious-approach vs. a real fork (an architecture choice, a
  missing input like a design asset, more than one defensible technical approach).
- For anything beyond a trivial fix: opens a tracking issue *before* the spec — this is what the
  eventual PR's closing keyword and the CHANGELOG entry both anchor to.
- Adds that issue to the delivery board immediately, with its Phase set, Status left at Backlog. An
  issue that never reaches the board is invisible to every later board-reconciliation step.
- Assigns the issue to its roadmap milestone/phase.
- Waits for explicit approval before Spec/Build begins.

### Manual procedure
1. Decide: is there genuinely more than one defensible way to do this, or a missing input only a
   human can supply? If yes, write out the alternatives and *why* each loses, and ask rather than
   guess. If no, state the one-paragraph plan and move on — don't manufacture ceremony.
2. `gh issue create --title "..." --body "..."` (or your tracker's equivalent).
3. `gh project item-add project-id --owner owner --url issue-url`, then set its Phase field
   and confirm Status is Backlog.
4. `gh issue edit number --milestone "Phase name"` (or equivalent) so the issue and the board
   phase agree.
5. Get explicit approval before proceeding to Spec.

### Expected results
An open issue, present on the board with the right Phase, Status `Backlog`, and an explicit "go
ahead" from whoever owns the decision.

### Troubleshooting and recovery
| Symptom | Likely cause | What to do |
|---|---|---|
| Work starts without an issue existing | Skipped for something that turned out not to be trivial | Stop, open the issue retroactively, backfill the board entry — don't let a PR reference nothing |
| An old approval is being stretched to cover new scope | Scope grew since the original decision | Treat it as a new decision — approval for one thing is not blanket approval for an unrelated one, even from the same conversation |
| Issue never appears on the board | The `item-add` step was forgotten | Board reconciliation (Orient's step 6 / Document's board step) is what catches this later, but check for it now rather than relying on that safety net |

### Where to investigate
The issue tracker itself and the board — this stage's whole output is those two records plus the
approval, nothing else persists yet.

### Decision points
**This is itself a decision-point stage.** Anything with more than one defensible technical answer,
or any missing input only a human can supply (a design asset, an account decision, a data-model
choice with real tradeoffs) must be surfaced explicitly and answered by the human, not assumed. Do
not proceed to Spec on a guessed answer to a genuine fork.

---

## Stage: Spec

### Purpose
Gate 2. Write down, precisely enough that a reader with **no memory of this conversation** can
check it, what "done" means — before any implementation code exists. Under a loop with a hard
context reset before validation, the spec is the *only* thing the post-reset check has to go on; an
ambiguity that a same-context reviewer would have silently resolved from memory becomes a real
failure mode here.

### Inputs
The approved proposal from the previous stage; existing spec template files to copy from (never
write from a blank file or from memory of "the last slice's shape" — that drift is how a required
file gets silently dropped over time).

### What happens behind the scenes
- Copies a fixed three-file template into a new dated slice directory: a narrative plan file
  (goal, scope, what's deliberately excluded, rationale — carries any front-matter and is the file
  a docs index would track), a numbered requirements file (`R1..Rn`, each one an objectively
  checkable sentence — a command exits 0, a file has property X, a route returns Y; no "should"
  language), and a validation file (one `| Requirement | How to verify |` row per requirement, each
  a concrete, runnable step).
- If the slice changes a **standing decision** (architecture, tech choice, a design-system token),
  also updates the relevant persistent doc — the dated slice folder is the one-time record, the
  persistent doc is what every future session reads as current truth.
- Runs an adversarial self-review before presenting: what's missing, ambiguous, or quietly out of
  scope? Deferred items get listed explicitly rather than left to vanish silently. Checked against
  existing standing decisions for contradictions.
- Commits the spec files as their own commit, before any implementation commit.

### Manual procedure
1. `cp specs/templates/feature-spec/plan.md specs/templates/feature-spec/requirements.md specs/templates/feature-spec/validation.md specs/date-slug/`
2. Fill `plan.md`: goal, scope, explicit exclusions, rationale, front-matter.
3. Fill `requirements.md`: `R1..Rn`, each a single falsifiable sentence.
4. Fill `validation.md`: one table row per requirement, each row a command or concrete step with an
   unambiguous pass/fail outcome — written for someone who wasn't in the room.
5. If a standing decision changed, edit the relevant persistent doc in the same pass.
6. Re-read the whole draft adversarially: what did I leave out, what's ambiguous, what silently
   changed scope?
7. Present for approval; on approval, commit the three (or four, with the persistent doc) files as
   one commit, separate from any implementation commit that follows.

### Expected results
A committed, approved spec directory with all three required files, each internally consistent, with
every requirement traceable to a concrete validation step.

### Troubleshooting and recovery
| Symptom | Likely cause | What to do |
|---|---|---|
| A required file is missing (e.g. only two of the three) | Copied from a previous slice's shape instead of the canonical template, and that slice had already drifted | Always copy from the canonical template directory, never from the most recent slice |
| A requirement can't be checked without "should"/subjective judgment | The requirement was written before the concrete mechanism was known | Rewrite it as an objective, checkable statement, or defer that judgment to a documented manual browser/UI check explicitly named as such |
| A validation row's literal check is broader or narrower than the requirement's actual intent | Common trap: a `grep` written to catch a pattern also matches the **explanation of why that pattern is deliberately absent** (a comment, a rationale sentence) | Scope the check to the actual construct (e.g. match a className attribute, not a bare word), or assert the property via a real test, rather than a naive text match |
| A requirement's own wording is broader than what its validation row actually checks | The prose was written expansively ("anywhere on this branch") while the practical check only covers the real enforcement surface | At Spec time, scope the requirement's text to match what's actually checkable/enforced — a requirement broader than its own validation is a requirement two people can satisfy differently |

### Where to investigate
`specs/templates/feature-spec/` for the canonical shape; any existing ADR or persistent doc for
standing decisions this slice must not silently contradict.

### Decision points
Whether a change constitutes a "standing decision" requiring a persistent-doc update, versus a
one-off slice detail, is a judgment call — when in doubt, write the persistent-doc update; a
missing one is far more expensive to discover later than an unnecessary one is to write now.

---

## Stage: Build

### Purpose
Implement exactly what the approved spec describes. Nothing more, nothing less.

### Inputs
The approved `requirements.md` (must exist — Build does not proceed without it). Existing code
conventions, ports/adapters/utilities already in the codebase.

### What happens behind the scenes
- Confirms an approved spec exists before writing any source; if not, stops and returns to Spec.
- Moves the tracking issue to **In Progress** on the board.
- Reuses existing patterns before creating new ones.
- Matches established conventions (design tokens over raw values, existing architectural layering,
  existing file/module shape for the area being touched).
- Builds only what `requirements.md` describes. A gap noticed but out of scope is *recorded*, not
  silently added — it becomes a future Propose candidate.
- **Shapes code for testability against the acceptance criteria** — specifically, if a requirement
  asserts a runtime property (atomicity, idempotency, a specific live behavior), the function under
  test needs to be callable directly from a plain script with its dependencies passed explicitly
  (e.g. a database client and a tenant/user id as parameters) rather than resolved internally from
  request context. Otherwise no later stage can prove the property outside a full running request.

### Manual procedure
1. Confirm `specs/date-slug/requirements.md` exists and is approved.
2. Move the issue to In Progress on the board.
3. Search the codebase for an existing utility/pattern before writing a new one.
4. Implement each requirement, matching existing conventions.
5. When something out-of-scope is noticed, write it down (a comment, a note) rather than fixing it
   inline — it's a future issue, not a silent addition to this branch.
6. Stop when `requirements.md` is satisfied — do not self-certify against `validation.md` here; that
   happens in a later, separate stage on purpose.

### Expected results
Working code on the branch that satisfies every requirement, following existing conventions, with
no undisclosed scope creep.

### Troubleshooting and recovery
| Symptom | Likely cause | What to do |
|---|---|---|
| A requirement can't be satisfied without resolving something from ambient/request context | The code wasn't shaped for standalone testability | Refactor to accept the needed context as explicit parameters — this is a Build-stage fix, not a later one |
| Mid-build, a requirement turns out to be wrong or contradictory | The spec had a real gap | Stop and flag it — going back to Spec is correct; guessing and building around it is not |
| Temptation to fix an unrelated bug noticed while in the area | Scope creep | Note it, don't fix it here — becomes a Propose candidate |

### Where to investigate
`requirements.md` itself is the only authority for what to build; existing similar features in the
codebase for the convention to match.

### Decision points
Whether an in-flight discovery is "in scope, just under-specified" (fix it now, referencing the
requirement) vs. "genuinely new scope" (defer it) is a judgment call — default to deferring when
unsure, since silent scope growth is exactly what this stage exists to prevent.

---

## Stage: Document (build notes)

### Purpose
Write to disk **everything that must survive the upcoming Clear**. This is explicitly a
write-to-disk stage, not a summary — anything left only in the conversation is destroyed by the
reset that follows it.

### Inputs
Everything decided/discovered during Build that isn't already captured in code or the spec: design
decisions the spec didn't dictate, deliberate deviations, known-shaky areas, anything deferred.

### What happens behind the scenes
- Writes `specs/date-slug/build-notes.md` from the canonical template — four fixed headings
  (What changed and why / Decisions taken during the build / Deviations from the spec / Known-shaky
  areas). The machine check (`sdd:preclear`) does a literal substring match on these headings, so
  they must be present verbatim even if a section's content is "None."
- **Writes the Gate 4 CHANGELOG entry now** — not at the final Document stage. It must be on the
  branch before the PR merges, and both the local pre-push hook and CI enforce a diff against the
  base branch. Because CI's check diffs against the PR's *current* base, if another PR merges first
  and moves that base, an already-satisfied diff can vanish — write it before opening the PR, not as
  a follow-up push after.
- Updates any persistent doc whose standing decision this slice actually changed (same list as
  Spec) — these belong on this branch, not deferred.
- Files a tracked issue for every deliberately deferred item, while the reasoning is still fresh —
  never left as a comment or an assumption the next session will remember.
- **If Build happened in an isolated sub-agent worktree**, names that worktree's exact path and
  branch explicitly in "What changed and why." `git worktree list` can enumerate what still exists
  *at the time someone runs it*, but it can't tell a later, fresh context which worktree belongs to
  *this* slice, and a worktree can be pruned before anyone thinks to check — the build notes are the
  one artifact the Clear is designed to preserve.
- Commits everything, then runs the preclear machine check and requires exit 0 before telling anyone
  it's safe to reset context.

### Manual procedure
1. `cp specs/templates/feature-spec/build-notes.md specs/date-slug/build-notes.md`
2. Fill all four sections — write "None." explicitly rather than deleting a heading with nothing to
   say.
3. Add an `[Unreleased]` entry to `CHANGELOG.md` in the terse style of existing entries.
4. Update any persistent doc affected.
5. `gh issue create` for every deferred item.
6. If Build ran in a worktree, name its path/branch in the build notes explicitly.
7. `git add` everything, commit.
8. `npm run sdd:preclear` — must exit 0. If it doesn't, fix exactly what it names; do not proceed on
   the strength of having *intended* to commit everything.
9. Only once it's 0, tell whoever is driving that it's safe to reset context (and, if applicable,
   switch to the review-stage model/session).

### Expected results
`sdd:preclear` exit 0, a clean working tree, a committed CHANGELOG diff, and build notes that are
actually informative — not just present.

### Troubleshooting and recovery
| Symptom | Likely cause | What to do |
|---|---|---|
| `sdd:preclear` fails on a missing heading | A heading was reworded or dropped instead of copied from the template | Copy the four headings verbatim from the template; content can say "None." but the heading text must match |
| `sdd:preclear` fails on CHANGELOG | The entry was never added, or was added then reverted | Add it now; it's a hard requirement, not optional documentation |
| `sdd:preclear` fails on a dirty tree | Something was edited after the last commit, or a generated file (e.g. a rebuilt index) changed | `git status`, commit or discard deliberately — never proceed to Clear with anything uncommitted |
| CI's CHANGELOG check fails on a PR that had it locally | Another PR merged first and moved this PR's base, so the diff against the new base no longer includes the CHANGELOG change | Re-diff against the new base and re-add if needed; this is why the instruction is to write it *before* opening the PR, immediately, not as an afterthought |
| Build happened in a worktree and nobody wrote its path down | Skipped step | Before anything else, `git worktree list` and write the path/branch into build notes now, while it's still discoverable — don't let a later stage inherit an invisible worktree |

### Where to investigate
`specs/templates/feature-spec/build-notes.md` for the exact required shape; the `sdd:preclear`
script's own source if its failure message is unclear about *why* something is being flagged.

### Decision points
None truly novel here — this stage's job is to make everything from Build/Spec explicit and
persistent, not to make new calls. The one judgment left to the operator: "informative, not just
present" build notes — the machine check cannot evaluate whether the content is actually useful to a
future reader, only whether the headings exist.

---

## Stage: Clear (pre-validation)

### Purpose
A hard reset between the session/context that built the change and the one that will judge it —
deliberately so the judge has no memory of the intent, only the artifact and the spec.

### Inputs
`npm run sdd:preclear` exit 0. Everything else is presumed already on disk.

### What happens behind the scenes
This is a manual, human-invoked action — an automated agent cannot trigger its own context reset.
Once triggered, the previous conversation's context is gone; only what's on disk (the repo, the
spec, the build notes) remains available to whatever picks the work up next.

### Manual procedure
1. Confirm (again) `npm run sdd:preclear` exits 0.
2. Confirm, as a human judgment call, that the build notes are actually informative, that every
   persistent-doc update landed, that every deferred item is a real issue, and — if applicable —
   that a worktree's path/branch is written into the build notes rather than left implicit.
3. Confirm `npm run kms:build-index` (or the project's equivalent index/catalog rebuild) has been
   run **last**, after every other edit in this pass, and the result committed — running it earlier
   and then editing a file afterward re-stales it.
4. Trigger the reset (e.g. `/clear`), and switch to whatever session/model is designated for the
   validation half of the loop.

### Expected results
A fresh session/context with no memory of the build, ready to load only the spec and the artifact.

### Troubleshooting and recovery
| Symptom | Likely cause | What to do |
|---|---|---|
| The index/catalog is stale again right after being rebuilt | Something was edited (e.g. a front-matter version bump) *after* the rebuild | Rebuild again, last, immediately before committing — this is a strict ordering requirement, not a one-time step |
| A committed index shows a "1-commit-behind" diff on every subsequent check | The index footer embeds the commit hash it was built from, so a freshly committed index can only ever cite its own parent | Expected — normalize/strip the footer before comparing (the machine checks already do this); don't chase it as real drift |

### Where to investigate
The preclear checklist itself (both the machine-checked items and the human-judgment items) is the
full list of what "ready to clear" means — there's no additional hidden state.

### Decision points
**This reset is always a deliberate human action, never something to automate away.** If
`sdd:preclear` fails, the choice is: fix what's missing, or explicitly and knowingly accept the
loss (rare, and should be a conscious decision, not a shrug) — never silently reset over a red
check.

---

## Stage: Validate

### Purpose
Gate 3, run from a **fresh context** with no memory of building the artifact. Check the artifact
strictly against `requirements.md` and `validation.md` — not against what the build notes *claim*
was done.

### Inputs
`requirements.md`, `validation.md`, and the artifact itself (the actual code/config on the branch).
`build-notes.md` is read only as *supporting context* — where to look, what was deliberately
deviated — never as a substitute for independently checking. If the notes and the artifact disagree,
**the artifact is the fact**.

### What happens behind the scenes
- Runs a fast local pre-flight: lint, format check, typecheck, unit tests, build.
- Does **not** fully trust local format/lint results on a checkout whose line-ending handling can
  diverge from CI's (see Global gotchas) — verifies against the actual committed blob before
  treating a flagged file as real drift.
- If the slice touches documentation that feeds a separate build pipeline not covered by the fast
  local suite (in this repo: the internal KMS docs site), runs that pipeline's real build locally
  rather than trusting the fast suite to have caught it.
- Walks **every row** of `validation.md`, not just the generic lint/test/build commands. A row that
  genuinely can't be checked in this environment is reported as **unverified, with the reason** —
  never silently marked passing.
- **Treats each validation row's literal check as a proxy, not the ground truth** — checks the
  requirement's actual wording against what the check actually tests. Concretely, a check can:
  - be **too broad** (a bare-word grep matching a comment/rationale that *explains* an absence,
    rather than a real occurrence);
  - be **too narrow or misdirected** (checking a file that no longer contains the relevant logic
    because it moved during Build; asserting an exact match count that doesn't account for the
    code's own explanatory comment mentioning the same string);
  - assert an implementation detail the requirement never actually specified (e.g. exact parameter
    *order*, when the requirement only asked that a value be an explicit parameter *somewhere*).

  None of these are code defects — they're specification/check mismatches, and the right response is
  to reason from the requirement's actual prose, not to blindly trust or blindly distrust the
  command's exit code.
- For UI changes: verifies against rendered output (compiled CSS, rendered HTML, a real screenshot)
  — never from a code read-through alone.
- For anything touching a live external system (a database, a third-party API), verifies against a
  **live** instance where the requirement actually claims live behavior, not just a mock/unit test —
  and confirms, before starting, that the environment being checked against is actually the one the
  artifact is running against (see Global gotchas' config-precedence point).
- If a requirement needs a migration applied to a shared environment before it can be exercised,
  applies that migration explicitly first — it does not happen automatically just because the branch
  exists.
- Once pushed, treats the **actual CI result** as ground truth — never reports "should pass CI"
  as equivalent to "passed CI."

### Manual procedure
1. Confirm this really is a fresh context/session with no memory of the Build that produced this
   artifact. If it isn't, say so — the whole point of this stage is independence from the builder's
   intent.
2. Load `requirements.md` and `validation.md`. Skim `build-notes.md` once for context, not as
   evidence.
3. Run the local fast pre-flight (lint/format/typecheck/test/build).
4. For any flagged formatting/lint issue on an unmodified file, diff the actual committed blob
   before trusting the local tool over CI.
5. If docs/specs were touched and a separate docs-site build exists, run that build for real,
   locally, before trusting the fast suite.
6. Walk every row of `validation.md` in order. For each: run the literal check, then read the
   requirement's actual sentence and ask whether the check's result actually proves or disproves it.
   Mark each row Pass / Fail / Unverified-with-reason.
7. For UI rows: actually render it (browser, screenshot, or at minimum compiled output) — don't sign
   off from source alone.
8. For DB/live-system rows: confirm which environment you're actually pointed at, apply any pending
   migration the row needs, exercise it live, and record what was actually observed.
9. Push (if not already), then poll the **real** CI check for this PR/commit — not the mere fact
   that it was pushed — and treat that result, not local output, as the final word for Gate 3.

### Expected results
Every `validation.md` row resolved to Pass, Fail, or explicitly Unverified-with-a-stated-reason; a
green real CI run on the pushed commit.

### Troubleshooting and recovery
| Symptom | Likely cause | What to do |
|---|---|---|
| A DB-touching row throws a constraint violation that looks like a code defect | The shared environment's schema is one migration behind what this branch adds — CI only applies migrations at merge, not before | Apply the branch's migration to the target environment explicitly (its direct/unpooled connection), then re-run the row |
| A grep-based validation row "fails" against code that's actually correct | The check matches a comment/rationale explaining a deliberate absence, not a real occurrence | Re-read the requirement's actual text; if the check is the problem, note that as a spec-wording finding rather than reporting a false code defect (and don't quietly loosen the check without saying so) |
| A grep-based row "passes" when it shouldn't | The check is looser than the requirement (e.g. matches any occurrence of a word rather than a specific construct) | Same treatment — flag the check/requirement mismatch, verify the actual property some other way (a real test, direct inspection) |
| Local lint/format flags files nobody touched | Windows line-ending rewrite on checkout, diverging from Linux CI | Diff the committed blob directly; trust CI |
| A plain local dev server shows a DB-touching feature silently broken/blank | The plain local dev server can't load whatever runtime-specific driver the deployed environment needs (in this repo: Prisma's WASM engine under `next dev`) | Use the project's real local-runtime-equivalent command (in this repo: `npm run preview`) for anything that touches the database |
| A docs/spec change passes the fast local suite but the operator suspects a separate doc pipeline exists | The fast suite doesn't build every downstream doc pipeline | Run that pipeline's actual build locally before considering it verified |
| CI shows "pending" for an implausibly long time with all visible steps green | A status-reporting-layer degradation, not an actually-stuck job (see Ship section for the detailed trap) | Don't treat "still pending" as evidence the job is still running — check the run's own API/log directly |
| The spec itself looks wrong once you try to validate against it | A genuine design defect in the requirement, not an artifact defect | Say so explicitly. This is a Spec-stage problem — go back to Spec, don't patch around it under Fix |

### Where to investigate
`validation.md` and `requirements.md` are the whole authority; `build-notes.md` for *where to look*
only; the actual CI run's logs/API (not just a UI's summary badge) for the real Gate 3 verdict; any
separate build pipeline's own build output for anything the fast suite doesn't cover.

### Decision points
**If the spec itself is wrong, stop and say so rather than validating around it.** Conforming to a
bad requirement produces a slice that passes and is still broken. Whether a found issue is "the
code is wrong" (→ Fix) or "the spec is wrong" (→ back to Spec) is a judgment call every failing row
requires — get it right at this stage, because Fix explicitly assumes the spec is correct and only
the artifact needs to change.

---

## Stage: Fix

### Purpose
Correct what Validate found — at the root cause, not by adjusting the check until it passes.

### Inputs
Validate's findings: which rows failed, and why.

### What happens behind the scenes
- Fixes the actual defect. If a requirement can't be proven because the code isn't *shaped* to allow
  it (e.g. a function resolves its dependencies internally instead of accepting them as parameters,
  so it can't be exercised outside a request), the reshape is the fix — not a workaround.
- Distinguishes a real fix from a disguised redesign: if correcting this properly requires a **new
  decision** rather than a correction of an existing one, that's out of scope for this stage — it
  goes back to Propose/Spec, not improvised here under validation-mode pressure.
- Updates `build-notes.md` with what changed and why, and the CHANGELOG if the fix changed any
  user-observable behavior.
- **Loosening a `validation.md` row is only correct when the row itself was actually wrong** (per
  Validate's own finding) — and if that's what's happening, it must be stated explicitly as "the
  check was wrong, here's why," never done silently.

### Manual procedure
1. For each failing row, determine root cause — is the code wrong, or is the check wrong?
2. If the code is wrong: fix it, reshaping for testability if that's what's blocking verification.
3. If the check was wrong: fix the check, and say explicitly that's what you're doing and why.
4. If the fix reveals a genuine new design decision is needed: stop, say so, and route back to
   Propose/Spec rather than improvising it here.
5. Update `build-notes.md` and the CHANGELOG (if behavior changed).
6. Commit.
7. Go back to **the top of Validate** — re-walk every row, not just the one that failed. A fix can
   break something that previously passed.

### Expected results
Every previously-failing row now passes on a full re-walk of `validation.md`, with no new
regressions in previously-passing rows.

### Troubleshooting and recovery
| Symptom | Likely cause | What to do |
|---|---|---|
| A commit here gets blocked by the spec-before-code pre-commit hook, even though a spec already exists for this branch | The hook only recognizes a *new* `requirements.md` on the branch — it can't tell "this corrects an already-approved spec" from "no spec exists" | Use the hook's documented escape hatch (e.g. `git commit --no-verify`) and say so explicitly in the commit message and to whoever's reviewing — don't silently bypass, and don't invent a throwaway spec file just to satisfy the heuristic |
| The "fix" keeps growing in scope | It's actually a redesign in disguise | Stop. Route back to Propose/Spec rather than continuing to improvise under validation pressure |

### Where to investigate
Validate's own findings (which rows, which reasons) are the whole input; there's nothing new to
discover here beyond what Validate already surfaced.

### Decision points
**"Fix the code" vs. "fix the check" vs. "this needs a new decision"** is the central judgment call
of this entire stage, made explicit every time rather than defaulted silently to whichever is
easiest.

---

## Stage: Ship

### Purpose
Get a validated, documented change through branch → PR → CI → merge → deploy, deliberately — this is
the part of the loop most prone to silent drift (a merge landing before a fast-follow commit, a
promotion issue being auto-closed wrongly, a stuck CI check being misread).

### Inputs
A branch with validated, committed work and an already-written CHANGELOG entry.

### What happens behind the scenes
- Branches off a **freshly fetched** base — never a stale local copy that might already be behind or
  merged.
- Pushes the complete logical unit *before* opening the PR — doesn't iterate live against CI on an
  already-open PR, because a merge can land within seconds of opening.
- Opens the PR referencing its issue with the closing keyword.
- **Waits for the real CI result**, polling correctly — a naive check against a multi-line status
  output can misread "still running" as done, or vice versa.
- Gets **explicit human confirmation before every merge and every promotion** — a prior approval for
  one merge is never blanket permission for the next one, because merging (and especially a
  promotion that triggers a real deploy) is hard to reverse and visible to others.
- After merging, confirms the actual deploy workflow completed — never infers success from the merge
  alone.
- If this repo separates a staging merge from a production promotion: the promotion is its **own**
  deliberate PR, opened only once the staging PR's own CI is green — never a rubber stamp on the
  first merge.
- Moves the issue to **In Review** on merge to the non-production branch (never `Done` yet).
- If a promotion PR closes multiple issues, repeats the closing keyword **per issue** — most
  trackers only honor the closing keyword for the *first* issue in a comma-separated list, silently
  leaving the rest open with no warning.
- If a worktree was used for Build, removes it once its branch has actually merged (confirms the
  merge and a clean worktree status first).

### Manual procedure
1. `git fetch origin base-branch`; branch from `origin/base-branch`, not a local copy.
2. Push the complete unit of work.
3. `gh pr create --title "..." --body "Closes #NN ..."` (matching existing conventions).
4. Poll CI correctly: `until ! gh pr checks N | grep -q "pending"; do sleep 5; done` — but see the
   troubleshooting row below before trusting a long "pending" at face value.
5. Get explicit confirmation, then merge.
6. If a separate production promotion exists: open that PR only after the first merge's CI is green,
   get separate explicit confirmation, then merge it too.
7. If it closes multiple issues: repeat the closing keyword once per issue, never a single
   comma-separated list.
8. Confirm the deploy workflow(s) actually completed (check the actual run, not just the merge).
9. Move the issue(s) to In Review (staging) or let auto-close to Done (production) as appropriate.
10. If a Build worktree exists and its branch merged: confirm clean, then remove it.

### Expected results
A merged PR, a confirmed-green real CI run, a confirmed-completed deploy, correct board status, and
(if applicable) no leftover worktree.

### Troubleshooting and recovery
| Symptom | Likely cause | What to do |
|---|---|---|
| `gh pr checks` shows "pending" far longer than any run has ever taken, even though every visible step looks green in the UI | A status-reporting layer (e.g. the platform's API/GraphQL layer) can degrade independently of the actual job runner — the job finishes but its status never gets written back | Don't trust "still pending" as proof of "still running." Check the run directly via its own API/log (e.g. `gh run view run-id --json status,conclusion`), and check **every** relevant status-page component, not just the one that looks most related |
| A promotion PR shows a merge conflict in append-only doc files (a changelog, an index) even though the source branch is a strict superset of the target | An earlier promotion was **squash-merged**, breaking the ancestor chain those files' history depends on, so a later regular merge computes a bogus 3-way diff against a stale merge-base | Confirm with a direct diff between the two branches that no real content differs; if so, resolve with a content-identical reconciliation merge (verify the diff between it and one side is empty before pushing) rather than treating it as a real conflict. Fix upstream: promotion PRs should always use a regular merge, never squash |
| A closing keyword accidentally closed an issue that was supposed to stay open | The closing-keyword scanner reads **every commit message** landing on the default branch, not just the PR's own title/body — including a commit that merely *quotes* the forbidden phrase (e.g. while explaining a past mistake) | Reopen the issue immediately with a comment explaining what happened, correct the board status back. Going forward: never write a closing keyword immediately adjacent to an issue number that must stay open, anywhere — not in a body, not in a commit message, not inside a quotation |
| A PR closes only the first of several comma-separated issues on merge | Most trackers only honor the closing keyword for the first reference in a list | Repeat the keyword per issue explicitly (`closes #A, closes #B`), never a single list |
| A fast-follow commit is stranded outside an already-merged PR | The PR merged faster than expected (can happen within seconds of opening) | Don't force-push or rewrite history to retroactively include it — open a tracking issue and land it as its own proper follow-up |
| `gh` returns errors or seems to hang across multiple commands | Could be genuine outage on the platform's side, not a local/auth problem | Check the platform's own status page **before** blind-retrying, especially near a production merge gate — retrying during a real outage wastes time and can create races once service resumes |

### Where to investigate
The actual CI run's own log/API, the deploy workflow's own run log, `gh pr view n --json
closingIssuesReferences` (useful but **not sufficient by itself** — it doesn't see every commit
message in the merged set, only the PR's own body/title) plus a direct read of every commit message
about to land, and the platform's status page for anything that looks like unexplained flakiness.

### Decision points
**Every merge and every promotion is an explicit-confirmation point, every single time** — never
inferred from an earlier approval, never automated past. Whether a stuck CI check is "actually still
running" vs. "done but not reporting" is a decision requiring direct evidence (the run's own log),
not an assumption in either direction. Whether history may be rewritten to fix a stranded commit is
never a retry-until-it-works decision — the safe path (a new follow-up PR) is always available and
should be preferred over any rewrite.

---

## Stage: Document (final)

### Purpose
The durable record of what actually shipped and what validation actually proved — written *after*
Ship, so it can supersede the build notes' pre-ship intent with verified reality where the two
disagree.

### Inputs
Everything from Ship (the merged PR(s), the confirmed CI/deploy results) plus whatever Validate
actually observed live (which is often more than anyone predicted at Build time).

### What happens behind the scenes
- Rebuilds any generated index/catalog and re-validates its own metadata. **The index will always
  trail the slice it documents by one commit**, because its own footer records the commit it was
  built from — this is expected, not a defect to chase.
- Reconciles documentation with what validation *actually found* — live verification routinely
  surfaces things no amount of pre-ship writing would have predicted; those become both doc
  corrections and freshly tracked issues here, not left as undocumented tribal knowledge.
- Updates the roadmap/change-log with a row citing the slice's spec path, and — separately — a row
  citing any promotion PR by number, matching the existing rows' style. **This is exactly what the
  audit machine check verifies at the next Orient** — run it here and confirm exit 0 rather than
  leaving a gap for the next loop to discover.
- Reconciles the delivery board (status only) — every issue for this slice should now be In Review
  (staging-merged) or Done (production-promoted), and anything newly deferred should be on the board
  with a Phase.
- Records anything the loop itself taught — a new trap, a new diagnostic trick — into the process
  doc(s), while it's still cheap to write down. (This runbook is exactly that kind of record.)

### Manual procedure
1. Rebuild the index/catalog (`npm run kms:build-index` in this repo) and re-validate front-matter
   (`npm run kms:validate`).
2. Compare what Validate actually found (including anything unexpected) against what the spec and
   build notes predicted; write the corrections and file the new issues.
3. Add the roadmap/change-log row(s): one for the slice's build+merge, one for any promotion,
   matching the existing entries' tone and level of detail.
4. `npm run sdd:audit` — confirm exit 0 before considering this stage done.
5. Reconcile the board: `gh project item-list id --owner owner --format json`, compare against
   what actually merged/promoted, correct any status that's out of sync (see the observed example
   in "The delivery board" above).
6. File issues for anything still deferred — never leave it as a comment or an assumption.
7. If this loop taught something new (a trap, a fix, a diagnostic technique), add it to the process
   doc / this runbook now.
8. Tell whoever's driving to switch to the next loop's designated model/session, **then** trigger the
   second Clear.

### Expected results
`npm run sdd:audit` exits 0. The board matches reality. The roadmap/change-log has both a build row
and (if applicable) a promotion row, each citing the actual path/PR number. Any new deferred item is
a tracked issue.

### Troubleshooting and recovery
| Symptom | Likely cause | What to do |
|---|---|---|
| `sdd:audit` still fails after this stage | A row was written but doesn't cite the literal path/PR-number string the audit looks for (prose mentioning the slice by name isn't enough) | Re-check the audit's exact matching rule (see "sdd:audit — exact mechanics" above) and fix the row's wording, not just its presence |
| A promotion's row can't be written yet | The promotion happened *after* the roadmap doc was last edited in this same pass | Expected — the audit itself treats this as "pending carry-forward," not failing; write the row on the *next* slice's branch instead of forcing an empty doc-only PR now |
| The board still shows issues as Backlog/In Progress after they're clearly merged/promoted | Manual reconciliation step was skipped (see the observed live example in "The delivery board" section) | Walk every issue this slice touched and correct its status by hand — nothing does this automatically |
| A doc-only reconciliation commit can't be pushed | Gate 4's CHANGELOG-diff check has no exception for a docs-only carry-forward commit | It still needs its own (small) CHANGELOG entry to be pushable — write one, however minor |

### Where to investigate
`sdd:audit`'s own output (it names exactly which slice/promotion is missing a row); the roadmap
doc's existing rows for the expected tone/format to match; the board's raw JSON output compared
directly against `git log`/`gh pr list` for ground truth.

### Decision points
Whether something newly discovered during live validation rises to "needs its own tracked issue" is
usually not ambiguous (if it's deferred or incomplete, it needs one) — but whether it's a big enough
finding to also warrant a runbook/process-doc update (vs. just a one-off note in this slice's own
docs) is a judgment call; when in doubt, write it into the shared process doc, since a lesson that
only lives in one slice's history is a lesson the next person has to relearn.

---

## Stage: Clear (post-documentation)

### Purpose
Close the loop. Second hard reset, this time returning all the way back to Orient for the next
piece of work.

### Manual procedure
1. Confirm committed (or deliberately, explicitly carried forward as noted work for the next
   branch): final documentation, the index rebuild, the roadmap update, and every deferred item as a
   tracked issue rather than a memory.
2. Switch whatever model/session is designated for the next loop's Orient/Propose/Spec/Build half.
3. Trigger the reset.
4. Land in Orient — treat it as a genuine re-entry, reading the repo rather than assuming continuity
   with a conversation that no longer exists.

### Decision points
Same as the first Clear: never reset over something incomplete without a conscious, explicit
decision to accept that loss.

---

## Scaling the loop to the size of the change

The full loop — two hard resets, a model/session switch — is for a real **slice** of work. A
one-file correction (a typo, a stale doc line, a genuinely one-line fix) should go straight
Build → Ship, with a CHANGELOG entry and no resets at all. This is worth stating explicitly, because
a process that charges slice-sized ceremony for a one-line fix is a process people learn to route
around entirely rather than scale down deliberately.

---

## Consolidated troubleshooting knowledge base

Symptom → likely cause → what to check → resolution. Ordered by where in the loop it's most likely
to first appear, deduplicated against the per-stage tables above (fuller detail lives in the
relevant stage's own section).

| Symptom | Where it shows up | Likely cause | Resolution |
|---|---|---|---|
| A generated index/catalog is stale | preclear, CI | Content edited after the index was last rebuilt | Rebuild **last**, immediately before commit, after every other edit |
| CHANGELOG diff check fails on push/PR | build-notes, Ship, CI | Entry never added, or added then reverted, or the PR's base moved after another PR merged first | Add/restore it immediately before the base can move again |
| Working tree "dirty" at preclear | build-notes | An edit (including a generated-file rebuild) wasn't committed | `git status`, commit or deliberately discard — never proceed uncommitted |
| A slice's work isn't found by any check run from the main checkout | Orient, Validate | Build happened in an isolated worktree, and nothing pointed later stages at its path | `git worktree list`; if build notes don't name the path, that's itself the defect to fix |
| Local lint/format flags untouched files | Validate | Local line-ending handling diverges from CI's | Diff the actual committed blob; trust CI over local |
| A DB-touching check throws a constraint/schema error that looks like a code bug | Validate | The shared environment is a migration behind this branch | Apply the branch's pending migration to that environment first, then re-check |
| A live check silently validates against the wrong environment | Validate | More than one config source exists with a defined precedence, and the operator didn't confirm which one is actually in effect | Confirm the effective target explicitly before starting, not after a confusing result |
| A grep/text-based validation check gives a misleading pass or fail | Spec, Validate | The check matches (or fails to match) based on wording/comments rather than the actual construct the requirement cares about | Re-read the requirement's literal text; fix the check to target the real construct, and say explicitly if the check itself was the defect |
| A docs/spec-only change passes the normal CI gate but breaks on the very next push | Validate, Ship | A separate downstream build (e.g. an internal docs-site build) isn't covered by the fast/normal CI gate | Run that pipeline's real build locally before considering docs changes verified |
| `gh pr checks` reports "pending" implausibly long with all visible steps green | Ship | A status-reporting layer degraded independently of the actual job | Check the run's own log/API directly; check every relevant status-page component, not just one |
| A promotion PR shows a false merge conflict in append-only doc files | Ship | An earlier promotion was squash-merged, breaking the ancestor chain | Verify no real content differs, then resolve with a content-identical reconciliation merge; avoid squash-merging promotions going forward |
| An issue that should stay open gets auto-closed | Ship | A closing keyword appeared anywhere in a landing commit message — including inside a quotation | Reopen with an explanatory comment, fix board status; never write a closing keyword near a protected issue number, anywhere, ever |
| Only the first of several comma-listed issues closes on a promotion merge | Ship | Trackers typically only honor the first reference in a comma-separated closing-keyword list | Repeat the keyword once per issue |
| The delivery board's status contradicts what's actually merged/promoted | Orient, Document (final) | The board reconciliation step for a prior slice was skipped | Compare board output directly against `git log`/`gh pr list`; correct by hand — nothing does this automatically |
| `sdd:audit`-equivalent reports a documentation gap | Orient | The previous loop's final Document stage never fully landed | Fix on the **current** branch, not as a deferred note — this is the one check that runs after everything else |
| Repeated `gh`/API failures right before a production-facing action | Ship, Orient | Could be a genuine platform outage, not a local problem | Check the platform's status page before blind-retrying, especially near a production gate |

---

## Decision-point summary

Situations with no universally correct automated answer, gathered from every stage above. In each
case: gather the stated evidence, then make (or explicitly request) a human decision — don't default
silently to whichever branch is easiest.

| Decision | Evidence to gather first | Options | Never do |
|---|---|---|---|
| Is this a routine change or a real fork requiring explicit sign-off? | Is there more than one defensible approach, or a missing input only a human can supply? | State the one-line plan and proceed / stop and ask, naming alternatives | Guess an answer to a genuine fork and proceed silently |
| Is a failing validation row a code defect or a check defect? | The requirement's literal text vs. what the check literally tests | Fix the code / fix (and disclose) the check | Silently loosen a check to make it pass without saying so |
| Is a needed correction really a fix, or a redesign? | Does it require a new decision, or just correcting an existing one? | Fix in place / stop and route back to Propose-Spec | Improvise a new design decision inside the Fix stage |
| Is it safe to merge / promote right now? | Real, confirmed-green CI; explicit human confirmation | Merge / wait | Merge on an inferred "should be fine," or treat a prior approval as covering this merge too |
| Is a stuck-looking CI check actually stuck? | The run's own log/API, not just a summary badge; the platform's status page | Wait longer / escalate as a reporting-layer issue, not a job failure | Cancel or retry based on a UI badge alone |
| Should history be rewritten to include a stranded commit? | Whether the PR already merged | Open a clean follow-up PR | Force-push or rewrite already-merged history |
| Is a merge conflict in append-only doc files real? | A direct diff between the two branches' actual content | Reconciliation merge (if content-identical) / a real merge resolution (if not) | Assume it's real without diffing first, or force through with a hard override |
| Should a genuinely destructive git operation proceed? | `git status` output, what's actually in the working tree | Stash/commit first, then proceed / stop and ask | Run a discard-capable command without checking what's there first |
| Is this newly-learned trap worth adding to the shared runbook, or just this slice's own notes? | Would the next unrelated slice hit the same thing? | Add here (shared) / leave slice-local | Let a transferable lesson live only in one slice's history |

---

## Keeping this runbook current

This document should evolve the same way the process it describes does — mechanically-checked
where possible, judgment-checked where not.

**During Document (build notes):** if Build surfaced anything reusable — an unexpected failure mode,
a diagnostic command that worked, a workaround, a new decision point — flag it as a runbook
candidate in that slice's own build notes (its `Known-shaky areas` or `Decisions taken` section is
the natural place), even though it doesn't get folded into this shared file until Document (final).

**During Document (final):** review that slice's build notes and its actual validation history for
anything that generalizes beyond the one slice, and fold it in here:
- New failure modes → add a row to the consolidated troubleshooting table (or a stage's own table if
  it's specific to one stage).
- New decision points → add a row to the decision-point summary.
- New commands/diagnostics that proved useful → fold into the relevant stage's manual procedure.
- **Consolidate, don't accumulate.** This file describes *how to operate the system*; a slice's own
  `build-notes.md` retains the detailed chronological history of what happened during that specific
  run. If a lesson here turns out to be a one-off that never recurred, it's still worth keeping as
  the "why" behind a rule — but a growing list of near-duplicate rows should be merged rather than
  left to accumulate.
- **Bump this doc's front-matter `version` and `updated` date whenever content changes**, and re-run
  `npm run kms:build-index` **last**, after all edits, per the ordering rule this same document
  states above — this file is itself a KMS-indexed artifact and is not exempt from its own advice.

**Anyone hitting a previously undocumented problem** should add it here once resolved, using the
Symptom → Likely cause → Checks → Resolution shape already established above, so the next person (or
the next automated loop) diagnoses it faster than the first time it happened.
