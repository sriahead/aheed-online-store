---
id: p9-2-reference-coverage-reconciliation-plan
title: "Reference coverage reconciliation — decommission, observability and production bootstrap (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-16
visibility: internal
summary: Gives the reference-data pipeline a way to retire an unsupported postcode area, reports configured-vs-covered drift on /api/health, and brings production's reference database up from empty to MK/RG.
tags: [reference-data, postcodes, operations, health]
# related: [p9-2-address-lookup-reference-data-plan]
---

# Reference coverage reconciliation — decommission, observability and production bootstrap (plan)

`#764` shipped the `uk-location-reference` database and its sync pipeline. Three weeks of operating
it surfaced one design gap, one observability gap and one unfinished environment. This slice closes
all three, and they belong together because each is the reason the next went unnoticed.

**Goal:** make an environment's materialised coverage match its configured coverage, provably, in
every environment — and make a mismatch visible from outside the Worker instead of only from a
hand-run database query.

## What is actually wrong today

**1. The pipeline can add an area but never remove one (`#770`).** `applyPostcodeRecords` scopes
both its read and its retirement to the areas being imported
(`where: { postcodeArea: { in: areas } }`), and `findOutstandingAreas` only ever considers the
**required** areas. Both are correct — they are what stops an `LU` import from retiring every `MK`
row — but together they mean an area that drops out of configuration is never touched again by any
run, in any environment.

`LU` is in exactly that state on the dev/staging branch: 6,464 Code-Point rows and a
`code-point-open/LU` coverage row from a single manual `--areas LU,MK,RG` run
(`ReferenceDataSyncRun`, 2026-09-15T22:04:12Z), against configuration that says `MK,RG`. It is not
merely untidy. The coverage row makes `isAreaCovered(…, "LU")` true, so
`lib/reference/postcode-reference-service.ts` treats Luton as an area it has authority over — and
its own state table then says *covered area, no active row → **INVALID***. A Luton postcode issued
after the frozen 2026-08 release is therefore answered "your address is wrong", which is the exact
inversion the `UNVERIFIED` state exists to prevent. `LU` is also half-imported: `PlaceReference`
holds **0** `LU` rows, because the Open Names run that followed used `--areas MK,RG`.

**2. Nothing compares configured areas against materialised coverage (`#771`).**
`lib/config.ts`'s `getRequiredPostcodeAreas()` has **no callers at all**;
`lib/repositories/reference-coverage.ts`'s `listCoveredAreas()` is referenced only by its own test;
`/api/health` says nothing about the reference database. That is why gap 1 sat unnoticed, and why a
second, unrelated failure also sat unnoticed: the deployed staging Worker version
(`f7e5c0ca…`, 2026-09-16T06:55:51Z) carries 19 bindings and neither `UK_LOCATION_REF_DATABASE_URL`
nor `UK_LOCATION_REF_POSTCODE_AREAS`, so staging answered `UNVERIFIED` for every postcode while its
reference database was perfectly healthy. Nothing logged, because the service returns
`unverified()` at the `isReferenceDatabaseConfigured()` guard *before* any query — correct
behaviour, and precisely why it is silent. From outside, "no binding" and "empty database" look
identical.

**3. Production's reference database has never been migrated or synced (`#767`).**
`ep-summer-boat-zapzp2t9`: **0 public tables**, 7,536 kB, no `_prisma_migrations`, re-verified
2026-09-16. Production answers `UNVERIFIED` for everything — the designed degradation, not a
defect, but dark.

**Scope (this slice):**

- **Decommission, as a pipeline stage, opt-in only.** `ReferenceDataSource` gains
  `decommissionAreas(prisma, areas)`, implemented by `sources/code-point.ts` (`PostcodeReference`)
  and `sources/open-names.ts` (`PlaceReference`), each deleting only rows whose `postcodeArea` is in
  the list. `lib/reference-data/sync-service.ts` gains `decommissionUnsupportedAreas`, which
  computes *covered minus required* and retires the difference.
  `lib/repositories/reference-coverage.ts` gains `removeAreaCoverage`.
- **Deletion order is the load-bearing detail: the coverage row goes FIRST, the data rows second.**
  Deleting rows while coverage survives makes every postcode in that area `INVALID` for the
  duration — actively telling customers their real addresses are wrong. Removing coverage first
  degrades the area straight to `UNVERIFIED`, which is manual address entry and harms nobody. This
  is a requirement (`R6`) with its own test, not an implementation detail.
