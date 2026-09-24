# P877 — Net Content for the Generated Demo Catalogue (build notes)

Written at the end of Build, **before** the Clear. The validating context is fresh and has only the
spec, the artifact, and this file.

Branch `feature/877-generated-net-content`. Spec commits `87c9854`/`9c5fdc2`/`f681229` (rebased onto
`staging` at Orient, 2026-09-24; the spec had never been pushed until then). Build commit `2403aa3`.

## What changed and why

- **`prisma/generate-catalogue.ts`** — `PACKS` is now exported (R3's test needs it). A new exported
  `PACK_NET_CONTENT: Record<string, { amount, unit } | null>` is the fixed lookup of `plan.md`'s
  table; `GeneratedProduct` gains `netContentAmount`/`netContentUnit` (R1), with `NetContentUnit`
  imported as a **type** from `../components/product/unit-price` (relative, not `@/`, to match the
  module's no-dependencies posture; type-only, so the generator stays pure). Each row's value is
  `PACK_NET_CONTENT[pack] ?? null` on the already-picked `pack`, **with no new `rng()` call**, which
  is what keeps R4's fingerprint unchanged.
- **`prisma/seed.ts`** — two new helpers above `seedGeneratedCatalogue`:
  - `generatedNetContentColumns(basePrice, product)` returns all three columns together
    (`netContentAmount`, `netContentUnit`, `unitPricePencePerBaseUnit` via
    `deriveUnitPricePenceForSort`) — used by both the create path (R5, spread into the existing
    `product.createMany` data) and the backfill, so the two can't disagree.
  - `backfillGeneratedNetContent(vendorId, usableSlugs)` (R6), called **after the placeholder
    uploads and immediately before the `existing >= count` count/guard**, with a comment in the
    same style as #502's upload note.
- **`tests/generate-catalogue.test.ts`** — a new `describe` block: every `PACKS` entry has a table
  entry; every row of `generateProducts(2000, …)` matches the entry for the pack at the end of its
  `name` (longest pack first, so `10kg` is never read as `0kg`); no half-set rows; and R4's SHA-256.
- **`specs/2026-09-23-p877-generated-net-content/verify-generated-net-content.ts`** — read-only R8
  script. `--env-file <path>` (default `.env`), `DIRECT_URL ?? DATABASE_URL` exactly like the seed,
  prints the DB host first, then (a)–(d) per vendor for **every** vendor, exit 1 on (b)/(c)/(d) > 0 or
  generated-rows-but-zero-coverage.
- **`docs/developer-portal/env-setup.md`** (1.12.0) — its "re-running is a no-op" bullet is no longer
  true (the first re-run backfills), so it now says so and names the env-var dependency below.
- **`CHANGELOG.md`** — Gate 4 entry under `[Unreleased]` / `Added`.

## Decisions taken during the build

- **R4 literal: `6acab641e19234bd6a2612b057020ae4e93c9fe1748ff5652ec6048f49344424`.** Computed before
  any source edit, from `git show HEAD:prisma/generate-catalogue.ts` written to the scratchpad, by a
  one-off `tsx` script hashing, per row, `JSON.stringify([slug, name, description, categorySlug,
  basePrice, unitLabel, quantity, origin, isHalal, isFresh, isOrganic]) + "\n"` into one SHA-256.
  **The test uses exactly that serialisation**; validation's independent recomputation must too
  (JSON array per row, newline-terminated, field order as listed), or it will get a different hash
  for reasons that have nothing to do with determinism.
- **The backfill regenerates `highestIndex + 1` rows, not `count` rows.** The highest index is
  parsed from existing `gen-<i>-…` slugs. This matches every existing row even if the database was
  seeded with a larger count than the current run requests. It works because neither slug nor pack
  depends on `categorySlugs` (category is round-robin by index and consumes no `rng()`).
- **The unmatched count covers all of the vendor's existing generated rows**, not only the null
  ones. That is the plain reading of R6's "existing generated rows with no matching regenerated
  slug". Expected `0`.
- **One `product.update` per row, sent as array `$transaction`s of 500** (`GENERATED_BATCH`), not a
  loop of 2,000 awaited round-trips and not `updateMany` (which can't write per-row values). Safe
  because the seed runs in real Node on `PrismaNeon` (WebSocket), the same justification the file
  already gives for `createMany`.
- **The update's `where` is `{ id, vendorId, netContentAmount: null }`** (Prisma's extended
  where-unique), so the write itself refuses a row that changed after the read.
- **`Pack of N` rows are skipped by the backfill**, since their table entry is null and there is
  nothing to write. This is what makes a second run report `0` (R7) even though those rows keep a
  null `netContentAmount` forever.
- **The sort key in the backfill uses the row's stored `basePrice`**, not the regenerated one. The
  two are equal for untouched generated rows, and R8(c) checks against the stored price.
- **The DB host is printed before backfill writes**, in the same `>>> … in database host:` form as
  #489 R13, and only when there is at least one row to update.

## Deviations from the spec

None.

## Known-shaky areas

- **The backfill only runs when `SEED_SCALE_PRODUCTS` is set.** It lives inside
  `seedGeneratedCatalogue`, which `maybeSeedGeneratedCatalogue` never calls when the variable is
  unset, and **neither `.env` nor `.dev.vars` sets it** (checked 2026-09-24). So R9's "usual
  `SEED_SCALE_PRODUCTS`" means running it explicitly: dev holds exactly **2,000** Aheed generated
  rows, so use `SEED_SCALE_PRODUCTS=2000`, plus the `SEED_AHEED_HOST`/`SEED_SRIMART_HOST` values
  `env-setup.md` shows. A bare `npm run db:seed` will print **no backfill line at all**, which is
  not an R6/R7 failure but also proves nothing.
- **Nothing has been run live.** The seed was not run at Build. The only live contact was one
  read-only run of the R8 script against dev (host `ep-dry-morning-zab7dx08`, the owner-confirmed
  dev branch; `.env`/`.dev.vars` both point there, distinct from staging `ep-empty-scene` and
  production `ep-young-glitter`). That run was the **pre-seed baseline R9 asks for**: Aheed
  (`a4ed0000-…0001`) had 2,000 generated rows with 0 net content, and every other vendor had 0
  generated rows. (b), (c) and (d) were all 0, and the script exited **1** on the zero-coverage
  branch, as designed.
- **R9's 70–90% band: expected exactly 1,606 of 2,000 (80.3%).** Computed at Build with no database
  from `generateProducts(2000, ["a"])` (category-independent, see above). If the live number after
  the seed differs, the backfill missed rows, even if the percentage is inside the band.
- **R10 is untested and the least certain.** It depends on the existing pack-size facet
  (`lib/repositories/products.ts`, #397) rendering on a category page. Check whether the facet
  needs a minimum number of distinct values before it shows, and whether a generated `1kg` card's
  unit line reads `£… / kg`. Generated products live under **sub**categories.
- **The extended where-unique update** (`netContentAmount: null` in `where`) throws P2025 rather than
  skipping if a row changed between the read and the write, which aborts that batch's transaction.
  That is acceptable for a dev-only seed and is not expected in practice.
- **R8(d) fails on any non-generated product with net content** in the database read. Pre-seed it is
  0 for every vendor. If someone has entered net content on a real dev product via the staff form
  since, (d) trips, and that would be real data, not a #877 bug.
- **Full `npx vitest run` was not run at Build.** Only `tests/generate-catalogue.test.ts` (12/12).
  Typecheck, lint and format:check passed.
