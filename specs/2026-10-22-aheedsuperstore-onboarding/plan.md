---
id: aheedsuperstore-onboarding-plan
title: "Aheed Super Store test vendor and reusable onboarding automation (proposal)"
audience: [dev]
type: spec
status: draft
version: "0.1.0"
updated: 2026-10-22
visibility: internal
summary: "Gate 1 proposal: add Aheed Super Store as a test vendor alongside the existing vendors, extend the provisioner for placeholder-bearing manifests, build the #1201 catalogue importer to its recorded rules, and add an onboarding runbook. Awaiting owner decisions; nothing built or deployed."
tags: [provisioning, onboarding, multi-tenancy, catalogue-import, p11]
related: [client-onboarding-prerequisites, architecture, adr-004-multi-tenancy, env-setup, roadmap]
---

# Gate 1 proposal — Aheed Super Store test vendor and reusable onboarding automation (`#1201` and a new tracking issue)

Status: **PROPOSAL — awaiting owner approval. Nothing has been built, pushed or deployed.**
Written 2026-10-22, on `feature/client-onboarding-process` (local only, cut from `docs/1211-document-pass`).
Prerequisites: `docs/developer-portal/client-onboarding-prerequisites.md`.

## 1. What is being asked

Onboard a shopfront on a new domain such as `aheedfoodcentre.co.uk`, and leave behind a reusable
process for future client onboarding and data migration. Use **Aheed Super Store** as a **test
vendor** to prove the process, importing similar catalogue data, before any real client data.

## 2. Findings from reading the repository (not assumed)

| Fact | Source |
| --- | --- |
| Existing routes: staging `staging.aheedfoodcentre.nocaped.com`, `srimart-staging.nocaped.com`; production `aheedfoodcentre.nocaped.com`, `srimart.nocaped.com`. | `wrangler.toml` |
| `aheedfoodcentre.co.uk` appears nowhere in the repo. Whether the zone exists in Cloudflare is **unknown**. | grep |
| A new vendor is data (a manifest) plus one `wrangler.toml` route per host. A deploy omitting a live host tears it down; the deploy workflows already fail on that. | `scripts/verify-worker-routes.ts`, `prisma/manifests/README.md` |
| `scripts/provision-vendor.ts` writes the vendor, branding, config, delivery areas, slots, loyalty tiers, discounts, footer and `VendorDomain`. It writes **no catalogue**. It refuses deployed databases with **no override**. | `scripts/provision-vendor.ts`, `scripts/lib/protected-hosts.ts` |
| The manifest schema is strict; numeric fields must be integers and the sender must be a valid email, so **a placeholder string cannot pass today**. | `scripts/provision-vendor.ts` |
| `lib/catalogue-import-policy.ts` is pure: new rows hidden + `UNKNOWN`; re-import never activates, never loosens, never touches stock. It takes a per-client department → restriction map as input. | `lib/catalogue-import-policy.ts` |
| **There is no importer yet** (`#1201`). Its measured requirements are in the issue body. | `#1201` |
| The `dev` tier is local-only: no `[env.dev]`, no deployed host. A deployed `aheedsuperstore.nocaped.com` dev host is **not possible today**. | `docs/developer-portal/env-setup.md` |
| Staging and production are separate databases; scripts refuse to write to either. | `protected-hosts.ts` |
| Email sending reads one `RESEND_FROM_EMAIL` env value; per-vendor `senderEmail` exists in config. Whether outgoing mail actually uses the per-vendor value needs checking before it is promised. | `lib/config.ts`, `env-setup.md` |

## 3. Is this a new vendor or another domain for Aheed Food Centre?

**It is described as a new vendor** (Aheed Super Store, its own catalogue) **on a domain named after
Aheed Food Centre.** That is internally ambiguous and I will not guess. The two readings are
different pieces of work:

- **A. New vendor**, own `Vendor`, own catalogue, own staff, orders, and a hostname. The hostname
  happens to be `aheedfoodcentre.co.uk`.
- **B. Second domain for the existing Aheed Food Centre vendor**: one `VendorDomain` row and one
  route. No new vendor, no import.

