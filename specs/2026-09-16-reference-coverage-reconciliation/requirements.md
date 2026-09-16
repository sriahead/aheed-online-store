# Reference coverage reconciliation — decommission, observability and production bootstrap (requirements / acceptance criteria)

Closes `#770` (the sync pipeline cannot retire a postcode area that has dropped out of
configuration, leaving `LU` materialised, frozen and treated as authoritative), `#771`
(nothing compares configured areas against materialised coverage, and `/api/health` reports nothing
about the reference database) and `#767` (production's reference database has never been migrated or
synced). Builds on `#764`, which introduced `uk-location-reference`, `lib/reference/`,
`lib/reference-data/` and `scripts/sync-reference-data.ts`. Configured coverage is `MK,RG` in every
environment; `LU` is not supported and must not be re-added.

## Decommissioning an unsupported area (`#770`)

R1. `lib/reference-data/source.ts`'s `ReferenceDataSource` interface declares
    `decommissionAreas(prisma: Db, areas: string[]): Promise<{ deleted: number }>`, and both
    `codePointSource` (`lib/reference-data/sources/code-point.ts`) and `openNamesSource`
    (`lib/reference-data/sources/open-names.ts`) implement it.

R2. `codePointSource.decommissionAreas` deletes `PostcodeReference` rows using a single
    `deleteMany` whose `where` is `{ postcodeArea: { in: areas } }`, and
    `openNamesSource.decommissionAreas` does the same for `PlaceReference`. Neither issues any
    delete whose `where` omits `postcodeArea`.

R3. `lib/repositories/reference-coverage.ts` exports
    `removeAreaCoverage(prisma: Db, sourceKey: string, postcodeArea: string): Promise<void>`,
    deleting exactly the one `ReferenceAreaCoverage` row identified by that composite key, and takes
    `prisma` as an explicit parameter like every other export in that file.

R4. `lib/reference-data/sync-service.ts` exports
    `decommissionUnsupportedAreas(prisma, source, options)` where `options` carries the required
    `areas`, an optional `dryRun`, and an optional `log`. It returns a summary carrying the source
    key, the areas removed, the number of data rows deleted, and an error string or `null`.

R5. `decommissionUnsupportedAreas` treats as unsupported exactly those areas that have a
    `ReferenceAreaCoverage` row for that source and are absent from the required `areas` list —
    computed from `listCoveredAreas()`, with no area literal anywhere in the function.

R6. For each unsupported area, `decommissionUnsupportedAreas` deletes the `ReferenceAreaCoverage`
    row **before** it deletes any data row for that area. A unit test asserts this ordering by
    recording the sequence of calls against a stubbed client and failing if the data delete is
    observed first.

R7. When the required `areas` list is empty, `decommissionUnsupportedAreas` performs no delete of
    any kind and returns a summary whose error names the empty configuration.

R8. `decommissionUnsupportedAreas` never deletes an area that appears in the required `areas` list,
    including when that area also has a coverage row.

R9. A non-dry run writes one `ReferenceDataSyncRun` row carrying `requestedAreas` set to the
    comma-separated removed areas, `retired` set to the number of data rows deleted, a
    `finishedAt`, and status `SUCCEEDED` — or `FAILED` with `errorMessage` when the run refuses or
    throws.

R10. After a successful non-dry run, that source's `ReferenceDataset` row has `recordCount` equal to
     the number of rows remaining for that source and `cacheVersion` incremented by exactly one.

R11. A run with `dryRun` true issues no delete, writes no `ReferenceDataSyncRun` row, does not touch
     `ReferenceDataset`, and reports the areas and row counts it would have removed.

R12. `scripts/sync-reference-data.ts` accepts `--decommission` and `--dry-run`. With
     `--decommission`, the script runs `decommissionUnsupportedAreas` for each selected source and
     calls neither `discoverLatest`, `download`, `parse`, `validate` nor `apply`. Its `--help`
     output documents both flags.

R13. Without `--decommission`, no code path reachable from `scripts/sync-reference-data.ts` deletes
     a `PostcodeReference`, `PlaceReference` or `ReferenceAreaCoverage` row: every `deleteMany` and
     `delete` call in `lib/reference-data/` and in `lib/repositories/reference-coverage.ts` is
     reachable only from `decommissionAreas` or `removeAreaCoverage`.

R14. After the decommission run against the dev/staging reference database
     (`ep-wild-violet-zaa9udu5`): `PostcodeReference` holds 0 rows with `postcodeArea = 'LU'`,
     `ReferenceAreaCoverage` holds no row with `postcodeArea = 'LU'` for any source, and the `MK`
     and `RG` figures are unchanged at 16,215 and 23,816 active postcodes and 9,989 and 13,483
     places.

## Coverage observability (`#771`)

R15. `scripts/verify-reference-coverage.ts` exists, takes `--env-file`, performs **no write of any
     kind**, and prints for that environment: the configured areas, the per-area `PostcodeReference`
     and `PlaceReference` counts, every `ReferenceAreaCoverage` row, and every `ReferenceDataset`
     row. It exits 0 when covered areas equal configured areas for every source and non-zero when
     they differ, naming the drift.

