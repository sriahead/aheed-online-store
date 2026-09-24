# P877 — Net Content for the Generated Demo Catalogue (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

This slice writes to a **database** through the seed, so the target matters more than anything else
here. Before any live row:

1. Diff `.env` and `.dev.vars` against `secrets/staging.vars` and `secrets/production.vars`.
2. Confirm `DIRECT_URL` and `DATABASE_URL` point at the **dev** Neon branch.
3. Confirm the host the seed prints on its `>>> … in database host:` line is dev.

Stop if it names staging or production. Browser checks run under `npm run preview`, never
`npm run dev` (`CLAUDE.md`: `next dev` cannot load the WASM engine).

## Testing Areas

1. **Unit:** the lookup table, pairing, and determinism (R1–R4).
2. **Integration:** the seed's creation and backfill paths against a real database (R5–R9).
3. **System / E2E:** the facet and card label in the real storefront (R10).
4. **Regression:** Gate 3 (R12). The existing determinism tests keep passing unchanged.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit         | Read `prisma/generate-catalogue.ts`: `GeneratedProduct` has both fields with the stated types, and `NetContentUnit` is imported from `components/product/unit-price.ts` (via a relative or `@/` path). `npm run typecheck` exits 0. |
| R2  | Unit         | Read the lookup table in `prisma/generate-catalogue.ts` and compare it entry by entry with `plan.md`'s table. All ten packs appear and all values match. Confirm the per-row values come from indexing that table by the picked `pack`, and that no string parsing (regex or `parseInt` on the pack) produces them. |
| R3  | Unit         | `npx vitest run tests/generate-catalogue.test.ts` exits 0. The file contains a test iterating `PACKS` against the table, a test checking each row's net content against its pack, and a test that no row has exactly one field set. |
| R4  | Unit         | `npx vitest run tests/generate-catalogue.test.ts` exits 0, including the hash test. **Independently confirm the literal came from the pre-change generator:** find the first commit on this branch that changed the generator (`git log --reverse --format=%H origin/staging..HEAD -- prisma/generate-catalogue.ts`, first line), and take its **parent** (`<sha>^`). Write that parent's version of the generator to a temp file with `git show <sha>^:prisma/generate-catalogue.ts`. Compute the same SHA-256 over the same eleven fields for `generateProducts(500, ["a","b","c"])` with a one-off `npx tsx` script importing that temp file. Confirm it equals the literal in the test. |
| R5  | Integration  | Read the diff of `prisma/seed.ts`: the generated-catalogue `product.createMany` data includes `netContentAmount`, `netContentUnit`, and `unitPricePencePerBaseUnit` from `deriveUnitPricePenceForSort`. Live consistency is checked by R9 via R8(c). |
| R6  | Integration  | Read the diff of `prisma/seed.ts`. The backfill runs before the `existing >= count` return, filters on vendor, the `gen-` prefix and `netContentAmount: null`, matches by slug, and writes all three columns in one update per row. During R9's first seed run, the log shows a rows-updated count greater than 0, and an unmatched count, which is `0`. |
| R7  | Integration  | Straight after R9's seed run, run `npm run db:seed` again against dev (same `SEED_SCALE_PRODUCTS`). The backfill's log line reports `0` rows updated. |
| R8  | Integration  | The file exists at the stated path. Run it against dev (`npx tsx specs/2026-09-23-p877-generated-net-content/verify-generated-net-content.ts`, with whatever env-file flag it documents). It prints (a)–(d) per vendor. To prove the failure branch is real, read its exit logic and confirm each of (b), (c), (d), and the zero-coverage case sets a non-zero exit. |
| R9  | Integration  | Record R8's output against dev **before** seeding (expected: 0 generated rows with net content). Run `npm run db:seed` against dev, then R8 again. Exit code is 0. For Aheed, rows with net content ÷ generated rows is between 0.70 and 0.90. (d) is `0`. |
| R10 | E2E          | `npm run preview` against dev. Open a category page that lists generated products (their names end in a pack such as `1kg`). The filter panel shows `Pack size` with options. Choose `1 kg` (or any listed option) and apply it: every listed product's name ends in that pack. On a generated `…1kg` product card, the unit line reads `£… / kg`, not the generated label's `/ 1kg` form. |
| R11 | Gate 4       | `git diff origin/staging...HEAD -- CHANGELOG.md` shows an entry under `## [Unreleased]` citing `#877`. |
| R12 | Gate 3       | `npm run lint`, `npm run typecheck` and `npm run format:check` exit 0. `npx vitest run` exits 0 when run **alone** (not beside or straight after a build), with no file-level failures in its summary. |
