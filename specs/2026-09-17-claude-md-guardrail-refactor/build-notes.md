# CLAUDE.md guardrail refactor — reduce always-loaded context (build notes)

Written at the end of Build, **before** the Clear. The validating context is fresh and has only the
spec, the artifact, and this file.

Issue **#786**. Branch `feature/claude-md-guardrail-refactor`. Base
`edd6e9f3d51c519010349b64afd556e2f9b522b5`.

**Read this first, validator:** two requirements do **not** pass as written — **R1** (size) and
**R8** (diff confinement). Both are declared under *Deviations from the spec* with evidence. Neither
is a silent reinterpretation; both need a judgement that is not mine to make.

## What changed and why

`CLAUDE.md` went from **149,380 to 13,925 characters** (−90.7%). It is loaded into every session
before any work begins, so its whole size was a fixed per-session cost, and five of its statements
had drifted into being false against the repository.

**Three new documents** (`docs/developer-portal/`) took the material with no existing owner:

- `runtime-pitfalls.md` (~37k) — code that passes `lint`/`typecheck`/`test`/`build` and still fails
  on Workers: Prisma/Neon adapter behaviour, the second database, storage credentials, edge caching,
  framework and dependency traps, Workers AI, Better Auth.
- `app-conventions.md` (~21k) — `"use server"` modules, `lib/repositories/*`, staff panel pages,
  React hooks, each with the test that enforces it.
- `local-dev-playbook.md` (~24k) — Windows shell and encoding, and proving something live without a
  browser.

**Six existing documents** absorbed the rest: `specs/architecture.md` (§3.1 raw-SQL scope and the
GAP-011 migration procedure), `specs/tech-stack.md` (pin policy), `specs/sdd-workflow.md`
(front-matter and MDX traps, in the Spec stage where front-matter is actually written),
`specs/design-system.md` (token and branding traps), `docs/developer-portal/env-setup.md` (config
precedence, secret-store traps, local Stripe troubleshooting) and
`docs/developer-portal/sdd/operator-runbook.md` (branch and CI detail).

Content was moved **substantially verbatim** so the relocation is reviewable as a diff. Compression
happened in `CLAUDE.md`, not at the destinations.

**Five reconciliations**, each from repository evidence rather than judgement: the Milestone 0 claim
(M0 closed 2026-08-06; the project is at P10), `@prisma/adapter-neon` stated as 6.19.3 against a
pinned and test-asserted 7.9.1, an env-format claim that generalised two keys into a file-wide
convention, the `phase:`/`gate:` label requirement (`#546`), and the "board holds status only" claim
(`#724`). `#584`'s vitest baseline was **removed, not relocated**.

**Nothing in `app/`, `lib/`, `features/`, `components/`, `tests/`, `prisma/`, `.github/` or any env
file was touched.** The 207 `CLAUDE.md` citations in source were honoured by preserving every cited
section heading.

## Decisions taken during the build

1. **The ledger counts lines, not bullets — and this is what caught the one real omission.** At
   Gate 2 the extractor was widened after an audit showed the `- ` inventory was blind to the four
   SDD gates (numbered items) and the `getPrisma`/`getPrismaWs` split (nested bullets). During
   Build, running `verify-ledger.mjs` surfaced that the **`ProductImage` row-versus-object rule**
   (base lines 221–240) had been relocated **nowhere**. It is now in `runtime-pitfalls.md` under
   *A row and the object it names are written by different systems*. Without the line-level ledger
   this would have shipped as silent knowledge loss.
2. **Two mis-mapped sections were corrected by reading failures, not by assuming.** The verifier
   also showed that the Schema bullets were never copied into `specs/architecture.md` (§3.1 already
   states them in its own words — now recorded as `DELETE`/`DUPLICATE` naming §3.1), and that
   dependency bullets 4–9 went to `runtime-pitfalls.md` rather than `tech-stack.md`. Both are
   per-row overrides in `gen-ledger.mjs` with the reason in a comment.
3. **The circular reference was broken in one direction.** `specs/architecture.md` §3.1 and
   `gap-register.md` GAP-011 both deferred the raw-SQL exception's scope to `CLAUDE.md`, which
   deferred back. §3.1 now states the scope itself; `CLAUDE.md` points at §3.1 and §3.1 points
   nowhere.
4. **A false positive was removed rather than argued with.** `local-dev-playbook.md` quoted a
   historical incident summary containing literal test counts. That is not a baseline, but R16's
   check cannot tell the difference, so the literals were replaced with prose. Better than having
   Gate 3 argue with its own command.
