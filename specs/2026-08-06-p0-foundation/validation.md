# P0 — Foundation & Scaffolding (validation)

| Req | How to verify |
|-----|---------------|
| R1  | On a scratch branch with no spec: edit a file under `lib/`, `git add` it, `git commit` → hook blocks with a clear message. Add a `specs/<date>-x/requirements.md`, stage it, retry → commit succeeds. |
| R2  | On a scratch branch: commit a source change without touching `CHANGELOG.md`, `git push` → hook blocks. Touch `CHANGELOG.md`, retry → push succeeds. |
| R3  | Fresh clone: `bash scripts/bootstrap.sh`, then `git config --get core.hooksPath` → prints `hooks`. |
| R4  | `npm run format:check` on the current tree → passes (files formatted as part of this slice). Introduce a deliberately misformatted scratch file → `format:check` fails, `npm run format` fixes it. |
| R5  | `npm run dev`, then fetch `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest` → each returns valid content (200, correct content-type). `npx tsc --noEmit` stays clean. |
| R6  | `npm test` — all existing + new tests still pass; `vitest.config.mts` references `tests/setup.ts`. |
| R7  | `npm run lint && npx tsc --noEmit && npm test` all exit 0. |
