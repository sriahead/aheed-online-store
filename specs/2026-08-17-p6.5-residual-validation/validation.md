# P6.5 residual validation & gap-register reconciliation (validation)

| Req | How to verify |
|-----|---------------|
| R1  | `grep -oE '^\| GAP-[0-9]{3}' docs/gap-register.md \| sort` lists every GAP-ID once, covering at least `GAP-001`..`GAP-015` plus any ID filed under R12. The `\| GAP-ID \|` header row is excluded by the digit pattern. |
| R2  | `grep -cE '^\| GAP-[0-9]{3}' docs/sdd/self-review/GAP-REGISTER.md` returns `0`. Then read the file and confirm it contains a relative link to `../../gap-register.md`, and that the path resolves from `docs/sdd/self-review/`. Anchored to table rows deliberately — prose naming GAP-001..004 is allowed and must not fail this row. |
| R3  | Read `docs/gap-register.md`'s front-matter: `title` or `summary` names it the master register, and `version` is greater than `1.0.0`. |
| R4  | For each non-`Open` row, read the row and its detailed section and confirm at least one of: a `#NNN` PR reference, a 7+ character commit SHA, or a repo-relative path that exists on disk. `build-notes.md` records which citation each row used. |
| R5  | For every issue number cited in `docs/gap-register.md`, run `gh issue view <n> --json state,title` and compare against the citing row's `Status`. All-closed citations must not sit on an `Open`/`Deferred` row; any open citation must not sit on a `Fixed`/`Resolved` row. Check GAP-002/#176 last, after R13 is known. |
| R6  | `grep -n 'GAP-007' docs/gap-register.md` shows `#180` and does not show `#167`. |
| R7  | `grep -n 'GAP-008' docs/gap-register.md` — the `Status` cell is not `Deferred` and the row or its detailed section cites `#204`. |
| R8  | `grep -n 'GAP-009' docs/gap-register.md` — the `Status` cell is not `Deferred`. |
| R9  | `grep -n 'GAP-010' docs/gap-register.md` — the `Status` cell is not `Deferred` and the row or its detailed section cites `#204`. |
| R10 | `grep -n 'GAP-013' docs/gap-register.md` — the `Status` cell is not `Deferred` and the row cites `#45`; `gh issue view 45 --json state` returns `CLOSED`. |
| R11 | Read the reconciliation note in `docs/gap-register.md`: it carries this slice's date, and the set of GAP-IDs it lists equals the set of table rows found in R1. Each listed ID is marked changed (old → new) or confirmed unchanged. |
| R12 | Read `build-notes.md`'s findings section. For each recorded-but-unbuilt gap it names, `gh issue view <n>` returns an issue and `gh project item-list 2 --owner sriahead --format json` shows that item with a non-empty `phase`. If none were found, confirm `build-notes.md` states that no recorded-but-unbuilt gap was found. |
| R13 | Read `build-notes.md` for the recorded sign-in attempt against `npm run preview` on `http://localhost:8787`: it must state the HTTP status code and whether the response contained `Invalid origin`. A summary such as "sign-in worked" with no status code does not satisfy this row. |
| R14 | `gh issue view 176 --json state` — if R13 recorded success, state is `CLOSED` and `gh issue view 176 --json comments` shows a closing comment naming `splitHostPort`/`inferProto`; if R13 recorded failure, state is `OPEN` and `build-notes.md`'s known-shaky section names it. |
| R15 | Read the GAP-002 sections of `docs/sdd/self-review/SELF-REVIEW.md` (line ~47) and `docs/sdd/self-review/VALIDATION-RESULTS.md` (line ~32). Both must state a status matching R13's outcome and both must say the original validation was unit-test-only. |
| R16 | Read `specs/sdd-workflow.md`'s Validate section end to end. Confirm no sentence instructs the reader to patch `lib/auth-origin.ts` locally or to leave a change uncommitted, and that what it now says about #176 matches R13's recorded outcome. Deliberately a read, not a grep — corrected text may legitimately still mention `Invalid origin` while describing the resolved defect. |
| R17 | `git diff origin/staging -- specs/sdd-workflow.md` shows the `version` and `updated` front-matter lines changed. |
| R18 | Read `specs/2026-08-13-p6.5-self-review-hardening/requirements.md`: acceptance criteria appear as `R1.`, `R2.`, … in sequence with no gaps. |
| R19 | Read `specs/2026-08-13-p6.5-self-review-hardening/validation.md`: row count equals the requirement count from R18, order matches, and every `Req` cell's identifier appears in that `requirements.md`. |
| R20 | Read every row of that `validation.md`. Any row satisfied by a document asserting something about itself (e.g. "the register states zero unresolved gaps") fails this row. |
| R21 | At least one row of that `validation.md` names a GAP-001..004 artifact directly — e.g. `app/not-found.tsx` exists and renders for an unknown route. Run that row's own step and confirm it passes. |
| R22 | Read `build-notes.md`: it records the order number used, the transition fired, the `OrderStatusEvent` row observed in Postgres, and whether email dispatch succeeded or failed with which error. Confirm the DB read was taken against the same Neon project `.dev.vars` points the Worker at (compare against `secrets/staging.vars` before trusting it). |
| R23 | Read `build-notes.md`: it records the banner rendering with no `aheed_cookie_consent` cookie present, the cookie's value after accepting, and that a reload showed no banner. |
| R24 | `gh issue view 192 --json state,comments` — a comment maps each of #192's four listed items to covered/not-covered; `state` is `CLOSED` only if none remain. |
| R25 | `grep -n '206' specs/roadmap.md` shows a change-log row citing PR #206 and merge `081f618`; read the row to confirm it describes the promotion to production. |
| R26 | `git diff origin/staging -- specs/roadmap.md` shows the `version` and `updated` front-matter lines changed. |
| R27 | Mirror `gates.yml`'s normalisation rather than a bare `git diff --exit-code` (the footer always cites the parent commit, so a bare diff fails forever once committed): `cp ARTIFACT_INDEX.md /tmp/before.md && npm run kms:build-index && diff <(sed -E 's/Last build: `[^`]+`/Last build: TS/; s/commit `[^`]+`/commit SHA/' /tmp/before.md) <(sed -E 's/Last build: `[^`]+`/Last build: TS/; s/commit `[^`]+`/commit SHA/' ARTIFACT_INDEX.md)` exits 0. |
| R28 | `npm run kms:validate` exits 0 and reports `invalid front-matter (failing): 0`. |
| R29 | `npm run sdd:audit` exits 0 and reports this slice's folder as documented. |
| R30 | `git diff --name-only origin/staging...HEAD \| grep -qx 'CHANGELOG.md'` succeeds, and the `[Unreleased]` entry describes this slice. |
| R31 | `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check` each exit 0. On a Windows checkout, treat a `format:check` failure on files this slice did not touch as the documented `core.autocrlf` artifact — confirm via `git show HEAD:<file>` written with LF endings and `prettier --config .prettierrc.json --check`, and defer to CI as the authority. |
