# Repository client injection — completion, slices 2+3 (requirements / acceptance criteria)

Delivers **#411** and **#412** as one slice, completing **#409**. `CLAUDE.md`'s repository-layer rule
requires every export in `lib/repositories/*.ts` to take its Prisma client as an explicit parameter.
Slice 1 (#410) added the enforcement but had to scope it to four files; the remaining four are
`categories.ts`, `loyalty.ts`, `vendor.ts` and `products.ts`, holding 26 self-resolving exports
between them. When the scoping is deleted, the rule holds repo-wide for the first time. Also carries
**#415**, a Worker `cpu_ms` raise.

> **Terminology used below.** "Declares a Prisma client as a parameter" means the function signature
> accepts a client value; it makes **no claim about parameter position**. "Its body contains no call
> to `getPrisma`/`getPrismaWs`" refers to a **call expression** — these files legitimately name both
> functions in prose comments and in `ReturnType<typeof getPrisma>` type positions, and those must
> survive.

## Enforcement

R1. `tests/repository-client-injection.test.ts` contains no list, constant, array or other structure
    that limits which files it checks. It walks every `*.ts` file in `lib/repositories/` and fails on
    a `getPrisma`/`getPrismaWs` **call expression** in any of them.

R2. The guard test that asserted every scoped file still exists is removed, since no scoped file list
    remains for it to guard.

R3. `npx vitest run tests/repository-client-injection.test.ts` exits 0.

R4. `lib/repositories/` contains no file with a `getPrisma`/`getPrismaWs` call expression — verified
    by R1's test, which is the authority for this, not by a bare-word grep.

## `categories.ts` — 4 exports

R5. `listCategoriesForAdmin`, `getCategoryForAdmin`, `createCategoryForVendor` and
    `updateCategoryForVendor` in `lib/repositories/categories.ts` each declare a Prisma client as a
    parameter, and no body contains a call to `getPrisma`/`getPrismaWs`.

## `loyalty.ts` — 3 exports

R6. `saveLoyaltySettings`, `createLoyaltyTier` and `deleteLoyaltyTier` in
    `lib/repositories/loyalty.ts` each declare a Prisma client as a parameter, and no body contains a
    call to `getPrisma`/`getPrismaWs`.

R7. `saveLoyaltySettings`'s caller passes a client obtained from `getPrismaWs`, preserving the #382
    HTTP-mode transaction constraint.

## `vendor.ts` — 5 exports

R8. `fetchVendorProfile`, `getVendorConfig`, `getVendorBranding`, `updateVendorLogoKey` and
    `updateVendorStorefrontConfig` in `lib/repositories/vendor.ts` each declare a Prisma client as a
    parameter, and no body contains a call to `getPrisma`/`getPrismaWs`.

R9. `updateVendorStorefrontConfig`'s caller passes a client obtained from `getPrismaWs`, preserving
    the #382 constraint that its existing comment documents.

R10. `updateVendorStorefrontConfig`'s `data` parameter is no longer typed `any`; it declares a named
     object type or interface with explicit field types.

## `products.ts` — 14 exports

R11. These 14 exports in `lib/repositories/products.ts` each declare a Prisma client as a parameter,
     and no body contains a call to `getPrisma`/`getPrismaWs`: `listInventoryForStaff`,
     `listProductsForAdmin`, `getProductForAdmin`, `createProductForVendor`, `updateProductForVendor`,
     `setPrimaryProductImage`, `addProductImage`, `promoteProductImage`, `removeProductImage`,
     `reorderProductImages`, `quickUpdateInventory`, `saveGeneratedProductImage`,
     `getProductsWithoutImages`, `approveProductImageRow`.

R12. **No export in `products.ts` declares two Prisma client parameters.** Each of the 14 declares
     exactly one. (Corrected during Build; the spec originally required two for
     `updateProductForVendor`, `setPrimaryProductImage` and `quickUpdateInventory`. Measured against
     the file, all three constructed an HTTP client with `const prisma = getPrisma();` and then
     **never read it** — every statement in each body runs on the transaction client. There was no
     dual-client function to preserve. See `build-notes.md`.)

R13. These seven take a client obtained from `getPrismaWs`, because each opens an interactive
     transaction (#382): `updateProductForVendor`, `setPrimaryProductImage`, `addProductImage`,
     `promoteProductImage`, `removeProductImage`, `reorderProductImages`, `quickUpdateInventory`.
     The other seven take a client obtained from `getPrisma`: `listInventoryForStaff`,
     `listProductsForAdmin`, `getProductForAdmin`, `createProductForVendor`,
     `saveGeneratedProductImage`, `getProductsWithoutImages`, `approveProductImageRow`.

## Services and call sites

R14. The service entry points for all 26 converted exports live in `lib/categories-service.ts`,
     `lib/loyalty-service.ts`, `lib/vendor-service.ts` and `lib/products-service.ts`. No new
     `lib/*-service.ts` file is created.

R15. Every new service entry point resolves its client **inside** the exported function body, never at
     module scope — a module-scope client is cached across requests and throws "Cannot perform I/O on
     behalf of a different request" on Workers (`CLAUDE.md`).

R16. Every service entry point **added by this slice** takes `vendorId` as a parameter rather than
     calling `getCurrentVendorId()`, matching slice 1's precedent and `lib/roles-service.ts`. This
     does **not** apply to the pre-existing accessors that must resolve the vendor from the request
     host — `getCurrentVendorProfile`, `getCurrentVendorSenderName`, and the three `getXRepository()`
     factories — which legitimately keep calling `getCurrentVendorId()` and are out of scope here.

R17. The existing `getCategoryRepository()`, `getProductRepository()` and `getLoyaltyRepository()`
     factories still exist and still serve their storefront-read callers.

R18. `features/admin/storefront.ts`'s aliased import (`updateVendorStorefrontConfig as
     updateConfigRepo`) is repointed at the service. No call site anywhere still calls a converted
     repository export directly from `app/`, `features/` or `components/`.

R19. No file under `app/`, `features/` or `components/` gains an import of `@/lib/db`.
     `app/api/health/route.ts`'s existing import remains the only one.

R20. `npm run typecheck` exits 0, which is what proves every repointed call site resolves against its
     new signature.

## No behavioural change

R21. `tests/repository-transaction-safety.test.ts` passes and its diff against `origin/staging` is
     empty — this slice changes where a client is resolved, never which one a write path uses.

R22. `tests/repository-purity.test.ts` and `tests/repository-vendor-scoping.test.ts` both pass.

R23. No converted function's `where` clause, `select`, ordering or return type changes. Verified by
     reading the diff, which for each converted function shows only the signature, the removed
     resolution line, and mechanical renames.

## Live proof

R24. `scripts/verify-repository-injection.ts` exercises at least one read and at least one write from
     **each** of `categories.ts`, `loyalty.ts`, `vendor.ts` and `products.ts`, using a Prisma client
     the script itself constructs from the bare `@prisma/client` specifier — not `/wasm`, and not via
     `lib/db`.

R25. Its `products.ts` coverage includes `createProductForVendor` and one image mutation that runs
     through the WebSocket transaction path.

R26. The script removes every row it created before exiting, and verifies the removal by re-counting
     rather than assuming the deletes succeeded.

R27. The script exits **non-zero without writing anything** when its resolved database host matches
     the host in `secrets/staging.vars` or `secrets/production.vars`. It prints the resolved host on
     every run.

R28. Running the script against the dev database exits 0 and every printed check line reads PASS.

## Documentation

R29. `lib/products-service.ts`'s docstring no longer claims the repository module's admin write path
     can be exercised from a plain `tsx` script as a pre-existing property, and says what was
     previously false.

R30. `CLAUDE.md`'s repository-layer section states that the client-injection rule is now enforced
     across all of `lib/repositories/`, with no file scoping, and records that this was the fourth
     docstring found asserting the property while its own file violated it.

R31. `lib/repositories/campaigns.ts` imports `getPrisma` with `import type`, not a value import.

## #415 — Worker CPU ceiling

R32. `wrangler.toml`'s `[limits] cpu_ms` is `300`, with a comment naming #415 and the date, alongside
     the existing note about the 2026-08-13 raise to 50.

R33. The `deploy-staging` workflow run for this branch's merge completes successfully.

R34. After that deploy, 10 sequential requests to `https://staging.aheedfoodcentre.nocaped.com/` each
     return HTTP 200 with no Cloudflare Error 1102 body. (This is a bounded smoke check, not a claim
     about sustained traffic — see `plan.md`.)

## Gates

R35. `specs/2026-08-27-repository-client-injection-completion/` contains `plan.md`,
     `requirements.md`, `validation.md` and `build-notes.md`.

R36. `CHANGELOG.md` updated (Gate 4).

R37. `npm run kms:validate` reports zero invalid front-matter, and `npm run kms:build-index` is run
     **last**, after every front-matter edit.

R38. `npm run sdd:audit` reports no documentation gaps.

R39. `npm run lint`, `npm run typecheck`, `npx vitest run` and `npm run format:check` each exit 0, and
     CI's `gates` job on the PR is green.

R40. The internal KMS docs site builds: `npm run kms:assemble:internal` followed by a `next build` in
     `kms/site-internal` succeeds. (This slice adds `specs/*.md`, which the root gates never build.)
