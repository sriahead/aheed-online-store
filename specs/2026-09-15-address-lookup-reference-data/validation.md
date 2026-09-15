# Address lookup — reference-data framework, Code-Point Open, OS Open Names (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Every feature should have appropriate **Unit** and **Integration** testing, followed by relevant validation testing. Broader testing mainly happens before release. However, testing is risk-based: features involving auth, payments, UI changes, performance-sensitive APIs, databases, or external dependencies require additional relevant testing earlier.

1. **Unit Testing** — *Every feature.* Isolated business logic, utilities, components.
2. **Integration Testing** — *Every feature.* The component with its immediate dependencies.
3. **System / End-to-End Testing** — *Critical journeys and validation testing.*
4. **Regression & Acceptance Testing** — *Before release, or when changing core flows.*
5. **Performance & Resilience Testing** — *Before release, or for performance-sensitive APIs.*
6. **Security & Accessibility Testing** — *Before release, or earlier for auth/payments/UI changes.*

---

## Before you start

These steps apply to every row below. A validator with no memory of the build needs all of them.

1. **Use `npm run preview`, never `npm run dev`, for anything touching the database or the
   Workers runtime.** Plain `next dev` runs in real Node, which cannot load
   `@prisma/client/wasm`'s query engine, so a DB-touching route silently renders an error state
   with no crash and no obvious signal.
2. **Do not hardcode a local vendor hostname.** Query the database this preview is actually
   connected to for its real host values before writing any `curl -H "Host: …"` command:
   `npx tsx` a short script calling `prisma.vendorDomain.findMany()`, or read them from the seed.
   A documented hostname that is not in *this* database silently redirects to `/coming-soon` with
   no error, which is indistinguishable from the feature being broken.
3. **For a multi-label local host (e.g. `srimart.localhost`), do not rely on `curl -b`/`-c`.**
   The cookie jar can silently fail to persist a `Secure` cookie for such a host, leaving an empty
   jar and a fresh guest identity on every request. Extract the value from the `Set-Cookie`
   response header and pass it back explicitly with `-H "Cookie: …"`.
4. **Never pipe a live-writing script's stdout through `head`.** Closing the pipe early can kill
   the writer before its own cleanup runs, leaving fixture rows behind. Redirect to a file and read
   the file.
5. **Do not run `npx vitest run` alongside, or immediately after, a heavy build.** A shortfall in
   the reported `Test Files` total is the tell; re-run it alone before treating a result as real.
6. When a `grep` row below asserts an **absence**, the pattern is already anchored or filtered to
   avoid matching a comment, a docstring, or the generated `app/(admin)/staff/runbook/docs.ts`
   bundle that quotes this very spec. Do not loosen it.
7. **Two vendors matter here.** Delivery eligibility is per-vendor, so rows R40 and R45 must be run
   against both seeded vendors, using the hosts resolved in step 2.

