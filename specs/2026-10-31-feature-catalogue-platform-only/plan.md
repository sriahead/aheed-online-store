---
id: p1379-feature-catalogue-platform-only-plan
title: "Feature Catalogue restricted to platform admins (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-10-31
visibility: internal
summary: "#1379: /staff/feature-catalogue refuses store admins and staff; its menu entry, catalogue entry and guide section move to the platform-admin side."
tags: [rbac, platform-admin, feature-catalogue, staff-panel]
related: [platform-admin-guide]
---

# Feature Catalogue restricted to platform admins (plan)

**Goal:** the owner asked (2026-10-31) to keep the Feature Catalogue (`#1374`) for platform admins
only. It lists unbuilt and partial features, which is platform-level information.

## Scope

- The page adds the established `auth.via !== "platform-admin"` refusal (as `/staff/errors` and
  `/staff/platform/*`), with a "Platform admin only" `PanelRefusal`.
- The menu entry moves from `nav-items.ts` (Insights & Help) to `platform-nav-items.ts`; the parity
  test excludes the route as it does `/staff/errors`.
- Its own catalogue entry moves from Admin → Insights to Platform Admin → Business.
- Its operator-guide section moves from `admin-tabs-guide.md` to `platform-admin-guide.md`.

## Deliberately excluded

- The URL stays `/staff/feature-catalogue`. The catalogue content is otherwise unchanged.
