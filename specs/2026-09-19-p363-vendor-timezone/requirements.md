# P9.2 — Vendor timezone becomes data, and the BST slot-picker day defect (requirements)

Closes `#363` (the store timezone is a platform constant, blocking non-UK vendor onboarding) and
`#811` (during BST the checkout slot picker returns the wrong calendar day's slots, live in
production at `187b5eb`). Both are the same root cause: no vendor timezone exists, so each piece of
date code picks a zone by accident. This slice adds `VendorConfig.timezone` with a staff control,
threads it through the two `datetime-local` conversion paths and their read side, and makes the
calendar day travelling between the slot picker and the server a plain `YYYY-MM-DD` string anchored
to UTC midnight. See `plan.md` for why the column sits on `VendorConfig` and why day selection stops
carrying an instant at all.

Throughout: `Europe/London` remains the platform default, and a vendor with no `VendorConfig` row
behaves exactly as it does today.

## Schema and data

R1. `prisma/schema.prisma`'s `VendorConfig` model declares `timezone String @default("Europe/London")`,
    and a migration directory under `prisma/migrations/` adds that column.

R2. The same migration normalises every existing non-null `"Order"."fulfilmentDate"` to UTC midnight
    of the calendar day that instant falls on in `Europe/London`, and re-running the statement
    changes no further rows.

R3. `npx prisma migrate status` against `DIRECT_URL` reports no pending migration and no drift after
    the migration applies, and the migration SQL contains no `DROP INDEX` against a `pg_trgm` index.

## The pure conversion layer

R4. `lib/local-datetime.ts` exports `calendarDayInZone(instant: Date, timeZone: string): string`
    returning `YYYY-MM-DD`, `addCalendarDays(day: string, n: number): string`,
    `calendarDayToUtcMidnight(day: string): Date | null` returning `null` for any string that is not
    a real `YYYY-MM-DD` calendar day, and `zoneWallClock(instant: Date, timeZone: string): { dayOfWeek: number; hhmm: string }`
    where `dayOfWeek` is `0`=Sunday and `hhmm` is zero-padded 24-hour.

R5. `lib/local-datetime.ts` still exports `STORE_TIMEZONE` with the value `"Europe/London"`, and the
    file imports nothing from `@/lib/db`, `@prisma/client`, `next/headers`, `@/lib/auth` or
    `@/lib/tenant` — it remains pure, DB-free, session-free and request-free.

R6. `tests/local-datetime.test.ts` asserts each of the four new helpers under both `TZ=UTC` and a
    non-UK `TZ`, and includes at least one case inside British Summer Time proving
    `calendarDayInZone` returns the London calendar day rather than the UTC one.

## Resolution path

R7. `VendorProfile` in `lib/repositories/vendor.ts` carries a `timezone: string` field,
    `fetchVendorProfile` selects `timezone` from the `config` relation, and a vendor whose
    `VendorConfig` row is absent resolves to `"Europe/London"`.

R8. `lib/repositories/vendor.ts` exports a `DEFAULT_TIMEZONE` constant equal to `STORE_TIMEZONE`,
    used as that fallback, matching the existing `DEFAULT_SENDER_NAME`/`DEFAULT_SEARCH_PLACEHOLDER`
    precedent in the same file.

R9. `tests/vendor-profile.test.ts` asserts both that a configured `timezone` is returned and that a
    missing config row falls back to `"Europe/London"`.

## Campaign and discount date conversion (`#363`)

R10. `parseCampaignForm` in `lib/campaign-form.ts` takes the timezone as a **required** second
     parameter (not optional, not defaulted), and every `parseLocalInput` call inside that file
     passes it. `npx tsc --noEmit` fails if a caller omits it.

R11. `optionalDateField` in `features/admin/discount-codes.ts` takes the timezone as a **required**
     parameter, and both the create and the update action resolve it from the current vendor before
     parsing any date field.

R12. `features/admin/campaigns.ts`'s `saveCampaign` resolves the vendor's timezone and passes it to
     `parseCampaignForm`.

R13. `components/staff/CampaignForm.tsx` takes a required `timezone` prop and passes it to both
     `formatLocalInput` calls; `app/(admin)/staff/promotions/[categoryId]/page.tsx` supplies it from
     the current vendor profile.

R14. `tests/campaign-form.test.ts` asserts that the same submitted `datetime-local` string parses to
     two different instants under two different timezone arguments.

## Staff control (`/staff/fulfilment`)

