# Validation: Storefront Configuration Dashboard and Vendor Onboarding Readiness

| Req | How to verify |
| :--- | :--- |
| **R1** | Run `npx vitest run tests/page-container.test.ts` and verify `/staff/onboarding` matches width `"standard"`. Inspect `app/(admin)/staff/onboarding/page.tsx` for `requireVendorRole("ADMIN")` and `<PanelRefusal />`. |
| **R2** | Run `npx vitest run tests/staff-nav-parity.test.ts` and verify it exits 0 with `/staff/onboarding` discovered under `store-setup`. |
| **R3** | Run `npx vitest run tests/storefront-onboarding-readiness.test.ts` and assert the service checks all 8 categories. |
| **R4** | Verify via unit test that an incomplete profile yields `NEEDS_ATTENTION` or `IN_PROGRESS`, while a complete profile yields `LAUNCH_READY` with 100% completion. |
| **R5** | Verify that rendered checklist items display reference values from `aheedfoodcentre.nocaped.com`. |
| **R6** | Verify through structural tests that every actionable setting generates a valid `/staff/*` deep link. |
| **R7** | Verify that `PLANNED` badges are assigned to Cloudflare Email Sending (#1217) and Live Stripe Keys (#113). |
| **R8** | Run `npx vitest run tests/operator-doc-coverage.test.ts` and verify it exits 0. |
| **R9** | Run `npx vitest run tests/page-container.test.ts` and verify it passes. |
| **R10** | Run `npx vitest run tests/storefront-onboarding-readiness.test.ts` and verify all tests pass. |
| **R11** | Run `git diff origin/staging...HEAD -- CHANGELOG.md` and confirm an entry exists referencing `#1267`. |
