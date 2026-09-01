# A give-up path for products the image pipeline can never fill (validation)

Run from a fresh context.

> **Testing strategy.** The threshold is a pure function and gets unit coverage. Everything else is
> verified against a **dev** database with a temporary product, because the thing that must be true
> — that a Prisma `where` actually excludes an exhausted product — cannot be established by a unit
> test that stubs the query. Production needs no action: the one product that motivated this issue
> already has an image, uploaded manually, so it is not selected by this path.

## Preconditions

- `.env` points at the **dev** Neon branch. Confirm the resolved host before creating rows.
- If a call fails with `UND_ERR_CONNECT_TIMEOUT` against an IPv6 address, re-run with
  `NODE_OPTIONS=--dns-result-order=ipv4first`.
- Any verification script that creates rows must delete them and report the remaining count. Do
  **not** pipe such a script through `head` — CLAUDE.md: SIGPIPE can kill the writer before its
  cleanup runs, which has already left orphan rows in this database once.

| Req | How to verify |
|---|---|
| R1 | `grep -n "imageAttemptFailures" prisma/schema.prisma` shows `Int @default(0)` on `Product`; a migration directory exists containing the `ALTER TABLE ... ADD COLUMN`. Query `information_schema.columns` for it against dev. |
| R2 | Strip comments from the migration (`grep -v '^\s*--'`) and confirm no `DROP` remains. Then query `pg_indexes WHERE indexname LIKE '%trgm%'` against dev — expect **3** rows. Cast to `::text`, or Prisma fails to deserialize Postgres' `name` type. |
| R3 | `npx vitest run tests/product-image.test.ts` passes and covers the helper. |
| R4 | Read the constant: `1 < MAX_IMAGE_ATTEMPT_FAILURES <= 5`. Asserted by a test as well. |
| R5 | The new cases in `tests/product-image.test.ts` import only from `@/lib/product-image` and read no `S3_*`/`DATABASE_URL`. |
| R6 | Read `recordImageAttemptFailure`: `prisma.product.update` (singular), `where: { id, vendorId }`, `data: { imageAttemptFailures: { increment: 1 } }`. `grep -n "updateMany" ` over the function returns nothing. |
| R7 | **Live against dev.** Create a temporary product with only a placeholder image. Assert it appears in `getProductsWithoutImages`. Call `recordImageAttemptFailure` until one below the threshold — still returned. Call once more — **no longer returned**. Delete the row and confirm 0 remain. |
| R8 | In the same run, call `saveGeneratedProductImage` for that product and assert `imageAttemptFailures` is back to `0`. |
| R9 | Read both call sites. In `scripts/fill-product-images.ts` the recording happens in the `catch` **and** on the `!result` branch; in the route, in its `catch`. Both wrap the recording in their own `try`, so a failure to record does not abandon the loop. |
| R10 | In the live run, assert `countProductsWithExhaustedImageAttempts` counts the exhausted product. Then read the script's summary line and confirm it names the skipped count and `#523` when the count is non-zero. |
| R11 | In the live run, call `recordImageAttemptFailure` with a **different** vendor's id and the same product id; it must throw (no row matches the composite `where`) and leave the counter unchanged. |
| R12 | `grep -n "recordImageAttemptFailure" lib/products-service.ts` shows an export delegating to the repository under the `…Repo` alias, and the route imports it from `@/lib/products-service`. |
| R13 | `git diff origin/staging -- CHANGELOG.md` shows an entry referencing #523. |
| R14 | `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run format:check` all exit 0. CI on the PR is the authority. |

## Notes for the validator

- **R7 is the load-bearing row.** Everything else could be correct while the Prisma `where` silently
  fails to exclude — and the symptom would be invisible until a scheduled run quietly wasted its
  budget weeks later. Exercise it against a real database, both sides of the threshold.
- **R2 is not paperwork.** `prisma migrate dev` proposed dropping all three trigram indexes for a
  change touching an unrelated table; in #508 the equivalent drops actually executed. Confirm the
  indexes are *present*, not merely that the file looks clean.
- **R11 matters because the counter is a write.** A repository write that ignores `vendorId` is the
  #340 class of defect; the composite `where` is what prevents it and it should be seen to fail.