Run the reference-data sync against the dev database once before the integration rows:
`npx tsx scripts/sync-reference-data.ts --env-file .env --source code-point-open > sync-cp.log`
then the same for `--source os-open-names`, and read each log file.

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1 | Unit | `grep -n "model ReferenceDataset" -A 20 prisma/schema.prisma` lists `sourceKey`, `displayName`, `sourceVersion`, `sourceChecksum`, `lastCheckedAt`, `lastSyncedAt`, `recordCount`, `refreshFrequencyDays`, `isActive`, `syncStatus`, `syncError`, `cacheVersion`, and shows no `vendorId`. |
| R2 | Unit | `grep -n "model ReferenceDataSyncRun" -A 18 prisma/schema.prisma` lists `datasetId`, `sourceVersion`, `startedAt`, `finishedAt`, `inserted`, `updated`, `retired`, `unchanged`, `status`, `errorMessage`. |
| R3 | Unit | `grep -n "enum ReferenceSyncStatus" -A 6 prisma/schema.prisma` shows `IDLE`, `RUNNING`, `SUCCEEDED`, `FAILED`. |
| R4 | Unit | `grep -n "model PostcodeReference" -A 20 prisma/schema.prisma` lists every field named in R4, shows `@@index` on `postcodeDistrict`, and shows no `vendorId`. |
| R5 | Unit | `grep -n "model PlaceReference" -A 22 prisma/schema.prisma` lists every field named in R5, shows a composite `@@index` including `postcodeDistrict`, and shows no `vendorId`. |
| R5a | Unit | `grep -nE "queryRaw\|executeRaw\|\\\$raw" lib/repositories/places.ts` returns nothing. `npx vitest run tests/places-repository.test.ts` exits 0, including direct calls to the exported distance function asserting a corner of the bounding box beyond 250 metres is discarded. |
| R6 | Unit | `grep -n "model CustomerAddress" -A 20 prisma/schema.prisma` shows required `vendorId` and `userId`, every field named in R6, and `@@index([vendorId, userId])`. |
| R6a | Security | `npx vitest run tests/customer-addresses-repository.test.ts` exits 0, including a case seeding a `CustomerAddress` for vendor A and asserting a read scoped to vendor B returns zero rows, and one asserting a read for user X excludes user Y's row. `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts tests/repository-vendor-scoping.test.ts` exits 0. |
| R7 | Integration | `git diff origin/staging -- prisma/schema.prisma` shows no change inside `model Address`; `grep -n "address.create" lib/repositories/orders.ts` returns exactly one hit, inside `placeOrder`'s `tx` block. |
| R8 | Integration | `git status --short prisma/migrations/` shows exactly one new directory. `grep -rn "DROP INDEX" prisma/migrations/<new-dir>/migration.sql` returns no line naming `Order_orderNumber_trgm_idx`, `Order_guestEmail_trgm_idx` or `User_email_trgm_idx`. `npx prisma migrate status` prints that the database schema is up to date. |
| R9 | Unit | `npx vitest run tests/postcode-normalisation.test.ts` exits 0, including cases asserting `"mk9 2nw"`, `" MK9  2NW "` and `"MK92NW"` all normalise to `"MK92NW"` and that `"MK92NW"` formats to `"MK9 2NW"`. `grep -nE "^import .*(@prisma/client\|next/headers\|node:fs)" lib/postcode-normalisation.ts` returns nothing. |
| R10 | Unit | Same test file asserts `postcodeDistrictOf("MK92NW") === "MK9"`, `postcodeAreaOf("MK92NW") === "MK"`, and that both return `null` for `"NOTAPOSTCODE"`. |
| R11 | Unit | `npx vitest run tests/osgb36.test.ts` exits 0, asserting three published reference points convert within 10 metres. `grep -nE "^import " lib/osgb36.ts` shows no third-party package. |
| R12 | Unit | `grep -n "interface ReferenceDataSource" -A 14 lib/reference-data/source.ts` shows `key`, `discoverLatest`, `download`, `parse`, `validate`, `apply`. |
| R13 | Integration | `npx vitest run tests/reference-source-code-point.test.ts` exits 0. Then confirm live and keyless: `curl -s https://api.os.uk/downloads/v1/products/CodePointOpen` returns a JSON body containing `"version"`, with no credential sent. `grep -niE "authorization\|api[-_]?key" lib/reference-data/sources/code-point.ts` returns nothing. |
| R14 | Integration | As R13 against `https://api.os.uk/downloads/v1/products/OpenNames` and `lib/reference-data/sources/open-names.ts`. |
| R15 | Security | `grep -rniE "OS_API\|ORDNANCE\|OS_KEY\|EPC_" lib/reference-data/ scripts/sync-reference-data.ts` returns nothing. |
| R16 | Integration | With both sources already synced, re-run `npx tsx scripts/sync-reference-data.ts --env-file .env --source code-point-open > sync-unchanged.log` and read the file: it reports `inserted=0 updated=0 retired=0`, status `SUCCEEDED`, and states the source was unchanged. Confirm no download occurred (the log names no archive). Query `ReferenceDataSyncRun` for the newest row and confirm the same counts. |
| R17 | Integration | `npx vitest run tests/reference-sync-integrity.test.ts` exits 0, including a case where a downloaded archive whose bytes do not match the published `md5` aborts before any reference row is written. |
| R18 | Integration | Same test file: a parsed dataset below the per-source minimum record count, and one missing a required header column, each abort with no reference row mutated. |
| R19 | Integration | Same test file: a failure injected after download leaves the previously imported rows readable and `cacheVersion` unchanged, and writes a `ReferenceDataSyncRun` with `status = FAILED` and a non-null `errorMessage`. |
| R20 | Integration | Same test file asserts `cacheVersion` increments on success only. Confirm live: note `cacheVersion` before and after the R16 unchanged run — it is identical. |
| R21 | Integration | The second run in R16 is the idempotency check: `inserted`, `updated` and `retired` are all `0`. |
| R22 | Integration | `npx vitest run tests/reference-sync-integrity.test.ts` includes a case where a record present in import 1 and absent from import 2 ends with `isActive = false`, still present in the table, and counted in `retired`. |
| R23 | Integration | `grep -rn "createMany\|updateMany" lib/repositories/` lists the bulk import functions; for each, `graft callers <fn>` shows `scripts/sync-reference-data.ts` and test files only, no `app/`, `features/` or `lib/*-service.ts` caller. `npx vitest run tests/repository-transaction-safety.test.ts` exits 0 — if it times out at 5000ms under full-suite load, re-run that file alone, which is the known `#538` flake, not a failure. |
| R24 | Unit | `grep -n "@prisma/client" scripts/sync-reference-data.ts` shows the bare specifier and no `/wasm`. `npx tsx scripts/sync-reference-data.ts --help` prints usage naming `--env-file` and `--source`. |
| R25 | Integration | `cat .github/workflows/sync-reference-data.yml` shows a `schedule` cron firing monthly, a `workflow_dispatch` trigger, an environment file materialised from `secrets.`, and a removal step guarded by `if: always()`. |
| R25a | E2E | Against the dev database, delete every row from `PostcodeReference` and `PlaceReference` (they are rebuildable cache data by definition — this is the clean-environment test). With `npm run preview` NOT running, run both sync commands and redirect each to a log file; read the logs and confirm both report a non-zero `inserted` count and status `SUCCEEDED`, and that row counts are non-zero afterwards. Confirm `gh workflow run sync-reference-data.yml` is accepted without any deploy workflow running. |
| R25b | Regression | The bootstrap doc exists under `docs/`, names both sync commands verbatim, and states the `UNVERIFIED` degradation. `npm run kms:validate` exits 0. |
| R26 | Security | `grep -rn "postcodes.io\|api.postcodes" app components features lib --include=*.ts --include=*.tsx` returns nothing. `grep -rn "fetch(" lib/address-lookup-service.ts lib/delivery-eligibility.ts` returns nothing. |
| R26a | E2E | With `code-point-open` synced, request `/api/address/lookup?postcode=ZZ99+9ZZ` under `npm run preview` and confirm the body reports the postcode invalid. Then set one real `PostcodeReference` row's `isActive` to `false`, request that postcode, confirm it also reports invalid, and restore the row. |
| R27 | E2E | Under `npm run preview`, set the `code-point-open` dataset row's `lastSyncedAt` to null, then request `/api/address/lookup?postcode=MK9+2NW` **and** `?postcode=ZZ99+9ZZ`; confirm neither reports the postcode as invalid, even though a `PostcodeReference` row exists for the first and not the second. Restore `lastSyncedAt` afterwards. |
| R27a | E2E | In the same `lastSyncedAt`-null state, load `/checkout` in a browser or via `curl`: no postcode validation error is rendered, every address field accepts input, and a full checkout completes and creates an order. Restore `lastSyncedAt` afterwards. |
| R28 | Unit | `npx vitest run tests/delivery-eligibility.test.ts` exits 0, covering all four `status` values. `grep -nE "^import .*(@prisma/client\|next/headers\|@/lib/db)" lib/delivery-eligibility.ts` returns nothing. |
| R29 | Unit | `graft grep "isDeliverable"` (or `grep -rn "isDeliverable" app components features lib --include=*.ts --include=*.tsx`) shows call sites only in `lib/delivery-eligibility.ts`; `components/layout/Header.tsx`, `features/checkout/place-order.ts` and `lib/fulfilment-service.ts` each import the new service instead. |
| R30 | Unit | `npx vitest run tests/address-lookup-service.test.ts` includes a case where `PlaceReference` returns no rows and the result still reports `valid: true` and the same `deliverable` verdict. |
| R31 | Unit | Same test file asserts a road at 240 metres is included and one at 260 metres is excluded, and that a road in a different `postcodeDistrict` is excluded regardless of distance. |
| R32 | Unit | Same test file asserts duplicate names collapse to one, ordering is ascending by distance, and at most 3 entries are returned. |
| R33 | Unit + E2E | Same test file asserts an empty list in all three suppression cases: no qualifying road, a nearest road beyond 200 m, and more than 25 distinct names within 250 m. **Then confirm against real Milton Keynes data** under `npm run preview`, with both datasets synced: request the lookup for a dense central-MK postcode (a `MK9` grid-square unit, where many named boulevards sit within 250 m) and confirm `location.streetSuggestions` is `[]` rather than an arbitrary pick; request it for a sparser outlying unit (e.g. in `MK17`) and confirm any suggestion returned is a street genuinely at that location. Record both postcodes and both responses in the build notes — a misleading hint is the failure this row exists to catch, and it is only visible against real data. |
| R34 | Unit | `grep -n "interface AddressLookupProvider" -A 12 lib/address-lookup-provider.ts` and `grep -n "AddressCandidate" -A 14 lib/address-lookup-provider.ts` show only the fields named in R34. |
| R35 | Unit | `npx vitest run tests/address-lookup-provider.test.ts` exits 0, asserting the null provider resolves to `[]` and that it is the configured provider. |
| R36 | E2E | Under `npm run preview`, for each of `MK9 2NW`, `MK14 6GD` and `SW1A 1AA`, `curl -s "http://127.0.0.1:8787/api/address/lookup?postcode=…" -H "Host: <resolved host>"` returns a body whose `addresses` is `[]`. |
| R37 | Integration | The same responses contain all six keys, with `manualEntryAvailable` true in each. |
| R37a | Integration | Pipe the `MK9 2NW` response through `node -e` and print `Object.keys(body.location).sort()`; it equals `county,district,latitude,longitude,streetSuggestions,town`. Confirm `latitude` is near `52.0` and `longitude` near `-0.76` (WGS84 degrees, not a six-figure grid value), and that every entry of `streetSuggestions` is a plain string. |
| R38 | Security | Pipe each response through `grep -cE "sourceVersion\|eastings\|northings\|localType\|sourceId\|datasetId\|cacheVersion\|vendorId\|userId"` and confirm `0`. |
| R39 | Security | `curl -s -o /dev/null -w "%{http_code}" ".../api/address/lookup"`, the same with `?postcode=!!!`, and the same with a 500-character `postcode` value, all return `400`. `grep -n "api.os.uk" app/api/address/lookup/route.ts` returns nothing. Read the handler and confirm the shape/length rejection precedes every repository call. |
| R40 | E2E | Run the same lookup against **both** vendor hosts resolved in "Before you start" step 2, using a postcode inside one vendor's `VendorDeliveryArea` and outside the other's, and confirm the two responses report different `deliverable` values. |
| R41 | E2E | Under `npm run preview`, on `/checkout`, enter `MK9 2NW` and trigger the lookup; the `city` input is populated and the `line1` and `line2` inputs are empty and editable. |
| R42 | E2E | On the same form, type a value into `city`, then run the lookup again with a different postcode; the typed `city` value is not overwritten. |
| R43 | E2E | Signed in, complete a checkout confirming the address. Query the dev database: one new `CustomerAddress` row exists for that `vendorId`/`userId`, and the order's own `Address` snapshot row also exists and is a different row. |
| R43a | Integration | After R43, record the order's `Address` row and its `Order` row. Edit the `CustomerAddress` row's `line1` and `postcode`, then delete it. Re-read the `Address` and `Order` rows and confirm every field is byte-identical to what was recorded, and that the order still resolves to its original delivery address. |
| R44 | E2E | Return to `/checkout` as the same signed-in customer: the saved address is offered; selecting it fills every address field. Confirm via the preview Worker's log query endpoint that no lookup was performed to reconstruct the fields. |
| R45 | E2E | Remove the matching `VendorDeliveryArea` prefix for that vendor, reload `/checkout`, select the saved address, and confirm a refusal is surfaced rather than the order proceeding. Restore the prefix afterwards. Repeat against the second vendor host. |
| R46 | Security | After R43, query `PostcodeReference` and `PlaceReference` for the customer-entered `line1` value and confirm zero rows. Confirm the R36 responses still show `addresses: []`. |
| R47 | Integration | `npx tsx scripts/verify-data-rights.ts > data-rights.log` (do not pipe through `head`) and read the file: the export includes the `CustomerAddress` row and the erasure path removes it. |
| R48 | E2E | Under `npm run preview`, on `/staff/storefront` as a vendor ADMIN, enter a postcode and confirm the town/county fields populate and that no delivery-eligibility verdict is rendered. |
| R49 | Unit | `ls lib/postcodes-api.ts features/checkout/postcode-lookup.ts tests/postcodes-api.test.ts` reports all three missing. For the absence check, match **imports**, not prose: `grep -rnE "^import .*(postcodes-api\|postcode-lookup)" app components features lib tests --include=*.ts --include=*.tsx` returns nothing. A bare substring grep legitimately matches two things that are not references — `app/(admin)/staff/runbook/docs.ts`, the generated KMS bundle that embeds CLAUDE.md's own text, and `features/checkout/address-lookup.ts`'s docstring explaining what it replaced. Exclude both rather than loosening the anchor. |
| R50 | Regression | `grep -n "Code-Point\|EPC" specs/architecture.md` shows the reference-data framework, Code-Point as the postcode-validity authority, and the EPC rejection with the AddressBase/PAF reason. `npm run kms:validate` exits 0. |
| R51 | Regression | `npx vitest run` alone (not alongside a build) prints `Test Files` and `Tests` totals that match the numbers recorded in `CLAUDE.md`. |
| R52 | Regression | `git diff origin/staging -- CHANGELOG.md` shows this slice's entry. |
| R53 | Regression | `npm run lint`, `npm run typecheck`, `npm run test` and `npm run format:check` each exit 0, **and** `npm run preview` completes its `opennextjs-cloudflare build` step — `next build` alone does not run the Cloudflare adapter and so proves nothing about deployability. CI on Linux is the authority, not local output. |
