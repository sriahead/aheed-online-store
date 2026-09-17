# CLAUDE.md guardrail refactor — reduce always-loaded context (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid
> testing the same behaviour multiple times at different levels unless doing so provides additional
> confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

This slice changes documentation only. It ships no runtime behaviour, so there is nothing to
exercise under `npm run preview` and no live-database or two-vendor check applies. The risk it
actually carries is **silent knowledge loss** and **broken references**, so the weight of this
validation sits in the ledger checks (R4, R5, R6), the heading-preservation check (R7) and the
reference checks (R9, R10). The generated-artifact and docs-site rows (R19, R20) cover the one way a
documentation change here can break a build.

**Issue closure is not validated here.** Closing `#584` and `#546` and commenting on `#724` and
`#505` happen at Ship and Document, once a PR identity exists. Gate 3 proves the *implementation*
that resolves them: R14, R15, R16 and R13.

## Before you start

Run these four setup steps first. Every row below assumes them.

**1. Resolve the base commit.** All "before" comparisons use it.

```bash
BASE=$(git merge-base HEAD origin/staging) && echo "$BASE"
```

**2. Write out the pre-change file's accountable line set.** The front-matter closes at line 12, so
the body is everything after it; blank lines are not accountable.

```bash
git show "$BASE:CLAUDE.md" | awk 'NR>12 && NF {print NR}' | sort -n > /tmp/body-lines.txt
wc -l < /tmp/body-lines.txt
```

At the time this spec was written the body held **1,599 accountable lines** (14 through 1651). If
the count differs, the base has moved — use the number this command prints and say so in the
validation notes.

**3. Expand every line range the ledger claims.** Column 2 of each ledger row is a `start-end`
range.

```bash
awk -F'|' '/^\|/ && $3 ~ /^ *[0-9]+ *- *[0-9]+ *$/ {
    split($3, r, "-"); s=r[1]+0; e=r[2]+0; for (i=s; i<=e; i++) print i
}' specs/2026-09-17-claude-md-guardrail-refactor/migration-ledger.md | sort -n > /tmp/claimed-lines.txt
```

**4. Extract the section names cited from source.** This is the list R7 checks.

```bash
git grep -h -o -i -E "CLAUDE\.md'?s? ([A-Za-z&/ -]{3,40}?) (section|rule|ban|trap|guidance|convention)" \
  -- lib/ features/ tests/ components/ app/ scripts/ prisma/ \
  | sed -E "s/CLAUDE\.md'?s? //I" | sort -u
```

### Why coverage is measured by line, not by bullet

