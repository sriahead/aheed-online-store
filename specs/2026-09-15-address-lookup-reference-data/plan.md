---
id: 2026-09-15-address-lookup-reference-data
title: "Address lookup — reference-data framework, Code-Point Open, OS Open Names (plan)"
audience: [dev]
type: spec
status: approved
version: "2.0.0"
updated: 2026-09-15
visibility: internal
summary: A dedicated UK location-reference database with demand-driven postcode-area coverage, fed by OS Code-Point Open and OS Open Names, behind a reference-data service boundary; plus a consolidated delivery-eligibility service, a provider-neutral address-lookup API, and customer saved addresses.
tags: [reference-data, postcodes, address-lookup, delivery, fulfilment, sync]
related: [adr-004-multi-tenancy, adr-006-store-locations, architecture, roadmap]
---

# Address lookup — reference-data framework, Code-Point Open, OS Open Names (plan)

Closes **#764** as one coherent feature rather than a sequence of follow-on slices, per the ruling
at `/propose` on 2026-09-15.

**Goal:** make the whole address journey work from local reference data the application owns —
`saved address where available → otherwise postcode validation → delivery check → reliable location
assistance → property candidates if a future provider supplies them → manual completion where
necessary → confirmation → save and reuse` — while removing checkout's runtime dependency on a
third-party postcode API, and leaving a provider port a licensed property-address service can drop
into later without touching checkout, the forms, the API contract, postcode validation or delivery
eligibility.

## Revised at Build: a dedicated reference database, demand-driven

**Version 2.0.0 of this plan.** The first implementation stored reference data in Aheed's own
transactional database and imported the full GB datasets. Building it proved that wrong, with
numbers rather than argument:

- A real full-GB Code-Point import succeeded — **1,749,109 postcodes** — and occupied **456.9 MB**.
- Aheed's whole dev database then stood at **489.8 MB against a 512 MB Neon project limit**, with
  postcodes alone consuming 89% of the budget and every transactional table together under 5 MB.
- The Open Names import then failed at 1,042,656 records with `could not extend file because
  project size limit (512 MB) has been exceeded`.

Two conclusions followed, and the owner ruled on both. **Shared UK reference data does not belong in
a tenant's transactional database** — it is not Aheed's data, it dwarfs Aheed's data, and it
competes with it for a storage budget sized for orders and products. And **importing the whole of
Great Britain to serve two postcode areas is waste**, not thoroughness.

The architecture is now a **dedicated reusable UK location-reference database with demand-driven
postcode-area population**.

### The persistence boundary

| Database | Owns |
|---|---|
| **`uk-location-reference`** (new Neon project; `uk-location-reference-staging` branch for now) | `PostcodeReference`, `PlaceReference`, dataset versions/checksums, materialised area coverage, sync/audit state, and future compatible UK location datasets |
| **Aheed's application database** (unchanged) | Vendors, customers, `CustomerAddress`, orders and their immutable `Address` snapshots, carts, products, delivery configuration, every other transactional concern |

`CustomerAddress` stays in Aheed's database, and a customer-confirmed address is **never** promoted
into the shared reference database or offered to another customer. Order-address snapshots remain
immutable. None of that changes.

### Demand-driven coverage, not an MK/RG architecture

The reference database is **UK-wide capable**; only the areas actually needed are materialised.
Today that is `MK` and `RG`, supplied through configuration — and nothing in the schema,
repositories, API or domain services knows those two values exist. Adding `LU` later is a
configuration change plus a sync run: **no migration, no new importer, no new endpoint, no checkout
change.**

This falls out of the archive layout rather than being bolted on. Code-Point Open ships **one CSV
per postcode area** (`Data/CSV/mk.csv`, `rg.csv`, ...), so importing two areas means reading two
files out of 129 rather than filtering 1.7M rows. Open Names is tiled by grid square instead, so its
rows are filtered on the area prefix of `POSTCODE_DISTRICT` during the parse.

