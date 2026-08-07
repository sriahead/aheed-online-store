---
id: sdd-workflow
title: SDD Workflow
audience: [dev]
type: doc
status: approved
version: "1.0.0"
updated: 2026-08-06
visibility: internal
summary: The seven-stage SDD workflow (Orient, Propose, Spec, Build, Validate, Document, Ship), each also an invokable Claude Code slash command, expanding CLAUDE.md's four gates.
tags: [sdd, workflow, process]
---

# SDD Workflow

The operational vocabulary for how work moves through this repo — seven keywords, one per stage,
each also available as a Claude Code slash command (`.claude/commands/<keyword>.md`) so the
discipline is invoked directly rather than relied on from memory. `CLAUDE.md`'s **four SDD gates**
(Propose, Spec, Validate, Changelog) are the non-negotiable core of this; **Orient**, **Build**, and
**Ship** are the connective tissue around them that this repo's actual history shows are just as
easy to get wrong. Where this doc and a command file disagree, this file governs — commands are
regenerated to match, not the reverse (same relationship `design-system.md` has to `tokens.css`).

## Orient

Check the actual repo before proposing or building anything — not what a doc *says* is true.

- Read the code/config for the area you're touching, not just the doc that describes it.
  `docs/repo-structure.md`'s phase-tags have already gone stale in places (it tagged `tsconfig.json`
  and a hex/px-lint rule as P6 after both were effectively superseded) — `specs/roadmap.md` and the
  actual filesystem are authoritative, planning-doc sketches are not.
- Check whether a roadmap item is *actually* buildable now, not just nominally next. `lib/repositories/`
  is listed under P0/P1 scope but has nothing to wrap until real Prisma models exist beyond
  `HealthCheck` — confirmed by checking the schema, not by assuming the roadmap line is ready.
- Check current branch and how far `staging`/`main` have actually diverged (`git fetch` + `git log
  origin/main..origin/staging`) before assuming either is in a known state — both moved underneath
  this workflow mid-session more than once.

## Propose

Gate 1. Calibrate the ceremony to the size of the fork.

- **Routine, single-approach work**: state the plan in a sentence or two and proceed. Don't open
  a planning session for a typo fix or an obvious one-file change.
- **Real forks** — architecture choices, a missing input (brand assets, an undecided config
  approach), anything with more than one defensible answer — stress-test it: name the alternative,
  say why it lost, and ask rather than guess when the answer is genuinely the user's call (e.g.
  Tailwind CSS-first `@theme` vs `tailwind.config.ts`; a placeholder palette vs waiting for a real
  brand kit).
- Open a GitHub issue before the spec, for anything beyond a trivial fix. The issue is what a PR's
  `Closes #NN` and the eventual CHANGELOG entry both anchor to.
- Wait for explicit approval on non-trivial work before Spec/Build. A prior approval does not carry
  forward to a new, unrelated decision.

## Spec

Gate 2 — no source without `specs/<YYYY-MM-DD-feature>/requirements.md`.

