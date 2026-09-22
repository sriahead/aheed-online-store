# /build-notes for #737

**Phase:** IMPLEMENTATION completed

## What changed and why
- We implemented Staff/Admin delegation by modifying the Server Actions and page guards for the Storefront, Payments, Delivery Areas, Loyalty, and Discounts to be ADMIN-only, while giving STAFF access to day-to-day operations like Products, Categories, Brands, Promotions, Bundles, and Search Synonyms.
- Added expand/collapse to the Category Manager.
- Separated Help Centre presentation and operator Runbook markdown chunking into a reusable component.
- Hid product ratings with zero reviews.
- We updated docs/model-handoff.md to indicate #737 is completed.

## Decisions taken during the build
- Extracted the custom markdown splitting logic (by ## ) into components/ui/DocumentSectionRenderer.tsx so that it could be natively reused by the shopper-facing Help Centre.
- Updated staff-tabs-guide.md and admin-tabs-guide.md to move the corresponding documentation sections to keep it in sync with the new RBAC checks.
- Auth checks were centralized and tested using a new suite (tests/admin-only-authorization.test.ts).

## Deviations from the spec
- None. Everything was strictly adhered to.

## Known-shaky areas
- None. Tests were comprehensively built around authorization enforcement and component rendering to ensure no regressions occur.
