---
id: p1251-navigation-icon-fixes-validation
title: "Fix Quick Shop mobile visibility, icon sizes, user profile icon and navigation drill-down (validation)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-24
visibility: internal
summary: Verification criteria for Issue 1251.
tags: [navigation, quick-shop, 3d-icons, storefront, header, mobile-ux, accessibility]
---

# Validation: Issue #1251

## Criteria

| ID | Criterion | Method |
|---|---|---|
| V1 | Quick Shop is rendered in Main Navigation across mobile, tablet, and desktop | Automated test in `tests/navigation-icon-fixes.test.tsx` |
| V2 | `FloatingContact` 3D icon renders with `size={38}` and descriptive tooltip | Automated test in `tests/navigation-icon-fixes.test.tsx` |
| V3 | Header `Shop` and `Quick Shop` icons render with `size={24}` and enhanced tooltips | Automated test in `tests/navigation-icon-fixes.test.tsx` |
| V4 | `user-profile` 3D icon is registered in `ICON_3D_DEFINITIONS` (total: 20 icons) | Automated test in `tests/navigation-icon-fixes.test.tsx` |
| V5 | Header renders 3D user icon for logged-in user without letter initial | Automated test in `tests/navigation-icon-fixes.test.tsx` |
| V6 | `Shop` and `Quick Shop` links have `prefetch={false}` for reliable navigation | Automated test in `tests/navigation-icon-fixes.test.tsx` |
| V7 | All quality gates pass (`lint`, `typecheck`, `format:check`, `kms:check-generated`, `sdd:preclear`, Vitest suite) | Automated test suite |
