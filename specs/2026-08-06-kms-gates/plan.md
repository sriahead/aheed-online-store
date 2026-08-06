---
id: kms-gate-wiring
title: "KMS — Gate Wiring (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-08-06
visibility: internal
summary: Plan for wiring kms:validate and an ARTIFACT_INDEX.md staleness check into gates.yml, closing the last deferred item from the KMS design's Gate-wiring section.
tags: [kms, gates, ci]
related: [kms-design]
---

# KMS — Gate Wiring (plan)

**Goal:** close `specs/2026-08-06-kms/plan.md` §2 ("Gate wiring") and
`specs/2026-08-06-kms/requirements.md` R8 — wire the front-matter validator and index generator
into `gates.yml`, so a stale index or invalid front-matter fails a PR the same way a missing
CHANGELOG entry does.

**Trigger:** grounding before touching `gates.yml` surfaced two prerequisite bugs that made the
original plan unsafe to implement as literally sketched:
1. `kms/schema/repo.ts`'s `walk()` didn't exclude `kms/site-*/content/` (assembled/generated site
   output) — the same doc was being indexed twice (source path + assembled copy), and the
   duplicate was CI-nondeterministic since that gitignored directory doesn't exist on a fresh
   checkout unless `assemble.ts` happened to run first.
2. `kms/schema/validate.ts` hard-failed on any frontmatter block regardless of whether it was ever
   meant to be a KMS doc — `.claude/commands/*.md` (Claude Code's own `description:` frontmatter)
   and Nextra's `title:`-only stub pages both collided with the schema. Wiring the validator into
   CI as originally sketched would have broken every future PR.

**Scope (this slice):**
- Fix both prerequisite bugs (path exclusion for generated content; a `visibility`-key
  discriminator so non-KMS frontmatter is reported informationally, not hard-failed).
- `gates.yml`: a `kms:validate` step, and a staleness-check step that regenerates
  `ARTIFACT_INDEX.md` and diffs it against the committed version with the `Last build:` timestamp
  *and* commit SHA normalized out first (both are inherently unstable per-run — a raw
  `git diff --exit-code` would always show a diff and always fail, caught the hard way on this
  slice's own PR when the SHA-normalization gap wasn't caught in the first pass).

**Deliberately excluded:**
- Front-matter backfill onto existing docs — separate slice (`specs/2026-08-06-kms-backfill/`).
- `site-public` gate wiring — that site doesn't exist yet (deferred until P6/storefront).
