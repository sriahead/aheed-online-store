# Storefront polish, theme deletion and role-based user journeys (validation)

Closes `#1385`.

| Check | Criterion | Method |
| :--- | :--- | :--- |
| V1 | `deleteVendorTheme` deletes vendor theme without touching other vendors | Automated test in `tests/vendor-saved-themes.test.ts` |
| V2 | `deleteStorefrontTheme` refuses non-admin roles | Automated test in `tests/vendor-saved-themes.test.ts` |
| V3 | "Delete Theme" button renders only for `vendor:<id>` themes | Component test |
| V4 | RoleJourneyMaps renders correct initial tab based on role prop | Component test in `tests/role-journey-maps.test.tsx` |
| V5 | Role switcher switches active journey content on click | Component test in `tests/role-journey-maps.test.tsx` |
| V6 | Full test suite passes | `npx vitest run` |
| V7 | Linter and typecheck pass | `npm run lint` and `npm run typecheck` |
| V8 | KMS build index passes | `npm run kms:build-index` |
