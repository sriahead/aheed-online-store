# Storefront polish, theme deletion and role-based user journeys (requirements / acceptance criteria)

Closes `#1385`.

## Part A — Customer feedback demo visibility
R1. A seed script `scripts/seed-demo-feedback.ts` exists to insert or ensure approved showcase reviews exist for demo purposes.
R2. The homepage renders the `CustomerFeedbackCards` carousel whenever approved feedback exists, displaying star rating summary and review count.

## Part B — Storefront theme deletion
R3. `lib/repositories/vendor.ts` exports `deleteVendorTheme(prisma, vendorId, themeId)` that deletes the matching `VendorTheme` row scoped to `vendorId`.
R4. `lib/vendor-service.ts` exports `deleteVendorTheme(vendorId, themeId)`.
R5. `features/admin/storefront.ts` exports async server action `deleteStorefrontTheme(themeId: string)` gated by `requireVendorRole("ADMIN")`.
R6. `components/staff/StorefrontConfigForm.tsx` shows a "Delete Theme" button only when a custom vendor theme (`vendor:<id>`) is selected. Global presets cannot be deleted by store admin.
R7. Deleting a custom theme removes it from the dropdown and refreshes the page state without losing unsaved form fields.

## Part C — Role-based user journey maps on `/help`
R8. `/help` detects the viewer's role (Platform Admin, Store Admin, Staff, or Customer) and renders the User Journey Maps section.
R9. The User Journey Maps section defaults to the viewer's detected role, but provides role tabs allowing any visitor or presenter to view all four roles.
R10. Each role journey map provides structured step-by-step guidance, route links, available features, and key actions.
R11. The layout is responsive, clean, and follows existing design system conventions (`PageContainer`, `Icon`, semantic colors).

## Part D — Documentation and verification
R12. `docs/client-help-centre/user-journeys.md` is updated with detailed, verified steps for all four roles.
R13. KMS index builds cleanly (`npm run kms:build-index`).
R14. Unit and integration tests cover theme deletion and journey map role selection.
R15. `CHANGELOG.md` records all changes under `#1385`.
