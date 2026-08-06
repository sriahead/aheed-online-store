# KMS — front-matter backfill (validation)

| Req | How to verify |
|-----|---------------|
| R1  | `git diff --stat` on the branch — exactly the 18 listed files touched (plus generated `ARTIFACT_INDEX.md`). |
| R2  | `npm run kms:validate` — 0 files in the "invalid front-matter" list; spot-check 3 files by eye for schema shape. |
| R3  | `npm run kms:validate` — sibling files (e.g. `2026-08-05-m0-walking-skeleton/requirements.md`) still appear under "no front-matter (warning, not blocking)", not newly valid. |
| R4  | `npm run kms:validate` output: `valid front-matter: 19`, `invalid front-matter (failing): 0`. |
| R5  | `npm run kms:build-index`; `ARTIFACT_INDEX.md`'s Track 1 table has 19 rows; `grep -c '^|' ARTIFACT_INDEX.md` sanity-checks the row count. |
| R6  | `npm run lint && npm run format:check && npx tsc --noEmit && npx vitest run` all exit 0. |
| R7  | `CHANGELOG.md` has a new entry under `[Unreleased]` on this branch. |
