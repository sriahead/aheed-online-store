# ADR-004 slice 2 — repository-layer vendorId enforcement + no-direct-Prisma guard (validation)

Read-path behavior is verified on `npm run preview` (or staging), never `npm run dev` (Prisma WASM).

| Req | How to verify |
|-----|---------------|
| R1  | `grep -n "getCurrentVendorId" lib/tenant.ts` shows an exported `async` function returning the single `ACTIVE` vendor's id, with a "slice 3 replaces this" comment; no module-level client/result cache. `npx tsc --noEmit` passes. |
| R2  | `grep -nE "vendorId|getCurrentVendorId" lib/repositories/products.ts` shows every query's `where` includes `vendorId`; the `ProductRepository` interface method signatures are unchanged (`git diff` shows no signature change). |
| R3  | Same check for `lib/repositories/categories.ts` (`listTopLevel`, `getBySlug`). |
| R4  | Same for `lib/repositories/reviews.ts` read methods; `git diff` shows `upsert`/`delete` still derive/keep `vendorId` from the product and signatures are unchanged. |
| R5  | `git diff lib/repositories/*.ts` shows the vendor id resolved inside the per-request factory/methods (e.g. a per-instance memoized promise), not a module-scope `let cached` — matching the `getPrisma()` no-cross-request-cache precedent in CLAUDE.md. |
| R6  | `grep -nE "no-restricted-imports|@prisma/client|lib/db|api/health" eslint.config.mjs` shows the restriction targeting `app/**`/`features/**`/`components/**` and the `app/api/health` exemption. |
| R7  | `npm run lint` exits 0 now. Then temporarily add `import { getPrisma } from "@/lib/db";` to `app/(storefront)/page.tsx` → `npm run lint` exits non-zero citing the rule on that line → revert and confirm `npm run lint` is 0 again. |
| R8  | On `npm run preview` (or staging): home, a category page, a product detail page, and a search all render the same product/category set as before; sign in and submit a review → succeeds and updates. `npx tsc --noEmit` exits 0. |
| R9  | `git diff specs/roadmap.md` shows a change-log row for slices 0–1 shipped (#56/#62) and one for slice 2 (#66). |
| R10 | `CHANGELOG.md` diff shows a new entry naming this slice and `#66`. |
| R11 | `npm run lint && npm run typecheck && npm run test && npm run format:check && npm run kms:validate` exit 0; `npm run kms:build-index` leaves `ARTIFACT_INDEX.md` matching the committed copy. |
