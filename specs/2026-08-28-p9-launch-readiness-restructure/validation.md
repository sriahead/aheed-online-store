# P8 closeout and the P9 / P10 restructure (validation)

All rows run from the repo root on the slice's branch. Only **R32** needs a running app; every other
row is a file, milestone or issue check, because this slice ships no application code.

**Two standing cautions apply throughout.** `gh` arguments containing double quotes break native
argument parsing on PowerShell 5.1 — parse JSON with `ConvertFrom-Json` rather than an inline `-q`,
or run these rows through the Bash tool. And never pipe a command's output through `head`/`tail` to
skim it: the pipe reports the pipe's exit status, not the command's, and closing it early can kill a
writer before its own cleanup runs.

| Req | How to verify |
|-----|---------------|
| R1  | `gh api repos/sriahead/aheed-online-store/milestones --paginate` — the returned titles include all six exactly: `P9 — Production launch readiness`, `P9.1 — Security & transaction safety`, `P9.2 — Production infrastructure & reliability`, `P9.3 — Launch quality validation`, `P9.4 — Launch certification`, `P10 — Post-launch improvements`. Check the em-dash is a real `—`, not a hyphen — a title mismatch silently creates a seventh milestone rather than erroring. |
| R2  | Same milestone listing, filtered to P8.6 and P8.7: both show `"state": "closed"` and `"open_issues": 0`. |
| R3  | Same listing, filtered to `P8 — Deployment & launch`: `"open_issues": 0`. Then `gh issue list --state open --milestone "P8 — Deployment & launch" --limit 60` returns nothing. |
| R4  | `gh issue view 340 --json number,state,milestone` — state `OPEN`, milestone `P9.1 — Security & transaction safety`. |
| R5  | `gh issue list --state open --milestone "P9.2 — Production infrastructure & reliability" --limit 60 --json number` — the set of numbers **contains** 113, 104, 227, 246, 175, 219, 101, 94 and 236. It will also contain the five new P9.2 issues from R13; that is expected, not a failure. |
| R6  | `gh issue list --state open --milestone "P9.3 — Launch quality validation" --limit 60 --json number` — contains 174, 350, 351 and 398, plus the four new P9.3 issues. |
| R7  | `gh issue list --state open --milestone "P10 — Post-launch improvements" --limit 100 --json number` — contains all 23 of 390, 416, 421, 397, 403, 407, 221, 75, 100, 116, 137, 146, 147, 148, 149, 151, 232, 280, 286, 288, 372, 373, 423. Assert each individually; a `contains` check over a 35-item list passes too easily if one number is missing. |
| R8  | From the same P10 listing, confirm 394, 395, 396, 399, 400, 401, 402, 404, 405, 406 and 422 are present. Cross-check the source is empty: the R2 listing already showed P8.6 and P8.7 at zero open issues, so a number missing here has been lost rather than left behind. |
| R9  | `gh issue view 91 --json state,comments` and `gh issue view 408 --json state,comments` — both `CLOSED`, and each has a comment stating the reason. Judgement row: read the comments and confirm they explain *why*, rather than being bare closure notices. |
| R10 | `gh issue view 243 --json state,milestone` — still `CLOSED`, milestone still `P8 — Deployment & launch`. **This row failing means the slice did the one thing it was written to prevent.** Note this is the sole intentional exception to R3's zero-open-issues claim, which counts open issues only. |
| R11 | `gh issue view 420 --json state,milestone` — still `OPEN`, milestone still `P8 — Deployment & launch`. |
| R12 | `gh issue list --state open --milestone "P9.1 — Security & transaction safety" --limit 30 --json number,title,body` — exactly eight issues (seven new plus #340). Read each of the seven new bodies and confirm it names the file(s) it concerns and states a "done when" condition. Judgement row — a title can look complete while the body says nothing actionable. |
| R13 | The R5 listing contains exactly five issues beyond the nine moved ones, covering migration-safe deployment, release quality gates, backup/PITR and restore, critical alerting, and rollback procedure. |
| R14 | The R6 listing contains exactly four issues beyond the four moved ones, covering LCP re-measurement, the Playwright smoke suite, customer/staff UAT, and accessibility validation. |
| R15 | `gh issue list --state open --milestone "P9.4 — Launch certification" --limit 30 --json number,title` — exactly three: game day, exact release-candidate verification, final GO/NO-GO. |
| R16 | The R7 listing contains exactly one issue beyond the 34 moved ones (23 from R7 plus 11 from R8), and it concerns CSP hardening. |
| R17 | Read the LCP issue's body from the R14 listing — it states #243 is closed and deliberately not reopened, and that measurement precedes optimization. Judgement row. |
| R18 | Read the Playwright issue's body — it states no `playwright.config.ts`, `e2e/` directory or Playwright dependency exists, that harness setup is in scope, and names all five journeys. Cross-check the underlying fact still holds: `test -f playwright.config.ts \|\| echo "absent"` prints `absent`, and `grep -c playwright package.json` prints `0`. |
| R19 | `gh issue list --state open --limit 200 --json number,title,createdAt` — no issue created by this slice matches broader E2E coverage, loading/error-state polish, database or index optimization, search evolution, caching, background-processing evolution, or analytics separation. Judgement row: match on intent, not keyword — #286 (fuzzy search) pre-dates this slice and is a legitimate P10 member, not a violation. |
| R20 | Conditional on R32. If the route rendered, assert no bundles issue was filed. If it failed, assert one exists and its body records the observed error. |
| R21 | `awk '/^- \*\*P8 — Deployment/,/^- \*\*P9 —/' specs/roadmap.md` — read the output. It describes P8 as historical/completed and does not present P8.2 as forthcoming launch work. Judgement row. |
| R22 | `awk '/^## P9 — Production launch readiness/,/^## P10 —/' specs/roadmap.md` — the section exists and contains four sub-phase headings P9.1 through P9.4, each with an objective and an exit gate. |
| R23 | From the R22 extraction, the P9.1 subsection's issue numbers include #340 and all seven new P9.1 numbers from R12. |
| R24 | From the R22 extraction, the P9.2 subsection's numbers include #113, #104, #227, #246, #175, #219, #101, #94, #236 and all five new P9.2 numbers. |
| R25 | From the R22 extraction, the P9.3 subsection's numbers include #174, #350, #351, #398 and all four new P9.3 numbers. |
| R26 | `awk '/^## P10 — Post-launch improvements/,/^## Roadmap Change Log/' specs/roadmap.md` — the section names every number from R7 and R8, and says P8.3, P8.6 and P8.7 fold into it. |
| R27 | From the R26 extraction, confirm all four gate relationships appear in prose: #363 gating #401 and #402; ADR-006 gating #402 and #400's per-store half; #398's variant model gating #399 and #397's Pack Size facet; #399 additionally needing a payments-capture decision amending ADR-005. Judgement row — a grep proves a number is present, not that it is stated as a gate. |
| R28 | `grep -n -B2 -A4 "#243" specs/roadmap.md` — the matched prose says #243 is closed, was not reopened, and that a new issue measures LCP against the release candidate. |
| R29 | Read the P9 and P10 sections and confirm all three rulings are recorded with their reasoning: P8.6/P8.7 folding; #421's set to P10 except #398's unit-price half; #221 to P10 unblocked by #104. Judgement row. |
| R30 | `grep -n "#267" specs/roadmap.md` returns a line whose surrounding prose says Project #2's Phase field cannot express P9 or P10. |
| R31 | `for p in "P8.1 —" "P8.2 —" "P8.3 —" "P8.5 —" "P8.6 —" "P8.7 —"; do grep -q -- "$p" specs/roadmap.md \|\| echo "MISSING $p"; done` prints nothing. Then `git diff origin/staging...HEAD -- specs/roadmap.md` and confirm no existing Roadmap Change Log row was modified and no P8 sub-phase was renumbered. Additions and rewritten P8 framing prose are expected; a changed phase number or an edited historical row is a failure. |
| R32 | Start `npm run preview`, sign in as a store admin, and load `/staff/bundles/new`. Record in `build-notes.md` whether the bundle form renders or the route fails, with the observed error if any. **Not `npm run dev`** — this route touches Prisma, and plain `next dev` cannot load the WASM query engine, so it renders an error state that would look like the very failure being tested for. On finishing, kill the whole `npm`/`wrangler`/`workerd` process chain, not just the top-level `npm`, or the next preview build fails with `EBUSY` on `.open-next\assets`. |
| R33 | `sed -n '1,12p' specs/roadmap.md` shows a `version:` higher than `1.52.0` and `updated: 2026-08-28`. `git diff origin/staging...HEAD -- specs/roadmap.md` shows exactly one added Roadmap Change Log row describing this slice. |
| R34 | `git diff origin/staging...HEAD -- CHANGELOG.md` is non-empty and describes this slice. |
| R35 | `npm run kms:validate` exits 0. This catches a dotted `id:` in the front matter of the three spec files — the P8.1a trap. |
| R36 | `npm run kms:assemble:internal` exits 0, then `cd kms/site-internal && npx next build --webpack` exits 0. Run as two separate commands and read each real exit status. This is the row that catches a bare `<` before a digit, or unbackticked curly braces, in the substantial prose this slice adds to `specs/`. |
| R37 | `npm run lint`, `npm run typecheck`, `npx vitest run` and `npm run format:check` each exit 0. CI's `gates` job is the authority if local and CI disagree. |
| R38 | `grep -n "specs/2026-08-28-p9-launch-readiness-restructure/plan.md" ARTIFACT_INDEX.md` returns a row. Re-run `npm run kms:build-index` and confirm the only difference is the generated footer's commit SHA — CI strips that footer before comparing, so a bare `git diff --exit-code` on this file always shows a one-commit footer difference by construction and is not a failure. |
| R39 | Read the PR body. It contains `Closes #426` and no other closing keyword. **Check every one of the ~39 other issue numbers it mentions is written without a closing verb** — #174 and #214 were once closed by accident exactly this way, and a body naming this many numbers is the shape that repeats it. |
