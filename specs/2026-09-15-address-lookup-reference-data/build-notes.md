# Address lookup — reference-data framework, Code-Point Open, OS Open Names (build notes)

Closes **#764**. Read `plan.md` for the architecture and why it changed mid-build; this file is
what the validating context needs that neither the spec nor the diff carries.

**The single most important fact for validation:** reference data no longer lives in Aheed's
database. It is a **separate Neon project**, `uk-location-reference`, reached through
`UK_LOCATION_REF_DATABASE_URL` / `UK_LOCATION_REF_DIRECT_URL`. Dev and staging share one branch
(`ep-wild-violet-zaa9udu5`); production is separate (`ep-summer-boat-zapzp2t9`) and **has not been
migrated or synced yet** — see Known-shaky areas.

## What changed and why

**The architecture changed during Build, driven by measurement rather than argument.** The first
implementation stored reference data in Aheed's own database and imported the full GB datasets. It
worked — 1,749,109 postcodes imported successfully — and that is exactly how it proved itself wrong:

- Code-Point alone occupied **456.9 MB**, taking Aheed's whole database to **489.8 MB of its 512 MB
  ceiling**, against under 5 MB for every transactional table combined.
- The Open Names import then failed outright: `could not extend file because project size limit
  (512 MB) has been exceeded`, after parsing 1,042,656 records.
- Ordinary writes started failing too, which is how three unrelated live-DB tests began failing.

The owner ruled on both problems: a dedicated reusable reference database, and demand-driven
coverage rather than full-GB population. `plan.md` v2 carries the reasoning.

### The reference database

`prisma/reference/schema.prisma` is a second Prisma schema with its own datasource, its own
migration history (`prisma/reference/migrations/`) and its own generated client. Aheed's own schema
no longer declares any reference model; a comment at `prisma/schema.prisma` records why they left.

**Storage was treated as scarce even with a dedicated database.** `PostcodeReference` is keyed on
`normalisedPostcode` and `PlaceReference` on `sourceId` — no surrogate UUIDs, no per-row
`createdAt`/`updatedAt`/`sourceVersion`, because every row in a table comes from the same release
and that metadata belongs on `ReferenceDataset`. Measured effect: **261 → 148.4 bytes per row**.

### Demand-driven coverage

`ReferenceAreaCoverage` records which postcode **areas** have been successfully materialised, for
which source, at which upstream version. A row is written only *after* that area's import completes,
so an interrupted import can never make an area look covered.

This is what makes the validity model three-state and honest:

| Condition | Verdict |
|---|---|
| Area materialised, active row found | `VALID` |
| Area materialised, no active row | `INVALID` |
| Area **not** materialised | `UNVERIFIED` |
| Reference DB unconfigured, unreachable, or any failure | `UNVERIFIED` |

### The sync has two change dimensions

Work is needed when the upstream release changed **or** when required coverage changed. A
checksum-only check would exit `changed=false` while a newly configured area sat unimported — a
failure with no error and no output. `findOutstandingAreas` is the second dimension, and
`tests/reference-coverage.test.ts` plus the live run below both exercise it.

### Runtime

`lib/reference/postcode-reference-service.ts` is the only door. Nothing under `app/`, `components/`
or `features/` touches the reference client. `lib/delivery-eligibility.ts` joins its verdict with
the vendor's own `VendorDeliveryArea` rules — two questions, two owners, never merged.

`lib/postcodes-api.ts` and `features/checkout/postcode-lookup.ts` are **deleted**: checkout no
longer depends on a third-party postcode API, and there is deliberately no network fallback.

`CustomerAddress` is new — no saved-address mechanism existed. It is separate from the per-order
`Address` snapshot, which `placeOrder` still writes unchanged.

## Decisions taken during the build

**`fflate` added as an exact-pinned devDependency (`0.8.3`).** Both archives are zips and no zip
reader existed in the tree. Zero dependencies, pure JS, Node-only — it never reaches the Worker
bundle. Rejected: shelling out to `unzip`/`Expand-Archive` (platform-divergent), and writing an
inflater.

**Parse by the publisher's own header document, never by column ordinal.** Both archives ship their
column names in `Doc/`. Mapping from those means an upstream column insertion fails loudly as a
missing required column instead of silently reading the wrong field. Both archive layouts were
confirmed against the real releases before any parser was written.

**Open Names' ~1.6M `LOCAL_TYPE = Postcode` records are deliberately not imported.** They would
create a second postcode authority inside a system whose whole validity model rests on Code-Point
being the only one. Only `transportNetwork` and `populatedPlace` are kept.

