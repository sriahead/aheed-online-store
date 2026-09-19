---
id: p363-vendor-timezone
title: "P9.2 — Vendor timezone becomes data, and the BST slot-picker day defect (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-19
visibility: internal
summary: "Adds VendorConfig.timezone with a staff control, threads it through the campaign and discount datetime-local conversion, and fixes the live BST defect where the slot picker returns the wrong calendar day's slots."
tags: [timezone, multi-tenancy, fulfilment, checkout, defect]
related: [adr-004-multi-tenancy, p10-fulfilment-config-and-checkout-fixes-plan, roadmap]
---

# P9.2 — Vendor timezone becomes data, and the BST slot-picker day defect (plan)

**Goal:** make the store's timezone per-vendor data rather than a platform constant (`#363`), and
in the same slice fix the live production defect that constant was hiding (`#811`) — during BST the
checkout slot picker asks the server for one calendar day and the server answers for a different
one.

These are one slice by owner decision, taken at `/propose` on 2026-09-19. They share a root cause:
nothing in the codebase can name a vendor's zone, so each piece of date code picks one by accident.
Fixing `#811` first would mean hardcoding `Europe/London` a second time, in a second place.

## Part A — `#363`, the timezone becomes data

`lib/local-datetime.ts:43` pins `STORE_TIMEZONE = "Europe/London"` platform-wide. Both seeded
vendors are UK, so today a constant and a column produce identical results for every row that
exists. ADR-004 decision 3 makes region, locality and delivery footprint vendor data; timezone is
the one region-shaped value still hardcoded, and the moment a non-UK vendor onboards every campaign
schedule and discount window on the platform is interpreted in London time.

**The column goes on `VendorConfig`, not `Vendor`** — a deliberate departure from the issue body.
`VendorConfig` already holds every region-shaped and operational per-vendor value (`localityName`,
the delivery rules, `bookingWindowDays`, `slotHoldDurationMinutes`, `prisma/schema.prisma:334-364`);
`Vendor` holds identity — slug, name, status, domains. Recorded here so it is not read as an
oversight.

**There are three call sites, not the two `#363` names.** The issue lists `lib/campaign-form.ts:99`
and `features/admin/discount-codes.ts:73`, both on the write side. It misses
`components/staff/CampaignForm.tsx:102`, which renders the stored instant back into the input
through `formatLocalInput`. Threading the zone into the writes alone would make write and read
disagree about which zone they mean — which is exactly the defect `#362` created this module to
kill.

**Scope (this slice):**

- `VendorConfig.timezone String @default("Europe/London")` — additive, Postgres backfills existing
  rows from the default, no data migration needed for this column.
- `timezone` added to `VendorProfile` (`lib/repositories/vendor.ts:71` neighbourhood) and selected
  in `fetchVendorProfile`'s `config` block, with a `DEFAULT_TIMEZONE` fallback in the same style as
  the existing `bookingWindowDays: config?.bookingWindowDays ?? 14`. This is the resolution path:
  `getCurrentVendorProfile()` is already request-scoped and memoised, already resolves the vendor
  from the request host, and already flows to the checkout page. No new resolver module.
- `lib/local-datetime.ts` stays pure, DB-free, session-free and request-free. Callers fetch the zone
  and pass it in; `STORE_TIMEZONE` survives as the platform default that `DEFAULT_TIMEZONE` refers
  to and as the default parameter value, so a vendor with no config row behaves exactly as today.
- `parseCampaignForm(raw, timeZone)` and `optionalDateField(form, field, timeZone)` take the zone as
  a **required** parameter. Deliberately not optional: an optional parameter lets a future caller
  silently reintroduce the platform constant, and nothing would fail.
- `components/staff/CampaignForm.tsx` takes a required `timezone` prop, passed by
  `app/(admin)/staff/promotions/[categoryId]/page.tsx`.
- An IANA timezone control in the fulfilment settings form on `/staff/fulfilment`, written through
  the existing `parseFulfilmentSettings` → `updateFulfilmentSettingsForVendor` path. The setting
  joins the four `VendorConfig` columns already edited there rather than opening a new surface.

