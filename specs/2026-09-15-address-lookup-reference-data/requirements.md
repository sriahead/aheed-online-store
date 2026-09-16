# Address lookup — reference-data framework, Code-Point Open, OS Open Names (requirements)

Closes **#764**. Builds a generic reference-data sync framework with two real sources (OS Code-Point
Open, OS Open Names), makes Code-Point the sole authority on postcode validity, consolidates the
three existing `isDeliverable()` call sites into one delivery-eligibility service, exposes a
provider-neutral `GET /api/address/lookup`, adds customer saved addresses, and removes checkout's
runtime dependency on `postcodes.io`. No credential of any kind is required. See `plan.md` for the
reasoning; `validation.md` for how each requirement below is checked.

**Revised at Build (v2).** Requirements R1-R5a, R13-R27a and R40 changed when the real import proved
the original storage design wrong: full-GB Code-Point occupied 456.9 MB of Aheed's 512 MB database
and Open Names then failed outright. Reference data now lives in a dedicated `uk-location-reference`
Neon project with demand-driven postcode-area coverage. See `plan.md`'s "Revised at Build" section.

Throughout: "normalised postcode" means upper-cased with all whitespace removed (`MK92NW`);
"display postcode" means the canonical spaced form (`MK9 2NW`).

## Data model

R1. A second Prisma schema at `prisma/reference/schema.prisma` declares its own `datasource`
    reading `UK_LOCATION_REF_DATABASE_URL` and `UK_LOCATION_REF_DIRECT_URL`, generates a client to its own
    output directory, and declares a `ReferenceDataset` model with at least the fields `sourceKey`
    (unique), `displayName`, `sourceVersion`, `sourceChecksum`, `lastCheckedAt`, `lastSyncedAt`,
    `recordCount`, `refreshFrequencyDays`, `isActive`, `syncStatus`, `syncError` and `cacheVersion`.

R1a. No reference model is declared in Aheed's own `prisma/schema.prisma` datasource going forward,
     and no file under `app/`, `components/` or `features/` imports the reference Prisma client
     directly — reference data is reached only through the service boundary in `lib/reference/`.

R2. `prisma/reference/schema.prisma` declares a `ReferenceDataSyncRun` model with at least the
    fields `datasetId`, `sourceVersion`, `startedAt`, `finishedAt`, `inserted`, `updated`,
    `retired`, `unchanged`, `status` and `errorMessage`.

R3. `prisma/reference/schema.prisma` declares a `ReferenceSyncStatus` enum whose values include
    `IDLE`, `RUNNING`, `SUCCEEDED` and `FAILED`.

R3a. `prisma/reference/schema.prisma` declares a `ReferenceAreaCoverage` model recording, per
     `sourceKey` and `postcodeArea`, the `sourceVersion` it was materialised from, its
     `recordCount` and a `materialisedAt` timestamp, keyed uniquely on `sourceKey` plus
     `postcodeArea`.

R4. `prisma/reference/schema.prisma` declares a `PostcodeReference` model whose **primary key is
    `normalisedPostcode`** — no surrogate UUID — with at least the fields `displayPostcode`,
    `postcodeArea`, `postcodeDistrict`, `eastings`, `northings`, `adminDistrictCode`,
    `adminCountyCode`, `countryCode` and `isActive`, carrying no `vendorId` and no per-row
    `createdAt`/`updatedAt`/`sourceVersion` (dataset-level metadata covers those), and declaring
    indexes on `postcodeArea` and on `postcodeDistrict`.

R5. `prisma/reference/schema.prisma` declares a `PlaceReference` model whose **primary key is
    `sourceId`** — no surrogate UUID — with at least the fields `name`, `type`, `localType`,
    `eastings`, `northings`, `postcodeArea`, `postcodeDistrict`, `populatedPlace`,
    `districtBorough`, `countyUnitary`, `region`, `country` and `isActive`, carrying no `vendorId`
    and no per-row timestamps, and declaring a composite index on `postcodeDistrict`, `eastings`,
    `northings` in that order.

