---
id: aheedsuperstore-onboarding-plan
title: "Aheed Super Store test vendor — placeholder manifests, catalogue importer, onboarding runbook (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-22
visibility: internal
summary: "Spec for #1216: manifests that carry marked owner-to-confirm placeholders and cannot yield a deploy route while any remain, a validate-before-write CSV/Excel importer (hidden, stock UNKNOWN), and the runbook, proven on a test vendor in the dev database."
tags: [provisioning, onboarding, multi-tenancy, catalogue-import, p11]
related: [client-onboarding-prerequisites, architecture, adr-004-multi-tenancy, adr-007-storefront-scope-restrictions-stock-states, env-setup, tech-stack, roadmap]
---

# Aheed Super Store test vendor — placeholders, importer, runbook (plan)

Issue `#1216`. Approved by the owner on 2026-10-22 (decisions D1-D11 below and in Appendix A).
`requirements.md` holds the checkable criteria; `validation.md` is what a fresh context runs.
Email is **not** in this slice: it is `#1217`. A deployed dev environment is **not** in this slice
either (Appendix A, 5.4).

**Goal:** prove, on a throwaway test vendor in the dev database, that a new client can be provisioned
from a manifest with honest placeholders, have a real stock export validated and imported **hidden
with stock UNKNOWN**, and be blocked from any deploy route until every owner-to-confirm value is
real. The proof is also the reusable process for the next client.

**Scope (this slice):**

1. **Placeholder-bearing manifests.** `scripts/provision-vendor.ts` gains an optional top-level
   `placeholders` list (paths of fields still awaiting the owner), `--check-ready` (exit 1 while any
   placeholder or `OWNER TO CONFIRM` marker remains) and `--emit-route --env staging|production`
   (prints the `wrangler.toml` route block only for a ready manifest). The schema stays strict.
   Numeric fields cannot carry a marker, so valid-but-fake numbers are listed in `placeholders`.
   **Where the block is enforced, honestly:** manifests are never committed, so CI cannot see them.
   The gate is the two commands above plus the host guard, which already stops the provisioner
   writing to any deployed database. It is a gate the operator runs, not one CI enforces, and the
   runbook says so.
