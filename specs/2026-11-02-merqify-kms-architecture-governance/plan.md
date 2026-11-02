---
id: merqify-kms-architecture-governance-plan
title: "Merqify KMS — Knowledge Architecture, Governance and Validation (plan)"
audience: [dev, architect, platform-admin]
type: spec
status: draft
version: "1.0.0"
updated: 2026-11-02
visibility: internal
summary: "Review, redesign, and reorganise Merqify KMS into an authoritative single source of truth across 13 canonical domains, with C4 alignment, automated link integrity testing, and Nextra portal restructuring."
tags: [kms, architecture, governance, link-integrity, documentation]
related: [client-help-centre-doc-management, client-user-journeys]
---

# Merqify KMS — Knowledge Architecture, Governance and Validation (implementation plan)

## Phase 1 — Inventory & Analysis
- Audit existing 1,020 markdown files in repository.
- Identify 305 registered KMS documents with YAML frontmatter.
- Map all documents against 13 canonical knowledge domains.
- Scan for broken links, hardcoded URLs, and terminology inconsistencies.

## Phase 2 — Architecture & Governance Design
- Define 13 canonical knowledge domains incorporating C4 system abstractions.
- Establish Role-Based Access Control matrix for 9 ecosystem roles.
- Document ownership, review cadences, and lifecycle statuses (`draft`, `review`, `approved`, `deprecated`).

## Phase 3 — Repository Updates & Quality Gate
- Author `tests/kms-link-integrity.test.ts` to test all registered markdown documents for broken links and raw `file:///` URLs.
- Repair all discovered broken links and hardcoded URLs in `docs/` and `specs/`.
- Update `kms/site-internal/wrangler.toml` and Nextra portal pages (`content/index.mdx`, `content/dev/index.mdx`) with Merqify branding and dual navigation hubs.
- Migrate `kms/site-internal/content/` metadata from ignored `_meta.json` to Nextra 4 `_meta.ts`, establishing purpose-driven sidebar category titles and section separators. Protect `_meta.ts` in `kms/scripts/assemble.ts`.
- Update `coverage-baseline.json` and rebuild index with `npm run kms:build-index`.

## Phase 4 — Verification & Delivery
- Run `npm run kms:validate`, `npm run kms:coverage`, `vitest` link integrity tests, `typecheck`, and `lint`.
- Deliver full specification artifact containing Deliverables 1 through 10.