### The sync has TWO independent change dimensions

This is the subtlety the first implementation would have got wrong. A sync must run when **either**:

1. the upstream OS release changed (new version or checksum), **or**
2. our required coverage changed — a newly configured area is not yet materialised.

Exiting `changed=false` because the upstream md5 matched, while `LU` sits unimported, would be a
silent failure of exactly the kind this project keeps paying for. So `ReferenceAreaCoverage` records
which areas have been **successfully** materialised for a given source and version, and a newly
configured area is not reported as covered until its import completes.

### Coverage makes validity three-state, explicitly

| Condition | Verdict |
|---|---|
| Area materialised, postcode present and active | `VALID` |
| Area materialised, authoritative data has no active row | `INVALID` |
| Area **not** materialised | `UNVERIFIED` |
| Reference service or database unavailable, or dataset never initialised | `UNVERIFIED` |

**A postcode outside MK/RG must never be called invalid merely because we have not imported that
area.** Moving reference data behind its own database introduces a runtime dependency, so the same
rule now covers infrastructure failure too: an unreachable reference database yields `UNVERIFIED`
and degrades to manual address entry. An infrastructure or coverage gap is never converted into a
rejection of the customer's address.

### The access boundary

```
OS Downloads API -> uk-location-reference -> reference-data service -> Aheed
                                                                    -> DeliveryEligibilityService
                                                                    -> checkout / address forms
```

The reference service answers only: is this postcode covered and current, what location information
attaches to it, and what reliable enrichment or street hints exist. It **does not own vendor
delivery eligibility** — that stays in Aheed, reading the vendor's own `VendorDeliveryArea` rows —
and `AddressLookupProvider` stays a separate seam, so a future licensed property-address provider
needs no change to the reference service.

## Why this shape

Three findings from `/propose` drove the design, and each one is load-bearing.

**Both sources are keyless.** `https://api.os.uk/downloads/v1/products/<id>` returns a `version`,
and `.../downloads` returns an `md5` and `size` per format — for `CodePointOpen` (`2026-08`,
`codepo_gb.zip`, roughly 14 MB) and `OpenNames` (`2026-07`, `opname_csv_gb.zip`, roughly 103 MB)
alike, with no API key. Version plus checksum are exactly the change-detection primitives the
framework needs, so "has the source changed?" is a single unauthenticated `GET`. This is also why
the generic abstraction is justified rather than speculative: it ships with **two real
implementations of one contract**, not one implementation and a hope.

**Both sources share a coordinate system, so the proximity join needs no reprojection.**
Code-Point Open supplies eastings/northings in British National Grid (EPSG:27700), and Open Names
supplies `GEOMETRY_X`/`GEOMETRY_Y` in the same grid. Distance between a postcode unit and a road is
therefore plain Euclidean arithmetic **in metres**, with no geodesy in the hot path. Latitude and
longitude are needed only for values leaving the system through the API, so the WGS84 conversion
runs at read time on the handful of rows a response carries — never on 1.7M rows at import.

**The proximity query is a bounding box in Prisma plus exact distance in TypeScript — never raw
SQL.** Prisma cannot express `sqrt((e1-e2)^2 + (n1-n2)^2) <= 250` as a filter, and raw SQL in
application code is banned with exactly one unrelated exception. So the repository issues a plain
indexed range filter — `eastings` between `x-250` and `x+250`, `northings` between `y-250` and
`y+250` — which is a 500-metre square strictly containing the 250-metre circle, and a pure function
then computes the true Euclidean distance on those few rows and discards the corners. Correct,
index-friendly, no raw SQL, and the distance maths lands somewhere a unit test can reach it. The
supporting index is therefore `postcodeDistrict`, `eastings`, `northings` in that order.

