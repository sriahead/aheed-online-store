# KMS — gate wiring (validation)

| Req | How to verify |
|-----|---------------|
| R1  | Read `kms/schema/repo.ts` — `walk()` excludes `kms/site-*/content/`. With `kms/site-internal/content/dev/kms-design.mdx` present locally (run `npm run kms:assemble:internal` first if not), `npx tsx kms/scripts/build-index.ts` then `grep kms-design ARTIFACT_INDEX.md` — only the `specs/2026-08-06-kms/plan.md` row appears, not the assembled copy. |
| R2  | `npm run kms:validate` — `.claude/commands/*.md` and `kms/site-internal/content/**/*.mdx` (if present) are not in the "invalid front-matter" list. |
| R3  | `npm run kms:validate` exits 0 with `invalid front-matter (failing): 0`. `grep -c kms-design ARTIFACT_INDEX.md` — exactly 1. |
| R4  | Push a branch with a deliberately broken front-matter block (e.g. `visibility: not-a-real-value` in a scratch doc) — `gates` fails on the `kms:validate` step. Revert it — `gates` passes. |
| R5  | Edit a doc's front-matter without regenerating `ARTIFACT_INDEX.md`, push — `gates` fails on the staleness step. Run `npm run kms:build-index`, commit, push — `gates` passes. |
| R6  | `npm run lint && npm run format:check && npx tsc --noEmit && npx vitest run` all exit 0. |
| R7  | `CHANGELOG.md` has a new entry under `[Unreleased]` on this branch. |
