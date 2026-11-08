# Application Improvements: Onboarding Visibility, Quick View, Product VAT, INFINITE Stock Mode & Checkout VAT Breakdown (Validation)

**Issue:** #1470  
**Slice:** `specs/2026-11-08-app-improvements-vat-quickview-onboarding/`  
**Status:** In Progress  

---

## Validation Gates

- [ ] Gate 1: Typecheck passes (`npm run typecheck`)
- [ ] Gate 2: Linter passes (`npm run lint`)
- [ ] Gate 3: Formatting passes (`npm run format:check`)
- [ ] Gate 4: KMS frontmatter & index check pass (`npm run kms:validate`, `npm run kms:build-index`, `npm run kms:check-generated`)
- [ ] Gate 5: Unit test suite passes (`npm test`)
- [ ] Gate 6: Dedicated test suite verifying:
  - Onboarding dashboard statistics visibility for platform-admin vs non-platform-admin.
  - Absence of `aheedfoodcentre.nocaped.com` reference.
  - VAT rate calculation and breakdown in checkout.
  - INFINITE stock mode purchasability without quantity restrictions.
  - Quick View modal in icon gallery with theme tint selector.