5. **`sdd-workflow.md`'s board section needed no change** — it already describes Status, Priority
   and Complexity correctly. `CLAUDE.md` was the only file carrying the false "status only" claim,
   which narrows `#724` to its command and roadmap halves.

## Deviations from the spec

**1. R1 (size ceiling) is NOT met: 13,925 characters against a ceiling of 10,000 — over by 3,925.**

Four compression passes took it 17,344 → 15,508 → 14,753 → 14,012 → 13,925, with each pass yielding
less. What remains is the rules themselves: 18 sections, every bullet one to three lines, all
evidence and rationale already pushed to the pointer documents.

R1 says explicitly that *"correctness takes priority over compression: no rule may be dropped, and
no wording may be shortened into ambiguity, to reach this number"*, and `validation.md` says *"do
not trim a rule into ambiguity to pass; report it instead."* So this is reported, not hidden. My
assessment is that ~13,000 is the honest floor with every rule intact and every source-cited heading
preserved; reaching 10,000 needs a scope decision I should not take alone. The options, for the
approver:

- **Accept ~13.9k.** Still a 90.7% reduction, roughly 135,000 characters off every future session.
- **Cut named sections to pointer-only.** Server Actions, Repository layer, Staff panel, Design
  tokens and Hooks total ~1,400 characters; reducing each to "see `app-conventions.md`" saves
  perhaps 900 but removes the actual rule from the always-loaded file — and Server Actions is the
  single most-cited section in the codebase (11 source citations).
- **Drop the Commands section** (~700). The brief explicitly asked to keep essential commands.

I did not take any of these unilaterally because each trades a guardrail for characters.

**2. R8 (diff confinement) is NOT met as written: two `.mjs` files were added.**

`git status` shows three non-markdown files: `app/(admin)/staff/runbook/docs.ts` (permitted), plus
`specs/2026-09-17-claude-md-guardrail-refactor/gen-ledger.mjs` and `verify-ledger.mjs`. R8's letter
allows only `.md` plus the two generated artifacts.

R8's *intent* — no application behaviour, configuration or environment change — is fully satisfied:
both files live inside the slice's own spec folder, are imported by nothing, and run only when
invoked by hand. They exist because `validation.md`'s R6 row says *"script it rather than eyeballing"*,
and because deleting them would make the ledger unreproducible, which weakens the very completeness
proof R4–R6 rest on. I am flagging rather than resolving: the approver may keep them and amend R8 to
permit spec-local tooling, or have them deleted after Gate 3.

**3. No other deviation.** Scope was not expanded, the three-document boundary held, no fourth
document was created, `.claude/commands/orient.md` and roadmap Priority handling were untouched, no
issue was closed or commented on, and no `@path` import was used.

## Known-shaky areas

- **`NARRATIVE` was never needed, and that is worth checking.** The final ledger has 29 `KEEP`,
  102 `COMPRESS`, 36 `MOVE` and 6 `DELETE` rows, and all six `DELETE`s are `DUPLICATE`. No row
  claims narrative status. That is the honest outcome — content was relocated rather than judged
  disposable — but a validator should spot-check a few `COMPRESS` rows to confirm the disposition is
  real and not a way of avoiding the `DELETE` classification.
- **Verify phrases are auto-derived** (first ~55 characters of each block), so they prove the text
  is present at the destination, not that it is *well placed* there. Section placement was chosen by
  hand and is the part least covered by machine checks. The boundary test in `plan.md` — "it is
  broken" / "I am writing in this layer" / "I am running something" — is what to judge against.
- **`comm` silently mis-sorted on the first coverage run.** Numeric versus lexicographic ordering
  made it print a warning instead of a result, which looks like a pass. `validation.md`'s own note
  about absence-checks applies to its own commands; sort both inputs the same way before trusting an
  empty result.
- **The docs-site build dirties `kms/site-internal/next-env.d.ts`** (`#423`, `#712`), reproduced
  again here. Restored before the clean-tree check rather than committed.
- **Inbound references were judged by hand.** Five were repointed (`env-setup.md`,
  `nfr-baseline.md`, `onboarding.md`, `regression-tests.md`, `walking-skeleton-runbook.md`); the
  rest still resolve to material `CLAUDE.md` retains. That judgement is per-reference and is the
  other place a fresh reader should re-check rather than trust.
- **Suite result:** `141 files / 1886 tests`, all passing, run alone. Recorded here as a Build-time
  observation only — deliberately **not** written into any document as a baseline (`#584`).
