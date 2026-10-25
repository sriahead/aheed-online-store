# Staff Panel Stock File Upload & Catalogue Import (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Validate component logic with unit and contract tests; verify staff routing and access controls via automated parity guards; prove the two-phase preview and apply flow in the local preview environment (`npm run preview`).

## Validation Steps

| Req | Testing Area | How to verify |
|---|---|---|
| **R1** | Static & Parity | `npx vitest run tests/staff-nav-parity.test.ts` passes; confirm `/staff/products/import` is listed under the Catalogue group with `tier: "admin"`. |
| **R2** | Static & Layout | `npx vitest run tests/page-container.test.ts` passes; confirm `app/(admin)/staff/products/import/page.tsx` renders `<PageContainer width="standard">` without hand-rolled container classes. |
| **R3** | Integration & Security | Request `http://localhost:8787/staff/products/import` under `npm run preview` as a non-admin staff user; confirm the page renders `<PanelRefusal />` and returns HTTP 200/403 refusal copy rather than product import controls. |
| **R4** | Static & Docs | `npx vitest run tests/operator-doc-coverage.test.ts` passes; grep for `### Import stock file` in `docs/developer-portal/operator-guides/admin-guide.md`. |
| **R5** | Static & Guard | `npx vitest run tests/catalogue-import-guards.test.ts` passes; confirm zero occurrences of `@e965/xlsx` under `app/`, `features/`, `components/`, or `lib/`. |
| **R6** | Static & Runtime | `grep -n "^export (const|let|var)" app/(admin)/staff/products/import/actions.ts` prints nothing; confirm all exports are `export async function`. |
| **R7** | Unit & Security | Unit test in `tests/staff-catalogue-import.test.ts`: invoke `validateStockFileAction` and `applyStockFileAction` passing an explicit foreign `vendorId` in the argument; assert the action ignores it and resolves `vendorId` strictly from `getAuth().api.getSession`. Assert unauthenticated calls fail with an auth error. |
| **R8** | Unit & Boundary | Unit test in `tests/staff-catalogue-import.test.ts`: invoke `validateStockFileAction` with a fixture array containing 10,001 rows; assert the call immediately fails with `"Payload exceeds 10,000 row limit"` without executing `buildPlan`. |
| **R9** | Unit & Invariants | `npx vitest run tests/staff-catalogue-import.test.ts`: assert `validateStockFileAction` applies default ADR-007 classifications (`TOBACCO` $\rightarrow$ `AGE_RESTRICTED`, `INSTANT LOTTERY` $\rightarrow$ `PROHIBITED`, `PHONE CARDS` $\rightarrow$ `NOT_DELIVERABLE`, `DEFAULT` $\rightarrow$ `NEEDS_REVIEW`) and executes zero database inserts. |
| **R10** | Unit | Assert `validateStockFileAction` fed with a fixture containing duplicate rows returns `rejected` array with exact line numbers and `code: "DUPLICATE_ROW"`. |
| **R11** | Integration | Assert `applyStockFileAction` uses `getPrismaWs()` and writes strictly with `vendorId` matching the session vendor; verify other vendors' row counts remain identical before and after. |
| **R12** | Database & Invariant | Query products and inventory created by `applyStockFileAction`: confirm all newly inserted products have `isActive === false`, `inventory.stockMode === "UNKNOWN"`, and `inventory.quantity === 0`. |
| **R13** | Database & Audit | Confirm every restricted product inserted or tightened by `applyStockFileAction` has a corresponding row in `ProductRestrictionAuditLog` with `source: "IMPORT"`. |
| **R14** | Database & Merging | Re-apply a stock file containing an existing active product with an unchanged price: confirm the product remains `isActive === true`, price is not overwritten, and inventory stock is not touched. |
| **R15** | Environment Check | Verify `aheedsuperstore.localhost:8787` resolves in local preview; confirm no route changes in `wrangler.toml` or staging database writes were performed during Gate 2. |
| **R16** | CI Gates & SDD | `git diff origin/staging...HEAD -- CHANGELOG.md` shows a changelog entry citing this feature and issue. `npm run lint`, `npm run typecheck`, `npm run format:check`, and `npx vitest run --maxWorkers=4` all exit 0. |
