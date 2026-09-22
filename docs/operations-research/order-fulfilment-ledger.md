---
id: order-fulfilment-ledger
title: "Source-to-Destination Ledger: Orders & Fulfilment Pilot"
audience: [dev, product]
type: doc
status: approved
version: "1.0.0"
updated: "2026-09-22"
visibility: internal
summary: "Ledger mapping original SDLC artifacts to the synthesized canonical Order Fulfilment Operations document."
tags: ["kms", "ledger", "orders"]
---

# Source-to-Destination Ledger: Orders & Fulfilment Pilot

This ledger demonstrates how 100% of the original historical specifications within the pilot's scope were treated during the KMS synthesis into the canonical `docs/operations-research/order-fulfilment-core.md`.

| Original Artifact | Synthesized Destination | Treatment / Notes |
| :--- | :--- | :--- |
| `specs/2026-08-10-p3b-checkout-order-core/plan.md` | `order-fulfilment-core.md` (Section 2) | Abstracted core status states; stripped chronology and DB column implementation details. Retained in Evidence & History. |
| `specs/2026-08-11-p4b-order-status-transitions/plan.md` | `order-fulfilment-core.md` (Section 2) | Integrated Staff Queue transition boundaries and email notification logic. Retained in Evidence & History. |
| `specs/2026-09-17-p696-staff-cancel-confirmed-order/plan.md` | `order-fulfilment-core.md` (Section 3) | Extracted explicit separation of cancellation (stock return, loyalty reversal) from refunding. Documented the known revenue reporting defect into `gap-register.md`. Retained in Evidence & History. |
| `specs/2026-08-10-p3c-stripe-payments/plan.md` (Payment Exception aspects) | `order-fulfilment-core.md` (Section 4) | Extracted webhook failure and staff reconciliation fallback flows. Retained in Evidence & History. |
| `lib/order-status.ts` | `order-fulfilment-core.md` (Sections 1, 2, 3) | Extracted `LEGAL_TRANSITIONS`, `CANCELLABLE_STATUSES`, and `REVENUE_STATUSES` logic. Used as the authoritative tie-breaker for system reality. |
| `docs/store-admin-guide/admin-tabs-guide.md` | Cross-referenced | Preserved existing audience entry points while delegating underlying state machine logic to the canonical guide via direct links. |
| `docs/staff-playbook/staff-tabs-guide.md` | Cross-referenced | Added pointer to the canonical core guide for underlying operational rules. |
| `docs/shopper-help/shopping-guide.md` | Updated text | Refined cancellation text to explicitly reference store policy boundaries without linking to internal staff manuals or reproducing staff procedures. |

## Resolved / Superseded Findings
No contradictions were identified during synthesis that required marking a historical artifact as explicitly false, other than the un-refunded revenue gap (#795) properly escalated to `gap-register.md` as `[Unresolved]`.