2. **`scripts/import-catalogue.ts`** (Node, never the Worker) and a pure core in
   `lib/catalogue-import/`. Reads `.csv`, `.xlsx` and `.xls`. Driven by an **import profile** JSON
   (column mapping, unit rule, the owner's department map), held outside the repository like a
   manifest. **Dry-run by default and DB-free; `--apply` writes.** Every product is created
   `isActive: false`, `stockMode: UNKNOWN`, quantity 0; every category is created `isActive: false`;
   restrictions come from `classifyImportRow`; each restricted product gets one `IMPORT` audit row.
   A re-run writes nothing except a **tightened** restriction. A report file lists every rejected
   row by source row number, the VAT variants (reported, never rewritten), source drift and a
   source-row-to-slug trace.
3. **`scripts/verify-onboarding.ts`**, a read-only post-import check, and the importer's
   **isolation guard** (row counts of every other vendor identical before and after).
4. **Runbook**: `docs/developer-portal/client-onboarding-prerequisites.md` gains Procedure,
   Testing and validation, and Rollback sections; `prisma/manifests/README.md` documents the new
   flags; an `example-import-profile.json` with neutral names; `specs/tech-stack.md` records the
   one new dependency.

**Decisions this spec encodes (owner, 2026-10-22):**

- Aheed Super Store is a **new vendor added alongside** the existing ones, in the **dev database**
  `ep-dry-morning-zab7dx08`, provided the host guard confirms it is dev. Nothing is deleted or
  overwritten. The test vendor stays until a separate approved cleanup.
- Placeholders for delivery fee, free-delivery threshold, minimum order, postcode prefixes, sender
  email and footer address; branding copied from the existing Aheed Food Centre seed values.
- Description: the source description, **blank** if the profile maps none. **Name** comes from the
  source column the profile maps to `name`. *For the supplied stock list this means the source's
  only text column, "Description", becomes the product **name**, and the product description is
  blank* — it has no longer text. Flagged in the summary so the owner can object.
- Unit: the source unit token **verbatim** when the profile's pattern finds one, else the profile's
  documented default (`each` in the example). Net-content columns stay null: deriving them is
  `#900`/`#901`'s machinery, not this slice.
- Restrictions: the owner's existing mapping (ADR-007 table) supplied through the profile.
  **Departments in neither the restricted map, the uncertain list nor the profile's reviewed
  `unrestrictedDepartments` list are flagged UNREVIEWED and imported as `NEEDS_REVIEW`.**
- Excel **and** CSV, one exact-pinned dependency, validation before any write, hidden + `UNKNOWN`,
  nothing fabricated.
- **Categories are the client's own, verbatim (owner decision, later on 2026-10-22).** The platform's category
  structure is not yet ready to be standardised, so the importer neither maps nor renames: department and
  sub-department values become category names exactly as written (typos and upper case included). Categories
  are per-vendor (`@@unique([vendorId, slug])`), so the new vendor's categories cannot collide with Aheed Food
  Centre's. Standardising categories is a **later phase**, together with a versioned standard import template.

**Why these shapes**

- **Dry-run default, DB-free.** The validator can run the whole parse-classify-plan path with no
  credentials, so it is reviewable anywhere, and an accidental invocation writes nothing.
- **Slug as identity.** There is no `sourceRef` column and this slice adds none (`#1201`'s recorded
  decision), so row-level idempotency must come from `Product`'s existing `@@unique([vendorId,
  slug])`. The slug is therefore a deterministic function of name, PLU and department only, never
  of the rest of the file. Known limit: if staff edit an imported product's slug, a later re-import
  recreates it; the runbook says to re-import before editing slugs or not at all.
- **Categories created inactive.** The storefront's `visibleCategoryWhere` already hides products
  whose category is inactive, so a hidden catalogue is hidden twice. Staff activate a category in
  the existing categories screen when they are ready.
- **One interactive transaction per department**, on the WebSocket client, so a mid-run failure
  cannot orphan a category or a product without its inventory/audit rows.
- **Pure core in `lib/`, I/O in `scripts/`.** The spreadsheet dependency is imported only from
  `scripts/`, so it can never reach the Worker bundle.

**Deliberately excluded:**

- **Category standardisation, category mapping, client mapping approval and a standard import template with
  mapping columns.** Deferred by the owner. A draft mapping pack (112 source pairs against Aheed Food Centre's
  seeded structure) was prepared and **withdrawn**; it was never shared with the client, lives outside the
  repository, and is the starting point for that later phase. Nothing in this slice reads a mapping.

- Barcode, supplier, cost, case size, reorder levels and stock quantity: not imported, not
  fabricated (`#1196` ruling; the supplied file has zero barcodes and zero suppliers).
- VAT: reported, not stored. `Product` has no VAT column and this slice adds no schema change.
- Product images, net-content derivation, price/name updates on re-import (reported as drift).
- Any change to `wrangler.toml`, workflows, secrets, DNS, Cloudflare, Resend or the host guard.
- Outgoing email (`#1217`), the deployed dev environment, per-vendor sender addresses.
- Deleting or rolling back test data through a script; rollback is documented and needs approval.
- Importing into staging or production. The importer **cannot**: the host guard has no override.

**Risks and mitigations**

| Risk | Control |
| --- | --- |
| A placeholder reaches a deploy | `--check-ready` and `--emit-route` fail; the provisioner cannot write to a deployed DB. Limit: CI cannot see an uncommitted manifest. |
| Imported rows become sellable | `newImportedProductState` is the only constructor; inactive categories; the DB `CHECK` for restricted rows; `verify-onboarding --expect-hidden`. |
| Another vendor's data touched | Every write carries the target `vendorId`; the isolation guard compares every other vendor's row counts before and after. |
| Wrong database | `assertNotDeployedDatabase` before any client; host printed; the dev host cannot be confirmed in the cloud session, so DB-touching validation rows run on the owner's machine and read **UNVERIFIED**, never PASS, without `.env`. |
| `unitLabel` carries a bare token such as `500G`, not a price-per-unit label | Products are hidden and net content is null so no unit price is computed; staff review before activation. Recorded as a known semantic gap. |
| `.xls` parser quality | The dependency choice is a Build gate (below). |

