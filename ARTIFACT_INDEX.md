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

_Generated from front-matter across the repo. Last build: `2026-08-07T06:57:02.433Z` · commit `5e702ff` · `3` artifacts._

**Legend** — Status: `draft` → `review` → `approved` → `deprecated` ·
Visibility: `internal` (dev/staff site, behind Access) · `public` (help centre).

---

## Track 1 — Internal / Engineering (`internal-eng`)  ·  audience: dev

| Artifact | Type | Ver | Updated | Status | Vis | Summary |
|---|---|---|---|---|---|---|
| [Aheed KMS — Design (structure, deployment, schema)](specs/2026-08-06-kms/plan.md) | spec | 0.1.0 | 2026-08-06 | draft | internal | Folder structure, deployment plan, and front-matter schema for the Aheed knowledge system — phased to M0 reality, with a generated index and an internal/public publication split. |
| [P1a — Email/Password Auth, RBAC, Account Shell (plan)](specs/2026-08-06-p1-auth/plan.md) | spec | 1.0.0 | 2026-08-06 | approved | internal | Plan for the first P1 slice — Better Auth email/password, RBAC, verification/reset emails, and an account shell — split from Google Sign-In, which needs OAuth credentials the human must create first. |
| [P1b — Google Sign-In (plan)](specs/2026-08-06-p1b-google-signin/plan.md) | spec | 1.0.0 | 2026-08-06 | approved | internal | Plan for adding Google as a Better Auth social provider alongside P1a's email/password flow, now that the human has provisioned the OAuth client and its secrets on Cloudflare. |

## Track 2 — Staff / Operations (`staff-ops`)  ·  audience: staff

| Artifact | Type | Ver | Updated | Status | Vis | Summary |
|---|---|---|---|---|---|---|
| _`<no artifacts yet>`_ | | | | | | |

## Track 3 — Customer / Help Centre (`customer-help`)  ·  audience: customer

| Artifact | Type | Ver | Updated | Status | Vis | Summary |
|---|---|---|---|---|---|---|
| _`<no artifacts yet>`_ | | | | | | |
