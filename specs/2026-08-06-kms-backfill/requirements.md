# KMS — front-matter backfill (requirements / acceptance criteria)

Closes the last deferred item from the KMS design (`specs/2026-08-06-kms/requirements.md` R8):
backfill front-matter onto the docs that predate the KMS schema, so `ARTIFACT_INDEX.md` indexes
more than the single doc it does today.

R1. Front-matter is added to 18 files: `CLAUDE.md`; `docs/onboarding.md`,
    `docs/repo-structure.md`, `docs/walking-skeleton-runbook.md`; the 9 persistent `specs/` docs
    (`architecture.md`, `mission.md`, `roadmap.md`, `tech-stack.md`, `design-system.md`,
    `sdd-workflow.md`, and the 3 `decisions/ADR-*.md` files); and one representative file per
    remaining dated slice folder (`plan.md` where one exists, else `requirements.md`) —
    `2026-08-05-m0-walking-skeleton/plan.md`, `2026-08-06-design-system/requirements.md`,
    `2026-08-06-kms-gates/requirements.md`, `2026-08-06-kms-site/requirements.md`,
    `2026-08-06-p0-foundation/plan.md`. `2026-08-06-p1-auth/requirements.md` is deliberately
    **excluded from this slice** — it doesn't exist on `staging` yet (only on PR #24's unmerged
    branch); its front-matter is added directly on that branch instead, so it lands as part of
    that PR rather than needing cross-branch coordination.
R2. Each block matches `kms/schema/frontmatter.ts`'s `FrontMatter` schema exactly (`id`, `title`,
    `audience`, `type`, `status`, `version`, `updated`, `visibility`, `summary`, `tags`); no
    optional fields fabricated where there's nothing meaningful to say (no `owner`/`related`
    unless real). `visibility: internal` for all of them — none of this is customer-facing.
R3. A sibling file within an already-covered slice folder (e.g. a slice's `requirements.md` when
    its `plan.md` got the front-matter) is deliberately left without front-matter, matching the
    existing precedent set by `specs/2026-08-06-kms/plan.md` vs. its own `requirements.md`/
    `validation.md`. `README.md`, `CHANGELOG.md`, `hooks/README.md`,
    `.github/pull_request_template.md`, and `kms/site-internal/*` stay out of scope entirely (see
    issue #25 for why).
R4. `npm run kms:validate` reports 0 invalid front-matter and exactly 19 valid (18 new + the
    already-existing `specs/2026-08-06-kms/plan.md`).
R5. `npm run kms:build-index` regenerates `ARTIFACT_INDEX.md` with 19 rows, correctly grouped by
    derived track (all `internal-eng`, since `audience: [dev]` everywhere in this pass).
R6. `lint`, `typecheck`, `test`, `format:check` remain green.
R7. `CHANGELOG.md` updated (Gate 4).