An earlier draft of this spec inventoried rules by matching lines starting with `- `. That extractor
returned 130 rows and looked complete, but it was structurally blind to every rule expressed in
another Markdown form — including **the four SDD gates**, which are numbered items, and the
`getPrisma()` / `getPrismaWs()` hybrid-client rule, which is a pair of nested bullets. Counting
bullets cannot prove that nothing was lost, because a rule can disappear simply by not having been
a bullet. Counting **lines** removes the question: every accountable line is either claimed by a
rule row or explicitly classified as narrative supporting one.

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1 | Acceptance | `wc -c CLAUDE.md` prints **10000 or less**. Record the exact number. If it exceeds 10000, the slice fails — do not trim a rule into ambiguity to pass; report it instead. |
| R2 | Unit | `grep -nE '^@\|\]\(@\|\s@[a-zA-Z0-9_./-]+\.md' CLAUDE.md` prints **nothing** (exit 1). Confirms no `@path` import was used to relocate context cost rather than remove it. |
| R3 | Unit | `ls docs/developer-portal/runtime-pitfalls.md docs/developer-portal/app-conventions.md docs/developer-portal/local-dev-playbook.md` succeeds for all three. Then `git diff --name-only --diff-filter=A "$BASE"...HEAD -- 'docs/**/*.md' 'specs/**/*.md'` lists **only** those three plus this slice's own `specs/2026-09-17-claude-md-guardrail-refactor/` files — no fourth new document. |
| R4 | Unit | `migration-ledger.md` exists. Confirm its header row is `Ref \| Lines \| Section \| Rule \| Disposition \| Destination \| Heading \| Verify phrase`. Confirm every data row's `Disposition` is one of `KEEP`, `COMPRESS`, `MOVE`, `DELETE`: `awk -F'\|' '/^\| *L[0-9]/ {gsub(/ /,"",$6); print $6}' specs/2026-09-17-claude-md-guardrail-refactor/migration-ledger.md \| sort -u` prints only those four words. |
| R5 | Integration | **The completeness proof.** After setup steps 2 and 3: `comm -23 /tmp/body-lines.txt <(sort -n -u /tmp/claimed-lines.txt)` prints **nothing** — no accountable line is unclaimed. Then `uniq -d /tmp/claimed-lines.txt` prints **nothing** — no line is claimed twice. Both must hold. Any line printed by the first command is content whose fate nobody recorded; open that line in `BASE:CLAUDE.md` and add its row before re-running. |
| R6 | Integration | For **every** row marked `MOVE` or `COMPRESS`, run `grep -F -q "<that row's Verify phrase>" "<that row's Destination>"` and confirm a match; zero failures required. For every `KEEP` row, confirm the named heading exists in the post-change `CLAUDE.md`. For every `DELETE` row, confirm it carries `DUPLICATE` plus a document and heading that really contains the rule, or `NARRATIVE` plus a ledger `Ref` that exists and is not itself a `NARRATIVE` row. Script it rather than eyeballing; report any row that fails. |
| R7 | Integration | Run setup step 4 to list the cited names. For each, confirm a matching heading exists: `grep -nE '^#{1,3} ' CLAUDE.md` and check the distinguishing word of each cited name appears in one of those headings. Every cited name must resolve. A dangling citation from source is a failure, and source may **not** be edited to fix it — restore the heading instead. |
| R8 | Regression | `git diff --name-only "$BASE"...HEAD \| grep -vE '\.md$' \| grep -vE '^(ARTIFACT_INDEX\.md\|app/\(admin\)/staff/runbook/docs\.ts)$'` prints **nothing**. (The first filter drops all markdown; whatever survives must be only the two generated artifacts, and `ARTIFACT_INDEX.md` is already dropped as markdown.) |
| R9 | Integration | `git grep -n "CLAUDE.md" -- 'docs/**/*.md' 'specs/**/*.md' ':(exclude)specs/2026-09-17-claude-md-guardrail-refactor/*'` — open **every** hit and confirm each still describes something `CLAUDE.md` actually contains after the change. Any reference sending a reader to `CLAUDE.md` for relocated material is a failure. Record the hit count and the verdict per hit. |
| R10 | Integration | `grep -n "CLAUDE" specs/architecture.md docs/business-analysis/gap-register.md` — confirm neither defers the raw-SQL exception's scope to `CLAUDE.md`. Read §3.1 of `specs/architecture.md` and GAP-011's row and confirm each states the scope itself or names a document other than `CLAUDE.md`. |
| R11 | Acceptance | `grep -niE 'milestone 0\|walking skeleton\|until M0' CLAUDE.md` prints **nothing**. `grep -nE 'P10\|#113\|#104' CLAUDE.md` shows the current-phase statement and both blocker references. |
| R12 | Unit | `grep -n 'adapter-neon@6.19.3' CLAUDE.md` prints **nothing**. `grep -n '7.9.1' CLAUDE.md` matches, and `grep -n '#560' CLAUDE.md` matches. Cross-check the three quoted versions against the `PINNED` block in `tests/dependency-pins.test.ts` — they must agree exactly. |
| R13 | Unit | `grep -n 'no spaces around' CLAUDE.md` matches (the rule survives). `grep -n 'UK_LOCATION_REF' CLAUDE.md` shows the two-key exception framed as an exception, and `grep -n '#505' CLAUDE.md` matches. Confirm no sentence claims the repo's env files generally use the spaced form. |
| R14 | Unit | `grep -nE 'phase:P\|gate:[0-9_]' CLAUDE.md` prints **nothing**. Read the gate line and confirm it requires only the issue reference and the CHANGELOG entry. |
| R15 | Unit | `grep -niE 'status only' CLAUDE.md` prints **nothing**. `grep -n 'Priority' CLAUDE.md` matches the board description. Cross-check reality once with `gh project field-list 2 --owner sriahead --format json --jq '.fields[].name'`, which must list `Priority`. |
| R16 | Unit | `grep -nE '[0-9]{2,3} files? ?/ ?[0-9]{3,4} tests?\|Test Files [0-9]' CLAUDE.md docs/developer-portal/runtime-pitfalls.md docs/developer-portal/app-conventions.md docs/developer-portal/local-dev-playbook.md` prints **nothing**. Then confirm the forks-pool trap is still described, with a detection procedure that names no fixed total. |
| R17 | Unit | `npm run kms:validate` exits 0 and prints `invalid front-matter (failing): 0`. Confirm none of the three new documents appears in its "no front-matter" or "non-KMS front-matter" lists. |
| R18 | Unit | `sed -n '1,13p' CLAUDE.md` shows `id: claude-md`, `version: "2.0.0"`, `updated: 2026-09-17`. Measure the summary length and confirm it is between 20 and 300 characters. |
| R19 | Integration | `npm run kms:build-index` then `git status --porcelain ARTIFACT_INDEX.md "app/(admin)/staff/runbook/docs.ts"` prints **nothing** (both already committed and current). `npm run kms:check-generated` exits 0. `grep -c 'specs/2026-09-17-claude-md-guardrail-refactor/plan.md' ARTIFACT_INDEX.md` prints 1, and each of the three new documents appears in the index. |
| R20 | System | `npm run kms:assemble:internal` exits 0, then `cd kms/site-internal && npx next build --webpack` exits 0. **Read the real exit status** — do not pipe through `head` or `tail`, which reports the pipe's status rather than the build's. A failure here is the MDX trap (a bare `<` before a digit or letter, or a bare curly-brace expression outside backticks) and is a hard fail even though `gates` would pass. |
| R21 | Acceptance | `git diff "$BASE"...HEAD -- CHANGELOG.md` shows a new entry for this slice referencing `#786`. |
| R22 | Regression | `npm run lint`, `npm run typecheck`, `npm run format:check` and `npx vitest run` each exit 0. Run vitest **alone**, not beside a build — under load its forks pool silently fails to start workers and whole files never execute. If a run reports fewer test files than an immediately preceding run of the same tree, that is the trap, not a regression: re-run alone before recording a result. `tests/dependency-pins.test.ts` must pass specifically, since its docstring couples to `CLAUDE.md`'s quoted versions. |

