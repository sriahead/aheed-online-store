---
id: kms-pilot-orders-fulfilment
title: "KMS Pilot: Orders, Fulfilment & Payment Exceptions (plan)"
audience: [dev, product, staff, store-admin, shopper]
type: spec
status: draft
version: "1.1.0"
updated: 2026-09-22
visibility: internal
summary: Pilot for the revised KMS restructuring focusing on consolidating orders, fulfilment, and payment exceptions into a thematic, current-knowledge model.
tags: [kms, pilot, documentation, orders, fulfilment, payments]
related: [store-admin-tabs-guide, staff-tabs-guide, p3b-checkout-order-core, p4b-order-status-transitions]
---

# KMS Pilot: Orders, Fulfilment & Payment Exceptions (plan)

This slice executes the approved KMS restructuring pilot for one representative domain: orders, fulfilment, and payment exceptions. It tests the feasibility of thematic synthesis, section-level references, and progressive disclosure without altering the existing directory structure or introducing unproven metadata schemas.

**Goal:** Prove the revised KMS approach by consolidating all related documentation for orders, fulfilment, and payment exceptions into one coherent current explanation, leaving historical SDLC artifacts intact as supporting evidence.

**Authority Rules for Current Truth:**
During synthesis, "current truth" is established using the following hierarchy:
1. **The Codebase:** The actual database schema (`prisma/schema.prisma`), runtime logic (`lib/`), and UI components dictate reality. If a doc contradicts the code, the code wins.
2. **Latest Merged SDLC Step:** If the code is ambiguous, the most recently merged feature slice (`specs/`) takes precedence over older slices.
3. **Accountable Decisions:** ADRs and architectural decisions explicitly marked as current override older planning artifacts.
Any claim that cannot be verified by these rules must not be presented as fact; it must be documented in the working register.

**Contradiction Classification:**
The working register will not just list issues; it will classify them into three explicit states:
- **Resolved:** Evidence was found in the codebase or a later spec that clarifies the current position.
- **Superseded:** The historical claim is obsolete and replaced by a newer decision.
- **Unresolved:** The documentation conflicts with the code, or two specs conflict, and no clear owner or codebase evidence can settle it without a product decision.

**Measurable Pilot Acceptance Criteria:**
1. A reader can understand the current flow of orders/fulfilment without needing to open a historical specification.
2. Related artifacts are synthesized into themes, not individually summarised.
3. Shared rules have exactly one canonical location.
4. Navigation and visibility behaviour for Staff, Store Admin, and Shopper are verified: links work, boundaries hold, and no unauthorized information leaks across roles.
5. All discovered conflicts are classified (Resolved, Superseded, Unresolved) with evidence.
6. The source-to-destination ledger accounts for 100% of the original artifacts in the pilot scope.
7. Existing directory structures are preserved.
8. The actual docs-site build (`kms:assemble:internal`) passes.

**Scope (this slice):**
- Write one canonical, thematic document detailing the current rules, workflows, and edge cases for orders, fulfilment, and payment exceptions.
- Explicitly differentiate actions by audience (shopper, staff, store admin).
- Delineate cancellation versus refund processes clearly.
- Include section-level references pointing to the original governing artifacts.
- Update existing entry points to link to this new canonical resource.
- Produce a working register classifying known contradictions and gaps.
- Produce a source-to-destination ledger documenting what was retained, merged, or referenced.

**Deliberately excluded:**
- Full-KMS restructuring beyond this pilot area. **Full restructuring requires explicit approval after pilot validation.**
- Relocating or structurally modifying existing `specs/` files.
- Expanding front-matter schemas beyond established metadata.