**Build gate — the Excel dependency.** SheetJS's npm package is stale and carries advisories; its
maintained builds are served from a CDN, not npm. Candidates are evaluated at Build against: reads
legacy `.xls`, `.xlsx` and `.csv`; permissive licence; exact-pinnable from the npm registry; `npm
audit` shows no high or critical advisory for it. **If none qualifies, Build stops and returns to
the owner** to choose between accepting `.xlsx`/CSV only (the client re-saves their export) or
vendoring a parser — it does not pick a lesser dependency silently.

**Open items carried forward:** the later category-standardisation phase (versioned template, reference
category list verified against the live database, per-client approved category map, approval gate before upload), `#1217` (email), the deployed dev environment slice, `#1201`'s
remaining client answers (opening stock, barcode/supplier export) which this slice deliberately does
not need, net-content derivation for imported products, a `sourceRef` column if repeated live
re-imports become a requirement, and cleanup of the test vendor (needs approval).


## Appendix A — Gate 1 proposal — Aheed Super Store test vendor and reusable onboarding automation (`#1201` and a new tracking issue)

Status: **PROPOSAL — awaiting owner approval. Nothing has been built, pushed or deployed.**
Written 2026-10-22, on `feature/client-onboarding-process` (local only, cut from `docs/1211-document-pass`).
Prerequisites: `docs/developer-portal/client-onboarding-prerequisites.md`.

## 0. Owner decisions of 2026-10-22 (supersede §6's recommendations where they differ)

Tracking issue: **`#1216`**.

| # | Decision |
| --- | --- |
| Environment | `aheedfoodcentre.co.uk` is the client's **future** production domain and is **not** an active zone in our Cloudflare account. The existing "production" is not Aheed Food Centre's live site. Nothing here touches that domain. |
| D1/D2 | New vendor **Aheed Super Store**, alongside the existing vendors. |
| D4 | A **deployed dev environment** is built as a **separate slice**, isolated from existing production infrastructure (own Worker name, own R2 bucket, own secrets, own database). See §5.4. |
| D5 | Support **Excel and CSV**, with a **pinned** Excel-reading dependency. |
| D6 | Description = source description, **blank if unavailable**. Unit = source unit preserved, else a **documented default**. |
| D7 | Restrictions come from the **existing verified department map** (`#1200`). **Unmapped departments are flagged for review**, never guessed. |
| D8 | Dev database `ep-dry-morning-zab7dx08`, **provided it is confirmed as a development database**. Vendor data stays isolated by `vendorId`. No deletion without approval. |
| D9 | Check whether email is platform-wide or per vendor, and verify Resend. Do not assume the sending domain is verified. |
| D10 | Marked placeholders for delivery fee, free-delivery threshold, minimum order, postcode prefixes, sender email, footer address. **Deployment is blocked while any required value is missing.** |
| D11 | Tracking issue created: `#1216`. |
| Rules | Validate before writing. Imported products hidden, stock `UNKNOWN`. Never fabricate. Document testing, validation and rollback. No push, deploy or production-infrastructure change without approval. |

### Findings that follow from those decisions

1. **Email is platform-wide (verified in code).** `lib/email.ts` sends with `from: RESEND_FROM_EMAIL`
   from the environment. A vendor's `senderEmail` is stored in `VendorConfig` but is **not** the From
   address; only `senderName` is per-vendor (subject copy). So a client cannot send from their own
   domain today, and the sender-email placeholder has no effect on delivery. Per-vendor From would
   need per-vendor Resend domain verification and a code change; it is **out of scope** and is
   recorded here so nobody promises it. Resend verification state of the platform sender is
   **unverified**: it lives in the Resend account and Worker secrets, neither visible from this
   session.
