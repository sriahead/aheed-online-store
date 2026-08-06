---
id: kms-index-assembly-site
title: "KMS — Index Generator, Assembly & Internal Site (requirements)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-08-06
visibility: internal
summary: Requirements for the ARTIFACT_INDEX.md generator, the assemble script, and the internal Nextra docs site serving specs/docs/CLAUDE.md under /dev.
tags: [kms, nextra, docs-site]
related: [kms-design]
---

# KMS — Index Generator, Assembly & Internal Site (requirements)

Follow-up slice to `specs/2026-08-06-kms/` (design in that folder's `plan.md`; not repeated here).
Builds on the schema/validator foundation: the generator, the internal Nextra site pulling in
`specs/`, `docs/`, `CLAUDE.md` as dev help guides, and its deploy workflow. The public site (track 3)
stays stubbed — no storefront exists yet to document.

R1. `kms/scripts/build-index.ts` walks all `.md`/`.mdx`, reads valid front-matter (reuses
    `kms/schema/validate.ts`'s walk + parse logic), derives `track` via `trackFor()`, and writes
    `ARTIFACT_INDEX.md` grouped by track, matching the file's existing generated-shape/legend.
R2. Running the generator twice with no source changes produces identical content **except** the
    `Last build: <timestamp>` line (deterministic — sorted by path, not filesystem enumeration
    order). A future CI staleness check (`git diff --exit-code`, deferred per the parent spec's R8)
    will need to exclude that line from the comparison, not diff the raw file.
R3. `kms/scripts/assemble.ts --visibility internal|public` copies single-source docs (front-matter
    files whose `visibility` matches, plus internal implicitly includes public) into a site's
    content directory, without duplicating doc bodies by hand.
R4. `kms/site-internal/` is a working Next.js + Nextra 4 app (App Router, current Nextra API — no
    `theme.config.tsx`, per Nextra 4's actual setup) that runs locally via its own `npm run dev` and
    renders assembled content under `/dev/*`, with `/staff` as a stubbed placeholder.
R5. `kms/site-internal/wrangler.toml` targets a separate Worker (`env.internal`) — this app is
    independently deployable from the main storefront Worker, isolating its dependency tree/build
    from the main app's.
R6. `.github/workflows/deploy-docs-internal.yml` exists and mirrors `deploy-staging.yml`'s pattern
    (build → deploy), triggered the same way. Actually succeeding requires Cloudflare-side
    provisioning (new Worker route, DNS for `docs.internal.<domain>`, and — per the design's
    zero-trust requirement — a Cloudflare Access application) that only the human can create; this
    requirement covers the workflow file existing and being correctly structured, not a live deploy.
R7. `lint`, `typecheck`, and `test` remain green for the root app after this slice (the new site is
    a separate npm project with its own toolchain, not wired into the root's).
