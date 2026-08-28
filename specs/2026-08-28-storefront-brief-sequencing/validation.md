# Storefront & fulfilment brief — roadmap sequencing (validation)

All rows run from the repo root on the slice's branch. No row needs a database, a Worker, a browser
or a live credential — this slice ships no application code, so `npm run preview` is not used
anywhere below. Commands are written for the Bash tool; `gh` rows note the PowerShell caveat.

| Req | How to verify |
|-----|---------------|
| R1  | `awk '/^  - \*\*P8\.6 — Storefront discovery/,/^  - \*\*P8\.7 — Fulfilment/' specs/roadmap.md \| grep -o '#[0-9]\+' \| sort -u -V` — the printed set includes #394, #395, #396, #397, #400, #404, #405 and #406. The `^  - \*\*` anchor is load-bearing: an unanchored range re-matches the summary blockquote below these bullets, which names every phase again, and would let a number missing from the bullet pass on the blockquote's mention instead. |
| R2  | `awk '/^  - \*\*P8\.7 — Fulfilment/,/^$/' specs/roadmap.md \| grep -o '#[0-9]\+' \| sort -u -V` — the printed set includes #397, #398, #399, #400, #401 and #402. Same anchoring caveat as R1; the range ends at the blank line that closes the bullet. |
| R3  | `awk '/^  - \*\*P8\.2 — Launch/,/^  - \*\*P8\.3 —/' specs/roadmap.md` — read the output. It names #398, #403, #407 and #397 as the pre-launch set, and says in prose that the set is sequenced by this slice and built by a separate later slice under its own issue. Judgement row: confirm the prose actually says a later slice builds it, not merely that the items are pre-launch. Note this bullet legitimately also names P8.2's own pre-existing launch-ops issues (#113, #174, #94, #101, #246, #227, #175, #219) — their presence is expected, not scope leakage. |
| R4  | `grep -n -B2 -A6 "#408" specs/roadmap.md` — the matched paragraph contains `2026-08-27`, both `#394` and `#407` as the range ends, and `#420`. |
| R5  | `for p in "P8.1 —" "P8.2 —" "P8.3 —" "P8.5 —"; do grep -q -- "$p" specs/roadmap.md \|\| echo "MISSING $p"; done` prints nothing. Then read `git diff origin/staging...HEAD -- specs/roadmap.md` and confirm no pre-existing P8.1/P8.2/P8.3/P8.5 entry was renumbered — additions, and the pre-launch insert inside P8.2, are expected; a changed phase number on an existing entry is a failure. |
| R6  | `grep -n -A4 "Country-of-Origin" specs/roadmap.md` — the matched prose states Country-of-Origin is pre-launch, the three boolean certification facets are P8.6, and Pack Size and Brand are P8.7. |
| R7  | Using the three `awk` extractions from R1–R3, confirm all six gating relationships appear in prose: #363 gating #401 and #402; #113 gating #403's live half; ADR-006 gating #402 and #400's per-store half; #146/#147/#148/#372/#377 gating #404; #398's variant model gating #399 and #397's Pack Size facet; #399 additionally needing a payments-capture decision. Judgement row — a grep can prove a number is present, not that it is stated as a gate. |
| R8  | `grep -n -B2 -A4 "capture_method" specs/roadmap.md` — the matched prose attributes it to `lib/payments.ts` and ties it to #399 and ADR-005. Cross-check the underlying fact still holds: `grep -c "capture_method" lib/payments.ts` prints `0`. |
| R9  | `grep -c "specs/2026-08-28-storefront-brief-sequencing/" specs/roadmap.md` prints 1 or more. |
| R10 | `grep -c "PR #419" specs/roadmap.md` prints 1 or more. Then run `npm run sdd:audit` and read its **full** output — **do not pipe it through `head`/`tail`** (CLAUDE.md: SIGPIPE can kill a writer before its own exit path, and a pipe reports the pipe's status, not the command's). The `#419` line in the promotions section begins with `✓` and does not contain `pending`. The audit is separately expected to report *this slice's own* `specs/2026-08-28-storefront-brief-sequencing/` directory as lacking a roadmap change-log entry, because that row is written by Document (final), which runs after Ship — that is not a failure of this row, which is pinned to PR #419 only. |
| R11 | `sed -n '1,12p' specs/roadmap.md` shows a `version:` higher than `1.51.0` and `updated: 2026-08-28`. |
| R12 | `test -f specs/decisions/ADR-006-store-locations.md && echo OK` prints `OK`; `sed -n '1,14p' specs/decisions/ADR-006-store-locations.md` shows `id: adr-006-store-locations` and `type: adr`. |
| R13 | `grep -n -i "vendorId\|tenancy root\|mandatory filter\|lib/repositories" specs/decisions/ADR-006-store-locations.md` — read the matches and confirm the ADR states all three claims: `vendorId` stays the sole isolation axis, a location is not a tenancy root, and a location never becomes a second mandatory filter in `lib/repositories/*`. Judgement row. |
| R14 | `grep -n -i "ADR-004\|Region" specs/decisions/ADR-006-store-locations.md` — the ADR names ADR-004 decision 1's anticipated `Region`/`Location` reference tables and states how a trading location differs from that concept. |
| R15 | `grep -n -i "mission" specs/decisions/ADR-006-store-locations.md` — the ADR states that `specs/mission.md` lists multi-branch management as out of scope and that this slice does not amend that line. |
| R16 | `grep -n "#400\|#402" specs/decisions/ADR-006-store-locations.md` returns matches whose surrounding prose names them as the issues unblocked for scoping and describes what would be additive if locations are later adopted. |
| R17 | `git diff origin/staging...HEAD -- specs/mission.md` produces no output. |
| R18 | `gh api repos/sriahead/aheed-online-store/milestones --paginate` — parse the JSON with `ConvertFrom-Json` in PowerShell rather than an inline `-q`/`--jq` argument (CLAUDE.md: quoted `gh` args break native parsing on PS 5.1, failing with `accepts 1 arg(s)`). Both `P8.6 — Storefront discovery & conversion` and `P8.7 — Fulfilment & merchandising data models` are listed. |
| R19 | `gh issue list --state all --limit 40 --json number,milestone`, filtered to #394–#407. Assert exactly R19's mapping: #394, #395, #396, #400, #404, #405, #406 on `P8.6 — Storefront discovery & conversion`; #399, #401, #402 on `P8.7 — Fulfilment & merchandising data models`; #397, #398, #403, #407 on `P8 — Deployment & launch`. Any issue on a different milestone is a failure. |
| R20 | `grep -n "#267" specs/roadmap.md specs/decisions/ADR-006-store-locations.md` returns at least one line whose surrounding prose says Project #2's Phase field cannot express P8.6 or P8.7. |
| R21 | `gh issue list --state open --limit 60 --json number` includes every number 394 through 407 inclusive. |
| R22 | `npm run kms:validate` exits 0. |
| R23 | `npm run kms:assemble:internal` exits 0, then `cd kms/site-internal && npx next build --webpack` exits 0. Run them as two separate commands and read each real exit status — **do not chain into `tail`/`head`**, which reports the pipe's status and has masked a `Next.js build worker exited with code: 1` as success before. This is the row that catches a bare `<` immediately before a digit, or unbackticked curly braces, in the roadmap/ADR prose this slice adds. |
| R24 | `grep -n "specs/2026-08-28-storefront-brief-sequencing/plan.md" ARTIFACT_INDEX.md` and `grep -n "specs/decisions/ADR-006-store-locations.md" ARTIFACT_INDEX.md` each return a row. Confirm freshness by re-running `npm run kms:build-index` and checking the only difference is the generated footer's commit SHA — CI's `gates` check strips that footer with `sed` before comparing, so a bare `git diff --exit-code` on this file always shows a one-commit footer difference by construction and is **not** a failure. |
| R25 | `git diff origin/staging...HEAD -- CHANGELOG.md` is non-empty and describes this slice. |
| R26 | `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run format:check` each exit 0. CI's `gates` job is the authority if local and CI disagree. |

<!--
  Rows R3, R7, R13, R14, R15 and R16 are deliberately judgement rows: the requirement is that a
  relationship or ruling is STATED, and a grep can only prove a string is present, not that it is
  asserted rather than merely referenced. Each names the exact extraction command so the reader is
  judging a bounded piece of text rather than searching the whole file.

  No row greps for the ABSENCE of a word. This slice's docs deliberately name the things they
  exclude (multi-branch, WhatsApp notifications, the discount engine), so an absence-grep would
  match the explanation and could only be "passed" by deleting the rationale — the P4a trap
  recorded in specs/sdd-workflow.md.
-->
