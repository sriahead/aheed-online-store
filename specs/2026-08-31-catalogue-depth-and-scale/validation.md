# Catalogue depth and scale — validation

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

This slice is **seed, scripts and docs only** — no application code, no schema change. Its risk is
therefore not in rendered UI but in (a) writing thousands of rows to the wrong database, (b) a seed
that is slow, non-idempotent or non-deterministic, and (c) a recorded measurement that is not
reproducible. The rows below are weighted accordingly: the live rows dominate, and two of them exist
purely to prove the target database was the intended one.

## Preconditions — run these BEFORE anything else

**P0 — Confirm the target database is the dev branch.** `CLAUDE.md` records that `.env` and
`.dev.vars` have previously agreed with each other while **both pointed at production** (the P5a
incident, where a migration reached the production database ahead of its promotion PR). A
"staging-sounding" filename is not evidence. Before any seed run:

1. Print the **host only** from `.env` and `.dev.vars` — use an anchored pattern such as
   `^DATABASE_URL` / `^DIRECT_URL`, never a bare `BASE_URL` filter, which also matches
   `DATABASE_URL` and prints the password (`#175`).
2. Diff both against `secrets/staging.vars` and `secrets/production.vars`.
3. Proceed only if the resolved host matches the **dev** entry and matches neither staging nor
   production.

**P1 — This slice writes roughly 2,000 rows.** If P0 does not resolve cleanly, stop and report;
do not guess.