R16. `lib/reference/reference-status-service.ts` exports `getReferenceStatus()`, returning
     `configured`, `requiredAreas`, and one entry per dataset carrying `sourceKey`,
     `sourceVersion`, `syncStatus`, `lastSyncedAt`, `recordCount`, `coveredAreas`,
     `missingAreas` (required but not covered) and `unsupportedAreas` (covered but not required),
     plus a top-level boolean that is true when any entry has a non-empty `missingAreas` or
     `unsupportedAreas`.

R17. `getReferenceStatus()` returns `configured: false` with empty dataset entries, and throws
     nothing, when `isReferenceDatabaseConfigured()` is false; it likewise returns rather than
     throws when the reference database is unreachable or its tables are absent.

R18. `GET /api/health` includes a `reference` object produced by `getReferenceStatus()`.

R19. `GET /api/health` returns HTTP 200 with `"status":"ok"` when the reference database is
     unconfigured, unreachable or unsynced, provided the Aheed database and storage checks pass —
     reference state never degrades the health verdict.

R20. The `/api/health` response body contains no connection string, database host, username or
     password: the `reference` block carries only area codes, source keys, versions, counts,
     timestamps and status strings.

R21. `app/`, `components/` and `features/` contain no import of `@aheed/reference-client`,
     `@/lib/reference-db` or `prisma/reference` — `/api/health` reaches reference state only through
     `lib/reference/`.

## Environment configuration and production bootstrap (`#767`)

R22. The GitHub `staging` and `production` environments each carry `UK_LOCATION_REF_DIRECT_URL` as a
     **secret** and `UK_LOCATION_REF_POSTCODE_AREAS` as a **variable** whose value is `MK,RG`.

R23. The currently deployed `aheed-store-staging` Worker version lists both
     `UK_LOCATION_REF_DATABASE_URL` and `UK_LOCATION_REF_POSTCODE_AREAS` among its bindings.

R24. On deployed staging, `GET /api/address/lookup?postcode=MK100AA` returns `"valid":true` with
     `"town":"Milton Keynes"` and a non-null latitude and longitude, and
     `?postcode=RG100AA` returns `"valid":true` with `"town":"Twyford"`.

R25. On deployed staging, after the decommission run, `GET /api/address/lookup?postcode=LU11AA`
     returns `"status":"UNVERIFIED"` and `"valid":false` — never `INVALID_POSTCODE`.

R26. On deployed staging, a well-formed postcode in a covered area that does not exist
     (`MK999ZZ`) returns `"status":"INVALID_POSTCODE"`, and a well-formed postcode in an uncovered
     area (`ZZ11ZZ`) returns `"status":"UNVERIFIED"`.

R27. The production reference database (`ep-summer-boat-zapzp2t9`) holds the six tables of
     `prisma/reference/schema.prisma` plus `_prisma_migrations`, and `prisma migrate status` against
     production's `UK_LOCATION_REF_DIRECT_URL` reports no pending migration.

R28. After the production sync, that database's `ReferenceDataset` holds `code-point-open` and
     `os-open-names`, both `SUCCEEDED` with a non-null `lastSyncedAt`; `ReferenceAreaCoverage` holds
     exactly four rows — `MK` and `RG` for each source — and no row for any other area.

R29. After the production sync, that database holds `PostcodeReference` rows for `MK` and `RG` only
     and `PlaceReference` rows for `MK` and `RG` only, with no row in either table whose
     `postcodeArea` is `LU`.

R30. `.github/workflows/sync-reference-data.yml` requires no change for the production run to
     succeed: it reads `secrets.UK_LOCATION_REF_DIRECT_URL` and `vars.UK_LOCATION_REF_POSTCODE_AREAS`,
     both of which R22 provides.

## Documentation

R31. `docs/model-handoff.md` no longer states that `LU` is materialised, and states the true
     production reference-database state after this slice.

R32. `docs/developer-portal/env-setup.md`'s note that production's reference branch is dark
     (`#767`) is replaced by the state this slice leaves it in.

R33. `CLAUDE.md` records both traps this slice paid for: that `wrangler secret list` reports the
     script's secrets rather than the running version's bindings, so a secret can exist while the
     live Worker has no such binding and every lookup silently degrades; and that a workflow reading
     `vars.X` sees nothing when the value was stored as a secret of the same name.

R34. `docs/developer-portal/env-setup.md` documents `--decommission`, `--dry-run` and
     `scripts/verify-reference-coverage.ts` alongside the existing bootstrap commands.

R35. `lib/reference-data/sync-service.ts`'s guarantee "**A failed refresh never costs you the data
     you already had.** Nothing is deleted at any point" is scoped so it remains true: it states
     that it describes refresh runs, and names `decommissionUnsupportedAreas` as the one path that
     deletes and the conditions under which it does. `lib/reference-data/source.ts`'s and
     `lib/reference-data/sources/code-point.ts`'s "marked inactive rather than deleting" comments
     are likewise scoped to `apply`.

R36. `specs/architecture.md` §3.0's third rule states that demand-driven coverage works in both
     directions — an area that leaves `UK_LOCATION_REF_POSTCODE_AREAS` is retired by an explicit
     decommission run, coverage row first — without weakening the existing INVALID/UNVERIFIED rule
     it sits inside.

## Gates

R37. `CHANGELOG.md` updated on the branch (Gate 4).

R38. `lint`, `typecheck`, `test` and `format:check` all remain green after this slice, and
     `CLAUDE.md`'s recorded vitest baseline matches a clean local `npx vitest run` summary.
