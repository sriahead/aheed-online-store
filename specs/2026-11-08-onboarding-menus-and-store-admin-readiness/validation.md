# Staff Onboarding Menu Expansion & Store Admin Readiness Checklist Access (Validation)

**Slice:** `specs/2026-11-08-onboarding-menus-and-store-admin-readiness/`  
**Status:** Complete  

---

## Verification Criteria

| ID | Type | Description | Result |
| :--- | :--- | :--- | :--- |
| **V1** | Unit | Store Admin (`canViewChecklist = true`) sees completion % and Launch Readiness Checklist | PASS |
| **V2** | Unit | Platform Admin (`isPlatformAdmin = true`) sees completion % and Launch Readiness Checklist | PASS |
| **V3** | Unit | Non-admin staff (`isPlatformAdmin = false, canViewChecklist = false`) sees only sequential guide | PASS |
| **V4** | Unit | Guide contains Step 7 (Orders, Delivery & Fulfilment), Step 8 (Offers, Loyalty), Step 9 (Customers, Content) | PASS |
| **V5** | Static | `npm run typecheck`, `npm run lint`, `npm run format:check` exit 0 | PASS |
| **V6** | Docs | `npm run kms:validate`, `npm run kms:build-index`, `npm run kms:coverage` exit 0 | PASS |
