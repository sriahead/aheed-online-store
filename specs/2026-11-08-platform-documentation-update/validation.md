# Platform Documentation Review and Comprehensive Update (Validation)

**Issue:** #1468  
**Slice:** `specs/2026-11-08-platform-documentation-update/`  
**Base branch:** `staging`  
**Status:** Approved  

---

## Validation Matrix

| Criterion | Type | Verification Command / Procedure | Expected Result |
| :--- | :--- | :--- | :--- |
| **KMS Frontmatter & Schema** | Automated | `npm run kms:validate` | Exits 0, all frontmatter valid and compliant. |
| **KMS Artifact Index & Runbook** | Automated | `npm run kms:build-index` | Regenerates `ARTIFACT_INDEX.md` and `app/(admin)/staff/runbook/docs.ts` without errors. |
| **KMS Coverage Ratchet** | Automated | `npm run kms:coverage` | Exits 0, baseline maintained or ratcheted cleanly. |
| **Typecheck** | Automated | `npm run typecheck` | Exits 0, no TypeScript compilation errors. |
| **Lint** | Automated | `npm run lint` | Exits 0, clean formatting and no lint violations. |
| **Unit & Boundary Tests** | Automated | `npx vitest run tests/help-vendor-facts.test.tsx tests/public-docs-boundary.test.ts --maxWorkers=4` | All tests pass. |
| **Help Page Content** | Manual / E2E | Inspect `/help` role tabs | Store Admin and Staff tabs clearly detail brands, icons, stock creation, and publication rules. |
| **Onboarding Page Content** | Manual / E2E | Inspect `/staff/onboarding` | Interactive operational workflow guide is present alongside the technical readiness report. |
| **Staging Deployment** | Operational | Deploy to `staging` | Staging workflow succeeds; `/help` and `/staff/onboarding` load cleanly on `aheed-staging.merqify.com`. |
| **Production Promotion** | Operational | Promote `staging -> main` | Production workflow succeeds; verified live on `aheed.merqify.com`. |