**Why a staff control is in scope.** A column with no writer is the failure this repository has
already recorded twice — `#397` is "Done in code but inert in data", and `#750` existed solely
because `#401`/`#402` shipped models and logic with no administrative surface at all. Shipping the
column without the control would reproduce that shape on purpose.

## Part B — `#811`, the BST slot-picker day defect

Live in production at `187b5eb`. Found by reading the call chain during `/propose`, not from a
report.

1. `components/checkout/SlotPicker.tsx:30-34` seeds the selected date as `new Date()` with
   `setHours(0,0,0,0)` — **local midnight in the customer's browser zone**. The selectable list at
   `:79-85` is built the same way.
2. `:160` submits `selectedDate.toISOString()` as the hidden `fulfilmentDate` field; `:72` sends the
   same instant to the server action.
3. `features/checkout/slots.ts:11` and `lib/fulfilment-slots-service.ts:34` pass the string through
   unchanged — nothing normalises it.
4. `lib/repositories/fulfilment-slots.ts:32-33` does `new Date(dateStr).getDay()`, and **a Worker's
   `getDay()` is UTC**.

For a UK customer during BST, local midnight on Saturday 19 September is `2026-09-18T23:00:00Z`, so
`getDay()` returns 5 — Friday. The customer picked Saturday and is shown Friday's slots. The same
instant then reaches `Order.fulfilmentDate` through `features/checkout/place-order.ts:167`, so the
stored delivery date is 23:00 on the wrong day, and `lib/repositories/orders.ts:181`'s capacity
count matches on it.

**This is not an edge case near midnight.** It is every hour of every day for the whole BST period,
roughly late March to late October — including today.

**Why the test suite is green.** `tests/slot-capacity.test.ts:105` and
`tests/concurrency-slot-booking.test.ts:79` both construct `fulfilmentDate` as **UTC midnight**. The
tests encode the correct contract; it is the browser that violates it. And under `npm run dev` on a
UK laptop the browser and the Node process are both BST, so the two errors cancel exactly — the
same shape of cancellation that hid `#362`.

**The fix removes the zone from day selection rather than answering it.** The contract the tests
already assume becomes explicit and enforced end to end: **`Order.fulfilmentDate` is always UTC
midnight of the vendor-local calendar day**, and the wire format between picker and server is a
plain `YYYY-MM-DD` calendar day, never an instant.

**Scope (this slice):**

- Three pure helpers in `lib/local-datetime.ts`, same posture as the existing two —
  `calendarDayInZone(instant, timeZone)` → `YYYY-MM-DD`, `addCalendarDays(day, n)` → `YYYY-MM-DD`,
  and `calendarDayToUtcMidnight(day)` → `Date | null`.
- `SlotPicker` holds the selected day as a `YYYY-MM-DD` string computed in the **vendor's** zone,
  builds its date list with `addCalendarDays`, labels each button with
  `Intl.DateTimeFormat("en-GB", { timeZone, … })` so the label and the submitted value cannot
  disagree, and submits the day string in the hidden `fulfilmentDate` input.
- `getAvailableSlotsForDate` accepts a `YYYY-MM-DD` day, derives the weekday with `getUTCDay()` on
  its UTC midnight, and refuses a malformed value rather than silently reading `NaN`.
- `features/checkout/place-order.ts` builds `fulfilmentDate` via `calendarDayToUtcMidnight` instead
  of `new Date(rawFulfilmentDate)`.
- **The Express-collection window does need the zone.** `SlotPicker.tsx:54-61` compares
  `now.getDay()` / `now.getHours()` — the *customer's* zone — against `expressSchedules` times that
  mean the *vendor's*. It gets a fourth pure helper, `zoneWallClock(instant, timeZone)` →
  `{ dayOfWeek, hhmm }`, and stays inside the existing effect so the hydration-safety comment at
  `:37-40` remains true.
- `timezone` threaded server → `app/(storefront)/checkout/page.tsx:113` neighbourhood →
  `CheckoutForm` → `SlotPicker`, on the identical path `bookingWindowDays` already takes.
