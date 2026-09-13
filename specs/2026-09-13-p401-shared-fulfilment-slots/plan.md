---
id: 2026-09-13-p401-shared-fulfilment-slots
title: P401 Shared Fulfilment Slots
audience: [dev]
type: spec
status: approved
version: "1.1.0"
updated: 2026-09-13
visibility: internal
summary: Shared scheduling and slot capacity reservation system for both Delivery and Collection.
---

# P401 Shared Fulfilment Slots

This slice introduces a unified capacity reservation system for both delivery and click-and-collect orders.

## Goal
To allow vendors to configure specific scheduling windows with capacity limits for both deliveries and collections, preventing overbooking while preserving checkout conversion.

## Scope
* **In Scope:** `VendorFulfilmentSlot` DB schema. A configurable booking window and slot-hold duration. Checkout UI for picking a slot. Robust concurrency controls (e.g., Prisma Serializable transactions or atomic constraints) during order creation to guarantee capacity limits under concurrent load without using raw SQL.
* **Out of Scope (Deliberately Deferred):** #402 Express SLA timers (addressed in the subsequent slice). 

## Rationale
A shared `VendorFulfilmentSlot` model prevents building two divergent scheduling calendars for Delivery vs Collection. By reserving the slot momentarily during the payment intent phase, we protect against the "pay-and-lose" race condition. A strict locking mechanism ensures capacity is never breached during concurrent checkouts. A TTL-based expiry mechanism will cleanly release slots held by abandoned checkouts (e.g. `PENDING_PAYMENT` orders older than the configured `slotHoldDurationMinutes`).