Recommendation: **A**, and for the *test* use a hostname that cannot collide with Aheed Food Centre's
identity (see §6, decision D2). Do not point `aheedfoodcentre.co.uk` at a test vendor.

## 4. Alongside the existing vendors, or replace the existing test data?

**Add alongside. Do not replace.**

- The platform is multi-tenant by `vendorId`; a new vendor with a manifest-owned UUID is isolated by
  construction, so it cannot overwrite Aheed's or SriMart's rows.
- Replacing existing test data would delete or overwrite rows that are not needed for this test and
  that other checks (the second-vendor branding eyeball, SriMart fixtures) depend on.
- Every provisioning write is an upsert keyed by the manifest id, so re-runs are no-ops and a failed
  run can be repeated.
- Where the test runs: the **dev database** (the only one scripts may write to). Staging is touched
  only by a reviewed PR and the deploy workflow, and production only after staging is proven and
  you approve.
- **No existing data is deleted or overwritten by this plan.** Any cleanup of test rows afterwards is
  a separate request needing your explicit approval.

## 5. Proposed implementation (after approval)

One slice, three parts, each testable alone. Spec first (`/spec`, Gate 2); no source before it.

### Part A — manifest hardening for placeholder-bearing test vendors
- Add an optional `placeholders: string[]` to the manifest schema (paths of fields still awaiting
  owner input) and a `--check-ready` mode that **fails** while any remain.
- Placeholder values are real, valid, obviously-fake values (for example `deliveryFeePence: 0`,
  `senderEmail: "owner-to-confirm@example.invalid"`, postcode prefix `"ZZ1"`), never fabricated
  business facts; the `placeholders` list is what marks them. The existing schema stays strict.
- The provisioner refuses a non-dev database if the manifest still lists placeholders (a second,
  independent gate on top of the host guard).
- Tests: manifest with placeholders validates and writes on dev; the same manifest is refused by
  `--check-ready`; unknown keys still fail.

### Part B — the catalogue importer (`#1201`, built to its recorded requirements)
- `scripts/import-catalogue.ts <source.xls> --manifest <manifest.json> --policy <policy.json>
  [--dry-run]`; Node, `DIRECT_URL`, behind the same host guard; never on the Worker.
- Pure core in `lib/` (parse → classify → plan) fully unit-tested; thin I/O shell in `scripts/`.
- Behaviour fixed by existing rulings: every row created **hidden**, stock **UNKNOWN**
  (`newImportedProductState`); classification through `classifyImportRow` with the supplied
  department map; re-import through `reimportedProductState`; the stock column **not** imported;
  barcode, supplier and cost **not** written and **never fabricated**; VAT normalised, original
  preserved in the report, nothing corrected; composite identity PLU + department; slugs
  disambiguated; categories keyed on the (department, sub-department) pair; duplicate-key handling
  accepting **both** `"23505"` and `P2002`, **verified against the adapter the importer actually
  constructs**.
- `--dry-run` writes nothing and prints the exception report. The real run writes an **exception
  report** (rejected rows by source row number) and a source-row → product trace file.
- `description` and `unitLabel` are non-null and the source has neither: needs an editorial default
  (see D6); the importer will not invent product facts.
- Excel reading needs a parser. The repo has none; adding a dependency is Gate-relevant, so it is
  **decision D5**, not a default.

### Part C — an onboarding orchestration command and runbook
- `scripts/onboard-vendor.ts` (or a documented sequence) that runs, in order, and stops on the first
  failure: manifest validate → readiness check (environment-aware) → provision (dev only) → import
  dry-run → import → verification queries → print the exact `wrangler.toml` block and the checklist
  of manual actions that remain.
