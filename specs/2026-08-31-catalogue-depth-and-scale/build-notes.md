# Catalogue depth and scale (build notes)

Written at the end of Build, before the Clear. Closes **#489**.

## What changed and why

**`prisma/generate-catalogue.ts` (new).** A pure generator: given a count and a list of category
slugs, it returns plain data. No Prisma, no storage, no `process.env`, no I/O of any kind.

The reason it is a separate module rather than a function inside `prisma/seed.ts` is the single
most important thing in this slice, and it is not visible from the code: **`prisma/seed.ts` calls
`main()` at module scope.** Importing it from anywhere therefore runs the entire seed against
whatever database the environment resolves. A determinism test that imported the generator from
`seed.ts` would have seeded a real database as a side effect of `npx vitest run`. That hazard was
found during the spec's adversarial pass, not at Build, and R6b exists to pin it.

Determinism comes from a seeded mulberry32 PRNG rather than `Math.random()`, because the generated
catalogue is the substrate for a latency measurement now recorded in `nfr-baseline.md`. A
measurement taken against data nobody can reproduce is an anecdote. `GENERATOR_SEED` is committed
and changing it invalidates any previously recorded figure — the constant's docstring says so.

**`prisma/seed.ts`.** Four changes, each answering a specific way the existing code fails at 2,000
rows rather than being a general tidy-up:

- **31 subcategory fixtures** (27 Aheed across its 9 departments, 4 SriMart across its 2), created
  by a new `seedSubcategories` pass. It is a *separate* pass, called from `main()` rather than
  folded into `seedCatalogue`, because `seedCatalogue` returns early when every top-level category
  already exists — folding children in would mean a database seeded before this slice never gains
  them. Idempotency here is keyed on the **child's** slug, not the parent's: "does this department
  exist?" and "does this subcategory exist?" are different questions with different answers.
- **One image object per subcategory, not per product.** `refreshProductImages` and `seedCatalogue`
  each call `putObject` once per product with the *same* placeholder SVG bytes; at 2,000 that is
  2,000 identical uploads, and `refreshProductImages` runs unconditionally on **every** seed run.
  Generated products now share one key per subcategory (27 objects for 2,000 products).
  `refreshProductImages` deliberately still iterates only the curated fixture, which is why a second
  scaled run uploads 21 objects rather than 48.
- **`createMany` in three passes** (products, images, inventory) with ids minted up front, replacing
  a per-product `create` with nested `images`/`inventory`. Safe **here specifically** and worth
  stating plainly: the seed runs in real Node on the WebSocket adapter (`PrismaNeon`), whereas #382
  records that `createMany`/`updateMany` crash unconditionally through `getPrisma()`'s HTTP adapter
  with "Transactions are not supported in HTTP mode". This is not a precedent for repository code.
- **Its own idempotency check**, keyed on the generated slug prefix, plus a `SEED_REMOVE_GENERATED`
  path and a resolved-host print before the first generated write (R13).

**`scripts/measure-catalogue-queries.ts` (new).** Query-level harness plus the catalogue-shape
summary that makes R1-R5, R8, R11 and R12 checkable from one command. Deliberately **not** an
extension of `scripts/measure-nfr.ts`: that file's docstring makes it HTTP-only ("no Prisma, no
repository imports, no session cookie, no database credential") as the reason it can run from a
clean checkout, and P7d's R4/R6 depend on it. Adding Prisma imports there would have revoked that
silently.

**`docs/developer-portal/nfr-baseline.md`.** New dated section; the existing tables are untouched,
and the new section says explicitly that the older figures were taken at `Product` = 22.

**`docs/developer-portal/env-setup.md`.** Documents the two new env vars.

## Decisions taken during the build

- **Dev `VendorDomain` hosts: `localhost:8787` and `srimart.localhost:8787`.** `env-setup.md`
  documents a staging and a production host pair but **no dev pair**, and neither `SEED_AHEED_HOST`
  nor `SEED_SRIMART_HOST` was set in `.env` or `.dev.vars` — so SriMart had never been seeded into
  the dev branch at all, and R2/R12 would have had nothing to measure. Picked the local preview
  origin for Aheed and a distinct subdomain for SriMart, reachable under `npm run preview` with a
  `Host:` header (the pattern `CLAUDE.md` already uses for SriMart checks). Now written into
  `env-setup.md` so the next person does not re-derive it.
