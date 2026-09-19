# P9.2 — Vendor timezone becomes data, and the BST slot-picker day defect (build notes)

Branch `feature/363-vendor-timezone`, off `origin/staging` at `dfb11d3`. Spec commit `d95309a`,
implementation commit `35ecff1`. Closes `#363` and `#811`.

## What changed and why

**The column is on `VendorConfig`, not `Vendor`** (`prisma/schema.prisma`, migration
`20260919113731_p363_vendor_timezone`). The issue body said `Vendor.timezone`; `VendorConfig` holds
every other region-shaped and operational per-vendor value (`localityName`, delivery rules,
`bookingWindowDays`, `slotHoldDurationMinutes`) while `Vendor` holds identity. This was decided at
`/propose` and is recorded in `plan.md` too, so it is not read later as a slip.

**Resolution rides the existing profile rather than a new resolver.** `timezone` joins
`VendorProfile` (`lib/repositories/vendor.ts`) beside `bookingWindowDays`, selected in
`fetchVendorProfile`'s `config` block, with `DEFAULT_TIMEZONE` (`= STORE_TIMEZONE`) as the fallback
in the same style as the neighbouring `?? 14` / `?? 15`. `getCurrentVendorProfile()` is already
request-scoped and memoised with React `cache()` and already resolves the vendor from the request
host — the same vendor `requireVendorRole` resolves, since both go through `getCurrentVendorId()`.
A second resolver would have been a second way to answer one question.

**`lib/local-datetime.ts` gained four pure helpers and kept its posture.** `calendarDayInZone`,
`calendarDayToUtcMidnight`, `addCalendarDays`, `zoneWallClock` — all DB-free, session-free,
request-free, all taking the zone as an argument. The module is told the zone and never looks one
up, which is what keeps a plain `tsx` script able to exercise every conversion. Its header block was
rewritten: the "Why the timezone is a constant" rationale is now a historical note explaining why
P8.5f was right to defer, followed by what replaced it.

**The zone is a REQUIRED parameter, not an optional one**, through `parseCampaignForm`,
`optionalDate` and `optionalDateField`. An optional parameter would let a future caller silently
fall back to the platform constant with nothing failing — which is the defect itself. Making it
required turned `tsc` into the enforcement and immediately surfaced all three production call sites
plus sixteen test call sites. `#363` named two call sites and missed the read side
(`components/staff/CampaignForm.tsx`), which would have left write and read disagreeing about the
zone again — the exact pair `#362` created this module to keep in agreement.

**`#811`'s fix removes the zone from day selection rather than answering it.** The wire format
between `SlotPicker` and the server is a bare `YYYY-MM-DD` calendar day, and `Order.fulfilmentDate`
is always the UTC midnight of the vendor-local calendar day. That contract was already assumed by
`tests/slot-capacity.test.ts:105` and `tests/concurrency-slot-booking.test.ts:79`, both of which
build `fulfilmentDate` as UTC midnight — the tests encoded the right thing and the browser violated
it, which is why the suite stayed green through the whole defect. Touched:
`components/checkout/SlotPicker.tsx`, `features/checkout/slots.ts`,
`lib/fulfilment-slots-service.ts`, `lib/repositories/fulfilment-slots.ts`,
`features/checkout/place-order.ts`.

**The Express-collection window is the one part that genuinely needs the zone**, so it kept it:
`zoneWallClock(new Date(), timezone)` replaces `now.getDay()`/`now.getHours()`, inside the existing
`useEffect` so the hydration-safety comment at the top of that effect stays true. `timezone` was
added to its dependency array.

**The migration carries an idempotent data backfill.** Not in the original `/propose` scope — see
Decisions below.

**Persistent docs updated on this branch, not deferred:** `specs/decisions/ADR-004-multi-tenancy.md`
(1.12.0 → 1.13.0) — its "store timezone is a constant, not yet vendor data" implementation note is
replaced; and `docs/store-admin-guide/admin-tabs-guide.md`'s `/staff/fulfilment` section, which
previously ended "All times are UK local time, and there is currently no per-store setting for a
shop in another timezone."

## Decisions taken during the build

**The migration backfills `Order.fulfilmentDate`.** The spec's R2 called for it, but only because
the need was found while writing the spec, not at `/propose`. Both capacity queries
(`lib/repositories/fulfilment-slots.ts:50`, `lib/repositories/orders.ts:181`) match that column by
**exact equality**, so once new rows land on UTC midnight a BST-era row at 23:00Z would stop
counting against its own day. The statement re-reads the naive `TIMESTAMP(3)` as UTC, converts to
`Europe/London` (every existing row came from a UK browser against a UK vendor), truncates to that
calendar day, and leaves the naive UTC midnight the application now writes. Idempotent in both GMT
and BST, with a `WHERE` clause that makes the no-op observable as a row count of 0. DML in a
migration, which is not the "no raw SQL in application code" rule.

**Date-button labels format in `UTC`, not the vendor zone.** UTC midnight of 2026-09-19 rendered in
a negative-offset zone is the evening of the 18th, so labelling in the vendor's zone would have
reintroduced the same off-by-one for vendors west of Greenwich. The day string *is* the label; UTC
is the lens that shows it unchanged. Switched to `formatToParts` so one formatter produces weekday,
day and month instead of three.