- It **writes no route and deploys nothing**; it prints the `--write` block for a human to review.
- A verification script confirms, for a named environment, that **every** `VendorDomain` host has a
  route and that no vendor row set is missing a host (a superset of today's check).
- The prerequisites document becomes the permanent runbook once reviewed; this slice extends it with
  the orchestration steps and the rollback table.

### Not included
- No wildcard route (ADR-004's 2026-10-21 note).
- No change to the host guard, which keeps no override.
- No deletion, no migration (no schema change), no secret handling, no Cloudflare or DNS change.
- No stock, cost, supplier or barcode import.

## 6. Decisions and information needed from you

| # | Decision / input | Recommendation |
| --- | --- | --- |
| **D1** | Reading A (new vendor) or B (second domain for Aheed Food Centre)? | A. |
| **D2** | Hostnames. For the **test**: ‹dev: `aheedsuperstore.localhost:8787` locally›. Do you want `aheedfoodcentre.co.uk` used at all for the test? | Not for the test. Keep the name until a real client domain is confirmed, so a test vendor never answers on a brand's real domain. |
| **D3** | Does `aheedfoodcentre.co.uk` exist as an **active zone in this Cloudflare account**? Who owns it? | You confirm; I cannot see the account. Stop and list manual steps if not. |
| **D4** | Deployed dev host `aheedsuperstore.nocaped.com`: build a deployed `[env.dev]` Worker (route, R2 bucket, secrets, CI), or keep dev local? | Keep dev local; it is a separate slice with its own cost and secrets. |
| **D5** | Add an Excel-reading dependency (for example `xlsx`/SheetJS or `read-excel-file`)? `tech-stack.md` policy applies; the legacy `.xls` BIFF format narrows the choice. | Yes, pinned exact, in the importer only, after a short evaluation recorded in the spec. Alternative: you export CSV and no dependency is needed. |
| **D6** | Default `description` and `unitLabel` for imported rows. | Description = product name; unitLabel from the existing `NetContentSuggestion` machinery where parseable, else a neutral marker that keeps the row hidden. Your call. |
| **D7** | Department → restriction map for the test. `#1200` records which departments are restricted. | Reuse the `#1200` lists; you confirm. |
| **D8** | Which database holds the dev run: confirm the `.env` dev host (`ep-dry-morning-zab7dx08`) and that it is acceptable for a test vendor to remain there. | Yes, and cleanup is a later, separately approved step. |
| **D9** | Email: platform-wide `RESEND_FROM_EMAIL` or per-vendor sender? Is the sending domain verified in Resend? | Verify what emails actually use per vendor before promising it; for the test, no real email is sent. |
| **D10** | Business config placeholders for the test (fee, threshold, minimum, postcode prefixes, sender, footer): agree the placeholder set in Part A, or supply real values. | Placeholders, marked, and refused outside dev. |
| **D11** | Board and issue handling: a new tracking issue for "reusable onboarding automation" alongside `#1201`, with Phase P11. | Yes. I cannot create board items from this session (GraphQL blocked); I would open the issue over REST and you set the board fields. |

## 7. Risks

| Risk | Control |
| --- | --- |
| A route edit drops an existing vendor's custom domain. | Add-only edits, `verify-worker-routes` in both deploys, a diff check in the PR. |
| A script writes to a deployed database. | Existing host guard, no override; the new scripts import it. |
| A placeholder reaches production. | Readiness gate refuses non-dev, plus `--check-ready` in review. |
| Imported rows become sellable. | `newImportedProductState` is the only constructor; a guard test; the DB `CHECK` for restricted rows. |
| Fabricated fields. | The importer has no code path for barcode, supplier, cost or stock; test asserts they are untouched. |
| Test data lingering. | Documented as intended; removal needs your approval. |
| `.xls` parsing differs from the real client file. | Dry run + exception report first; tests use a small synthetic fixture that is not client data. |

## 8. Validation (for the eventual spec)

Unit tests for every pure function; a dev-database verification script run twice (idempotence);
`lint`, `typecheck`, `format:check`, `npx vitest run --maxWorkers=4`, `npm run build`,
`kms:validate`, `kms:coverage`, `sdd:audit`; the §9 verification list in the prerequisites document
per environment; `validation.md` run in a **fresh** context, not the building one.

## 9. What I will not do without further approval

Push this branch, open a PR, change `wrangler.toml`, touch Cloudflare/DNS/Resend/secrets, run any
script against any database, install a dependency, or delete or overwrite any existing data.
