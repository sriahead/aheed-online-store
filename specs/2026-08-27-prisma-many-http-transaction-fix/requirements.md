# updateMany/createMany + direct $transaction HTTP-mode crash fix (requirements / acceptance criteria)

Closes #382 (corrected root cause, 2026-08-27). Four call sites crash intermittently or
unconditionally because they run through `getPrisma()` (HTTP mode) instead of `getPrismaWs()`. See
`plan.md` for the full root-cause trace and the empirical table showing exactly which Prisma
operations trigger this.

R1. `lib/bundles-service.ts`'s call to `upsertBundle(...)` (the wrapper around
    `lib/repositories/bundles.ts`'s `upsertBundle`) passes `getPrismaWs()`, not `getPrisma()`.

R2. `lib/bundles-service.ts`'s call to `setBundleImage(...)` passes `getPrismaWs()`, not
    `getPrisma()`.

R3. `lib/repositories/discounts.ts`'s `deactivateCodeForVendor` passes `getPrismaWs()` to
    `deactivateCode(...)`, not `getPrisma()`.

R4. `lib/repositories/vendor.ts`'s `updateVendorStorefrontConfig` calls `.$transaction(...)` on
    `getPrismaWs()`, not `getPrisma()`.

R5. A new test, `tests/repository-transaction-safety.test.ts`, statically enforces two rules
    across every file in `lib/repositories/`:
    - **R5a:** no `updateMany(`/`createMany(` call exists outside a `.$transaction(...)` callback.
    - **R5b:** no `.$transaction(` call is made directly on the return value of `getPrisma()`
      (i.e. no literal `getPrisma().$transaction(` in any repository file).
    Both rules apply with no allowlist — matching `tests/repository-purity.test.ts`'s precedent
    (whole-file/whole-pattern check, no per-file exceptions).

R6. Running `tests/repository-transaction-safety.test.ts` against the pre-fix code (R1-R4 reverted,
    e.g. via `git stash`) fails on exactly the four sites named in R1-R4 and no others — proving the
    new test actually would have caught this bug, not just that it passes post-fix.

R7. Live, against a real deployed environment (not local reasoning or a unit test): the exact
    reproduction that crashed this session — sign in as `demo-admin@example.com` on
    `https://staging.aheedfoodcentre.nocaped.com`, open the "Kitchen Pack" bundle's edit page
    (`/staff/bundles/b7a978f5-3a46-4d43-9e78-0c00332401fb`), upload an image with alt text, submit —
    completes without the "This page couldn't load" error, repeated 5 consecutive times (this bug is
    intermittent for the `updateMany` class; a single clean attempt is not informative, per the
    lesson already recorded in the prior slice's `validation.md`).

R8. Live, same environment: saving the SAME bundle's name/tagline via the "Save bundle" button
    (exercising `upsertBundle`, R1) completes without error, 3 consecutive times.

R9. Live, same environment, as staff on `/staff/discounts`: deactivating a discount code
    (exercising `deactivateCode`, R3) completes without error.

R10. Live, same environment, as staff on `/staff/storefront`: saving the storefront config form
     (exercising `updateVendorStorefrontConfig`, R4) completes without error.

R11. The diagnostic instrumentation added during #382's investigation is fully reverted: no
     `[382-diag` string remains anywhere in `lib/auth.ts`, `lib/db.ts`, or
     `features/admin/bundle-image.ts`.

R12. `rateLimit: { enabled: false }` in `lib/auth.ts` (from the prior slice) is left unchanged —
     this slice does not touch it either way.

R13. `CHANGELOG.md` updated (Gate 4).

R14. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
