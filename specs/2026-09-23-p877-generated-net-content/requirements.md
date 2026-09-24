# P877 — Net Content for the Generated Demo Catalogue (requirements / acceptance criteria)

Closes `#877`. `#697` stays open (net content for real products). The seed's generated demo
catalogue (products whose slug starts with `gen-`) gains net content for its eight weight and volume
packs, including rows already present in a database, so `#397`'s pack-size facet and `#398`'s derived
unit price are visible in dev. No real or curated product is changed, and no environment other than
dev is written to. See `plan.md` for the pack table and why it is a lookup, not a parser.

## Generator

R1. `prisma/generate-catalogue.ts`'s `GeneratedProduct` type has `netContentAmount: number | null`
    and `netContentUnit: NetContentUnit | null`, with `NetContentUnit` imported from
    `components/product/unit-price.ts`.

R2. Every generated row's net content is taken from a fixed lookup table keyed by its pack string,
    and matches `plan.md`'s table exactly. There are eight weight and volume packs, and `Pack of 4` and
    `Pack of 6` map to `null` for both fields. `netContentAmount` and `netContentUnit` are either
    both null or both non-null on every row.

R3. `tests/generate-catalogue.test.ts` asserts:
    - every entry of `PACKS` has a lookup-table entry;
    - for the generator's output, each row's `(netContentAmount, netContentUnit)` equals the table
      entry for the pack in its `name`;
    - no row has exactly one of the two fields set.

R4. Generator determinism is unchanged for every pre-existing field. `tests/generate-catalogue.test.ts`
    asserts that a SHA-256 hash over `slug`, `name`, `description`, `categorySlug`, `basePrice`,
    `unitLabel`, `quantity`, `origin`, `isHalal`, `isFresh` and `isOrganic` equals a hard-coded
    literal. The hash covers `generateProducts(500, ["a", "b", "c"])` at the committed seed. The
    literal is computed from the **pre-change** generator, not from the changed one.

## Seed

R5. The generated-catalogue row creation in `prisma/seed.ts` writes `netContentAmount`,
    `netContentUnit` and `unitPricePencePerBaseUnit`. The last is computed per row with
    `deriveUnitPricePenceForSort(basePrice, netContent)` from `components/product/unit-price.ts`, and
    is `null` when net content is null.

R6. `prisma/seed.ts` runs a net-content backfill for the generated catalogue before the `existing >=
    count` early return. It regenerates the catalogue and matches existing rows by slug. It updates
    only rows that:
    - belong to that vendor;
    - have a slug starting with `gen-`;
    - match a regenerated slug;
    - currently have `netContentAmount` null.

    It writes the same three columns as R5 together. It logs the number of rows updated and the
    number of existing generated rows with no matching regenerated slug.

R7. Running the seed a second time in a row against the same database updates zero rows through the
    R6 backfill (the log line reports `0`).

## Live (dev database only)

R8. `specs/2026-09-23-p877-generated-net-content/verify-generated-net-content.ts` exists, reads the
    database given by its env file, and prints the following for each vendor:
    - (a) the number of generated rows, and how many of them have non-null net content;
    - (b) the number of rows where exactly one of the two net content fields is set;
    - (c) the number of generated rows with non-null net content but a `unitPricePencePerBaseUnit`
      that differs from `deriveUnitPricePenceForSort` of that row;
    - (d) the number of non-generated rows with non-null net content.

    It exits non-zero if (b), (c) or (d) is non-zero, or if (a) reports zero rows with net content
    while generated rows exist.

R9. After `npm run db:seed` against the dev database (with that database's usual
    `SEED_SCALE_PRODUCTS`), the R8 script run against dev exits 0. For Aheed, the generated rows with
    net content are between 70% and 90% of generated rows (eight of ten packs, drawn pseudo-randomly),
    and (d) is `0`.

R10. Under `npm run preview` against the dev database:
     - a category page containing generated products shows the `Pack size` filter control;
     - selecting one of its options narrows the list to products of that pack;
     - a generated weight product's card shows the derived unit price (per `kg`), not its generated
       `unitLabel` (which reads `/ <pack>`, e.g. `/ 1kg`).

## Gates

R11. `CHANGELOG.md` has an entry under `## [Unreleased]` citing `#877` (Gate 4).

R12. `npm run lint`, `npm run typecheck`, `npm run format:check` and `npx vitest run` (run alone)
     all exit 0 (Gate 3).