**P2 — Set both `SEED_AHEED_HOST` and `SEED_SRIMART_HOST` before seeding.** `#276` made SriMart seed
only when *both* are present, and `prisma/seed.ts` **warns rather than fails** when
`SEED_SRIMART_HOST` is missing — leaving a database that looks correctly seeded while holding one
vendor. Every row below naming a SriMart count depends on this. Note that the dev database was
recorded as holding a single active vendor and zero `VendorDomain` rows as recently as the
2026-08-31 rate-limit slice, so do not assume SriMart is already present.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Integration | On a clean dev database run `npm run db:seed`, then `npx tsx scripts/measure-catalogue-queries.ts`. Its catalogue-shape summary (R16b) reports Aheed `topLevelCategories = 9` and `subCategories >= 27`. Read `prisma/seed.ts`: every Aheed subcategory fixture names a parent that is one of the nine departments. |
| R2  | Integration | Same summary reports SriMart `topLevelCategories = 2` and `subCategories >= 4`. Confirm SriMart category slugs are disjoint from Aheed's — the summary lists both vendors' slugs, or compare the two fixture arrays in `prisma/seed.ts` directly. |
| R3  | Integration | The same summary reports `categoriesDeeperThanTwoLevels = 0` for both vendors. |
| R4  | Integration | On a clean dev database, with `SEED_SCALE_PRODUCTS` unset, run `npm run db:seed` then the shape summary: Aheed `totalProducts = 18`, SriMart `totalProducts = 3`, and `generatedProducts = 0` for both. |
| R5  | Integration | On a clean dev database, `SEED_SCALE_PRODUCTS=2000 npm run db:seed`, then the shape summary: Aheed `totalProducts = 2018` and `generatedProducts = 2000`. The summary also reports that every generated product has exactly one primary image and exactly one inventory row (counts equal to 2000 for each). |
| R6  | Unit | A test under `tests/` asserts the generator is deterministic: calling the exported generation function twice with the same seed value returns arrays that are deeply equal on `(slug, name, basePrice, origin, isHalal, isFresh, isOrganic, quantity)` and on category assignment. Separately, `grep -n "Math.random" prisma/generate-catalogue.ts prisma/seed.ts` returns no hit inside the generated path. |
| R6b | Unit | Read the R6 test's imports: it imports the generator module and **not** `prisma/seed.ts`. Confirm the hazard is real and avoided — `tail prisma/seed.ts` shows a bare top-level `main()` call, so importing it from a test would run the whole seed. `npx vitest run` completes without any seed output (no `seeded N categories` line) and without touching the database. |
| R7  | Integration | Read `prisma/seed.ts` for the documented prefix constant. Then, after an `SEED_SCALE_PRODUCTS=2000` run, execute the documented removal path and re-run the shape summary: Aheed `totalProducts = 18`, `generatedProducts = 0`, SriMart `totalProducts = 3`, and both vendors' category counts unchanged from R1/R2. |
| R8  | Integration | The shape summary reports `distinctGeneratedStorageKeys <= 40`. For each such key, the harness (or a manual `GET` against `${CDN_BASE_URL}/${key}`) confirms the object exists. Note: `.svg` is used, which per `CLAUDE.md` is **not** subject to the CDN hotlink 403 that blocks raster assets under a localhost referer. |
| R9  | Integration | Record the seed's printed total `putObject` count for a clean run with `SEED_SCALE_PRODUCTS` **unset**, then for a clean run at `SEED_SCALE_PRODUCTS=2000`. The second exceeds the first by **at most 40**. Run the seed a third time over the already-seeded database: the generated pool adds no further uploads. No figure is anywhere near 2,000. Also confirm by reading the code that `refreshProductImages` never iterates the generated set. |
| R10 | Unit | `grep -n "product.create(" prisma/seed.ts` shows occurrences only inside the curated path; the generated path shows `createMany` for products, images and inventory. A reviewer reads the generated function to confirm no per-product create remains. |
| R11 | Integration | With the database already seeded at `SEED_SCALE_PRODUCTS=2000`, run `SEED_SCALE_PRODUCTS=2000 npm run db:seed` a second time. The shape summary afterwards reports Aheed `totalProducts = 2018`, identical to the first run. |
| R12 | Integration | In the same `SEED_SCALE_PRODUCTS=2000` run used for R5, the shape summary reports SriMart `totalProducts = 3` and `generatedProducts = 0`. |
| R13 | Integration | Capture the seed's stdout for a `SEED_SCALE_PRODUCTS=2000` run. It contains a line naming the resolved database host before the first generated write. Confirm that line contains no `:` -delimited password segment and is not a full connection string — inspect the literal printed line, do not infer from the code. |
| R14 | Regression | `git diff --stat <base>...HEAD -- prisma/schema.prisma` is empty, and `git diff --name-only <base>...HEAD -- prisma/migrations/` lists nothing. |
| R15 | Regression | `git diff --name-only <base>...HEAD` lists no path beginning `app/`, `components/`, `features/` or `lib/`. |
| R16 | Unit | The file `scripts/measure-catalogue-queries.ts` exists. Read it: it imports `PrismaClient` from the bare `@prisma/client` specifier (not `@prisma/client/wasm`, which real Node cannot load — see `CLAUDE.md`), constructs its own client, and passes it as the first argument to each repository function. It contains no import from `@/lib/db`. |
| R16b | Integration | `npx tsx scripts/measure-catalogue-queries.ts > shape.txt` then read `shape.txt`: it opens with a per-vendor summary containing every field named in R16b, including `generatedWithExactlyOnePrimaryImage` and `generatedWithExactlyOneInventoryRow` (both `2000` after an R5 run). **Do not pipe through `head`** — that can SIGPIPE the writer before its cleanup runs, the `#411`/`#412` lesson. |
| R17 | Performance | The same run prints p50 and p95 for all seven named read paths, plus a sample count, with a warm-up sample excluded. Confirm all seven appear by name in the output. |
| R18 | Regression | `docs/developer-portal/nfr-baseline.md` contains a new dated section with both-scale figures for all seven paths. `git diff <base>...HEAD -- docs/developer-portal/nfr-baseline.md` shows only additions — the existing "Summary against the targets", "API latency" and "Index and query review" tables have no modified lines. |
| R19 | Security | The new section names the Neon endpoint host. Compare it against `secrets/staging.vars` and `secrets/production.vars`: it matches neither, and matches the dev entry. This is the recorded counterpart to precondition P0. |
| R20 | Performance | For each of the seven paths the new section states meets/breaches against `API p95 < 400ms`. If any path breaches, confirm the named issue exists via `gh issue view <n>`. If none breaches, the section says so explicitly. **A breach is a valid outcome of this slice, not a failure** — remediation is out of scope per `plan.md`. |
| R21 | Regression | `git diff <base>...HEAD -- CHANGELOG.md` is non-empty and describes this slice (Gate 4). |
| R22 | Regression | `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run format:check` — all four pass. CI on the PR is the authority, not local output. |

## Notes for the validating context

- **Do not run any of this against staging or production.** Precondition P0 exists because the
  failure mode is silent and has happened here before.
- **`npm run preview` is not required for this slice** and is not the right tool for it: nothing here
  renders a page or touches a Worker request path. The seed and both harnesses run in real Node, which
  is exactly why the repository functions take `prisma` explicitly.
- **`sdd:audit` will report this slice's own roadmap row as missing.** That is expected and is not a
  failure: `/validate` runs before Ship, and the roadmap row is written at Document (final). The
  carry-forward row this slice's branch **should** carry is the one for **promotion PR #488**, which
  `sdd:audit` currently reports as pending.
- If a generated-catalogue run leaves partial data behind after an interrupted seed, use R7's removal
  path before re-running rather than hand-deleting rows.
