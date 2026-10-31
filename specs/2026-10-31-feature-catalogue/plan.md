---
id: p1374-feature-catalogue-plan
title: "Feature Catalogue under the Admin menu (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-31
visibility: internal
summary: "#1374: a role-organised, demo-ready Feature Catalogue at /staff/feature-catalogue, linked from the Admin menu. Content is a typed module covering Customer, Admin, Staff and Platform Admin features with BLUF, value, demo talking point and an honest Live/Partial/Unavailable status; a test pins its routes and menu coverage."
tags: [feature-catalogue, demo, admin-menu, p10]
related: [store-admin-tabs-guide]
---

# Feature Catalogue under the Admin menu (plan)

Closes `#1374`. Approved in conversation on 2026-10-31 (menu item at the Admin tier, under Insights &
Help; deploy via staging only).

## Approach

- **Content:** `features/feature-catalogue/catalogue.ts`, a plain module (not `"use server"`). Role,
  then business area, then feature (Pyramid Principle); each feature leads with its BLUF.
- **Page:** `app/(admin)/staff/feature-catalogue/page.tsx`, gated `requireVendorRole("ADMIN")`, using
  `PanelRefusal`, `PageContainer width="wide"` and the icon registry. Role jump links, status
  counts and a "Not ready to demonstrate" table.
- **Menu:** one entry in `components/staff/nav-items.ts`, `tier: "admin"`.
- **Docs and guard:** a section in `admin-tabs-guide.md`; `tests/feature-catalogue.test.ts`.

## How the content was sourced

Three read-only inventories of the storefront, the store panel and the platform pages, then
cross-checked against `nav-items.ts`, `platform-nav-items.ts`, `specs/roadmap.md` and the RBAC
four-views spec. Nothing is listed unless a route or control exists; unbuilt items appear as
`unavailable` so they are not promised.
