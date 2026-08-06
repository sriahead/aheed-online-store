<!--
  ARTIFACT_INDEX.md — GENERATED FILE. DO NOT EDIT BY HAND.
  Produced by: kms/scripts/build-index.ts (walks **/*.md(x), reads front-matter).
  Regenerated and diffed in CI (gates.yml) — a stale index fails the PR, exactly
  like the Gate-4 CHANGELOG check. Source of truth is each doc's front-matter, not
  this table. To change a row, edit that doc's front-matter and let CI rebuild.

  Columns: Artifact (title) · Type · Version · Updated · Status · Visibility · Summary
  Path is the link target. Grouped by derived track (audience → track).
-->

# Artifact Index

_Generated from front-matter across `specs/`, `docs/`, `CLAUDE.md`, and `kms/`.
Last build: `<timestamp>` · commit `<sha>` · `<N>` artifacts._

**Legend** — Status: `draft` → `review` → `approved` → `deprecated` ·
Visibility: `internal` (dev/staff site, behind Access) · `public` (help centre).

---

## Track 1 — Internal / Engineering (`internal-eng`)  ·  audience: dev

| Artifact | Type | Ver | Updated | Status | Vis | Summary |
|---|---|---|---|---|---|---|
| [System Architecture](specs/architecture.md) | spec | 1.0.0 | 2026-08-05 | approved | internal | PostgreSQL-first, vendor-agnostic Cloudflare + Neon design with per-seam ports and migration playbooks. |
| [ADR-001 — Hosting, DB & Egress](specs/decisions/ADR-001-hosting.md) | adr | 2.0.0 | 2026-08-05 | approved | internal | Revised: Cloudflare Workers + Neon serverless origin, superseding the GCP design. |
| [ADR-002 — Auth Library](specs/decisions/ADR-002-auth-library.md) | adr | 1.0.0 | 2026-08-05 | approved | internal | Better Auth (self-hosted, bearer tokens, RBAC); unchanged by the pivot. |
| [ADR-003 — Storage Abstraction](specs/decisions/ADR-003-storage-abstraction.md) | adr | 1.0.0 | 2026-08-05 | approved | internal | S3-compatible API behind a StorageService port; DB stores relative keys only. |
| [AI Guardrails](CLAUDE.md) | doc | — | 2026-08-05 | approved | internal | Authoritative runtime/dependency constraints and the four SDD gates for AI-assisted work. |
| [Onboarding](docs/onboarding.md) | runbook | — | 2026-08-05 | approved | internal | Five-minute local run + branch flow for the M0 walking skeleton. |
| [Walking-Skeleton Runbook](docs/walking-skeleton-runbook.md) | runbook | — | 2026-08-05 | approved | internal | Follow-once procedure to stand up Workers + Neon and go green on production. |
| [M0 — Walking Skeleton (plan)](specs/2026-08-05-m0-walking-skeleton/plan.md) | spec | — | 2026-08-05 | approved | internal | Scope of the smallest end-to-end infra proof; what it deliberately excludes. |
| _`<prompt library entries appear here — type: prompt>`_ | prompt | — | — | — | internal | — |
| _`<...auto-populated from front-matter...>`_ | | | | | | |

## Track 2 — Staff / Operations (`staff-ops`)  ·  audience: staff

> **Stub.** Populated from P6 (admin & staff panel) onward. Schema is ready; no
> content yet — deliberately, per the phased plan.

| Artifact | Type | Ver | Updated | Status | Vis | Summary |
|---|---|---|---|---|---|---|
| _`<no artifacts yet>`_ | sop | — | — | — | internal | — |

## Track 3 — Customer / Help Centre (`customer-help`)  ·  audience: customer

> **Stub.** Populated once the storefront UI exists (there is nothing to document
> until customers can do something). Deploys to the **separate public** site.

| Artifact | Type | Ver | Updated | Status | Vis | Summary |
|---|---|---|---|---|---|---|
| _`<no artifacts yet>`_ | faq | — | — | — | public | — |

---

### Build/coverage notes (emitted by the generator)

- `<N>` artifacts total · Track 1: `<n1>` · Track 2: `<n2>` · Track 3: `<n3>`
- Front-matter validation: `<pass/fail>` · files missing front-matter: `<list>`
- Coverage flags (optional): specs without a matching `validation.md`, `draft` docs older than `<X>` days, `deprecated` docs still linked.