2. **The dev database cannot be confirmed from this session.** This container has no `.env`, no
   `.dev.vars`, no `secrets/staging.vars` or `secrets/production.vars`, and no `DIRECT_URL` or
   `DATABASE_URL` exported. The CLAUDE.md procedure (diff `.env` against both secrets files; read
   `prisma migrate status`'s datasource host) cannot be run here, and the host guard
   (`assertNotDeployedDatabase`) would correctly refuse to run for lack of the comparison files.
   **Every database-touching step therefore has to run on your machine**, or in a session where those
   files exist. Build and unit tests do not need a database and are unaffected.
3. **`dev` is local-only today** (`env-setup.md`): no `[env.dev]`, no Worker, no custom domain, no CI
   workflow, no GitHub environment. A deployed dev environment is new infrastructure.

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

### 5.4 Slice 2 — a deployed, isolated dev environment (separate slice, own spec and approval)

Purpose: review changes visually at your convenience without touching existing staging or production.
It is infrastructure, so it **stops and lists what you must create** (CLAUDE.md hard stop); I do not
invent resources or credentials.

What the repo side would add: an `[env.dev]` block (own Worker name, own `custom_domain` route,
own R2 binding), `[env.dev.vars]` without `SEO_INDEXABLE` (non-indexable by being unconfigured), a
deploy workflow and GitHub environment mirroring staging's, and the verify-worker-routes step for
`--env dev`. **What you must create or confirm first:** the hostname and that its zone is in the
Cloudflare account (a one-label `‹name›.nocaped.com` host is the proven pattern); a separate Neon
**branch or project** for dev data (deployed dev must not share staging's database; the
`ep-dry-morning-zab7dx08` host may serve this, but the host guard treats a deployed Worker's
database differently, so confirm); an R2 bucket and CDN host for dev; Worker secrets for dev
(`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, S3 keys, Resend, optional Stripe test
keys); and the GitHub `dev` environment secrets. Isolation checks: its host, bucket, database and
secrets share nothing with staging or production, and `wrangler deploy --env dev` cannot affect
either other environment's routes.

### 5.5 Slice 3 — provider-agnostic outgoing email (own spec; Cloudflare Email Sending first)

**Owner decision 2026-10-22:** keep outgoing email provider-agnostic, use Cloudflare Email Sending as
the initial provider, keep it separate from incoming routing and Gmail forwarding, and make switching
to Resend or another provider a configuration change.

**What exists (verified in code).** `lib/email.ts` already defines the port,
`EmailService.send({ to, subject, html })`, but the Resend call is inline in `getEmailService()` and
`lib/config.ts` carries `RESEND_*` names. Callers (`lib/auth.ts`, `features/checkout/send-confirmation.ts`,
`features/orders/send-status-email.ts`, `lib/error-rate.ts`, `app/api/jobs/check-error-rate/route.ts`,
`app/(landing)/page.tsx`) all go through `getEmailService()`, so **the core logic does not need to
change**; only what sits behind the factory does.

**Design.**
- `lib/email/types.ts` — the port: `EmailMessage { to, subject, html, text?, replyTo?, headers? }`
  and `EmailService.send(message): Promise<EmailSendResult>` where the result is
  `{ ok: true, providerMessageId } | { ok: false, reason }`. Adapters **never throw to callers** (today's
  behaviour: log and continue), but report the outcome so it can be asserted in tests.
- `lib/email/adapters/resend.ts` — the current behaviour moved verbatim.
- `lib/email/adapters/cloudflare.ts` — uses the `send_email` binding (`env.<BINDING>.send({ from, to,
  subject, html, text, replyTo, headers })`, result `{ messageId }`, per the installed
  `@cloudflare/workers-types`). Binding reached through `getCloudflareContext()`, like `lib/config.ts`.
- `lib/email/adapters/console.ts` — logs instead of sending; the default in dev and CI, replacing
  today's "skipped" branch.
- `lib/email/index.ts` — `getEmailService()` picks the adapter from `EMAIL_PROVIDER`
  (`cloudflare` | `resend` | `console`). A new zod schema `EMAIL_PROVIDER`, `EMAIL_FROM_ADDRESS`,
  `EMAIL_FROM_NAME`, `EMAIL_BINDING_NAME` (default `EMAIL`). **Provider-specific values stay in that
  provider's block** (`RESEND_API_KEY` only validated when `resend` is selected). Production requires
  an explicit provider and a From address, so a missing config fails closed rather than silently not sending.
- **Backwards compatibility:** if `EMAIL_PROVIDER` is unset and `RESEND_API_KEY` is present, behave as
  `resend` with `RESEND_FROM_EMAIL` as the From address, so existing environments keep working with no
  config change until the owner migrates deliberately.
- **Separation from incoming mail:** nothing in `lib/email/` reads Email Routing or Gmail settings.
  Incoming is documented manual DNS work (prerequisites §6.2).
- **Tests:** a shared contract suite run against every adapter with a fake transport; provider
  selection; fail-closed production config; the legacy-Resend fallback; recipient restriction in
  non-production; the existing `tests/email.test.ts`, `order-*-email` and `auth` tests keep passing.
- **Unknowns blocking the build:** the Cloudflare Email Sending docs page could not be read from this
  session (proxy blocks `developers.cloudflare.com`). Before Build, someone must confirm: domain
  onboarding and DNS records; whether sending to arbitrary recipients is permitted on this account's
  plan, and any beta flag; rate limits; whether `from` must match a verified domain or an
  `allowed_sender_addresses` entry; local-dev behaviour of the binding (`remote` flag).
- **Infrastructure (owner):** the sending domain onboarded in Cloudflare; the `send_email` binding
  declared per environment; `EMAIL_PROVIDER`/`EMAIL_FROM_ADDRESS` per environment; a rollback to Resend
  by changing `EMAIL_PROVIDER` only. No production environment changes without approval.

**Decisions of 2026-10-22 (tracking issue `#1217`, separate from `#1216`):**

1. **Separate issue and spec** for this slice; it is not folded into `#1216`.
2. **Recipient policy.** Development and staging send **only to an approved test-address allowlist**
   (`EMAIL_TEST_RECIPIENTS`, comma-separated, required outside production). A message to any other
   address is **not sent** and the adapter returns `{ ok: false, reason: "RECIPIENT_NOT_ALLOWED" }`
   (logged; no throw). Arbitrary recipients are allowed **only in production**, subject to the
   selected provider's configuration and limits. The restriction lives in a wrapper around the
   adapter, not inside each adapter, so every provider is covered by the same code and the same test.
   The environment is read from configuration, never inferred from a hostname. An empty allowlist
   outside production sends nothing (fail closed).
3. **Draft stays local.** The branch is not pushed until explicitly approved.
4. **Resend remains a supported fallback**, not a deprecated path: the Resend adapter ships in the
   same slice as the Cloudflare one, with the same contract tests, and switching back is changing
   `EMAIL_PROVIDER`. The Cloudflare adapter sits behind the existing `EmailService` interface and
   no caller changes.

**Cloudflare prerequisites still to verify before implementation** (none verified; the docs host was
unreachable from the planning session): (a) the sending domain's onboarding steps and the exact
SPF/DKIM records, and that they coexist with Email Routing's records on the same zone; (b) whether
this account's plan permits sending to arbitrary recipients, and any beta or opt-in flag; (c) daily
and per-second limits; (d) whether `from` must be on a verified domain or listed in
`allowed_sender_addresses`; (e) local-dev behaviour of the binding (`remote` flag), which decides
whether tests can exercise it without sending real mail; (f) how failures, bounces and complaints are
observed; (g) the exact `wrangler.toml` binding syntax and that each environment declares its own.
Build does not start until each is answered in the spec with its source.

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