## Notes for the validator

- **R5 is the requirement that proves nothing was lost.** A reduced `CLAUDE.md` that passes R1 while
  failing R5 is a worse outcome than one that misses R1 — it means content was dropped rather than
  relocated. Treat an unclaimed line as a hard failure, not a documentation nit.
- **Do not let `NARRATIVE` become a disposal chute.** R6 requires every `NARRATIVE` row to name the
  rule row it supports. If a block of prose is classified `NARRATIVE` but the rule it supposedly
  evidences is nowhere in the ledger, that is knowledge loss wearing a label — fail it.
- **Do not repair a failure by editing source.** R8 forbids it. If R7 shows a source citation with
  no surviving heading, the fix is to restore the heading in `CLAUDE.md`, never to change the
  comment in the source file.
- **A grep that prints nothing is only meaningful if the pattern is right.** Several rows assert an
  absence. Before recording a pass, confirm the pattern matches the pre-change file: for example
  `git show "$BASE:CLAUDE.md" \| grep -c 'adapter-neon@6.19.3'` should print a non-zero count,
  proving the R12 pattern is capable of matching at all.
- **`sdd:preclear` may report a dirty tree** because the `kms/site-internal` build in R20 rewrites
  `kms/site-internal/next-env.d.ts` (`#423`, `#712`). Confirmed to reproduce while writing this
  spec. That is the known issue, not this slice's doing; restore the file rather than committing it.
