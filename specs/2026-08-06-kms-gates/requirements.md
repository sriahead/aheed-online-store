# KMS — gate wiring (requirements / acceptance criteria)

Closes the last deferred item from `specs/2026-08-06-kms/plan.md` §2 ("Gate wiring") and
`specs/2026-08-06-kms/requirements.md` R8: wire `kms:validate` and an `ARTIFACT_INDEX.md`
staleness check into `gates.yml`. Includes two prerequisite bug fixes found while grounding —
wiring the validator as originally sketched would break CI on files it was never meant to touch.

R1. `kms/schema/repo.ts`'s `walk()` excludes `kms/site-*/content/` (assembled/generated build
    output, gitignored except `index.mdx`/`_meta.json`) — prevents the same doc from being indexed
    twice (once at its source path, once at an assembled copy's path) and prevents CI-vs-local
    nondeterminism, since that directory doesn't exist on a fresh checkout unless `assemble.ts`
    has already run.
R2. `kms/schema/validate.ts` distinguishes "no front-matter at all" from "front-matter present but
    missing the `visibility` key" (the schema's own required, no-default field — the one marker no
    other frontmatter convention in this repo uses). The latter is reported in its own
    informational bucket, not treated as a hard failure. Fixes false-positive failures on
    `.claude/commands/*.md` (Claude Code's `description:` frontmatter) and Nextra's stub pages
    (`title:`-only frontmatter).
R3. After R1+R2, `npm run kms:validate` reports 0 invalid front-matter files against the current
    repo state, and a regenerated `ARTIFACT_INDEX.md` contains exactly one row for the KMS design
    doc (no duplicate `kms/site-internal/content/dev/kms-design.mdx` row).
R4. `.github/workflows/gates.yml` runs `npm run kms:validate` as a gate step — a hard failure
    (genuinely invalid KMS front-matter) fails the PR; missing or non-KMS front-matter does not.
R5. `.github/workflows/gates.yml` regenerates `ARTIFACT_INDEX.md` (`npm run kms:build-index`) and
    fails the PR if the result differs from the committed file — compared with the `Last build:`
    timestamp line normalized out first (a raw `git diff --exit-code` would always show a diff
    because of that line — flagged as a known follow-up need in
    `specs/2026-08-06-kms-site/requirements.md` R2).
R6. Root `lint`, `typecheck`, `test`, `format:check` remain green after this slice.
R7. `CHANGELOG.md` updated (Gate 4).
