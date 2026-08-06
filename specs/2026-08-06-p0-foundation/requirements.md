# P0 — Foundation & Scaffolding (requirements / acceptance criteria)

R1. `hooks/pre-commit` blocks a commit that touches source directories
    (`app/`, `components/`, `features/`, `lib/`, `prisma/`, `kms/`, `design-system/`) when no
    `specs/*/requirements.md` file is new relative to `origin/main`; passes otherwise (docs-only
    or spec-included commits are unaffected).
R2. `hooks/pre-push` blocks a push when `CHANGELOG.md` has no diff against the merge-base with the
    remote base branch (`origin/staging`, falling back to `origin/main`); passes when it's been
    touched, mirroring `gates.yml`'s Gate 4 check.
R3. `git config core.hooksPath hooks` (already run by `scripts/bootstrap.sh`) makes both hooks
    active for a fresh clone with no extra setup.
R4. `npm run format` (Prettier, write mode) and `npm run format:check` (check mode, CI-usable)
    both work against the whole repo; `.prettierignore` excludes build/dependency output.
R5. `app/sitemap.ts`, `app/robots.ts`, `app/manifest.ts` exist, type-check against Next's
    `MetadataRoute` types, and are reachable at `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest`
    in a running app.
R6. `tests/setup.ts` exists and is registered in `vitest.config.mts`'s `test.setupFiles`; existing
    tests still pass unaffected.
R7. `lint`, `typecheck`, and `test` all remain green after this slice (Gate 3).