**Open Names cannot be joined to a postcode unit, only to a district.** Its `POSTCODE_DISTRICT`
field holds the first two-to-four characters (`MK9`), never the full unit (`MK9 2NW`). Matching on
that field alone would return every road in the district and present it as address assistance,
which is noise wearing the costume of help. The reliable relationship is proximity, so street
suggestions require **both** the district attribute and a distance ceiling, and are suppressed
entirely where the result is ambiguous. They are suggestions about where the postcode is, never
evidence that a property belongs to a street.

## Scope (this slice)

**Reference-data framework.** New non-vendor-scoped models in `prisma/schema.prisma`:
`ReferenceDataset` (source key, version, checksum, last checked, last synced, record count, refresh
frequency, active flag, sync status, sync error, cache version), `ReferenceDataSyncRun` (one row per
run: version, started, finished, inserted, updated, retired, unchanged, status, error) and the
`ReferenceSyncStatus` enum. `lib/reference-data/source.ts` defines one `ReferenceDataSource`
contract — `key`, `discoverLatest`, `download`, `parse`, `validate`, `apply` — implemented by
`lib/reference-data/sources/code-point.ts` and `lib/reference-data/sources/open-names.ts`, and
driven by `lib/reference-data/sync-service.ts`.

**Postcode reference.** `PostcodeReference` holds the normalised postcode (unique), the display
form, area, district, eastings/northings, administrative codes, an active flag and the source
version. It is the **sole** authority on whether a postcode exists.

**Place reference.** `PlaceReference` holds Open Names records — source id, name, type, local type,
eastings/northings, postcode district, populated place, district/borough, county/unitary, region,
country, active flag, source version.

**Customer saved addresses.** `CustomerAddress` — see "The saved-address mechanism does not exist
yet" below, which is the one place this slice's scope is larger than #764 implies.

**Sync.** `scripts/sync-reference-data.ts` runs on a Node runner, taking `--env-file` and
`--source`, driven by `.github/workflows/sync-reference-data.yml` monthly plus
`workflow_dispatch`. The pipeline is `discover latest release → compare version/checksum → exit if
unchanged → download → verify checksum → validate schema and record-count invariants → transform →
transactional import → activate → invalidate cache → record sync result`.

**Services.** `lib/postcode-normalisation.ts` (pure), `lib/osgb36.ts` (pure BNG→WGS84),
`lib/delivery-eligibility.ts` (pure) with `lib/delivery-eligibility-service.ts` (request-context
facade), `lib/address-lookup-provider.ts` (the port plus a null provider), and
`lib/address-lookup-service.ts` (orchestration). Repository modules — `reference-data.ts`,
`postcodes.ts`, `places.ts`, `customer-addresses.ts` — take `prisma` and their scope explicitly, per
the repository-layer rules.

**Public API.** `GET /api/address/lookup?postcode=…` returning `postcode`, `valid`, `deliverable`,
`location`, `addresses` and `manualEntryAvailable`, exposing no internal identifiers, no source
version, no eastings/northings and no provider implementation detail.

**Integration.** `components/checkout/CheckoutForm.tsx` (validation, enrichment, suggestions, saved
addresses, save-on-confirm) and `components/staff/StorefrontConfigForm.tsx` (validation and
enrichment for the vendor's own location — no delivery check, because a store's own address is not
a delivery destination). `components/layout/Header.tsx`, `features/checkout/place-order.ts` and
`lib/fulfilment-service.ts` all move onto the one eligibility service.

## Why sync runs in GitHub Actions and not the scheduler Worker

The project has two existing scheduling mechanisms, and this work belongs to the second one.
`workers/scheduler` fires every 15 minutes into `/api/jobs/*` on the application Worker; that is
the right home for short, database-light domain jobs. Parsing a 1.7M-row CSV, or a 103 MB archive,
inside a 128 MB Worker isolate is not viable, and `.github/workflows/fill-product-images.yml`
already establishes the pattern for heavy Node-runner work that writes to the database with an
explicit `--env-file`. Splitting the cheap check onto the Worker and the ingest onto Actions would
add a mechanism boundary for no benefit, since the check is one unauthenticated `GET` the Actions
job can perform itself in a second before exiting. One mechanism, one log, one retry story.

