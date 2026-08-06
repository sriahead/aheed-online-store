# P0 — Foundation & Scaffolding (plan)

Per `specs/roadmap.md`, P0 hardens what M0 proved. Most of P0's originally-listed scope
(`lib/config`, `lib/db`, `lib/storage`, Cloudflare config, `gates.yml`, the base `app/` shell) was
already built and battle-tested during M0's infrastructure debugging — this slice covers what's
still genuinely missing, checked against the current repo rather than re-scaffolding what exists.

## Scope (this slice)

1. **Local SDD git hooks** (`hooks/pre-commit`, `hooks/pre-push`) — `hooks/README.md` already
   documents the intent and `scripts/bootstrap.sh` already wires `core.hooksPath`, but the scripts
   themselves don't exist yet.
   - `pre-commit` → Gate 2 (spec-before-code): if staged changes touch source directories
     (`app/`, `components/`, `features/`, `lib/`, `prisma/`, `kms/`, `design-system/`), require a
     `specs/*/requirements.md` file to exist that's new relative to `origin/main`.
   - `pre-push` → Gate 4 (changelog-before-merge): mirrors `gates.yml`'s check — `CHANGELOG.md`
     must differ from the merge-base with the remote base branch.
   - Both are fast local feedback, not hard security — `gates.yml` in CI remains the real
     enforcement (hooks are trivially bypassed with `--no-verify`).

2. **Prettier** — named in the roadmap's P0 tooling list, not configured yet. `.prettierrc`,
   `.prettierignore`, `prettier` devDependency, `format`/`format:check` scripts.

3. **`public/`+`app/` SEO/PWA surface** — `app/sitemap.ts`, `app/robots.ts`, `app/manifest.ts`
   (Next.js App Router convention places these as route files under `app/`, not static files under
   `public/`, despite the folder-structure doc's phrasing). No real icon/favicon assets exist yet
   (`public/images/brand/` is empty) — `manifest.ts` ships with an empty `icons` array and a
   comment; real brand assets are a follow-up requiring the human to supply them (not fabricated).

4. **`tests/setup.ts`** — wired into `vitest.config.mts` via `test.setupFiles`. Minimal but real:
   loads `.env` for tests that read `process.env`, establishing the extension point the project
   structure doc commits to, rather than a no-op stub.

## Explicitly out of scope (see prior proposal message for reasoning)

- Design-system tokens — no `specs/design-system.md` decision doc exists yet, no UI to consume
  tokens. Needs its own spec first.
- `lib/repositories/` — empty stub; nothing to wrap until P1's catalogue models exist.
- GitHub branch-protection rules on `main`/`staging` (require PR + passing `gates` check) — a real
  gap proven by this session's own direct-push mistakes, genuinely more effective than local hooks
  since it can't be bypassed, but it's infra/process configuration outside this code-focused
  slice's approved scope. Flagged as a follow-up recommendation, not built here.