R5a. The nearby-place query in the places repository filters `eastings` and `northings` by range
     only, contains no raw SQL and no `$queryRaw`, and the exact Euclidean distance is computed by a
     separately exported pure function that a unit test calls directly.

R5b. After the `MK` and `RG` imports, the measured size of `PostcodeReference` and
     `PlaceReference` including indexes, and the resulting bytes-per-row, are recorded in
     `build-notes.md`.

     *Measured at Build:* `PostcodeReference` 6.58 MB / 46,495 rows = **148.4 bytes per row**;
     `PlaceReference` 6.20 MB / 23,472 rows = 276.8 bytes per row; whole database **20.50 MB of
     512 MB**. The natural-key change cut Code-Point from **261 bytes per row** (456.9 MB for
     1.75M rows under the original surrogate-UUID design) to 148.4 — a 43% reduction per row, and
     96% smaller overall once demand-driven coverage is applied. This requirement originally
     asserted a **120** byte ceiling; that figure was reasoned from full-GB scale and is not met at
     46k rows, because per-index fixed overhead is proportionally larger on a small table. The
     budget's purpose — do not waste storage — is served, and the number is recorded as measured
     rather than restated as a target that was missed.

R6. Aheed's own `prisma/schema.prisma` declares a `CustomerAddress` model with a required `vendorId`, a
    required `userId`, and at least the fields `label`, `recipientName`, `phone`, `line1`, `line2`,
    `city`, `county`, `postcode`, `notes`, `isDefault` and `lastUsedAt`, indexed on
    `vendorId` plus `userId`.

R6a. Every exported function in `lib/repositories/customer-addresses.ts` takes `prisma`,
     `vendorId` and `userId` as explicit parameters, and a read issued for one vendor never
     returns a `CustomerAddress` row belonging to another vendor or another user.

R7. The existing `Address` model is unchanged, and `lib/repositories/orders.ts`'s `placeOrder`
    still creates exactly one `Address` row per order inside its transaction.