- **The dev database was completely empty** — 0 products, 0 categories — before this slice, so the
  "curated scale" column in `nfr-baseline.md` is a measurement I created by running the curated seed
  first, not a pre-existing state I found. Sequence was: measure empty, seed curated, measure, seed
  generated, measure.
- **Batch size 500** for `createMany`. 2,000 rows in one statement is a needlessly large single
  query; 500 makes it four statements per table instead of 2,000 inserts.
- **Round-robin category assignment** rather than random, so every subcategory is populated
  regardless of `count` and per-category timings stay comparable.
- **Generated content is deliberately generic grocery vocabulary** ("Everyday Rice 5kg"), not
  anything resembling real Aheed or SriMart merchandising. A generated row that reads like genuine
  vendor copy is exactly the confusion #239 was filed over. `origin` includes `null` in its pool and
  ~8% of rows are out of stock, so the nullable-origin and `inStockOnly` paths have something to
  discriminate on.
- **Left the dev database in the scaled state** (2,018 Aheed products) after proving the removal
  path, so the recorded measurement and the database agree, and so the follow-on chrome slice
  (#394/#395) has realistic data.

## Deviations from the spec

- **R15 was amended at Build, in `requirements.md` itself, because it was unsatisfiable as
  written.** It forbade any change under `app/`, `components/`, `features/` or `lib/`. But adding
  this slice's own `plan.md` makes it a countable KMS artifact, so `npm run kms:build-index` is
  mandatory (the `gates` workflow fails on a stale index), and that rebuild writes
  `app/(admin)/staff/runbook/docs.ts`. The requirement now permits exactly that one **generated**
  file, and its validation row asks the validator to confirm it is generated rather than
  hand-edited by re-running the build and checking for no further churn. The requirement's intent —
  no application *logic* changes, which is what makes the measure-do-not-fix posture checkable — is
  unchanged and still holds.
- **No other deviation.** In particular, the stronger safety control I considered and did **not**
  build is recorded as #490 rather than added quietly: `scripts/verify-repository-injection.ts`
  refuses outright to run against a host named in `secrets/staging.vars`/`secrets/production.vars`,
  which is a better control than R13's print-and-trust-a-human. R13 is implemented exactly as
  specified.

## Known-shaky areas

- **The measurement is noisier than it looks, and one number is actively misleading if read
  casually.** `listProducts` came out **faster** at ~100x the rows (p95 75.2 ms to 61.0 ms). That is
  not an improvement — it is Neon round-trip and autoscaling variance dominating query cost, the
  same caveat the pre-existing tables carry. The write-up says so, but a validator re-running the
  harness should expect figures that move by tens of percent between runs and should **not** treat a
  difference from the recorded numbers as a regression. Only product search (`scan`, +27%) showed
  signal above that noise.
- **`listOrdersForUser` was never measured, at either scale** — the dev branch holds no `Order` rows
  with a `userId`. It is recorded as "not measurable" rather than omitted, but R17 asks for seven
  paths and only six have numbers. That is the single weakest row in the whole slice.
- **R2's "slugs disjoint from Aheed's" is enforced by convention, not by code.** SriMart's
  subcategory slugs carry a `sri-` prefix as its existing fixtures do; nothing fails if a future
  editor forgets. `Category` is uniquely indexed on `(vendorId, slug)`, so a collision across
  vendors is legal at the database level.
- **The generated set has only ever been exercised at exactly 2,000.** `SEED_SCALE_PRODUCTS` accepts
  any non-negative integer, and the unit test covers 0/1/2000, but no other value has touched a real
  database. A value larger than a few thousand may want a bigger `GENERATED_BATCH`.
- **Nothing here has been through `npm run preview`.** This slice renders no page and touches no
  Worker request path, so that is deliberate (the validation notes say so) — but it does mean the
  2,000-product catalogue has not been viewed through the actual storefront. If the follow-on chrome
  slice finds a page that degrades at scale, it will be the first thing to look at, and it is not
  something this slice's numbers would have caught.
- **`lib/repositories/orders.ts` value-imports `@/lib/db`** (unlike `products.ts`/`categories.ts`,
  which use `import type`). Probed empirically at Build: importing it in Node works, because the
  WASM query compiler loads lazily at client construction rather than at import. But
  `scripts/verify-repository-injection.ts` never imports `orders.ts`, so this harness is the first
  thing to exercise that module outside a request — a thin margin worth knowing about if it starts
  failing with `ERR_UNKNOWN_FILE_EXTENSION`.
