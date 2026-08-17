---
id: sdd-workflow
title: SDD Workflow
audience: [dev]
type: doc
status: approved
version: "2.14.0"
updated: 2026-08-17
visibility: internal
summary: The SDD delivery loop — Orient, Propose, Spec, Build, Document (build notes), Clear, Validate, Fix, Ship, Document (final), Clear — with two deliberate context resets so validation runs against the spec, not the memory of building it. Each stage is also a Claude Code slash command.
tags: [sdd, workflow, process, context]
---

# SDD Workflow

The operational vocabulary for how work moves through this repo — one keyword per stage, most of
them also available as a Claude Code slash command (`.claude/commands/<keyword>.md`) so the
discipline is invoked directly rather than relied on from memory. `CLAUDE.md`'s **four SDD gates**
(Propose, Spec, Validate, Changelog) are the non-negotiable core; the surrounding stages are the
connective tissue this repo's actual history shows are just as easy to get wrong. Where this doc and
a command file disagree, this file governs — commands are regenerated to match, not the reverse
(same relationship `design-system.md` has to `tokens.css`).

## The loop

```
ORIENT → PROPOSE → SPEC → BUILD → DOCUMENT (build notes)
                                        ↓
                                     CLEAR  ← switch to Sonnet 5
                                        ↓
                                   VALIDATE ⇄ FIX
                                        ↓ (passes)
                                      SHIP
                                        ↓
                              DOCUMENT (final, incl. KMS)
                                        ↓
                                     CLEAR  ← switch to Opus 5 → back to ORIENT
```

**Why the switch sits after Document, not before.** Document (final) is reconciliation work —
roadmap row, KMS rebuild, board sync — against a branch the current Sonnet 5 session already has
full context on from Ship; it needs none of Opus's extra reasoning. Switching model *before* it, as
this diagram previously showed, means the newly-switched Opus 5 session spends tokens re-orienting
to that same context just to do reconciliation, then sits idle for the switch that actually matters:
Opus is what the *next* loop's Orient/Propose/Spec/Build needs. Corrected 2026-08-12: the switch now
sits at the second Clear, right before Orient, so Document runs on the model that's already warm and
the next loop starts already on Opus 5 — one switch, spent where it's used.

