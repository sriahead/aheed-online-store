# Feature Catalogue (validation)

| Req | Proof |
|---|---|
| R1-R3 | `tests/feature-catalogue.test.ts` (content block). Live: open `/staff/feature-catalogue` as `demo-admin` and read all four roles. |
| R4 | Live: open as `demo-staff` (refusal) and signed out (redirect). |
| R5 | `tests/staff-nav-parity.test.ts`; live: menu entry visible to `demo-admin`, absent for `demo-staff`. |
| R6 | `tests/feature-catalogue.test.ts` (routes and menu coverage). |
| R7 | `tests/page-container.test.ts`, `tests/panel-refusal-coverage.test.ts`, `tests/icon-imports.test.ts`. |
| R8 | `tests/operator-doc-coverage.test.ts`. |
| R9 | Read `CHANGELOG.md`. |

Run `lint`, `typecheck`, `format:check`, `npx vitest run --maxWorkers=4` and `kms:coverage`. The live
rows (R4, R5) need the deployed staging host and a signed-in demo account.
