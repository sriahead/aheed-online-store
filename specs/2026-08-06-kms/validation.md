# KMS — Schema & Validator (validation)

| Req | How to verify |
|-----|---------------|
| R1  | `tests/kms-frontmatter.test.ts` — parse the example block from `plan.md` §3, assert it passes; assert omitting `visibility` fails. |
| R2  | `tests/kms-frontmatter.test.ts` — `trackFor` returns `customer-help`/`staff-ops`/`internal-eng` for each audience combination. |
| R3  | `npm run kms:validate` locally — confirm it finds and parses `plan.md`'s own front-matter without error. |
| R4  | `npm run kms:validate` on the current repo — confirm it lists existing front-matter-less docs as warnings, exit code 0. |
| R5  | Temporarily break a front-matter block (e.g. malformed `id`) in a scratch file, run `npm run kms:validate`, confirm non-zero exit + the file path and Zod error are printed, then remove the scratch file. |
| R6  | `npm run kms:validate` — human-readable summary line (pass/fail counts). |
| R7  | `npm test` — all cases in `tests/kms-frontmatter.test.ts` pass. |
| R8  | `git diff` for this branch touches only: `specs/2026-08-06-kms/`, `ARTIFACT_INDEX.md` (moved), `kms/schema/`, `tests/kms-frontmatter.test.ts`, `package.json`, `CHANGELOG.md`. No `kms/scripts/`, no `site-internal`/`site-public`, no `gates.yml` changes. |
