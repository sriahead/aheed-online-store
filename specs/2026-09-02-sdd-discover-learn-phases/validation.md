# DISCOVER and LEARN — milestone-level SDD phases (validation)

> **Testing Strategy (Lean 80/20 Model)**
> This slice ships **no runtime code** — no route, no repository, no schema change, no server action.
> It is documentation, two Claude Code command files, and three KMS-registered artifacts. Unit and
> integration tests would have nothing to bind to, so the confidence here comes from the KMS
> pipeline (front-matter validation, generated-artifact currency, and the Nextra build that the root
> gates never run) plus literal inspection of the files against `requirements.md`.
>
> The one genuine risk this slice carries is the **MDX pipeline**, and it is a real one: research
> prose quotes UI labels and cites percentages, which is exactly what the bare-curly-brace and
> bare-`<`-before-a-digit traps catch. R9 is therefore the load-bearing row, not a formality.

## Verification

| Req | How to verify |
| --- | --- |
| R1 | `grep -n "^## Discover$\|^## Learn$" specs/sdd-workflow.md` returns both headings. |
| R2 | `grep -n "^## Milestone close (Discover, then Learn)$" specs/sdd-workflow.md` returns one line; read the section and confirm it states Discover runs first and gives the ordered steps. |
| R3 | `sed -n '1,13p' specs/sdd-workflow.md` shows `version: "2.27.0"`, `updated: 2026-09-02`, and a `summary` naming Discover and Learn. |
| R4 | `head -3 .claude/commands/discover.md .claude/commands/learn.md` shows a front-matter block with `description:` in each. |
| R5 | `head -3 docs/research/*.md` shows front-matter opening each file; confirm each `id` value is lowercase letters, digits and hyphens only. |
| R6 | `npm run kms:validate` prints `invalid front-matter (failing): 0`; `npm run kms:validate \| grep "docs/research"` returns nothing (they are in the valid set, not the warning list). Redirect to a file and read it rather than piping to `head` — never truncate a script's stdout. |
| R7 | `grep -n "docs/research/" ARTIFACT_INDEX.md` returns all three paths. |
| R8 | `npm run kms:check-generated` exits 0 and reports both artefacts current. |
| R9 | `npm run kms:assemble:internal && (cd kms/site-internal && npx next build --webpack)` — redirect to a file, then check the **real exit status** and confirm the summary line reports all pages generated. A pipe through `tail` reports the pipe's success, not the build's. Confirm `research-index`, `discovery-log` and `milestone-retrospectives` appear among the assembled content. |
| R10 | Read `.claude/commands/document.md`; confirm a numbered step names `/discover`, `/learn`, and places them before the model switch and `/clear`. |
| R11 | Read `.claude/commands/orient.md`; confirm a numbered step names `docs/research/discovery-log.md`. |
| R12 | Read the block added to `CLAUDE.md` after the workflow paragraph; confirm it names both commands, states Discover runs first at milestone close, and states neither is a gate. |
| R13 | Read `CLAUDE.md`'s "The four SDD gates (non-negotiable)" section; confirm four numbered items, wording unchanged (`git diff` shows no edit inside that section). |
| R14 | Read `docs/research/discovery-log.md`; count three `###` findings under the dated pass, each ending in a single `**Next action:**` line whose value is one of the five permitted. |
| R15 | `gh issue list --limit 20 --state all` shows `#550` and `#551` as the only issues created today for this work; `grep -n "order adjustment\|analytics instrumentation\|capacity ceiling" specs/roadmap.md` returns nothing. |
| R16 | Read `docs/research/milestone-retrospectives.md`; confirm a template block, no milestone entry, and the paragraph stating P8 is deliberately not backfilled. |
| R17 | `git diff --stat origin/staging -- scripts/sdd-check.ts package.json` returns no changes. |
| R18 | `git diff origin/staging -- CHANGELOG.md` shows the entry for this slice. |
| R19 | `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run format:check` all pass. **Run vitest alone**, not alongside another heavy build, and check the file/test totals (currently 74 files / 874 tests) rather than the exit code — under load its forks pool silently skips whole files and still exits 0. |

## Notes for the validator

- **This slice changes the process the validator itself follows.** Read `specs/sdd-workflow.md`'s new
  sections before walking the table, or the `/document` and `/orient` rows will look like arbitrary
  edits to unrelated command files.
- **Do not treat the seeded discovery findings as work.** They are evidence. R15 exists specifically
  to catch a well-meaning validator filing issues for them.
- **`ARTIFACT_INDEX.md`'s footer records the commit it was built from**, so it trails this branch by
  one commit. Expected, not a failure of R7 or R8.
