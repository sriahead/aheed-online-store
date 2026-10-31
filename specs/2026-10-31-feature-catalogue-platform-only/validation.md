# Feature Catalogue restricted to platform admins (validation)

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `tests/operator-doc-coverage.test.ts` derives "Platform admins only" from the `auth.via` check and requires the platform guide; `tests/panel-refusal-coverage.test.ts` passes. |
| R2  | Unit | `tests/staff-nav-parity.test.ts` and `tests/feature-catalogue.test.ts` pass. |
| R3  | Unit | `tests/feature-catalogue.test.ts` (platform menu items catalogued under `platform`). |
| R4  | Unit | `rg -n "feature-catalogue" docs/store-admin-guide docs/platform-admin-guide` lists the platform guide only. |
| R5  | Regression | The four local commands; CI green on the PR. |
| R6  | E2E (live) | `curl -sS -I https://aheed-staging.merqify.com/staff/feature-catalogue`; then the two demo sign-ins in a browser. |
