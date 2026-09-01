# Production catalogue seed, cross-environment image copy, and scheduled image fills (validation)

Run from a fresh context. Every row below is a concrete step with an unambiguous pass/fail. Rows
R15/R16 mutate **production** and are the only ones that do; read the warning above them before
running either.

> **Testing strategy.** The pure helpers (`getObject`'s 404/200 handling) get unit coverage. The
> scripts are validated by running them against real environments, because the defects this slice
> is exposed to — a key minted from the wrong environment's product id, a driving query pointed at
> the wrong database, a script that cannot load in Node — are all invisible to a unit test that
> stubs the thing being got wrong.

## Preconditions

- PR #517 is merged to `main` and `deploy-production` has completed. (Confirmed 2026-09-01,
  run `33505735924`, commit `8be2e8a`.)
- `secrets/staging.vars` and `secrets/production.vars` are present in the working checkout.
- **Before any row that touches production**, confirm the host: run the script's own printed
  `database:` line and check it against `secrets/production.vars`. Per `CLAUDE.md`, a
  production-sounding filename is not evidence of the target — only the host is.

| Req | How to verify |
|---|---|
| R1 | Read `lib/storage.ts`: `StorageService` declares `getObject` returning `Promise<ArrayBuffer \| null>` and the object returned by `getStorage()` implements it. Then, against staging: fetch a known existing key and assert `byteLength > 0`; fetch `products/definitely-not-a-real-key/x.webp` and assert the result is `null`. |
| R2 | `npx vitest run tests/storage.test.ts` (or the file the new cases live in) passes, and the file contains a case stubbing a 404 response asserting `null` and a 200 response asserting an `ArrayBuffer`. Confirm no real network call: the test must not read `S3_*` credentials. |
| R3 | `npx tsx scripts/copy-product-images.ts` with no flags, then with only `--from secrets/staging.vars`. Both exit non-zero and print a usage line naming `--from` and `--to`. |
| R4 | Run the copy script with both flags and read the first lines of output: source and destination `database:` (host only) and `bucket:` appear before any copy line. Grep the full output for `postgresql://` and for the value of `S3_SECRET_KEY` — both must return nothing. |
| R5 | `npx tsx scripts/copy-product-images.ts --from secrets/staging.vars --to secrets/staging.vars` exits non-zero, prints a same-bucket refusal, and reports 0 copied. |
| R6 | Run the copy script `--from secrets/staging.vars --to secrets/production.vars`. Confirm `p5b-validation-fixture` appears **nowhere** in its output. Then query production: `SELECT count(*) FROM "Product" WHERE slug = 'p5b-validation-fixture'` returns `0`. |
| R7 | From the copy run's output, take one copied product. Query production for its product id and its new `storageKey`; assert the key is `products/<that production id>/<uuid>.webp`. Query staging for the same slug's key and assert the two keys differ. |
| R8 | For that same product in production: `SELECT count(*) FROM "ProductImage" WHERE "productId" = <id> AND "isPrimary" = true` returns `1`; that row's `storageKey` is the new key; and no row remains for that product whose `storageKey` ends `/main.svg`. |
| R9 | Re-run the identical copy command. It reports `0` copied. Re-run the R8 queries and confirm the product's image row id and `storageKey` are unchanged from the first run. |
| R10 | `npx tsx scripts/fill-product-images.ts` with no `--env-file` exits non-zero with a usage line. With `--env-file secrets/staging.vars --limit 2`, at most 2 products are processed and the host/bucket lines print first. Read the source: the default limit constant is a finite number `<= 25`. |
| R11 | `grep -nE "products-service\|lib/db\|@prisma/client/wasm" scripts/fill-product-images.ts` returns nothing. Read the file and confirm the `PrismaClient` import is the bare `@prisma/client` specifier and that the client is passed as an argument to each repository call. |
| R12 | `npx tsx scripts/fill-product-images.ts --env-file secrets/staging.vars --limit 0`; assert exit code 0 and that no image was generated. This is the row that proves the script loads in real Node — a WASM-query-compiler failure surfaces here as `Unknown file extension ".wasm"`. Redirect to a file and read it; do **not** pipe through `head` (`CLAUDE.md`: SIGPIPE can kill the writer before its cleanup runs). |
| R13 | Read the new workflow file: it declares both `schedule:` (with a cron expression) and `workflow_dispatch:`, invokes `scripts/fill-product-images.ts` with an explicit `--limit`, and sources config from `secrets.*` in a declared `environment:`. Then trigger it once via `gh workflow run <file>` and confirm the run completes successfully. |
| R14 | `git diff origin/staging -- prisma/seed.ts` produces no output. |
| R15 | **MUTATES PRODUCTION.** Confirm the resolved host matches `secrets/production.vars` first. Run the seed against production's `DIRECT_URL` with `SEED_SCALE_PRODUCTS` unset and both `SEED_*_HOST` set to the production hosts. Then query production: at least 29 non-`gen-` products; the four previously-missing Aheed top-level categories present; `count(*)` of categories with a non-null `parentId` is `>= 31`; and `SELECT count(*) FROM "Product" WHERE slug LIKE 'gen-%'` returns `0`. |
| R16 | **MUTATES PRODUCTION.** After R15 and the R6 copy run, query production for products whose image rows are all placeholders — expect `0`. Then for each of the eight named slugs, resolve its primary `storageKey` and run `curl -I "${CDN_BASE_URL}/${key}"` against **production's** `CDN_BASE_URL`, asserting `200`. Per `CLAUDE.md`, verify against the CDN of the environment that serves it — a key returning 200 in staging proves nothing about production. |
| R17 | `git diff origin/staging -- CHANGELOG.md` shows an entry for this slice referencing #518. |
| R18 | `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run format:check` all exit 0. CI on the PR is the authority, not local output. |

## Notes for the validator

- **R12 is the load-bearing row for the scheduled job.** The whole reason the fill script takes an
  explicit Prisma client is that `lib/db`'s `@prisma/client/wasm` import cannot load in Node. If
  R12 passes, the GitHub Actions path works; if it fails, the workflow would fail identically on
  its first scheduled run with nobody watching.
- **R7 is the load-bearing row for the copy.** A copy that reuses the source key would still
  "succeed" and write rows — it would simply point production at objects that do not exist there.
  Comparing the two environments' keys and asserting they differ is what catches that.
- The copy's expected count on first run is **8**. A materially different number means either the
  seed did not add what R15 expects, or the driving query is pointed at the wrong database.
