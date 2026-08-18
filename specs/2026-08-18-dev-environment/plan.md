---
id: dev-environment
title: "Local dev environment tier — per-developer Neon branch (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-18
visibility: internal
summary: A local-only "dev" environment tier — one disposable Neon branch per developer (branched off staging) plus a shared aheed-images-dev R2 bucket — so local validation stops reading/writing the staging database directly. Closes #226.
tags: [environments, neon, database, ops, devops]
related: [env-setup, neon-db-separation, adr-004-multi-tenancy]
---

# Local dev environment tier — per-developer Neon branch (plan)

`requirements.md` holds the checkable acceptance criteria; this file holds the reasoning. Ref:
issue #226, approved at `/propose` on 2026-08-18. No parent issue — standalone ops/tooling slice,
the same shape as ADR-004 slice 0 (`neon-db-separation`, #56), which this slice extends rather than
revisits.

**Does not contradict ADR-004's "separate projects, not Neon branches" ruling** (`ADR-004-multi-
tenancy.md` line ~113): that ruling governs **staging and production** — environments holding real
(or real-shaped, in staging's case) vendor data under shared compute/limits, where a staging test
mutating a live vendor's rows is a data-integrity and UK-GDPR concern. A personal `dev` branch holds
no vendor's real data, is never load-bearing for anything but its own developer's local loop, and is
deleted/recreated at will — the exact conditions ADR-004's own text carves out as not requiring
project-level isolation. Staging and production remain separate Neon **projects**, unchanged by this
slice; `dev` is a **branch of staging**, one layer below both.

**Goal:** stop local validation (`next dev` / `npm run preview`) from either reading/writing the
**staging** Neon database directly — its current behaviour, confirmed during `/propose`: `.env` and
`.dev.vars` point at the staging project today — or requiring ad hoc scratch infra to be stood up by
hand for every validation pass. After this slice, a developer has a standing, disposable, personal
database they can reset in seconds, and staging is never touched by local work again.

**Scope (this slice):**
- **Docs only** — `docs/env-setup.md` gains a new "Local development (`dev`)" section, written to
  the same standard as its existing "One Neon project per environment" and "Bootstrapping a fresh
  environment database" sections. It documents:
  - Creating a **personal Neon branch** off the **staging** project (Neon Console: staging project →
    Branches → Create Branch → parent `staging`'s default branch → name it `dev-<you>`, e.g.
    `dev-sri`). A fresh branch is a byte-for-byte copy of its parent at creation time, so it starts
    with staging's current schema **and seed/demo data already loaded** — no `db:seed` or
    demo-accounts step needed for the common case.
  - Retrieving that branch's **pooled** (`-pooler`, → `DATABASE_URL`) and **direct** (→
    `DIRECT_URL`) connection strings from the branch's own Connection Details panel — same
    pooled/direct split every other environment already uses.
  - **Resetting**: delete the branch and recreate it from staging's current tip. No migration,
    no re-seed step — that's the point of branching instead of a from-scratch project.
  - **Applying a locally-authored, not-yet-merged Prisma migration** to the branch before testing it:
    `DIRECT_URL=<branch-direct-url> npx prisma migrate deploy` (or `migrate dev` while iterating on
    the migration itself) — a local Node command against the branch's direct URL, not a Worker-time
    operation, so it doesn't conflict with `CLAUDE.md`'s "migrations never run on the Worker" rule.
  - The **shared** `aheed-images-dev` R2 bucket (one bucket for every developer, not per-developer —
    object storage isn't where concurrent test writes actually collide; the worst case is a stale
    test image, not corrupted state).
  - Stating explicitly that `dev` is **local-only**: no `wrangler.toml` `[env.dev]` block, no
    Cloudflare Worker deploy, no custom domain, no CI workflow, no GitHub environment secrets, and
    it never goes through `scripts/configure-env.mjs` (nothing to push to a GitHub/Cloudflare store
    for a tier with no deployment). Staging remains the shared, deployed tier where system
    integration testing happens once a fix is opened as a PR.
- **`.env.example` / `.dev.vars.example` updated** — both currently show `S3_BUCKET=` with the
  literal example value `aheed-images-staging`, because they were written when local dev *was*
  pointed at staging. That value flips to `aheed-images-dev`, and both files gain a short comment
  pointing at `docs/env-setup.md`'s new section for how to obtain a personal `DATABASE_URL`/
  `DIRECT_URL`. This is the concrete fix for the behaviour that prompted #226.
- **Proof of isolation**: once a human has provisioned the two blocking items from #226 (Neon
  branch-creation access, the `aheed-images-dev` bucket), a real personal branch is created per the
  new doc section and exercised — `npm run preview` against it renders the storefront with catalogue
  data present (proving the copy-on-branch inheritance), and a marker row written only to the branch
  is invisible from staging's own `/api/health` (proving it's a genuinely separate database).

**Deliberately excluded:**
- **No deployed Worker, custom domain, or CI workflow for `dev`** — confirmed local-only at
  `/propose`. Staging already covers "shareable, deployed" validation.
- **No per-developer R2 bucket** — one shared `aheed-images-dev` bucket, confirmed at `/propose`.
- **No change to `scripts/configure-env.mjs`** (`VALID_ENVS` stays exactly `["staging",
  "production"]`) and **no `[env.dev]` block in `wrangler.toml`** — both asserted as unchanged by
  `requirements.md` so a later slice can't silently reintroduce deploy scope for `dev` without a new
  `/propose`.
- **No wrapper script for branch create/reset** (e.g. a hypothetical `scripts/dev-branch.mjs`). The
  Neon Console flow is three clicks and needs no new tooling or dependency; a script would be pure
  convenience for an action a developer runs rarely (create once, reset occasionally). Revisit only
  if that assumption turns out wrong in practice.
- **No change to the `feature/<slug> → staging → main` branch/PR strategy** — a developer's fix
  still integrates the same way it always has; this slice only fixes what their *local* loop was
  pointed at before that PR exists.
- **No `neonctl` CLI documented as the primary path.** The exact flags of a locally-installed
  `neonctl` version weren't verified while writing this spec, so the doc leads with the Console
  (always correct, no version drift) and mentions the CLI only as an optional shortcut a developer
  can look up themselves (`neonctl branches create --help`) — not asserted as copy-pasteable fact.

**Open items carried forward:**
- **Neon plan/branch limits are not verified.** Branching is a Neon feature available down to its
  Free tier (with a per-project branch cap), but this repo's docs don't record which Neon plan the
  account is actually on, and this session has no Neon account access to check. If the account's
  branch limit is smaller than the number of developers who'd want a standing personal branch, that's
  a real constraint on this design — surface it at `/build` (checking the Neon dashboard) rather than
  discovering it only when someone's branch-create fails.
- The two human-only provisioning items from #226 (Neon branch-creation access; creating the
  `aheed-images-dev` bucket) are **blocking** for `R9`/`R10` in `requirements.md` — those two
  requirements can't be validated until both exist. Everything else in this slice (the doc and
  example-file edits) doesn't depend on them.
- Whether a `dev-<you>` naming convention needs enforcing anywhere beyond the doc (e.g. so two
  developers don't collide on a branch name) is left to Neon's own "branch already exists" error at
  creation time — not worth a written convention beyond the doc's example.