**`isSupportedTimeZone` asks `Intl`, it does not match a list.** A hand-maintained allow-list would
drift from what `lib/local-datetime.ts` can actually convert with, and the point of the column is
that a stored zone is *usable*, not merely well-spelled. Nothing is normalised on the way in,
because the stored string is fed straight back to `Intl` and a round-trip that changed it would make
the staff page show something other than what was saved.

**`supportedTimeZones()` has an explicit fallback, and the form unions the stored value in.**
`Intl.supportedValuesOf` is not guaranteed on every runtime this ships to, and a silently-empty
select is the invisible-breakage shape `#750` exists to prevent. `FALLBACK_TIME_ZONES` covers the
zones this platform plausibly onboards into and deliberately includes the three `R17` names. Separately,
`FulfilmentSettingsForm` unions `settings.timezone` into the option list, so a vendor on a zone
outside the list cannot have the select quietly show someone else's zone as selected and save it on
the next submit.

**`addCalendarDays` returns an unparsable input unchanged rather than throwing.** This module never
throws, and every caller derives its day from `calendarDayInZone`, so the branch is unreachable by
construction. Throwing inside a client render would white-screen the checkout for a case that cannot
occur.

**A null `VendorProfile` falls back to the platform default in the two admin actions**, rather than
refusing the save. `requireVendorRole` has already resolved that vendor from the same host, so null
is not reachable in practice; refusing a valid campaign or discount save over it would be a worse
failure than converting in `Europe/London`.

**The settings control went on `/staff/fulfilment`, the existing page**, so the three-surface rule
for a *new* `/staff/*` page does not apply. The operator-guide sentence for that page did need
updating and was.

## Deviations from the spec

**None** in substance. Three validation rows were corrected during the build because they would not
have discriminated — recorded here because a fresh validator will see the edits in `git log`:

- **R6 and R25 originally specified `TZ=Pacific/Auckland` / `TZ=Europe/Berlin`.** Measured on this
  machine: Windows Node never receives a `TZ` value containing a slash — `process.env.TZ` is
  `undefined` and the run silently uses the system zone — so both rows were vacuous locally. They
  now use slash-free values (`UTC`, `PST8PDT`), which do propagate and do change the zone. Any IANA
  name still works on the Linux CI runner.
- **R19, R20 and R23's greps now say which hits are comments.** The code comments deliberately quote
  the old `toISOString()` / `now.getDay()` / `setHours(0,0,0,0)` behaviour, so the greps as first
  written return matches on a correct implementation and a fresh reader could call it a fail.
- **R26 originally said the two slot tests pass "unchanged".** `tests/slot-capacity.test.ts:78` had
  to change from `mondayDate.toISOString()` to the plain `"2026-09-14"` day, since
  `getAvailableSlotsForDate` no longer accepts an instant. The row now names that exact edit and
  states that `fulfilmentDate` construction is what must stay unchanged.

## Known-shaky areas

**`Intl.supportedValuesOf` on workerd is unverified.** Not exercised under `npm run preview` in this
context. If it is absent the select falls back to `FALLBACK_TIME_ZONES`, which contains the three
zones `R17` names, so the requirement passes either way — but the *list the operator sees* is 21
entries instead of ~450, and only a preview run distinguishes those. **R17 is the row to actually
run, not skim.**

**No E2E row was executed here, by design.** `R17` and `R25`'s browser halves need `npm run preview`
plus a DevTools timezone override, and `/validate` runs from a fresh context. `R25` in particular
is written to establish that the check discriminates — reproduce the wrong-day result against
**deployed staging** first. A check that cannot fail against the broken version proves nothing, and
that is exactly how this defect survived since `#401`.

**The `--slots` verification depends on seeded slot rows for weekday coverage.** It passed against
dev with 1–2 slots per weekday and 0 on Sunday. A database whose `VendorFulfilmentSlot` rows were
cleared would make every row trivially pass with `0 === 0`. Check the printed slot counts are
non-zero for at least some days before believing it.

**A correction made at build-notes time, worth knowing because it is in the git history.** `plan.md`
first said *six* staff surfaces format dates in the Worker's UTC. Four do
(`staff/errors/page.tsx:64`, `staff/payments/page.tsx:85,126`, `staff/team/page.tsx:66`,
`lib/saved-list.ts:98`); the other two — `staff/customers/page.tsx:109` and
`staff/reports/page.tsx:171` — call `toLocaleString("en-GB")` on loyalty-point **numbers**, not
dates, and are unaffected. Verified per file before filing **`#812`**, which carries the accurate
list. `plan.md` now says four and records the correction.

**Nothing has exercised a genuinely non-UK vendor end to end.** Both seeded vendors are UK, so every
live check ran with `Europe/London` as both the vendor zone and the platform default — the two
values that this slice's whole point is to separate. `--settings-roundtrip` writes `Asia/Karachi`
and `Indian/Kerguelen` and reads them back, and the unit tests use non-UK zones as arguments, but no
full page render or checkout has happened with a vendor whose zone differs from the default. That is
the thinnest coverage in the slice.

**`addCalendarDays`'s DST cases are asserted but not observed in production.** The spring-forward
test uses 29 March 2026; string arithmetic through UTC should make DST irrelevant by construction,
which is the claim, and the test is the only thing standing behind it.

**The backfill's row count on staging and production is unknown.** Dev had zero pre-existing skewed
rows (the two the check used were purpose-built and removed). The platform has never traded, so the
expected count is zero or near it — but the migration runs in CI against `DIRECT_URL`, and that is
where a non-zero count would first appear. Worth reading the migration step's output on the
`deploy-staging` run rather than assuming.
