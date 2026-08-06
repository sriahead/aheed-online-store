---
id: kms-index-assembly-site
title: "KMS — Index Generator, Assembly & Internal Site (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-08-06
visibility: internal
summary: Plan for the ARTIFACT_INDEX.md generator, the assemble script, and the internal Nextra docs site — the deferred follow-up to the KMS schema/validator foundation slice.
tags: [kms, nextra, docs-site]
related: [kms-design]
---

# KMS — Index Generator, Assembly & Internal Site (plan)

**Goal:** deliver the pieces `specs/2026-08-06-kms/requirements.md` R8 explicitly deferred from the
schema/validator foundation slice — the generator that produces `ARTIFACT_INDEX.md`, the assembler
that copies single-source docs into a site's content directory, and a working internal Nextra site
that actually serves them. Design in `specs/2026-08-06-kms/plan.md`, not repeated here.

**Scope (this slice):**
- `kms/scripts/build-index.ts` — walks front-matter docs, derives track (audience → track), writes
  `ARTIFACT_INDEX.md` grouped by track. Deterministic aside from its `Last build:` timestamp line.
- `kms/scripts/assemble.ts --visibility internal|public` — copies single-source docs into a site's
  `content/` by `visibility`, so doc bodies are never duplicated by hand. Both scripts share
  `kms/schema/repo.ts` (walk/parse helpers factored out of `validate.ts`).
- `kms/site-internal/` — a standalone Next.js + Nextra 4 app (own `package.json`/toolchain, so its
  dependency tree and build never touch the root app's) serving assembled docs under `/dev`, with
  `/staff` stubbed until the P6 admin/staff panel exists.
- `.github/workflows/deploy-docs-internal.yml`, mirroring `deploy-staging.yml`'s pattern.

**Deliberately excluded:**
- `site-public` (track 3) — no storefront exists yet to document; stays stubbed per the parent
  design's phasing principle (tracks 2-3 wait for their real consumers, P6/storefront).
- CI gate wiring for `kms:validate`/staleness checking — that's `specs/2026-08-06-kms-gates/`, a
  later slice, not this one.
- Front-matter backfill onto existing docs — `specs/2026-08-06-kms-backfill/`.

**Open items carried forward:**
- The internal site isn't actually reachable yet — needs the human to provision Cloudflare DNS for
  `docs.internal.aheedfoodcentre.nocaped.com` and a Cloudflare Access application gating it
  (zero-trust; the site has no auth of its own). `workers_dev = false` and the route stay commented
  out in `kms/site-internal/wrangler.toml` until both exist, so this deploy workflow is safe to run
  before that provisioning without exposing anything.