**The proximity query is a bounding box plus exact distance in TypeScript.** Prisma cannot express a
Euclidean filter and raw SQL is banned in application code, so the database returns the enclosing
square and `rankNearbyStreets` discards the corners (which reach 354 m). Rejected: `$queryRaw`.

**Coordinates are stored as British National Grid, not lat/long.** Both datasets use that grid, so
distance is plain arithmetic in metres with no reprojection; WGS84 conversion runs only on rows
leaving through the API. `lib/osgb36.ts` is a dependency-free Helmert transform.

**Suggestion thresholds were calibrated against the real dataset, not chosen a priori.** See
Deviations — the spec's original figure was measurably wrong.

**The generated reference client lives in `node_modules/@aheed/reference-client`.** Generated
anywhere inside the project, webpack parses its `query_compiler_bg.wasm` as source and the OpenNext
build fails outright. `serverExternalPackages` is how `@prisma/client` escapes that, and it matches
package specifiers — which a relative path can never be. Consequence: `npm ci` wipes it, so both
deploy workflows now run `npm run db:generate` before building. They previously ran **no** generate
step, relying on `@prisma/client`'s postinstall, which would never have known about a second schema.

**`touchCustomerAddress` takes the WebSocket client.** Its scoped `updateMany` crashes
unconditionally on the HTTP adapter (#382), and it is reachable from a real request.

**Saved addresses are deleted, not redacted, on erasure.** An `Address` snapshot is load-bearing
financial history so it is redacted in place; a `CustomerAddress` carries no such weight.

## Deviations from the spec

**R33's density ceiling changed from 8 to 25, and a 200 m nearest-road rule was added.** Measured
against the real Open Names release over 4,000 real postcodes per city, the median number of
distinct roads within 250 m is **10** in Milton Keynes, **12** in central London and **7** in
Birmingham — so a ceiling of 8 would have suppressed street hints for **59% of Milton Keynes** and
73% of central London, disabling the feature for most shoppers while appearing to work. At
200 m / 25 the rule serves ~89% of MK and London and 77% of Birmingham, and **both** suppression
paths still fire (MK: 6.1% no candidate, 1.4% too far, 3.8% too dense). `requirements.md` R33 was
updated with the evidence before the code was written.

**R5b's "under 120 bytes per row" is not met — measured 148.4.** That figure was reasoned from
full-GB scale; at 46k rows the per-index fixed overhead is proportionally larger. The requirement
now records the measurement rather than restating a missed target. The budget's purpose is served:
261 → 148.4 per row, and 456.9 MB → 6.58 MB overall.

**The whole storage architecture deviates from spec v1**, which is why `plan.md` is at v2.0.0 and
requirements R1–R5b, R13–R27c and R40 were rewritten and re-approved mid-build.

## Known-shaky areas

**Production reference data does not exist yet.** `ep-summer-boat-zapzp2t9` has had **no migration
and no sync**. Until `npm run ref:migrate` and a sync run against it, production answers
`UNVERIFIED` for every postcode — which degrades correctly to manual entry, but means the feature is
dark there. Tracked as **#767**.

**`LU` is materialised for Code-Point but not Open Names**, left over from proving the coverage
dimension. Harmless and it demonstrates the capability: `LU1 1AA` returns `VALID` with no town and
no street hints, which is the correct behaviour when one source covers an area and the other does
not. If `MK,RG` is meant to be exact, drop the `LU` coverage row and its 6,464 postcodes.

**`addresses[]` is empty in every response and always will be until a licensed provider exists.**
Not a defect — see `lib/address-lookup-provider.ts` for why no lawful source exists today. Tracked
as **#766**. Validation should confirm it is empty, not look for candidates.

**The scheduled workflow has never run.** `sync-reference-data.yml` is untested end to end; only the
script it calls has been exercised, locally. Its `environment:` selects `staging`/`production`
secrets, and `UK_LOCATION_REF_POSTCODE_AREAS` must exist as a GitHub **variable** (not a secret) in
each environment — if it is absent the job fails closed with "no postcode areas configured", which
is the intended direction but will look like a broken workflow.

**Checkout's saved-address flow has not been driven end to end.** The API, the eligibility service
and both vendors were validated live, but placing a real order as a signed-in customer — writing a
`CustomerAddress`, returning, selecting it, and confirming the snapshot stayed immutable (R43,
R43a, R44, R45) — was not done. That is the thinnest coverage in the slice and is where validation
should start.

**A live test that proved nothing, worth repeating as a warning.** The first attempt at the
unreachable-database check appeared to pass while actually testing the healthy path: the env files
use `KEY = "value"` **with spaces around the `=`**, so a `^KEY=` substitution silently matched
nothing and the Worker kept the real URL. Note this conflicts with `CLAUDE.md`'s env-format rule
("no spaces around `=`"); the files parse fine in practice, but any script that rewrites them must
tolerate the spacing. Always verify an env edit landed before trusting the result.

**Dev's Aheed database holds leftover fixture vendors** (`test-vendor-*`, `concurrency-test-*`,
`express-test-*` with `AB` delivery areas) from the live-DB tests. Harmless, pre-existing, not from
this slice — but they appear in any vendor listing during validation.