The sync script runs in **real Node**, so it constructs its Prisma client from the bare
`@prisma/client` specifier exactly as `prisma/seed.ts` does — never `@prisma/client/wasm`, which
cannot load outside workerd.

## The validity state model, and why bootstrap ordering cannot be allowed to fake it

Two distinct states, and conflating them is the failure mode this section exists to prevent:

| Condition | Verdict |
|---|---|
| Reference data initialised, and no active `PostcodeReference` row matches | **invalid** |
| Reference data absent or never successfully initialised | **`UNVERIFIED`** |

The test is the **dataset's own sync history**, not whether a particular row happens to be missing.
An environment that has never synced answers `UNVERIFIED` for *every* postcode, including ones a
partially-populated table might coincidentally contain — because a table nobody has ever
successfully filled cannot be evidence of absence. Once `code-point-open` records a successful sync,
a missing or inactive row becomes a real "invalid".

**`UNVERIFIED` is never shown to a customer as an invalid postcode**, renders no validation error,
and never blocks manual address entry or order placement (R27a). The whole point is that a
deployment-ordering accident degrades into "we could not check" rather than "your address is
wrong" — the latter would turn an operational gap into lost orders.

**Production must not silently reach this code with an empty dataset.** The sync is therefore
runnable entirely on its own: `scripts/sync-reference-data.ts` needs no application deployment
present, and the workflow is `workflow_dispatch`-invocable independently of either deploy pipeline
(R25a), with the bootstrap commands documented under `docs/` (R25b). Validation proves the
from-empty population path against genuinely empty tables rather than assuming it (R25a's row).
Where ordering still cannot be guaranteed, the degradation above is the designed answer.

**The third-party postcode API is not coming back to solve bootstrap ordering.** That would
reintroduce the second runtime authority this slice removes, to paper over a one-command
operational step.

## Consistency with the existing ADRs

Worth stating so a validator does not read these as violations.

**Non-vendor-scoped tables do not contradict ADR-004.** That ADR makes `vendorId` the sole tenancy
isolation axis for *domain* data, and its decision 1 explicitly anticipates "`Region`/`Location` as
their own reference tables when geography grows beyond delivery areas". Shared reference data is
the case ADR-004 predicted, not an exception to it. Postcode and place records are identical for
every vendor and must not be duplicated per vendor; `CustomerAddress`, which *is* domain data,
carries `vendorId` and is scoped exactly as ADR-004 requires (R6a).

**`PlaceReference` deliberately avoids ADR-006's naming collision.** ADR-006 reserves the bare name
`Location` for geography reference data and `VendorLocation` for a trading site, and asks that
whichever is built first take the more specific name. Naming this table `PlaceReference` sidesteps
the ambiguity altogether rather than spending the reserved word.

## The saved-address mechanism does not exist yet

#764's closure condition says to "save through the existing customer saved-address mechanism".
**There is no such mechanism.** Verified during `/spec`: `Address` rows are created in exactly one
place, `lib/repositories/orders.ts`'s `placeOrder` at line 316, inside the order transaction, and
`specs/architecture.md` describes that row as a deliberate per-order **snapshot** — "editing a saved
address later must not rewrite where a past order was delivered". `Address.userId` is nullable and
reserved for a future address book, `app/(storefront)/account/` has no addresses route, and no issue
tracks one.

So this slice **creates** that mechanism as `CustomerAddress`: user-owned, vendor-scoped, editable,
and entirely separate from the per-order `Address` snapshot, which continues to be written by
`placeOrder` exactly as it is today. The saved address is the *source* a checkout form is populated
from; it is never the snapshot itself. That separation is what lets a customer correct a typo in
their saved address without rewriting where last month's order went.

This is the one place the slice is materially larger than #764's wording implies, and it is called
out here rather than absorbed silently.

## EPC: investigated and rejected

Recorded so the question is not reopened by accident. The GOV.UK Energy Performance of Buildings
dataset was investigated as an address-candidate source and is **rejected for the commercial
checkout use case**. Although much of it is published under OGL terms, its **address and postcode
fields carry additional licensing restrictions**, because they incorporate OS AddressBase Premium
and Royal Mail PAF-derived address data; there are also data-protection considerations around
address-level EPC records. No EPC data is imported, exposed, or depended upon here, and no EPC
credential is a dependency of this feature. Existing downloaded EPC data may be used for permitted
offline investigation only, and must never silently become production address data. If licensing
and use rights are later established, EPC returns as an `EpcAddressLookupProvider` behind the same
port, changing nothing else. This ruling is mirrored into `specs/architecture.md` so it outlives
this folder.

## Deliberately excluded

- **Property-level address candidates.** No licensed source exists in scope, so `addresses[]` is
  reserved strictly for genuine property-level candidates and ships **empty**. Street-level
  suggestions must never be placed in it: a candidate with no house number is not an address, and a
  shopper clicking one gets a form that looks filled and is not.
- **OS Open UPRN, OSM/Nominatim, EPC ingestion, and any commercial provider.** Each needs its own
  `/propose` demonstrating a concrete requirement with the licensing and coverage question already
  resolved.
- **Maps.** Deferred. This slice exposes coordinates through `location` so a future map component
  has something to consume, and does nothing else about mapping.
- **A network fallback to `postcodes.io`.** `lib/postcodes-api.ts`,
  `features/checkout/postcode-lookup.ts` and `tests/postcodes-api.test.ts` are **removed**. Keeping
  a third-party call alongside a local authority would reintroduce exactly the runtime external
  dependency this slice removes, and could contradict Code-Point on validity. Where reference data
  has not been synced, the answer is `UNVERIFIED` — never "invalid" — so checkout proceeds on manual
  entry rather than falling back to the network.
- **A full account address-management page.** Saved addresses are created, listed, selected and
  deleted from checkout in this slice. A dedicated `/account/addresses` screen is deferred to its
  own issue, filed at Build.
- **Saved addresses for guests.** `CustomerAddress` requires a `userId`, so only signed-in
  customers can save and reuse one. A guest's experience is unchanged: the existing delivery
  postcode cookie continues to carry their postcode between visits, and they complete the address
  fields each time. Giving a guest a durable server-side address record would mean minting an
  identity for someone who declined to create one.
- **Rate limiting on `/api/address/lookup`.** The endpoint is public because checkout needs it
  unauthenticated, but every path it takes is a bounded, indexed read of local reference data with
  no external call and no per-request cost — unlike the AI endpoints the discovery log flags as
  attacker-controlled cost paths. The defence carried here is input rejection on shape and length
  *before* any query runs (R39). If real traffic shows abuse, rate limiting is a follow-up with an
  existing pattern to copy (`lib/repositories/order-lookup-rate-limit.ts`).
- **Delivery-area semantics.** Unchanged. Note `#613`'s issue body is stale: district prefixes
  (`MK9` but not `MK17`) already work in both `lib/delivery.ts` and `lib/delivery-area-form.ts`,
  having landed incidentally in `2f0f20c`.
- **Edge caching claims.** `#599` established that a `Cache-Control` header does not by itself
  create Cloudflare edge caching for a Worker route. This slice therefore claims only what it can
  demonstrate: reference rows read from PostgreSQL, request-scoped memoisation via React `cache()`,
  and a `cacheVersion` bumped on activation. No edge-cache behaviour is asserted.

## Open items carried forward

- **`#755`** — rejected R2 credentials. Unrelated to this slice and not a blocker for it; no code
  here touches object storage.
- **A licensed property-address provider** remains unowned. The port exists; nothing fills it.
- **`#613`** stays open on its genuine remaining question (which districts Aheed actually serves,
  and whether the `Region`/`Location` reference model is warranted), not on the code limitation its
  body describes.
