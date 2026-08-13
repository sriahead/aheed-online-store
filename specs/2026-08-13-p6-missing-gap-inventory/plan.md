---
id: p6-missing-gap-inventory
title: "P6 Missing Gap: Staff-Visible Stock-Only Surface"
audience: [dev]
type: doc
status: approved
version: "1.0.0"
updated: 2026-08-13
visibility: internal
summary: Implements the deferred P6 requirement for a staff-visible stock-only surface (Issue #168).
tags: [admin, inventory, staff, P6]
---

# Plan

## Goal
Implement a dedicated "Live Inventory & Availability" view tailored for shop-floor staff, as deferred in P6b1. This view provides dynamic tier toggling, tabbed navigation, and optimistic mutations for quick stock adjustments.

## Scope
- Create a `TierToggle` to switch between STAFF and ADMIN views in the header.
- Create a new tabbed navigation for `(admin)` routes depending on the selected tier.
- Implement `/staff/inventory` with a searchable product table.
- Optimistic updates for inventory count and active/hidden toggling.

## Excluded
- Complex filtering or sorting (simple text search is enough for now).
- Full product edit forms (already handled in `/staff/products`).
