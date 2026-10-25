# Staff Panel Stock File Upload & Catalogue Import (requirements / acceptance criteria)

Context: Introduces `/staff/products/import` to allow store owners to upload stock files (`.csv`, `.xlsx`, `.xls`) with an in-memory preview of additions, updates, duplicates, and rejections before committing. Implements two-phase execution while strictly keeping `@e965/xlsx` out of the Worker bundle and maintaining ADR-007 stock and restriction safeguards.

## Functional & Security Requirements

- **R1: Staff Navigation Item:**
  `components/staff/nav-items.ts` registers `/staff/products/import` in the `catalogue` group with `tier: "admin"`, label `"Import stock file"`, and icon `"upload"`.

- **R2: Shared Page Container:**
  `app/(admin)/staff/products/import/page.tsx` exists and wraps its top-level layout in `<PageContainer width="standard">`.

- **R3: Admin Role Authorization:**
  `app/(admin)/staff/products/import/page.tsx` enforces `requireVendorRole(session, "ADMIN")` and renders `<PanelRefusal />` when the session role is not admin.

- **R4: Operator Guide Documentation:**
  `docs/developer-portal/operator-guides/admin-guide.md` contains a section documenting the `/staff/products/import` page, its two-phase upload workflow, and its restriction rules, satisfying `tests/operator-doc-coverage.test.ts`.

- **R5: Worker Bundle Protection:**
  No file under `app/`, `features/`, `components/`, or `lib/` imports `@e965/xlsx`, satisfying `tests/catalogue-import-guards.test.ts`. Excel parsing is performed client-side / in-browser before submission to server actions.

- **R6: Server Action Purity:**
  All server actions in `app/(admin)/staff/products/import/actions.ts` export exclusively async functions with no exported constants or non-function types.

- **R7: Session-Derived Vendor Isolation:**
  `validateStockFileAction` and `applyStockFileAction` derive `vendorId` exclusively from the verified server session (`getAuth().api.getSession`). Neither action accepts a client-supplied `vendorId` in its payload, preventing cross-tenant injection.

- **R8: Payload Size Ceiling (10,000 Rows):**
  Server actions immediately reject any import payload exceeding 10,000 grid rows with a validation error (`"Payload exceeds 10,000 row limit"` / HTTP 400), safeguarding Cloudflare Worker memory and CPU execution limits.

- **R9: In-Memory Preview & Default ADR-007 Restriction Policy:**
  `validateStockFileAction` runs `buildPlan` in-memory from grid rows without executing any database write. It enforces the default ADR-007 restriction dictionary:
  - `TOBACCO` & `ALCOHOL` $\rightarrow$ `AGE_RESTRICTED`
  - `INSTANT LOTTERY` $\rightarrow$ `PROHIBITED`
  - `PHONE CARDS`, `NEWS`, `E-PAY`, `STAMPS` $\rightarrow$ `NOT_DELIVERABLE`
  - `DEFAULT` department and £0.00 lines $\rightarrow$ `NEEDS_REVIEW`
  - Standard grocery departments $\rightarrow$ `ALLOWED`
  It returns preview counts for candidate additions, matching existing products, rejected duplicate rows, and ADR-007 classified restrictions.

- **R10: Duplicate & Invalid Row Reporting:**
  `validateStockFileAction` identifies duplicate rows and malformed entries, returning a rejection list containing the source row index and rejection code (e.g. `DUPLICATE_ROW`, `INVALID_DATA`).

- **R11: Interactive WebSocket Transaction Scoping:**
  `applyStockFileAction` executes `applyPlan` scoped strictly to `session.vendorId` using `getPrismaWs()` for interactive department transactions.

- **R12: Hidden Products & UNKNOWN Stock Defaults:**
  All products newly created by `applyStockFileAction` are written with `isActive: false`, `stockMode: "UNKNOWN"`, and `quantity: 0`. Uploaded file quantities or negative EPOS till counts are never treated as live inventory.

- **R13: Restriction Audit Logging:**
  All restricted products created or tightened by `applyStockFileAction` have an immutable audit row created in `ProductRestrictionAuditLog` with `source: "IMPORT"`.

- **R14: Non-Destructive Merging Rules:**
  For existing products matching a plan slug, `applyStockFileAction` preserves existing `isActive` status, existing prices, and inventory stock; only restrictions can be tightened via `reimportedProductState`.

- **R15: Hostname & Environment Boundaries:**
  Local development runs under `aheedsuperstore.localhost:8787`. The third vendor hosted test hostname `aheedsuperstore.nocaped.com` remains evaluated as an architectural target; no premature DNS, Worker route, or staging database modifications are made during this slice.

- **R16: Quality Gates & SDD Discipline:**
  `CHANGELOG.md` is updated on the branch citing this slice and issue (Gate 4). `npm run lint`, `npm run typecheck`, `npm run format:check`, and `npx vitest run --maxWorkers=4` all pass.
