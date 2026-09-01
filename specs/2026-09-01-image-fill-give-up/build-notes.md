# A give-up path for products the image pipeline can never fill (build notes)

Written at the end of Build, before the Clear. Branch `feature/image-fill-give-up`, cut from a
freshly-fetched `origin/staging` at `a79cef2`.

## What changed and why

- **`prisma/schema.prisma`** — `Product.imageAttemptFailures Int @default(0)`, plus its migration.
- **`lib/product-image.ts`** — `MAX_IMAGE_ATTEMPT_FAILURES` (3) and pure
  `hasExhaustedImageAttempts`. The threshold governs a paid, scheduled job, so it belongs where a
  test can reach it without a database or an AI call.
- **`lib/repositories/products.ts`** — `recordImageAttemptFailure`,
  `countProductsWithExhaustedImageAttempts`, the new filter in `getProductsWithoutImages`, and a
  counter reset inside `saveGeneratedProductImage`.
- **`lib/products-service.ts`** — same-named wrapper resolving its own client (#411/#412's
  convention).
- **`scripts/fill-product-images.ts`** and **`app/api/admin/jobs/backfill-images/route.ts`** — both
  record failures.

**Three attempts, not one.** The AI filter is flaky in both directions: `Gulab Jamun 1kg` and
`Extra Noodles 1L` were each refused once as NSFW and then accepted on retry, while
`Halal Chicken Thighs 1kg` has never once passed. One strike would give up on products that do
work; a large number defeats the purpose, since every attempt reaching AI generation is a paid call
repeated on every run.

**Both callers record, deliberately.** If only the script did, a product would remain selectable
through the admin button while the scheduled job had written it off — two paths disagreeing about
the same product.

**The run reports what it skipped.** A give-up rule that silently shrinks the work list is the same
class of problem it was built to fix: the job would report "nothing to do" while products sat
permanently unfilled and nothing pointed at them. `countProductsWithExhaustedImageAttempts` exists
only so the summary line can say it.

**The reset is unconditional**, merged into the existing `needsReview` update so it stays one write.
A product that later loses its image should be retried from scratch, not excluded by attempts that
predate an image it once had.

## The migration trap fired, and was caught before it executed

`prisma migrate dev --create-only` generated this for a single unrelated column on `Product`:

```
-- DropIndex
DROP INDEX "Order_guestEmail_trgm_idx";
-- DropIndex
DROP INDEX "Order_orderNumber_trgm_idx";
-- DropIndex
DROP INDEX "User_email_trgm_idx";
-- AlterTable
ALTER TABLE "Product" ADD COLUMN "imageAttemptFailures" INTEGER NOT NULL DEFAULT 0;
```

All three drops were removed before applying, and the migration file carries a comment recording
why. **This is the third occurrence of CLAUDE.md's GAP-011 drift and the first caught before
anything ran** — in `#508` the equivalent drops executed against the dev database and needed a
three-step recovery. `--create-only` plus reading the SQL is exactly the step CLAUDE.md added after
that incident, and it worked.

Verified after applying: all three trigram indexes still present in dev, and the new column exists.

**`prisma migrate dev` then prompted for a second migration name** and sat waiting until the command
timed out. That is the same drift being re-detected — the indexes exist in the database but not in
`schema.prisma`. Nothing was created; `prisma/migrations/` holds exactly one new directory. Do not
answer that prompt.

## What ran live during Build

Against the **dev** database, with a temporary product created and deleted by the harness:

| Row | Result |
|---|---|
| R2 | migration's executable SQL has no `DROP`; **3** `pg_trgm` indexes present afterwards; column exists |
| R3/R4/R5 | `tests/product-image.test.ts` — 27 passed |
| R7 | selected at 0 and at 2 failures; **not** selected at 3 |
| R8 | counter back to `0` after `saveGeneratedProductImage` |
| R10 | `countProductsWithExhaustedImageAttempts` returned 1 for the exhausted product |
| R11 | incrementing with another vendor's id **threw**, counter unchanged |
| R14 | lint, typecheck, format:check green; 844 tests across 71 files |

Cleanup reported **0** `__verify523-` rows remaining.

## Deviations from the spec

None.

## Known-shaky areas

- **The scheduled job still cannot run**, so this protection is untested in the setting it exists
  for. The `production` GitHub environment is missing six S3/CDN secrets (`#518`). Everything here
  is verified through the same code paths the job uses, but no scheduled run has exercised it.
- **No admin surface lists given-up products.** The count is reported per run and the column is
  queryable, but a staff screen is deliberately out of scope — worth its own decision.
- **`Product.imageAttemptFailures` has no index.** At this catalogue size the filter rides the
  existing scan; at 100k products it would want one, which is `#503`'s territory rather than this
  slice's.
- **The sanitised-prompt retry from `#523`'s description was not built.** Choosing a fallback prompt
  is a different question, and a wrong guess produces an image that does not depict the product —
  worse than the grey box the placeholder already degrades to.