**Live evidence already gathered** (so validation need not re-derive it):

```
Code-Point MK+RG   40,031 postcodes      (2.3% of the full-GB 1,749,109)
  re-run           unchanged, 0 written, nothing downloaded
  --areas +LU      "version 2026-08 (unchanged upstream) — importing areas: LU", 6,464 rows
Open Names MK+RG   23,472 records
Storage            20.50 MB of 512 MB

Aheed localhost:8787 (MK1-MK17) / SriMart srimart.localhost (RG)
  MK9 1AA   DELIVERABLE      / OUTSIDE_DELIVERY_AREA
  RG30 2BE  OUTSIDE          / DELIVERABLE
  MK99 9ZZ  INVALID_POSTCODE (covered area, genuinely absent)
  EH1 1YZ   UNVERIFIED       (real postcode, area not materialised)

Reference DB unreachable:
  MK9 1AA   HTTP 200 UNVERIFIED deliverable=true
  MK99 9ZZ  HTTP 200 UNVERIFIED deliverable=false   (was INVALID when reachable)
```

`MK17 8NL` independently validates the coordinate maths: this code converts Code-Point's grid
reference to `52.0103,-0.6436`, and postcodes.io reports `52.010298,-0.64353` for the same postcode
from data this code never saw.

## Fix (2026-09-16) — three gaps found at `/validate`

**Checkout's saved-address flow (R43, R43a, R44, R45) got its end-to-end run.** The gap this file
flagged above ("Checkout's saved-address flow has not been driven end to end") was closed at
`/validate`, not here — no code changed for it. Driven live as the demo customer via the
`Next-Action` header technique (`addToCart`) and a curl-submitted `useActionState` form
(`placeOrderAction`), through a real Stripe test-mode redirect: a `CustomerAddress` row and a
separate `Address` snapshot were both confirmed written, editing/deleting the saved address left the
snapshot byte-identical, the saved address was offered and filled every field with no lookup, and
temporarily removing the matching `VendorDeliveryArea` prefix confirmed `applySavedAddress`'s
re-check refuses correctly. Recorded here so this isn't re-flagged as untested next time.

**1. `scripts/verify-data-rights.ts`'s own R4 check failed — root cause, not this slice's fault
originally, but this slice's job to fix.** Its hardcoded top-level export-key list (written for an
earlier data-rights spec) never gained `savedAddresses`, which `exportPersonalData` now legitimately
returns. Every substantive CustomerAddress export/erasure assertion in the same script passed; only
this stale list was wrong. Fixed by adding `"savedAddresses"` to the `expected` array — confirmed
`npx tsx scripts/verify-data-rights.ts` now reports "All checks passed."

**2. R25b was genuinely unmet — no doc named the bootstrap commands.** `docs/model-handoff.md`
covered the two-database split and the production-dark/`UNVERIFIED` fact, but named only
`npm run ref:migrate` (schema) and never the two `sync-reference-data.ts` invocations that actually
populate the tables. Fixed by adding a "Bootstrapping the reference database" subsection to
`docs/developer-portal/env-setup.md` (the file's existing "Bootstrapping a fresh environment
database" pattern for Aheed's own DB made this the natural home, not `model-handoff.md`, which is
explicitly a point-in-time snapshot rather than an authoritative procedure doc), naming all four
commands verbatim and stating the `UNVERIFIED` degradation. Version bumped 1.10.0 → 1.11.0;
`npm run kms:validate` and a full `kms:assemble:internal` + `next build` of `kms/site-internal` both
confirmed clean, and `npm run kms:build-index` / `kms:check-generated` re-run since the doc's body
(not just its front-matter) changed.

**3. R8's "exactly one new directory" was wrong the moment the v1→v2 pivot happened, and nobody
went back to fix the count.** There are genuinely two: the v1 migration and the one that drops its
superseded tables. The protection R8 exists for (no dropped trigram indexes, clean `migrate status`)
held throughout — only the requirement's arithmetic was stale. Corrected `requirements.md` R8 and
its `validation.md` row to describe both directories and to diff against `origin/staging` rather
than assume `git status` still shows an uncommitted new directory.

No app behaviour changed by any of the three fixes, so no `CHANGELOG.md` entry — Gate 4's existing
`#764` entry already covers this slice's user-observable changes.