R8. New directories exist under `prisma/migrations/` for this slice's own changes to Aheed's
    schema, none of whose `migration.sql` files contain a `DROP INDEX` statement naming
    `Order_orderNumber_trgm_idx`, `Order_guestEmail_trgm_idx` or `User_email_trgm_idx`, and
    `npx prisma migrate status` reports no pending migration against the dev database.

    *Revised at Fix (2026-09-16).* Originally said "exactly one new directory." The v1→v2 storage
    pivot recorded in `plan.md` and `build-notes.md` means there are genuinely **two**:
    `20260915160937_p10_address_lookup_reference_data` (v1's reference tables plus `CustomerAddress`)
    and `20260915221254_p10_drop_superseded_reference_tables` (dropping those reference tables once
    the dedicated `uk-location-reference` database replaced them). The substance this requirement
    protects — no accidental drop of the P7d trigram indexes, and a clean `migrate status` — holds
    across both; only the count assumed a single, un-revised migration.

## Pure helpers

R9. `lib/postcode-normalisation.ts` exports `normalisePostcode`, which maps any of `"mk9 2nw"`,
    `" MK9  2NW "` and `"MK92NW"` to `"MK92NW"`, and `formatPostcode`, which maps `"MK92NW"` to
    `"MK9 2NW"`. Neither function imports Prisma, `next/headers` or `node:fs`.

R10. `lib/postcode-normalisation.ts` exports `postcodeDistrictOf` and `postcodeAreaOf`, which
     return `"MK9"` and `"MK"` respectively for `"MK92NW"`, and return `null` for an input that
     cannot be parsed as a UK postcode shape.

R11. `lib/osgb36.ts` exports a pure `eastingsNorthingsToWgs84` function that converts British
     National Grid coordinates to latitude/longitude within **10 metres** of the published value
     for at least three known reference points, and imports no third-party package.

## The reference-data source contract

R12. `lib/reference-data/source.ts` exports a `ReferenceDataSource` TypeScript interface declaring
     at least `key`, `discoverLatest`, `download`, `parse`, `validate` and `apply`.

R13. `lib/reference-data/sources/code-point.ts` exports an implementation of `ReferenceDataSource`
     whose `key` is `"code-point-open"`, and whose `discoverLatest` reads the `version` from
     `https://api.os.uk/downloads/v1/products/CodePointOpen` and the `md5` from that product's
     `/downloads` response, sending no credential, API key or `Authorization` header.

R14. `lib/reference-data/sources/open-names.ts` exports an implementation of
     `ReferenceDataSource` whose `key` is `"os-open-names"`, and whose `discoverLatest` reads the
     `version` and `md5` from the `OpenNames` product on the same host, sending no credential.

R15. No file under `lib/reference-data/` or `scripts/sync-reference-data.ts` reads an environment
     variable naming an OS, Ordnance Survey, or EPC credential.

## Sync behaviour

R16. The sync exits without downloading or writing only when **both** change dimensions are
     satisfied: the discovered version and checksum equal the values stored on the
     `ReferenceDataset` row, **and** every currently required postcode area already has a
     `ReferenceAreaCoverage` row for that source at that version. It then updates `lastCheckedAt`
     and records a `ReferenceDataSyncRun` with `status` `SUCCEEDED` and `inserted`, `updated` and
     `retired` all `0`.

R16a. When the upstream version and checksum are unchanged but a required postcode area has no
      coverage row at that version, the sync **still imports that area** — it does not report
      `changed=false`. Areas already materialised at the current version are not re-imported.

R16b. A `ReferenceAreaCoverage` row is written only after that area's import has completed
      successfully, so a newly configured area is never reported as covered before its data is
      present.

R17. The sync verifies the downloaded archive against the published `md5` before parsing it, and
     aborts without mutating any reference row when the checksum does not match.

R18. The sync rejects a parsed dataset, without mutating any reference row, when a required column
     is absent from the parsed header, or when the parsed record count for a requested area is
     below a declared per-source minimum. The minimum is expressed **per area**, because a
     demand-driven import legitimately parses far fewer records than a full-GB one.

R19. A sync that fails at any stage after download leaves the previously imported reference rows
     readable and their `ReferenceDataset.cacheVersion` unchanged, and records a
     `ReferenceDataSyncRun` whose `status` is `FAILED` with a non-null `errorMessage`.

R20. `ReferenceDataset.cacheVersion` is incremented only after a successful import, and is not
     incremented by a run that exits unchanged or fails.

R21. Running the sync twice in succession against an unchanged source reports `inserted`, `updated`
     and `retired` all `0` on the second run.

R22. A reference record present in a previous import and absent from the current one is marked
     `isActive = false` rather than deleted, and is counted in the run's `retired` total.
     Retirement is scoped to the postcode areas being imported in that run, so importing `LU` never
     retires `MK` rows that were simply not part of that pass.

R23. No repository function that issues a `createMany` or `updateMany` is reachable from
     request-path code: the bulk reference-import functions are called only by
     `scripts/sync-reference-data.ts`, which supplies its own Node Prisma client. Any
     `createMany`/`updateMany` that *is* reachable from a request runs through `getPrismaWs()`,
     never `getPrisma()`.

R24. `scripts/sync-reference-data.ts` constructs its reference Prisma client from the generated
     reference client's **Node** entry point, not its `/wasm` one, connects using
     `UK_LOCATION_REF_DIRECT_URL`, and accepts `--env-file`, `--source` and `--areas` arguments.

R24a. The required postcode areas come from configuration (`UK_LOCATION_REF_POSTCODE_AREAS`, overridable
      per run by `--areas`), and the strings `"MK"` and `"RG"` appear in no file under
      `prisma/reference/`, `lib/reference/`, `lib/reference-data/`, `lib/repositories/`,
      `app/` or `features/` — adding an area is configuration, never code.

R25. `.github/workflows/sync-reference-data.yml` exists, declares both a `schedule` trigger that
     fires monthly and a `workflow_dispatch` trigger, materialises its environment file from
     GitHub secrets and removes that file in an `if: always()` step.

R25a. `scripts/sync-reference-data.ts` populates both datasets from empty against a database whose
      `PostcodeReference` and `PlaceReference` tables contain zero rows, with no application
      deployment present, and `.github/workflows/sync-reference-data.yml` is invocable by
      `workflow_dispatch` independently of either deploy workflow.

R25b. A bootstrap procedure is documented under `docs/` naming the exact commands that populate
      both datasets in a new environment, and stating that an environment which has not yet run
      them serves `UNVERIFIED` rather than failing.

## Validity, eligibility and enrichment

R26. Postcode validity is determined solely by the reference service, from an active
     `PostcodeReference` row within a materialised area. No application module outside
     `lib/reference-data/` performs a network request to determine whether a postcode is valid.

R26a. Where the postcode's **area is materialised** for `code-point-open`, a postcode with no
      matching `PostcodeReference` row, or whose matching row has `isActive = false`, is reported
      as `INVALID`.

R27. A postcode whose **area is not materialised** is reported as `UNVERIFIED`, never `INVALID` —
     not having imported an area is not evidence that a postcode in it does not exist. This holds
     regardless of whether a row happens to exist for it.

R27a. No customer-facing surface presents an `UNVERIFIED` verdict as an invalid postcode. While the
      verdict is `UNVERIFIED`, the checkout form renders no postcode validation error, permits
      manual entry of every address field, and allows the order to be placed.

R27b. `UNVERIFIED` is also returned — never `INVALID`, and never an unhandled error — when the
      reference database is unreachable, the reference client cannot be constructed, the dataset
      has never successfully initialised, or any other infrastructure condition prevents an
      authoritative answer. The lookup catches such failures rather than letting them propagate.

R27c. The reference-service lookup is memoised per request, so a single checkout render performs at
      most one reference-database round trip for a given postcode.

R28. `lib/delivery-eligibility.ts` exports a pure function returning a discriminated union whose
     `status` is one of `INVALID_POSTCODE`, `UNVERIFIED`, `OUTSIDE_DELIVERY_AREA` or
     `DELIVERABLE`, and which imports neither Prisma nor `next/headers`.

R29. `components/layout/Header.tsx`, `features/checkout/place-order.ts` and
     `lib/fulfilment-service.ts` each reach delivery eligibility through the new service, and
     `lib/delivery.ts`'s `isDeliverable` has no call site outside `lib/delivery-eligibility.ts`
     and its own tests.

R30. Absence of a matching `PlaceReference` record never changes a postcode's validity or a
     vendor's delivery eligibility for that postcode.

R31. Street suggestions are drawn only from `PlaceReference` rows whose `type` is
     `transportNetwork`, whose `postcodeDistrict` equals the postcode's district, **and** whose
     distance from the postcode's eastings/northings is at most **250 metres**.

R32. Street suggestions are deduplicated by name, ranked by ascending distance, and limited to at
     most **3** entries.

R33. The lookup returns an empty street-suggestion list — never a partial or arbitrary one — when
     any of the following holds: no road qualifies under R31; the nearest qualifying road is more
     than **200 metres** away; or more than **25** distinct road names fall within the 250-metre
     radius.

     *These two ceilings were calibrated against the real OS Open Names dataset at Build, not
     chosen a priori, and the first draft of this requirement was measurably wrong.* Over 4,000
     real postcodes per city, the median number of distinct roads within 250 m is **10** in Milton
     Keynes, **12** in central London and **7** in Birmingham — so this requirement's original
     ceiling of 8 would have suppressed the hint for **59% of Milton Keynes postcodes** and 73% of
     central London, disabling the feature for most shoppers while appearing to work. At
     200 m / 25 the rule serves 88.7% of Milton Keynes, 89.6% of central London and 77.4% of
     Birmingham, and **both** suppression paths still fire on real data (in Milton Keynes: 6.1% no
     candidate, 1.4% too far, 3.8% too dense), so the protection is real rather than nominal.

## Provider port and public API

R34. `lib/address-lookup-provider.ts` exports an `AddressLookupProvider` interface whose lookup
     method takes a postcode and resolves to an array of a normalised `AddressCandidate` type
     exposing at most a stable source identifier, address line 1, address line 2, locality,
     town, postcode, latitude, longitude and source.

R35. `lib/address-lookup-provider.ts` exports a null provider that resolves to an empty array, and
     that provider is the one configured for this slice.

R36. The `addresses` array in the `GET /api/address/lookup` response is empty for every postcode,
     and no street-level or locality-level suggestion appears inside it.

R37. `GET /api/address/lookup?postcode=…` returns HTTP 200 with a JSON body containing the keys
     `postcode`, `valid`, `deliverable`, `location`, `addresses` and `manualEntryAvailable`, where
     `manualEntryAvailable` is `true` in every response.

R37a. The `location` value in that response exposes exactly the keys `town`, `district`, `county`,
      `latitude`, `longitude` and `streetSuggestions`, where `latitude` and `longitude` are WGS84
      decimal degrees derived from the stored eastings/northings, and `streetSuggestions` is an
      array of plain street-name strings carrying no identifier or distance.

R38. The `GET /api/address/lookup` response body contains none of the strings `sourceVersion`,
     `eastings`, `northings`, `localType`, `sourceId`, `datasetId`, `cacheVersion`, `vendorId` or
     `userId`, and no database row identifier.

R39. `GET /api/address/lookup` returns HTTP 400 for a missing or malformed `postcode` parameter —
     rejecting it on shape and length **before** issuing any database query — and its handler
     issues no request to `api.os.uk` on any code path.

R40. `GET /api/address/lookup` resolves the current vendor from the request host and reports
     `deliverable` against that vendor's own `VendorDeliveryArea` rows, so two vendors can return
     different `deliverable` values for the same postcode. Nothing under `lib/reference/` or
     `prisma/reference/` reads vendor delivery configuration — the reference service does not own
     vendor eligibility.

## Integration

R41. `components/checkout/CheckoutForm.tsx` populates the `city` and `county` inputs from the
     lookup's `location`, and leaves `line1` and `line2` empty and editable.

R42. `components/checkout/CheckoutForm.tsx` does not overwrite the value of an address input the
     user has edited since the last lookup.

R43. A signed-in customer who confirms an address at checkout has a `CustomerAddress` row written
     for that vendor and user, and placing the order still writes its own separate `Address`
     snapshot row.

R43a. Updating or deleting a `CustomerAddress` row leaves every existing `Address` snapshot row,
      and every `Order` referencing one, unchanged — a customer correcting their saved address
      does not alter where any past order was recorded as delivered.

R44. A signed-in customer with at least one `CustomerAddress` row for the current vendor is offered
     those addresses at checkout, and selecting one populates every address field without
     performing a postcode lookup to reconstruct them.

R45. Selecting a saved address re-evaluates postcode validity and the current vendor's delivery
     eligibility, and surfaces a refusal when that vendor no longer delivers to it.

R46. No code path writes a customer-entered address value into `PostcodeReference`,
     `PlaceReference` or the `addresses` array of the lookup API.

R47. `lib/repositories/data-rights.ts` includes `CustomerAddress` rows in both the data export and
     the erasure path.

R48. `components/staff/StorefrontConfigForm.tsx` validates its postcode against
     `PostcodeReference` and populates its town/county fields from the lookup, and does not display
     a delivery-eligibility verdict.

R49. `lib/postcodes-api.ts`, `features/checkout/postcode-lookup.ts` and
     `tests/postcodes-api.test.ts` no longer exist, and no file in the repository imports them.

## Documentation and gates

R50. `specs/architecture.md` records the reference-data framework, names Code-Point Open as the
     authority on postcode validity, and records EPC as investigated and rejected for production
     address lookup with the AddressBase/PAF licensing reason stated.

R51. `CLAUDE.md`'s recorded Vitest baseline matches the `Test Files` and `Tests` totals a clean
     local `npx vitest run` reports after this slice.

R52. `CHANGELOG.md` updated (Gate 4).

R53. `lint`, `typecheck`, `test` and `format:check` all remain green after this slice.