- **A one-time data backfill in the migration.** Existing `Order.fulfilmentDate` rows written during
  BST hold 23:00Z of the preceding day; after this change the capacity queries match on UTC
  midnight, so those rows would stop counting against their own day. The migration normalises them:
  the intended calendar day is the stored instant's day in `Europe/London` (every existing row came
  from a UK browser against a UK vendor), re-anchored to UTC midnight. It is idempotent for rows
  already at UTC midnight. Generated `--create-only` and the SQL read before it applies, per the
  standing `pg_trgm` rule.

## Standing decisions this slice changes

- **`specs/decisions/ADR-004-multi-tenancy.md`** §"Implementation note — store timezone is a
  constant, not yet vendor data" (line 317, added P8.5f 2026-08-25) is superseded and must be
  rewritten to record that the column now exists, where it lives, and how it is resolved.
- **`lib/local-datetime.ts`**'s "Why the timezone is a constant" header block (lines 33-40) states a
  decision that this slice reverses. It is rewritten, not deleted — the reasoning for why a constant
  was correct for `#362` stays, with what replaced it.
- **`specs/2026-09-14-p10-fulfilment-config-and-checkout-fixes/plan.md`** excluded `#363` with "Slot
  times remain UK-local. Unchanged by this slice." That exclusion is now spent; it is a historical
  slice document and is **not** edited, but the ADR-004 rewrite is what a future reader will find.

## Deliberately excluded

- **Four surfaces that render dates with a bare `toLocaleDateString`/`toLocaleString`** —
  `staff/errors/page.tsx:64`, `staff/payments/page.tsx:85,126`, `staff/team/page.tsx:66` and
  `lib/saved-list.ts:98`. With no `timeZone` option these render in the Worker's UTC rather than
  the vendor's zone. Real, but display-only and a different shape of fix. Kept out rather than
  allowed to enlarge this slice; **filed as `#812`** at build-notes time. (An earlier draft of this
  document said *six*, counting `staff/customers/page.tsx:109` and `staff/reports/page.tsx:171` —
  those two format loyalty-point **numbers**, not dates, and are unaffected.)
- **A timezone column on `Vendor` rather than `VendorConfig`.** Considered and rejected above.
- **Per-vendor locale or currency formatting.** `Order.currency` already exists and the discovery
  log's 2026-09-07 finding covers the hardcoded pound sign in six UI implementations. Zone and
  locale are separate concerns and this slice touches only the zone.
- **Changing `VendorFulfilmentSlot.startTime`/`endTime` or `VendorExpressSchedule` to carry a zone.**
  They are vendor wall-clock times by definition and stay plain `HH:mm` strings; the zone that
  interprets them now has a home.
- **A capacity or rounds model beyond the per-slot `capacity` integer.** The discovery log's
  2026-09-02 finding still asks Aheed for van count and round size; unanswered, and not answered
  here.
- **Any DST-transition policy for slots.** A vendor whose clocks change mid-booking-window gets the
  calendar day right, which is what `#811` is about. Whether a 01:30 slot on a spring-forward
  Sunday should exist at all is a merchandising question nobody has asked.
- **Wiring the timezone into transactional email or invoice rendering.** No date in those surfaces
  is currently zone-sensitive in a way a customer would notice, and `#104` still gates real sending.

## Open items carried forward

- **`#422`** (does Aheed trade from more than one physical site) is untouched. A second site in a
  different zone would need the column per *location*, not per vendor. Named here so a future reader
  does not mistake this slice for having answered it.
- **The staff-page `toLocaleDateString` gap** described under "Deliberately excluded" above — four
  surfaces rendering dates in the Worker's UTC. Filed as **`#812`** (board Phase `P10`).
- **Whether any production `Order` row actually carries a BST-skewed `fulfilmentDate`** is unknown
  until the migration runs — the platform has never traded (`#113`, `#104`), so the expected count
  is zero or near it, and the backfill exists for correctness rather than for a known volume.
