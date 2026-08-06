---
id: kms-frontmatter-backfill
title: "KMS — Front-Matter Backfill (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-08-06
visibility: internal
summary: Plan for backfilling front-matter onto the docs that predate the KMS schema, closing the last deferred item from the KMS foundation slice.
tags: [kms, front-matter, backfill]
related: [kms-design]
---

# KMS — Front-Matter Backfill (plan)

**Goal:** close the last deferred item from the KMS foundation slice
(`specs/2026-08-06-kms/requirements.md` R8) — `ARTIFACT_INDEX.md` indexed exactly one doc
(`specs/2026-08-06-kms/plan.md`) because nothing else carried front-matter yet.

**Scope decision — one entry per meaningful doc/slice, not per file:** the existing precedent
(`specs/2026-08-06-kms/plan.md` has front-matter; its own `requirements.md`/`validation.md` don't)
already establishes that a slice's front-matter/index entry lives on its most narrative file, not
every acceptance-criteria file in the folder. Applied consistently here: `CLAUDE.md`, the three
`docs/*.md` files, the 9 persistent `specs/` docs, and one representative file per dated slice
folder (`plan.md` where one exists, else `requirements.md` at the time this slice ran — since
then, `plan.md` backfill (issue #27) means every slice now has one, so this precedent simplifies
to "always `plan.md`" going forward).

**Deliberately excluded:** `README.md`, `CHANGELOG.md`, `hooks/README.md`,
`.github/pull_request_template.md` (not listed in the KMS design's own walk scope — `specs/`,
`docs/`, `CLAUDE.md`, `kms/prompts/`; a PR template and CHANGELOG aren't "docs" in the indexed
sense, per `specs/2026-08-06-kms/plan.md`'s own words: "a config is not a doc").
`kms/site-internal/{AGENTS,CLAUDE,README}.md` — belong to that nested, independently-toolchained
app, not the root repo's scope.

**Open items carried forward:** `specs/2026-08-06-p1-auth/requirements.md` (now `plan.md`, per
issue #27's backfill) is excluded from this slice — it didn't exist on `staging` yet, only on
PR #24's unmerged branch. Its front-matter/plan.md landed with that PR instead of needing
cross-branch coordination.