- **Every slice gets all three files: `plan.md`, `requirements.md`, `validation.md`.** Copy from
  `specs/templates/feature-spec/`, don't write from a blank file or from memory of "the most recent
  slice" — that's exactly how four slices drifted to a two-file pattern and lost `plan.md` before
  this line existed (issue #27). `plan.md` carries the front-matter and is the file that gets an
  `ARTIFACT_INDEX.md` entry — it's the narrative (goal, scope, deliberately-excluded, rationale)
  that `requirements.md`'s terse `R1..Rn` list can't carry on its own. `requirements.md` and
  `validation.md` deliberately don't get their own front-matter/index entry.
- `requirements.md`: numbered `R1..Rn`, each one objectively checkable sentence (a tool exits 0, a
  file exists with property X, a route returns Y) — no "should" language. `validation.md`: a
  `| Req | How to verify |` table, one concrete step per row.
- If the slice also changes a **standing decision** (architecture, tech choice, design tokens), also
  write or update the relevant **persistent doc** (`specs/architecture.md`, `tech-stack.md`,
  `design-system.md`, ...) — the dated folder is the one-time slice, the persistent doc is what
  future sessions read as current truth. Three-document pattern (plan/requirements/validation) plus
  the persistent doc when a standing decision changes, not one file improvised per slice.
- **Adversarial pass before presenting**: read your own draft asking what's missing, ambiguous, or
  quietly out of scope. Explicitly list deferred items (don't let them vanish silently) and check
  the spec doesn't contradict an existing ADR or persistent doc.
- Commit the spec files as their own commit, before any implementation commit.

## Build

Implement to the approved spec — nothing more.

- Reuse before create: check for an existing port/adapter/utility before writing a new one.
- Match existing conventions: semantic design tokens, not raw hex/px, in UI; Clean Architecture
  layering (components never import Prisma or the storage client directly); the project's existing
  file/module shape for the area you're in.
- No scope creep past `requirements.md`. A gap you notice but that's out of scope becomes a Propose
  candidate for later, not a silent addition now.

## Validate

Gate 3 — `lint`, `typecheck`, `test`, and `validation.md`'s criteria all pass.

- Run the local suite first (`lint`, `format:check`, `typecheck`, `test`, `build`) as a fast
  pre-flight — but **don't fully trust local `format`/`lint` output on a Windows checkout**.
  `core.autocrlf` rewrites line endings on checkout, which makes `prettier --check` flag files that
  are actually fine on the real (Linux) CI runner — this happened repeatedly. When local and CI
  disagree, CI is the authority; verify by diffing against the actual committed git blob
  (`git show HEAD:<file>`) if it's unclear whether a flagged file is real drift or checkout noise.
- CI (`gates`) is the real Gate 3 — don't report a slice done until it's actually green on GitHub,
  not "should be green based on local output."
- UI changes: verify by running the dev server and inspecting the rendered output (compiled CSS,
  rendered HTML, or a browser screenshot) — not from code review alone.

## Document

Gate 4 — `CHANGELOG.md` updated **before** the branch merges, plus whatever else the phase needs.

- Add the `[Unreleased]` entry as part of the same commit/PR as the change, in the terse style of
  existing entries (what shipped, why, what's deliberately deferred) — not as an afterthought PR.
  Gate 4's CI check only verifies a diff exists **against the PR's current base branch** — if
  another PR merges first and moves that base, your diff can vanish and the check fails on
  reopen. Write the entry before opening the PR, not as a follow-up push.
- Update the relevant persistent doc (see Spec) when a standing decision changed, not just the
  CHANGELOG line.
- Anything deliberately deferred becomes a tracked GitHub issue, not a comment that gets lost.
- Later phases (P7 compliance, P8 handover) need compliance reports / a handover pack per their own
  specs when the time comes — call that out explicitly in that phase's `requirements.md`, don't
  assume "Document" already covers it by default.

## Ship

Get Validated + Documented work through the branch → PR → deploy chain deliberately. Not one of
`CLAUDE.md`'s four named gates, but the part of this repo's actual history most prone to drift.

- Branch off the freshly **fetched** base (`origin/staging`, not a stale local branch) for new work.
- Push everything for one logical unit as a complete commit (or set of commits) *before* opening
  the PR. Don't iterate live against CI on an already-open PR — merges here have landed within
  seconds of opening more than once, stranding a fast-follow commit outside the merge.
- Open the PR referencing its issue (`Closes #NN`). Wait for the **actual** CI result before calling
  it ready — poll correctly (multi-line `gh pr checks` output breaks a naive string-equality
  check; match on absence of `pending` instead) rather than assuming a run will pass.
- Merging, and any promotion that triggers a deploy, are hard-to-reverse and visible to others:
  always get explicit confirmation before either, even immediately after a related approval — one
  merge is not blanket permission for the next one.
- `staging → main` is its own deliberate promotion PR, mirroring the existing "Promote X to
  production" title convention — staging gets deploy-tested first, the production merge is a
  second, separate confirmation, not a rubber stamp on the first.
- If a PR merges before a fix/follow-up commit lands, don't force-push or rewrite history to patch
  it in retroactively — open a tracking issue and land the fix as its own proper follow-up PR.