- **`scripts/sync-reference-data.ts` gains `--decommission` and `--dry-run`.** `--decommission` runs
  the decommission pass **only**: no `discoverLatest`, no download, no import. The monthly scheduled
  run passes no flag and therefore can never delete anything, so a temporarily mis-set
  `UK_LOCATION_REF_POSTCODE_AREAS` cannot quietly wipe coverage. `--dry-run` reports what would be
  removed and removes nothing.
- **Two refusals, both without deleting anything:** an empty required-areas list (because "nothing
  is required" must never mean "remove everything" — the script already refuses to *import* with no
  areas configured, for the same reason), and any attempt to decommission an area that is in fact
  required.
- **A `reference` block on `/api/health`**, built by a new `lib/reference/reference-status-service.ts`
  and reusing `listDatasetStatuses()` (which already exists and, per its own docstring, was written
  for operational reporting) plus `listCoveredAreas()` and `getRequiredPostcodeAreas()` — giving
  that last function its first caller. It reports configured, required areas, and per source: the
  dataset's version and sync status, its covered areas, and the drift in **both** directions —
  required-but-not-covered and covered-but-not-required.
- **Reported, never fatal.** An absent, unreachable or unsynced reference database must not change
  `/api/health`'s status or HTTP code. `lib/config.ts` deliberately does not make these variables
  required-in-production; turning a provisioning gap into a red health check would invert that
  decision.
- **Operational reconciliation, each step separately approved at `/validate`:** decommission `LU`
  from dev/staging, redeploy staging so its Worker picks up the stored secrets, then dispatch
  `sync-reference-data.yml` against `production` to migrate and sync `MK,RG`.
- **Documentation reconciliation:** `docs/model-handoff.md`, `docs/developer-portal/env-setup.md`
  and a `CLAUDE.md` entry for the two traps this cost — `wrangler secret list` reporting the
  *script's* secrets rather than the *running version's* bindings, and a workflow reading `vars.X`
  where the value was stored as a secret.

**Deliberately excluded:**

- **Any change to the `UNVERIFIED`/`INVALID` state model.** The model is right; `LU` violated it by
  having coverage it should not have, not by being classified wrongly.
- **A staff panel surface for reference data.** `/api/health` answers the operational question at a
  fraction of the cost; a new `/staff/*` page drags in `tests/staff-nav-parity.test.ts`,
  `tests/operator-doc-coverage.test.ts` (four tests per route) and three operator guides. If an
  in-panel view is wanted later it gets its own `/propose`.
- **Re-adding `LU` in any form.** Luton is not supported coverage. Adding it back is a
  configuration decision plus a sync run, and not one this slice makes.
- **Automatic decommission on the scheduled run.** Deliberate: a destructive action driven by a
  configuration value that a single mistyped GitHub variable could empty is not something to run
  unattended.
- **Runtime verification of production `/api/address/lookup` or of production's `/api/health`
  `reference` block.** Neither route's current behaviour is evidence about the reference database:
  `#764` has not been promoted to `main`, so production does not serve that route at all. Production
  is verified in this slice by direct database inspection only; the routes are checked there when
  `#764` is promoted.
- **Backfilling `PlaceReference` enrichment for any new area.** Out of scope; `MK`/`RG` already have
  it.
- **Changing how `#764`'s two deploy workflows generate the reference client.** They reference
  `secrets.UK_LOCATION_REF_DATABASE_URL`, which no longer exists as a GitHub secret — harmless,
  because `prisma generate` succeeds with that variable empty (verified directly: with `.env` moved
  aside and both `UK_LOCATION_REF_*` set to `""`, `npm run db:generate` still generated the client).
  Noted here so a future reader does not mistake it for a live break.

**Open items carried forward:**

- `#766` — no licensed property-address provider, so `addresses[]` stays empty. Untouched.
- `#765` — the three `pg_trgm` order-search indexes missing from all three environments. Unrelated
  and separately tracked.
- Whether production should eventually share dev/staging's reference branch is **not** reopened:
  `docs/developer-portal/env-setup.md` already rules that a shared project reintroduces the exact
  problem the split removed. Production keeps `ep-summer-boat-zapzp2t9`.