R15. `lib/fulfilment-form.ts`'s `FulfilmentSettingsInput` carries `timezone: string`, and
     `parseFulfilmentSettings` returns a field error naming `timezone` for any value that
     `Intl.DateTimeFormat` rejects as a time zone, rather than throwing or persisting it.

R16. `updateFulfilmentSettingsForVendor` writes `timezone`, and `getFulfilmentSettingsForVendor`
     reads it back with a `"Europe/London"` fallback.

R17. The fulfilment settings form on `/staff/fulfilment` renders a timezone control whose option
     list is non-empty under the Workers runtime and includes at least `Europe/London`,
     `Europe/Dublin` and `Asia/Karachi`, and which always offers the vendor's currently-stored value
     as an option even when that value is absent from the runtime's generated zone list.

R18. `tests/fulfilment-form.test.ts` asserts that a valid IANA zone is accepted, that an invalid
     string is rejected with `field === "timezone"`, and that the rejection does not throw.

## The BST day defect (`#811`)

R19. `components/checkout/SlotPicker.tsx` holds the selected day as a `YYYY-MM-DD` string derived in
     the vendor's timezone, submits that string in the hidden `fulfilmentDate` input, and passes it
     unchanged to the slot server action — no `toISOString()` call remains on a selected date.

R20. Each date button's visible label in `SlotPicker` is produced by an `Intl.DateTimeFormat` call
     carrying an explicit `timeZone`, so the label and the submitted value name the same calendar
     day in every browser zone.

R21. `getAvailableSlotsForDate` in `lib/repositories/fulfilment-slots.ts` accepts a `YYYY-MM-DD` day,
     derives its weekday with `getUTCDay()` on the UTC midnight of that day, and returns an empty
     array for a malformed day string rather than querying with `NaN`.

R22. `features/checkout/place-order.ts` builds `fulfilmentDate` with `calendarDayToUtcMidnight` and
     refuses the order with its existing field-error path when that returns `null`.

R23. The Express-collection availability check in `SlotPicker.tsx` compares `expressSchedules`
     against `zoneWallClock(new Date(), timezone)` rather than `now.getDay()`/`now.getHours()`, and
     the comparison stays inside the existing `useEffect` so no hydration mismatch is introduced.

R24. `timezone` flows from `app/(storefront)/checkout/page.tsx` through `CheckoutForm` to
     `SlotPicker` as a required prop on the same path `bookingWindowDays` already takes.

R25. With the server running `npm run preview` (Worker runtime, UTC) and a browser in a UTC+1
     zone, selecting a given date in the slot picker returns that same date's slots, and the
     resulting `Order.fulfilmentDate` is UTC midnight of that date.

R26. `tests/slot-capacity.test.ts` and `tests/concurrency-slot-booking.test.ts` both still pass, and
     their `fulfilmentDate` construction is **unchanged** — both already build it as UTC midnight,
     which this slice turns from a coincidence into the enforced contract. The one edit expected in
     `tests/slot-capacity.test.ts` is its **day argument**: line 78's
     `mondayStr = mondayDate.toISOString()` becomes the plain `"2026-09-14"` calendar day, because
     `getAvailableSlotsForDate` no longer accepts an instant. It accepts `YYYY-MM-DD` only —
     deliberately not both, since accepting both restores the ambiguity `#811` is made of.

## Documentation

R27. `specs/decisions/ADR-004-multi-tenancy.md`'s "Implementation note — store timezone is a
     constant, not yet vendor data" section records that the column now exists, names
     `VendorConfig.timezone` and the `VendorProfile` resolution path, and no longer states that the
     timezone is a constant.

R28. `lib/local-datetime.ts`'s header block no longer contains the "Why the timezone is a constant"
     rationale as a current statement; it records what replaced it and keeps why a constant was
     correct for `#362`.

R29. `docs/store-admin-guide/admin-tabs-guide.md`'s `/staff/fulfilment` section documents the
     timezone setting, and every capability sentence added there corresponds to a control that
     exists on the page.

R30. `npm run kms:validate` exits 0, `npm run kms:build-index` leaves no uncommitted change, and a
     real `next build` in `kms/site-internal` succeeds after `npm run kms:assemble:internal`.

R31. `ARTIFACT_INDEX.md` carries an entry for `specs/2026-09-19-p363-vendor-timezone/plan.md`.

## Gates

R32. `CHANGELOG.md` updated (Gate 4).

R33. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
