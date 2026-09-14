---
id: 2026-09-13-p402-express-sla
title: P402 Express SLA
audience: [dev]
type: spec
status: approved
version: "1.1.0"
updated: 2026-09-13
visibility: internal
summary: Click & Collect 60-minute express pickup SLAs with relational scheduling and operational visibility.
---

# P402 Express SLA

This slice builds on the Fulfilment Foundation to deliver the 60-minute express Click & Collect capability.

## Goal
To allow vendors to offer Express Collection (ASAP pickup) during specific scheduled operating hours, distinct from standard collection slots, and to track SLA compliance in the staff queue.

## Scope
* **In Scope:** `expressCollectionEnabled` config. A relational `VendorExpressSchedule` model to define when Express is available. `targetFulfilmentTime` stamping on the order upon payment confirmation. SLA countdown/breach visibility in the staff order queue.
* **Out of Scope (Deliberately Deferred):** Modifying the P401 shared slot model (Express is an ASAP override, not a specific capacity-bound slot selection).

## Rationale
Express Collection must only be offered when the store is open and staffed for it, which may differ from standard collection windows. Using a relational model for the schedule conforms strictly to the project's no-JSON domain-data rule. The 60-minute SLA must start when the payment clears (order transitions from `PENDING_PAYMENT` to `CONFIRMED`), ensuring staff aren't penalized for customer checkout delays. The staff queue UI must prominently highlight these orders to drive operational urgency.