**Why the two Clears.** A context that just built something is the worst possible judge of whether
it matches the spec — it remembers the intent, so it reads the intent into the code. Clearing before
Validate forces the check to run against `requirements.md` and the artifact on disk, which is the
only version of the spec a future maintainer will ever have. This has already caught real defects
under the old single-context flow (a consolidated `features/cart/actions.ts` that quietly deviated
from the spec's one-file-per-action shape; webhook functions that resolved `getPrisma()` internally
and so couldn't be proven against real Postgres) — the reset makes that catch systematic rather than
lucky.

**The cost.** Everything load-bearing must be on disk *before* a Clear. Anything living only in the
conversation is gone. That is the discipline the flow is buying, not a side effect of it.

## Two machine checks

Every SDD gate fires *before or at merge* — `pre-commit` (Gate 2), `pre-push` and `gates.yml`
(Gate 4), CI (Gate 3). Nothing had teeth after Ship, which is exactly how P3a, P3b and P3c all
shipped with no roadmap change-log entry while cart, checkout and payments went live. Two commands
turn the loop's two honor-system promises into exit codes:

| Command | Stage | Asks |
|---|---|---|
| `npm run sdd:preclear` | end of Document (build notes) | Would this Clear destroy anything? |
| `npm run sdd:audit` | Orient | Did the last shipped slice actually get documented? |

Both live in `scripts/sdd-check.ts` and copy `hooks/pre-push`'s posture: resolve `origin/staging`,
else `origin/main`, else don't block. `sdd:audit` only looks at slices *after* the loop baseline
constant — it deliberately does not police slices that predate this workflow.

Neither is a substitute for judgment. `sdd:preclear` proves files exist and the tree is clean, not
that the build notes are any good; `sdd:audit` proves a roadmap row *mentions* the slice, not that
the row is worth reading.

## The delivery board

The GitHub Project **“Aheed Online Store — Delivery”** (`#2`, owner `sriahead`, provisioned by
`scripts/provision-project.sh`) is a generated **view** of this roadmap — the **status layer only**.
Scope and acceptance criteria live in `specs/`, never on the board.

Its one non-obvious rule, which the loop has to respect: **`Done` means *in production*, not
merged.** PRs here merge into `staging`, not the default branch, so `Closes #NN` does **not**
auto-close on merge — the issue closes when the work is promoted to `main`. Staging-merged work
therefore sits in **In Review** until promotion. That is the agreed semantics, not a bug, and it is
why open issues for shipped slices are expected rather than a backlog leak.

| Loop stage | Board action |
|---|---|
| Propose | add the new issue to the project, set **Phase**, leave Status **Backlog** |
| Build | move to **In Progress** |
| Ship — merged to `staging` | move to **In Review** (*not* Done — it isn't in production yet) |
| Ship — promoted to `main` | issue closes → **Done** |
| Document (final) | reconcile the board against reality; it's the status-layer twin of the roadmap update |

> **Prerequisite, now met** (corrected 2026-08-11). The Status field's one-time UI rename — listed
> in `scripts/provision-project.sh`'s manual steps, and UI-only because Projects V2 exposes no API
> for it — **is done**. All four options `Backlog` / `In Progress` / `In Review` / `Done` exist on
> Project #2, so the table above is usable as written. This blockquote previously said the opposite
> and told the reader to substitute `Todo`; it had gone stale, and a reader following it would have
> filed status wrongly.

## Scale the loop to the change

The full loop — two Clears, two model switches — is for a **slice**. A one-file correction (a typo,
a stale doc line, a one-line fix) goes Build → Ship with a CHANGELOG entry and no Clears at all.
This is stated so the loop gets scaled down deliberately rather than skipped wholesale, which is
what happens to a process that charges slice-sized ceremony for a one-line fix.

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
- **Divergence alone doesn't prove the commits were gated.** Cross-check `gh pr list --state all
  --limit 15` against that commit range — if recent `staging` commits don't line up with merged PRs,
  they were pushed directly, which means `gates` never ran on them. Caught at a P6.7 Orient (2026-08-17):
  six slices' worth of commits after PR #182 turned out to be direct pushes, and the one PR that *did*
  run `gates` in that window had failed and been merged anyway — `staging` had been quietly red on
  `lint`/`format:check`/`vitest` the whole time. `git log`'s divergence count doesn't distinguish a
  reviewed merge commit from a direct push; only the PR list does.
- Coming out of a Clear, Orient is also the *re-entry* point: the previous loop's docs are on disk,
  so read them rather than assuming continuity with a conversation that no longer exists.
- **Run `npm run sdd:audit`.** It reports whether slices shipped under this loop got their roadmap
  change-log entry and reached `ARTIFACT_INDEX.md`. A gap here means the previous loop's Document
  (final) never landed — fix it on the current branch, per the carry-forward rule, rather than
  noting it and moving on. This is the only check that runs *after* Ship, so treat a failure as
  real work, not a warning.
- Read the delivery board as the status layer (`gh project item-list 2 --owner sriahead`) — but
  trust `specs/` and the filesystem for scope. A board that disagrees with the repo is a board that
  needs reconciling, not a source to plan from.

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
- **Put it on the board**: `gh project item-add 2 --owner sriahead --url <issue-url>`, set its
  **Phase**, and leave Status at **Backlog**. An issue that never reaches the board is invisible to
  every later stage — ten issues (#93–#106) were filed after the board was provisioned and none of
  them were added, until a sync caught it.
- **Assign a milestone**: Every issue must be explicitly associated with its relevant roadmap milestone (e.g., `gh issue edit <number> -m "P6 — Admin & staff panel"`). This ensures the GitHub issue matches the project board's phase.
- Wait for explicit approval on non-trivial work before Spec/Build. A prior approval does not carry
  forward to a new, unrelated decision.

## Spec

Gate 2 — no source without `specs/<YYYY-MM-DD-feature>/requirements.md`.

**Under this flow the spec carries more weight than it used to**: it is the *only* thing the
post-Clear validation context has to check against. An ambiguity that a same-context validator would
have silently resolved from memory becomes a genuine failure mode here. Write for a reader who was
not present.

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
- **Don't verify the *absence* of a word with `grep` when the artifact is prose or carries an
  explanatory comment.** Good code and good docs *name the thing they deliberately exclude* — so the
  grep matches the explanation and the only way to "pass" is to delete the most useful sentence in
  the file. P4a hit this twice in one slice: R5 (`grep -n "note"` matched the comment explaining why
  `note` is deliberately absent) caught at Build, and R27 (`grep -n "Todo"` matched the *corrected*
  blockquote naming the mistake it had just fixed) caught at Validate. Target the syntax that would
  actually constitute the defect (`\bnote\s*[:?]` for a field), or assert the property in a test, or
  state the property and read it — but don't let a check reward deleting the rationale.
- If the slice also changes a **standing decision** (architecture, tech choice, design tokens), also
  write or update the relevant **persistent doc** (`specs/architecture.md`, `tech-stack.md`,
  `design-system.md`, ...) — the dated folder is the one-time slice, the persistent doc is what
  future sessions read as current truth.
- **Adversarial pass before presenting**: read your own draft asking what's missing, ambiguous, or
  quietly out of scope. Explicitly list deferred items (don't let them vanish silently) and check
  the spec doesn't contradict an existing ADR or persistent doc.
- Commit the spec files as their own commit, before any implementation commit.

## Build

Implement to the approved spec — nothing more.

- Move the issue to **In Progress** on the board when you start.
- Reuse before create: check for an existing port/adapter/utility before writing a new one.
- Match existing conventions: semantic design tokens, not raw hex/px, in UI; Clean Architecture
  layering (components never import Prisma or the storage client directly); the project's existing
  file/module shape for the area you're in.
- No scope creep past `requirements.md`. A gap you notice but that's out of scope becomes a Propose
  candidate for later, not a silent addition now.
- **Design for testability against the acceptance criteria.** If a requirement asserts a runtime
  property (a transaction is atomic, a handler is idempotent), the code must expose a way to prove
  it from a plain script — pass `prisma`/`vendorId` as explicit arguments rather than resolving them
  from request context inside the function. `placeOrder(prisma, vendorId, input)` exists in exactly
  that shape because the earlier version couldn't be exercised outside a request.

## Document (build notes)

Everything that must survive the Clear. This is a **write-to-disk** stage, not a summary stage.

- Write `specs/<YYYY-MM-DD-feature>/build-notes.md` **from
  `specs/templates/feature-spec/build-notes.md`**, not from a blank file: what was changed and why,
  decisions taken during the build that the spec didn't dictate, anything deliberately deviating
  from the spec (and the justification), and any known-shaky area worth extra scrutiny. The
  template's four headings are exactly what `sdd:preclear` greps for — keep them, and write "None."
  under one rather than deleting it. No front-matter: like `requirements.md`/`validation.md` it's
  slice-local, not a KMS artifact.
- **Gate 4 lands here, not in the final Document stage** — the `[Unreleased]` `CHANGELOG.md` entry
  must be on the branch *before* it merges, and the pre-push hook plus CI both enforce that. Write it
  in the terse style of existing entries (what shipped, why, what's deliberately deferred). Gate 4's
  CI check only verifies a diff exists **against the PR's current base branch** — if another PR
  merges first and moves that base, your diff can vanish and the check fails on reopen. Write it
  before opening the PR, never as a follow-up push.
- Update any **persistent doc** whose standing decision this slice changed (see Spec). These are part
  of the change and belong on the same branch, not deferred to the post-ship pass.
- Anything deliberately deferred becomes a tracked GitHub issue now, while the reasoning is fresh —
  not a comment, and not something the next context is expected to remember.
- Commit it all. If it isn't committed, the Clear destroys it.
- **Then run `npm run sdd:preclear` and get exit 0.** It is the gate on this stage, not a
  formality: it derives the slice from the branch, requires all four spec files, requires the
  build-notes template's sections, requires a `CHANGELOG.md` diff against the base, and requires a
  clean working tree. Don't announce that it's safe to clear on the strength of having *intended*
  to commit everything.

## Clear (pre-validation)

A hard context reset. **Manual — the user runs `/clear`; the assistant cannot invoke it.**

`npm run sdd:preclear` must exit 0 first. It checks, mechanically:

- [ ] `specs/<date-feature>/` — `plan.md`, `requirements.md`, `validation.md`, `build-notes.md`
- [ ] `build-notes.md` has its four required sections
- [ ] `CHANGELOG.md` differs from the base branch (Gate 4)
- [ ] The working tree is clean — nothing lives only in the editor

Still on you, because no script can judge them:

- [ ] The build notes are actually *informative*, not just present
- [ ] Persistent-doc updates for any changed standing decision
- [ ] GitHub issues filed for every deferred item
- [ ] **`npm run kms:build-index` has been run and the result committed.** Every slice adds a
      front-mattered `plan.md`, so every slice makes `ARTIFACT_INDEX.md` stale — and CI's `gates`
      job fails on exactly that. Nothing before CI catches it: `sdd:preclear` doesn't check it, and
      it isn't in Validate's local pre-flight (`lint`/`format:check`/`typecheck`/`test`/`build`), so
      a slice can pass every local gate and still fail its first CI run. P4a remembered by hand;
      P4b didn't and burned a red CI run plus a fix commit (**#132** tracks teaching `sdd:preclear`
      to check this so it stops depending on memory).
      **Run it LAST — after every front-matter edit, immediately before `git add`.** The index
      embeds each artifact's `version`/`updated`, so bumping any front-matter *after* the rebuild
      re-stales it, and "I ran `kms:build-index`" is not the same claim as "the index matches the
      tree". P5a's closeout burned a red CI run on exactly this: the index was rebuilt first, then
      `roadmap.md` (1.13.0→1.14.0) and this file (2.4.0→2.5.0) were bumped, and CI's rebuild-and-diff
      caught two stale version cells. The check normalises away the timestamp and commit footer, so
      a footer-only difference is *not* what fails it — a version cell is.
      **If a slice's own `validation.md` writes this check as a raw `git diff --exit-code
      ARTIFACT_INDEX.md`, it will spuriously fail on every re-run once the index has been committed
      once.** The footer embeds `git rev-parse HEAD` at generation time, so a committed index can only
      ever cite its own parent commit — regenerating it again post-commit always shows a one-commit
      footer diff, forever, by construction. `gates.yml`'s check (above) strips exactly that footer
      with `sed` before comparing; a slice's `validation.md` row for this check should mirror that
      normalisation (or just trust CI's result) rather than a bare `git diff --exit-code`. P6.7's
      closeout slice wrote the bare version, `/validate` reported it failing, and `/fix` spent a
      commit chasing it — harmless (freshening the index is never wrong) but unnecessary, since CI
      would have passed either way.

Then **switch to Sonnet 5** (`/model claude-sonnet-5`) for the validation half of the loop. The
assistant cannot switch its own model — if a stage is running on the wrong one, it should say so and
ask rather than proceed quietly.

## Validate

Gate 3, run from a **fresh context**. Load `requirements.md` + `validation.md` + the artifact.

- **The spec is the authority.** Validate the artifact against `validation.md`'s rows and
  `requirements.md`'s `R1..Rn` — not against what the build notes claim was done. Read
  `build-notes.md` only as supporting context (where to look, what was deliberately deviated), never
  as a substitute for checking. If the notes and the artifact disagree, the artifact is the fact and
  the notes are the claim.
- **If the spec itself looks wrong**, say so rather than validating around it. A fresh context that
  conforms to a bad requirement produces a passing slice that's still broken; escalate it as a
  finding and, if it's a real design defect, go back to Spec rather than patching under Fix.
- Run the local suite as a fast pre-flight (`lint`, `format:check`, `typecheck`, `test`, `build`) —
  but **don't fully trust local `format`/`lint` output on a Windows checkout**. `core.autocrlf`
  rewrites line endings on checkout, which makes `prettier --check` flag files that are actually fine
  on the real (Linux) CI runner. When local and CI disagree, CI is the authority; verify by diffing
  against the actual committed git blob (`git show HEAD:<file>`) before treating a flagged file as
  real drift.
- Walk **every row** of `validation.md`, not just the generic lint/test/build commands. A row that
  can't be checked in this environment is reported as unverified, with the reason — never quietly
  marked as passing.
- UI changes: verify against rendered output (compiled CSS, rendered HTML, browser screenshot), not
  code review alone. DB-touching code: `npm run preview`, never `npm run dev` (see `CLAUDE.md`).
- **Server actions can be driven headlessly against `npm run preview`** — no browser needed. Next
  renders every `<form action={serverAction}>` with progressive-enhancement fields, so submitting
  those fields as `multipart/form-data` invokes the real action, and `Set-Cookie` on the response
  is how you prove a *negative* (P3d's "matching writes nothing" was verified this way). Three
  traps, each of which cost a dead end in P3d:
  - **`fetch`/undici silently drops a caller-set `Host` header.** Under multi-tenancy the vendor is
    resolved from the host, so every request lands on `/coming-soon` and looks like a broken app.
    Use `node:http` with `{ setHost: false }` and set `Host` yourself.
  - **`$ACTION_REF_1` renders with no `value` attribute.** A parser that requires `value="..."`
    drops it, the action payload is unparseable, and the POST fails as a bare `500` with nothing in
    the response body. Parse each `<input>` whole, then read `name`/`value` out of it.
  - **A `<select>` is a form field too.** Serialize `<input>` *and* `<select>` in document order, or
    any action pairing repeated fields positionally will be tested against the wrong shape.
  - **An action's id is a stable build-time hash, independent of any session** — you don't need to
    render an authenticated page to discover it. `.next/server/server-reference-manifest.json` maps
    every server action's id to its `filename`/`exportedName`; grep the built bundle
    (`.next/server/app/**/page.js`) for that id string to confirm which `$ACTION_1:0` shape it
    expects. This is what let P5b's Validate exercise `/staff/discounts`'s admin actions — including
    the no-`Cookie` and wrong-role refusal cases — **without a valid session to render the form
    first**, which matters exactly when the row under test is about authorization itself.
- **Check which database the Worker is actually on before trusting a live result.** `npm run preview`
  reads `.dev.vars`; `prisma migrate`/`db:seed` and any local inspection script read `.env`. When
  those point at different Neon projects, a live check silently validates against a database the app
  isn't using. Compare both before starting, not after a confusing result.
- **A real browser can sign in against `npm run preview` — #176 is fixed** (verified 2026-08-17 at
  the #192 audit). `lib/auth-origin.ts`'s `splitHostPort` keeps the request port (and handles
  bracketed IPv6 literals) and `inferProto` returns `http` for loopback rather than trusting
  `wrangler dev`'s default `x-forwarded-proto: https`, so preview's trusted origin is
  `http://localhost:8787`, port included. **This entry said the opposite until 2026-08-17, and its
  diagnostic is now inverted** — it told the reader that `Origin: http://localhost:8787` gets `403`
  and that `Origin: http://localhost` (no port) gets `200`, and instructed them to apply a
  temporary uncommitted patch to `lib/auth-origin.ts`. Today the port-ful origin is the one that
  passes and the port-less one is correctly refused as a genuine mismatch, so a validator following
  the old text would have concluded a working app was broken. The fix had actually landed as
  GAP-002 of P6.5, but its only evidence was 26 unit tests — the reported symptom was never
  re-fired, so #176 stayed open and this paragraph stayed stale. Current behaviour, if you need to
  confirm it:

  | `Origin` on `POST /api/auth/sign-in/email` | Result |
  |---|---|
  | `http://localhost:8787` | reaches credential checking (`401` on a wrong password) |
  | `http://localhost` | `403 INVALID_ORIGIN` — correct, it isn't the request's origin |

  Because the origin check runs *before* credential validation, a deliberately wrong password is
  enough to tell the two apart — you never need a real credential to test this. Headless
  `node:http` calls with a session cookie remain the right tool for rows that don't specifically
  need a real browser (CORS, canvas/EXIF, on-screen rendering).
- CI (`gates`) is the real Gate 3 — don't report a slice done until it's actually green on GitHub,
  not "should be green based on local output."

## Fix

Validation failed. Correct the artifact, then **re-run Validate from the top** — not just the row
that failed, since a fix can break a row that previously passed.

- Fix the root cause, not the check. If a requirement can't be proven because the code isn't shaped
  to allow it, reshape the code — that's what produced the `placeOrder(prisma, vendorId, input)` and
  `getWebhookOrderService()` refactors, both found at this stage.
- **Know when a fix is really a redesign.** If it needs a new decision rather than a correction, stop:
  that's a Spec-level change, and improvising it here — on the validation model, in a validation
  mindset — is how scope quietly escapes review. Say so and go back.
- Update `build-notes.md` and, if the fix changed observable behaviour, the CHANGELOG entry.
- **`hooks/pre-commit`'s Gate 2 check only looks for a *new* `specs/*/requirements.md` on the
  branch** — it has no way to recognise "this branch corrects an already-existing, already-approved
  spec," which is exactly what a Fix-stage branch usually is. A Fix commit that touches
  `app/`/`lib/`/etc. with no new spec file will be blocked by the hook even when the actual Gate 2
  intent (spec exists before code) is satisfied — the spec just isn't new. `git commit --no-verify`
  is the hook's own documented escape hatch for this case; use it, and say so in the commit message
  and to the user, rather than silently bypassing or inventing a throwaway spec file just to satisfy
  the heuristic. First hit at the P7a `/fix` pass (2026-08-17, #123/#162).

## Ship

Get validated work through the branch → PR → deploy chain deliberately. Not one of `CLAUDE.md`'s four
named gates, but the part of this repo's actual history most prone to drift.

- Branch off the freshly **fetched** base (`origin/staging`, not a stale local branch) for new work.
- Push everything for one logical unit as a complete commit (or set of commits) *before* opening
  the PR. Don't iterate live against CI on an already-open PR — merges here have landed within
  seconds of opening more than once, stranding a fast-follow commit outside the merge.
- Open the PR referencing its issue (`Closes #NN`). Wait for the **actual** CI result before calling
  it ready — poll correctly (multi-line `gh pr checks` output breaks a naive string-equality check;
  match on absence of `pending` instead) rather than assuming a run will pass.
- **`gh pr checks` is a view, not the truth — cross-check a long "pending" against
  `gh run view <run-id> --json status,conclusion`.** During P5a's promotion (#140) a `gates` run
  showed every step green in the Actions UI, including `Complete job`, while the job's own status
  stayed `in_progress` and `gh pr checks` reported `pending 0` for **56 minutes**; `gh run cancel`
  on it returned `HTTP 500`. The run had in fact succeeded in ~1 minute. githubstatus.com showed
  **Actions "Operational"** but a separate active **API Requests / GraphQL** degradation — the
  status-finalisation write rides that degraded path, so the component badge for Actions stays green
  while its status reporting is broken. Consequences for this stage: an `until ! gh pr checks | grep
  pending` loop can spin forever on an already-finished run, and "still pending" is **not** evidence
  a job is still working. When a run's steps are all green but its status won't settle, read the run
  API directly, and check **every** status-page component rather than only Actions. See also
  `CLAUDE.md`'s outage guidance: an incident window is the wrong time to exercise the production
  gate, but a stuck *reporting* layer is not the same thing as a stuck job.
- Merging, and any promotion that triggers a deploy, are hard-to-reverse and visible to others:
  always get explicit confirmation before either, even immediately after a related approval — one
  merge is not blanket permission for the next one.
- Confirm the deploy workflow (`deploy-staging`/`deploy-production`) actually completed. Don't infer
  success from the merge alone.
- **Move the issue to `In Review` once it's merged to `staging`** — not `Done`. `Done` means in
  production, and `Closes #NN` won't fire on a staging merge because staging isn't the default
  branch. The issue closes (→ `Done`) when the work is promoted to `main`.
- `staging → main` is its own deliberate promotion PR, mirroring the existing "Promote X to
  production" title convention — staging gets deploy-tested first, the production merge is a second,
  separate confirmation, not a rubber stamp on the first.
- **A promotion PR closing several issues needs the keyword repeated per issue** —
  `closes #93, closes #96, closes #99`, not `Closes #93, #96, #99`. GitHub only honours the closing
  keyword for the *first* issue in a comma-separated list; the rest stay open on merge with no error
  or warning (#112, found on PR #108). This bites specifically here because slice PRs merge into
  `staging`, never the default branch, so every issue closure is deferred to a promotion PR — which
  is exactly where several `Closes` references pile up at once.
- If a PR merges before a fix/follow-up commit lands, don't force-push or rewrite history to patch it
  in retroactively — open a tracking issue and land the fix as its own proper follow-up PR.
- **A PR body referencing an issue that must stay open is a closing-keyword trap, independent of the
  staging/main issue above.** Drafting PR #209's body for a slice against issue #192 (an umbrella
  issue that stays open on purpose — one of its four items was explicitly left undischarged), a
  first draft included a line reading "Closes issue #192's uncovered validation debt…" — not the
  canonical `Closes #NN` form, but close enough in prose to be worth not trusting by eye. Verified
  with `gh pr view <N> --json closingIssuesReferences` (empty, confirming GitHub's keyword parser
  requires the keyword immediately adjacent to the reference, e.g. `Closes #192` with nothing
  between them) — but the safer habit is to avoid the closing-keyword words entirely anywhere near
  that issue number in the body, and to run the same `closingIssuesReferences` check on any PR that
  references an issue it must not close, before merging rather than after.

Then go straight to **Document (final)** — no model switch here. It runs on the same Sonnet 5
session that just shipped.

## Document (final)

The durable record of what actually shipped and what validation actually proved. Supersedes
`build-notes.md` where they disagree — the notes describe intent at build time, this describes
verified reality. **Runs on the same model as Ship (Sonnet 5), not a freshly-switched Opus 5** — see
"Why the switch sits after Document, not before" above.

- Rebuild the KMS index (`npm run kms:build-index`) and re-validate front-matter
  (`npm run kms:validate`). **The index footer records the commit it was built from, so a post-ship
  rebuild always trails the slice it documents by one commit.** That is expected, not a bug — it
  rides along on the next slice's branch rather than triggering a PR of its own.
- Reconcile the docs with what validation actually found. Live verification routinely surfaces things
  no amount of pre-ship writing would have predicted (an unverified Resend sending domain that
  blocked all real email delivery; a payment-failure path that needed a scheduled window against live
  secrets) — those become tracked issues and doc corrections here.
- Update `specs/roadmap.md`: progress, and a closure note in its change log if this closed out a
  phase/milestone, matching existing entries' style. **This is the step `sdd:audit` checks at the
  next Orient** — if it doesn't land, the next loop opens with a reported gap. Verify with
  `npm run sdd:audit` before you consider this stage done, rather than waiting to be caught.
- **Reconcile the delivery board** — the status-layer twin of the roadmap update. Every issue for
  this slice should be `In Review` (staging) or closed/`Done` (promoted to `main`), and anything
  newly deferred should be on the board with a Phase. The board holds status only; nothing that
  belongs in `specs/` goes there.
- Record anything the loop itself taught — a trap worth encoding in this file or `CLAUDE.md` — while
  it's still cheap to write down.
- Later phases (P7 compliance, P8 handover) need compliance reports / a handover pack per their own
  specs when the time comes — call that out explicitly in that phase's `requirements.md`, don't
  assume this stage covers it by default.

**Carry-forward rule:** doc changes made after the slice's PR merged land on the *next* slice's
branch, not a PR of their own. Gate 4 requires a CHANGELOG diff on every branch, so a doc-only PR
needs its own CHANGELOG entry to be pushable at all — worth it for a real correction, wasteful for
an index footer.

When this stage is done, tell the user to **switch to Opus 5** (`/model claude-opus-5`) and *then*
run `/clear` — the assistant can do neither itself. Switching here, not right after Ship, means the
model that does the reconciliation work is the one already holding the context, and the model that
starts the next loop's Orient/Propose/Spec/Build is warm rather than freshly switched and idle.

## Clear (post-documentation)

Second hard reset, closing the loop. **Manual — the user switches to Opus 5, then runs `/clear`.**

Before clearing, confirm committed (or deliberately carried forward as uncommitted working-tree
changes, noted for the next branch):

- [ ] Final documentation and KMS index
- [ ] Roadmap updated
- [ ] Every deferred item is a tracked issue, not a memory

Then return to **Orient** for the next slice, already on Opus 5 — which, coming out of a Clear,
means reading the repo rather than resuming a conversation.
