# ADR-004 slice 2 — repository-layer vendorId enforcement + no-direct-Prisma guard (requirements)

Turns slice 1's `vendorId` column (#62) into a real isolation boundary: every repository query
filters by the current vendor, enforced centrally, with a lint guard keeping domain queries inside
`lib/repositories/*`. Issue #66; parent ADR-004 (#49). Single-vendor today, so runtime output is
unchanged — the point is provable scoping + regression prevention.

R1. `lib/tenant.ts` exports `getCurrentVendorId(): Promise<string>` that returns the current vendor's
    id; the interim implementation resolves the single `ACTIVE` vendor and a comment states slice 3
    replaces the body with host→tenant resolution. It does not cache a client/result across requests.

R2. `lib/repositories/products.ts` applies `where: { vendorId }` (from `getCurrentVendorId()`) to
    `listByCategory`, `search`, and `getBySlug`; the public method signatures are unchanged.

R3. `lib/repositories/categories.ts` applies `where: { vendorId }` to `listTopLevel` and `getBySlug`
    (the top-level query); signatures unchanged.

R4. `lib/repositories/reviews.ts` applies `where: { vendorId }` to `listByProduct` and
    `getByUserAndProduct`; `upsert` continues to derive `Review.vendorId` from the product;
    signatures unchanged.

R5. Each repository resolves the vendor id **once per repository instance** (request-scoped), not via
    a module-level/cross-request cache — matching `getPrisma()`'s per-request contract on Workers.

R6. `eslint.config.mjs` defines a rule that makes importing `@/lib/db` (or `getPrisma`) or the bare
    `@prisma/client` specifier an **error** in `app/**`, `features/**`, and `components/**`, with
    `app/api/health/**` exempted. `lib/**` is unaffected.

R7. `npm run lint` exits 0 on the current tree (no existing violations), and adding a
    `getPrisma` import to any file under `app/**` (outside `app/api/health`) makes `npm run lint` fail
    with that rule — i.e. the guard actually bites.

R8. Runtime behavior is unchanged: the storefront home, a category page, a product page, and search
    return the same results as before this slice, and a signed-in review submit still succeeds;
    `npx tsc --noEmit` passes.

R9. `specs/roadmap.md` change-log records the deferred slice-0/1 closure (#65) and a slice-2 entry.

R10. `CHANGELOG.md` updated (Gate 4), referencing #66.

R11. `lint`, `typecheck`, `test`, `format:check`, `kms:validate` all pass and `ARTIFACT_INDEX.md` is
     regenerated.
