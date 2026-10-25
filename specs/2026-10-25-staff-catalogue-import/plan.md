---
id: staff-catalogue-import
title: "Staff Panel Stock File Upload & Catalogue Import (plan)"
audience: [dev, staff]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-25
visibility: internal
summary: "Spec for staff panel stock file upload at /staff/products/import: two-phase validate/preview and apply workflow, browser/streaming grid parsing keeping @e965/xlsx out of worker bundle, ADR-007 hidden & UNKNOWN stock invariants, and audit logging."
tags: [staff, catalogue, import, csv, excel, adr-007, p11]
related: [client-onboarding-prerequisites, adr-004-multi-tenancy, adr-007-storefront-scope-restrictions-stock-states, architecture, tech-stack]
---

# Staff Panel Stock File Upload & Catalogue Import (plan)

Approved under SDD Gate 1 on 2026-10-25. `requirements.md` defines the checkable acceptance criteria; `validation.md` defines the validation procedure run by an independent fresh context.

**Goal:** Enable store owners and administrators to upload stock files (`.csv`, `.xlsx`, `.xls`) directly through the staff panel at `/staff/products/import`. The interface validates files in-memory first, previews additions, updates, duplicates, and rejections without touching the database, and on explicit user confirmation applies changes while strictly maintaining ADR-007 invariants (new products hidden, stock `UNKNOWN`, quantity 0, prohibited/age-restricted lines blocked).

---

## 1. Scope (This Slice)

1. **Staff Panel Surface (`app/(admin)/staff/products/import/page.tsx`):**
   - Registered once in `components/staff/nav-items.ts` under the `catalogue` group:
     - `href: "/staff/products/import"`
     - `label: "Import stock file"`
     - `tier: "admin"`
     - `icon: "upload"`
   - Access control enforced via `requireVendorRole(session, "ADMIN")`, rendering `<PanelRefusal />` on refusal.
   - Structured within `<PageContainer width="standard">`.
   - Documented in `docs/developer-portal/operator-guides/admin-guide.md` (satisfying `tests/operator-doc-coverage.test.ts`).

2. **Security & Server Session Binding:**
   - Both server actions (`validateStockFileAction`, `applyStockFileAction`) derive `vendorId` exclusively from the verified server session (`getAuth().api.getSession`).
   - Neither action accepts a client-supplied `vendorId` in its payload, preventing cross-tenant injection.
   - Payloads exceeding **10,000 rows** are rejected immediately with an HTTP 400 / error message to protect Worker memory and CPU execution limits.

3. **Two-Phase Import Workflow & Built-In ADR-007 Policy:**
   - **Phase 1: Validate & Preview (Dry Run):**
     - Accepts `.csv`, `.xlsx`, `.xls` via dropzone or file picker.
     - Extracts the 2D cell grid without executing any database write.
     - Applies the default ADR-007 restriction dictionary automatically:
       - `TOBACCO` & `ALCOHOL` $\rightarrow$ `AGE_RESTRICTED`
       - `INSTANT LOTTERY` $\rightarrow$ `PROHIBITED`
       - `PHONE CARDS`, `NEWS`, `E-PAY`, `STAMPS` $\rightarrow$ `NOT_DELIVERABLE`
       - `DEFAULT` department and £0.00 rows $\rightarrow$ `NEEDS_REVIEW`
     - Passes grid rows to `buildPlan` from `lib/catalogue-import/plan.ts`.
     - Returns a comprehensive preview: count of candidate additions, count of matching existing products, rejected duplicate rows with line numbers, and ADR-007 classified restrictions.
   - **Phase 2: Explicit Confirmation ("Apply Changes"):**
     - The store owner must explicitly click "Confirm & Apply Changes" after inspecting the diff.
     - Commits changes using `applyPlan` from `lib/catalogue-import/apply.ts` inside interactive department transactions via `getPrismaWs()`.
     - Generates `ProductRestrictionAuditLog` rows for all restricted products.
     - Returns an execution receipt detailing created products, updated products, and unchanged rows.

4. **In-Browser / Streaming Grid Parsing (Worker Bundle Protection):**
   - In accordance with `tests/catalogue-import-guards.test.ts` (R7), `@e965/xlsx` must NOT be imported in the Cloudflare Worker runtime bundle (`app/`, `features/`, `components/`, `lib/`).
   - For CSV files: Parsed using a lightweight, zero-dependency streaming CSV parser in `lib/catalogue-import/csv.ts`.
   - For Excel files (`.xlsx`, `.xls`): Parsed in the browser (client component / Web Worker) before posting the resulting `string[][]` grid to the server action, or parsed via a sandboxed client-side parser. The server action receives pure string rows, avoiding Excel dependency in the Worker bundle.

5. **Product Merging & Stock Policy Enforcement:**
   - **New Products:** Created with `isActive: false` (hidden), `stockMode: "UNKNOWN"`, and `quantity: 0`.
   - **Existing Records:** Matched via composite slug identity `slugify(name)-plu-<PLU>-<deptSlug>`.
   - **Merging Rules (`reimportedProductState`):** Re-importing an existing active product never activates it, never loosens a restriction, and never overwrites stock quantity or manual descriptions. It only tightens restrictions if the incoming source department is more restrictive.
   - **Stock Safety:** Uploaded stock quantities in the file are strictly ignored; stock is never assumed without physical counting.

---

## 2. Deliberately Excluded

- **Automatic Product Activation:** No product will be set to `isActive: true` automatically upon upload. Product activation is an explicit editorial staff action via `/staff/products`.
- **EPOS / Live Stock Sync:** This slice is a catalogue and availability baseline; bidirectional EPOS sync and replenishment ledgers remain deferred under `#1196`.
- **Live Infrastructure Changes:** No DNS modifications, Worker route changes, or database deployments are performed in this slice.

---

## 3. Hostname Architecture: Local Dev & Hosted Test Hostname

- **Local Development Host:** Retains `aheedsuperstore.localhost:8787` under `npm run preview`.
- **Third Vendor Hosted Test Hostname (`aheedsuperstore.nocaped.com`):**
  - **DNS & Zone:** `nocaped.com` is an active Cloudflare zone. Cloudflare Worker Custom Domains support single-label subdomains (e.g. `aheedsuperstore.nocaped.com`).
  - **TLS:** Managed Universal SSL certificates are issued automatically per custom domain hostname upon route attachment.
  - **Routing:** Requires adding `[[env.staging.routes]]` with `pattern = "aheedsuperstore.nocaped.com"` and `custom_domain = true` in `wrangler.toml` alongside existing routes when deployment is authorized.
  - **Current Status:** Purely architectural verification. The local development environment retains `aheedsuperstore.localhost:8787`. No changes will be applied without explicit owner instruction.
