# Platform Admin role and platform-wide management suite (validation)

Validation checklist for issue #1269.

| Requirement | Verification Check |
|---|---|
| R1, R2, R3, R4 | Unit tests in `tests/platform-admin-rbac.test.ts` verify `requirePlatformAdmin()` grants `role: "ADMIN"`, refuses `CUSTOMER`/`STAFF` with 403, unauthenticated with 401, and store admins with 403. |
| R5, R6, R7, R8 | Navigation tests verify `PanelNav.tsx` renders the "Platform" menu when `isPlatformAdmin` is true and omits it for store admins. |
| R9, R10, R11, R12, R13 | Platform pages render correctly with live mock and real database fixtures, gated on `requirePlatformAdmin()`. |
| R14, R15 | Unit tests in `tests/storefront-onboarding-readiness.test.ts` verify `owner` tagging (`VENDOR_OPERATOR` vs `PLATFORM_ADMIN`) and role-based filtering on the onboarding dashboard. |
| R16 | `git status` shows no changes to `prisma/schema.prisma` or `prisma/migrations/`. |
| R17 | Tenant resolver tests confirm `aheedsuperstore.localhost:8787` resolves to `aheedsuperstore`. |
| R18 | ADR-007 tests confirm product restriction classifications and hidden inventory defaults remain intact. |
| R19 | `tests/repository-purity.test.ts` and `tests/repository-client-injection.test.ts` pass without errors. |
| R20 | `tests/operator-doc-coverage.test.ts` passes with full 7-section coverage for all platform routes. |
| Quality Gates | `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm test` all exit 0. |
| KMS & SDD Gates | `npm run kms:validate` and `npm run sdd:preclear` exit 0. |
