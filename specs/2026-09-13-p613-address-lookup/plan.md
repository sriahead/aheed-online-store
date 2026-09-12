---
id: 2026-09-13-p613-address-lookup
title: P613 Postcode & Address Lookup
audience: [dev]
type: spec
status: proposed
version: "1.1.0"
updated: 2026-09-13
visibility: internal
summary: Address lookup and postcode validation using postcodes.io, with graceful fallback and no full property autocomplete.
---

# P613 Postcode & Address Lookup

This slice implements postcode validation and partial address auto-filling during checkout.

## Goal
To improve checkout UX by validating UK postcodes and automatically populating broader geography (City and County) using the free, open-source `postcodes.io` API.

## Scope
* **In Scope:** Calling `postcodes.io` for postcode validation. Extracting `admin_district` and `admin_county` for partial form fill. Adding a "Change Postcode" reset flow. Implementing a graceful fallback for API unreachability.
* **Out of Scope (Deliberately Deferred):** Full street-level property/address lookup (e.g., fetching a list of houses for a postcode). This requires a commercial API and is deferred to a future phase.

## Rationale
Using `postcodes.io` solves the immediate need for robust postcode validation and reduces typing fatigue for City/County. Retaining manual fields for Address Line 1 and 2 ensures shoppers can always complete checkout even without a full property lookup integration. To protect checkout conversion, the system must gracefully degrade to local regex validation if the external API fails. Vendor delivery-area gating remains exclusively driven by the existing offline prefix logic (`lib/delivery.ts`).
