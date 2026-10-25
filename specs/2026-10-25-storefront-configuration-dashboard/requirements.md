# Requirements: Storefront Configuration Dashboard and Vendor Onboarding Readiness

## R1 — Staff Route & Admin Access Gate
The application provides a page at `/staff/onboarding` wrapped in `<PageContainer width="standard">` and gated exclusively to `requireVendorRole("ADMIN")`, serving `<PanelRefusal />` to non-admin roles and redirecting unauthenticated visitors to `/login`.

## R2 — Staff Navigation Registration
The route `/staff/onboarding` is registered in `components/staff/nav-items.ts` under the `store-setup` group with `tier: "admin"`, label `"Onboarding Readiness"`, and icon `"clipboard-list"`, satisfying `tests/staff-nav-parity.test.ts`.

## R3 — Readiness Evaluation Engine
A service module `lib/vendor-readiness-service.ts` queries the current vendor's database configuration using `getPrisma()` (HTTP) and evaluates completeness across 8 categories:
1. Store Identity & Chrome
2. Visual Theme & Brand Primitives
3. Storefront Copy & Badges
4. Fulfilment & Delivery
5. Footer, Location & Legal
6. Customer Communication & Community
7. Catalogue & ADR-007 Inventory
8. Platform Infrastructure

## R4 — Category Completion & Overall Readiness Calculation
The evaluation engine calculates:
- The total count of configured vs required settings per category.
- The overall completion percentage of implemented requirements.
- A dynamic readiness status:
  - `LAUNCH_READY` when all required implemented settings are configured.
  - `NEEDS_ATTENTION` when core identity exists but essential delivery, hours, or legal items are missing.
  - `IN_PROGRESS` when initial setup has not been completed.

## R5 — Reference Storefront Benchmarking
Each setting in the checklist provides its current value, reference value from `aheedfoodcentre.nocaped.com`, validation rule, and a status tag (`CONFIGURED`, `MISSING`, `OPTIONAL`, or `PLANNED`).

## R6 — Action Deep-Links
Every configurable row in the checklist provides a direct navigation link to its respective management tab (`/staff/storefront`, `/staff/delivery-areas`, `/staff/fulfilment`, `/staff/assistant`, `/staff/products/import`, `/staff/team`, `/staff/ai-usage`).

## R7 — Distinction of Implemented vs Planned Features
The dashboard renders distinct visual badges separating `IMPLEMENTED` in-app controls from `PLANNED` or external infrastructure tasks (including Cloudflare Email Sending [#1217] and Live Stripe Keys [#113]).

## R8 — Operator Documentation Coverage
`docs/store-admin-guide/admin-tabs-guide.md` contains a section for `/staff/onboarding` with all 7 standard operator guide sections (Title, Tab Purpose, Who Uses It, What Happens When It Is Not Done, Tasks, Troubleshooting, Integration Points), satisfying `tests/operator-doc-coverage.test.ts`.

## R9 — Page Container Registry Compliance
`tests/page-container.test.ts` includes `"app/(admin)/staff/onboarding/page.tsx": { width: "standard", padY: "default" }` and passes.

## R10 — Automated Test Suite
A dedicated test suite `tests/storefront-onboarding-readiness.test.ts` validates the evaluation service across empty, partially-configured, and fully-configured vendor fixtures, asserting correct scoring, status derivations, and deep-link generation.

## R11 — Changelog Record
`CHANGELOG.md` records the addition under `[Unreleased]`, referencing issue `#1267`.
