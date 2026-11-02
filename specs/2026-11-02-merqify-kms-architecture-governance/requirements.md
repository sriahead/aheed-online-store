# Merqify KMS — Knowledge Architecture, Governance and Validation (requirements)

## Context & Objectives
Review, redesign, and reorganise the existing Knowledge Management System (KMS) to establish Merqify KMS as the central, authoritative source of truth for the entire Merqify ecosystem (Platform: Merqify; Clients: Aheed Food Centre and SRIMART).

## Part A — Assessment & Information Architecture
R1. Complete inventory and categorization of all 305 registered KMS documents across 13 canonical knowledge domains.
R2. C4-aligned system model (System Context, Container, Component, Code) integrated into KMS documentation.
R3. Clear classification boundaries between Platform Core, Client Storefronts (Aheed Food Centre, SRIMART), Operations, and Internal Engineering.

## Part B — Role-Based Access & Visibility
R4. Clear RBAC matrix defining document permissions across 9 ecosystem roles: Customer, Store Staff, Store Admin, Platform Admin, Solutions Architect, Business Analyst, Product Manager, Software Engineer, and QA Engineer.
R5. Strict enforcement of visibility boundaries: public vs authenticated vs internal (Cloudflare Access / staff session).

## Part C — Navigation & Portal Architecture
R6. Portal homepage (`kms/site-internal/content/index.mdx`) and developer hub (`dev/index.mdx`) redesigned to present Merqify KMS and provide dual navigation gateways (`/staff` and `/dev`).
R7. All portal index links verified against live assembled routes.

## Part D — Governance & Link Integrity
R8. Automated link-integrity quality gate (`tests/kms-link-integrity.test.ts`) enforcing zero broken relative links and zero hardcoded `file:///` URLs across all registered KMS documents.
R9. Repair of all pre-existing hardcoded URLs and broken links across registered documents.
R10. Ratchet coverage verified (`npm run kms:coverage`) and KMS index regenerated (`npm run kms:build-index`).
