# P9.2 — Vendor timezone becomes data, and the BST slot-picker day defect (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Every feature should have appropriate **Unit** and **Integration** testing, followed by relevant validation testing. Broader testing mainly happens before release. However, testing is risk-based: features involving auth, payments, UI changes, performance-sensitive APIs, databases, or external dependencies require additional relevant testing earlier.

1. **Unit Testing**
   - *When needed:* Every feature.
   - *Purpose:* Test isolated business logic, utilities, and components.
2. **Integration Testing**
   - *When needed:* Every feature. (Includes Contract testing).
   - *Purpose:* Verify the component works with its immediate dependencies (e.g., database, external services).
3. **System / End-to-End Testing**
   - *When needed:* For critical user journeys and validation testing.
   - *Purpose:* Validate that the feature works correctly in the real system.
4. **Regression & Acceptance Testing**
   - *When needed:* Mainly before release, or when changing core flows. (Includes Smoke and Sanity testing).
   - *Purpose:* Ensure existing functionality remains unbroken and acceptance criteria are met.
5. **Performance & Resilience Testing**
   - *When needed:* Mainly before release, or for performance-sensitive APIs. (Includes Load, Stress, and Spike testing).
   - *Purpose:* Ensure the system meets throughput/latency targets and degrades gracefully.
6. **Security & Accessibility Testing**
   - *When needed:* Mainly before release, or earlier for features involving auth, payments, or UI changes.
   - *Purpose:* Ensure the system is safe and accessible to all users.

---

## Before you start

This slice touches the database and the Workers runtime. **Validate with `npm run preview`, never
`npm run dev`** — `next dev` cannot load the WASM Prisma engine and silently renders an error state.
**Run `npx vitest run` alone**, not beside or straight after a build, or its forks pool can fail to
start workers and skip whole files while still exiting 0. After stopping `preview`, kill the whole
`node`/`workerd` process chain or the next build fails with `EBUSY`.

`specs/2026-09-19-p363-vendor-timezone/verify-vendor-timezone.ts` is the committed verification
script several rows below refer to, following the `verify-saved-lists.ts` / `verify-cancel.ts`
precedent. It takes `--prove-http` to drive the real preview server in addition to the repository
layer.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `grep -n 'timezone' prisma/schema.prisma` shows `timezone String @default("Europe/London")` inside the `VendorConfig` model, and `ls prisma/migrations/` shows a new directory whose `migration.sql` contains `ADD COLUMN "timezone"`. |
| R2  | Integration | Against dev Postgres: `npx tsx specs/2026-09-19-p363-vendor-timezone/verify-vendor-timezone.ts --backfill-check` seeds one `Order` at `2026-09-18T23:00:00Z` and one at `2026-09-15T00:00:00Z`, applies the migration's normalising statement, and asserts the first becomes `2026-09-19T00:00:00Z` while the second is unchanged; running the statement a second time reports 0 further changes. |
| R3  | Integration | `npx prisma migrate status` against `DIRECT_URL` reports no pending migrations and no drift, and `grep -ri 'drop index' prisma/migrations/ | grep -i trgm` returns nothing. |
| R4  | Unit | `npx vitest run tests/local-datetime.test.ts` exits 0 with cases covering all four new exports; `grep -n 'export function' lib/local-datetime.ts` lists `calendarDayInZone`, `addCalendarDays`, `calendarDayToUtcMidnight` and `zoneWallClock`. |
| R5  | Unit | `grep -nE "from \"@/lib/(db\|auth\|tenant)\"\|@prisma/client\|next/headers" lib/local-datetime.ts` returns nothing, and `grep -n 'STORE_TIMEZONE = ' lib/local-datetime.ts` still shows `"Europe/London"`. |
| R6  | Unit | `TZ=UTC npx vitest run tests/local-datetime.test.ts` and `TZ=Pacific/Auckland npx vitest run tests/local-datetime.test.ts` both exit 0 with identical assertion counts, and the file contains a case asserting `calendarDayInZone(new Date("2026-09-18T23:30:00Z"), "Europe/London") === "2026-09-19"`. |
| R7  | Integration | `npx tsx specs/2026-09-19-p363-vendor-timezone/verify-vendor-timezone.ts --profile` prints the resolved `timezone` for both seeded vendors from a real `fetchVendorProfile` call against dev Postgres. |
| R8  | Unit | `grep -n 'DEFAULT_TIMEZONE' lib/repositories/vendor.ts` shows the export and its use as the `??` fallback in the profile mapping. |
| R9  | Unit | `npx vitest run tests/vendor-profile.test.ts` exits 0, including a case with no `config` relation asserting `timezone === "Europe/London"`. |
| R10 | Unit | `grep -n 'export function parseCampaignForm' lib/campaign-form.ts` shows a second parameter declared `timeZone: string` — no `?`, no `=` default — and `grep -n 'parseLocalInput(' lib/campaign-form.ts` shows every call passing it. `npm run typecheck` exits 0. |
| R11 | Unit | `grep -n 'function optionalDateField' features/admin/discount-codes.ts` shows a required `timeZone: string` parameter, and `grep -n 'optionalDateField(' features/admin/discount-codes.ts` shows every call passing a resolved zone. |
| R12 | Unit | `grep -n 'parseCampaignForm' features/admin/campaigns.ts` shows the vendor timezone as the second argument, resolved before the call. |
| R13 | Unit | `grep -n 'formatLocalInput' components/staff/CampaignForm.tsx` shows both calls passing `timezone`, and `grep -n 'timezone' 'app/(admin)/staff/promotions/[categoryId]/page.tsx'` shows the prop being supplied. |
| R14 | Unit | `npx vitest run tests/campaign-form.test.ts` exits 0, including a case where the same `"2026-07-01T09:00"` string parses to two different instants under `"Europe/London"` and `"Asia/Karachi"`. |
| R15 | Unit | `npx vitest run tests/fulfilment-form.test.ts` exits 0 and `grep -n 'timezone' lib/fulfilment-form.ts` shows the field on `FulfilmentSettingsInput` and its validation branch. |
| R16 | Integration | `npx tsx specs/2026-09-19-p363-vendor-timezone/verify-vendor-timezone.ts --settings-roundtrip` writes `"Asia/Karachi"` through `updateFulfilmentSettingsForVendor` against dev Postgres, reads it back through `getFulfilmentSettingsForVendor`, asserts equality, then restores `"Europe/London"`. |
| R17 | E2E | Under `npm run preview`, sign in as the seeded admin and open `/staff/fulfilment`. Confirm the timezone control lists `Europe/London`, `Europe/Dublin` and `Asia/Karachi` and has the vendor's current value selected — an empty or three-entry list means the runtime lacks `Intl.supportedValuesOf` and the fallback list is in use, which is a fail unless the fallback itself contains those three. Then write a deliberately obscure zone via the `--settings-roundtrip` script above, reload, and confirm it still appears as the selected option. |
| R18 | Unit | `npx vitest run tests/fulfilment-form.test.ts` exits 0 with three named cases: a valid zone accepted, `"Not/AZone"` rejected with `field === "timezone"`, and the rejection returned rather than thrown. |
| R19 | Unit | `grep -n 'toISOString' components/checkout/SlotPicker.tsx` returns no line applied to a selected date, and the hidden input's `value` is the `YYYY-MM-DD` day string. |
| R20 | Unit | `grep -n 'Intl.DateTimeFormat' components/checkout/SlotPicker.tsx` shows every label formatter carrying an explicit `timeZone` option. |
| R21 | Integration | `npx tsx specs/2026-09-19-p363-vendor-timezone/verify-vendor-timezone.ts --slots` calls `getAvailableSlotsForDate` against dev Postgres for a known Saturday `YYYY-MM-DD` and asserts the returned slots are the Saturday rows; the same call with `"not-a-day"` returns `[]` and issues no query. |
| R22 | Unit | `grep -n 'calendarDayToUtcMidnight' features/checkout/place-order.ts` shows it replacing `new Date(rawFulfilmentDate)`, with the `null` case returning the existing field-error state. |
| R23 | Unit | `grep -n 'zoneWallClock' components/checkout/SlotPicker.tsx` shows the express check using it, still inside the `useEffect` at the top of the component, and `grep -n 'now.getDay()\|now.getHours()' components/checkout/SlotPicker.tsx` returns nothing. |
| R24 | Unit | `npx tsc --noEmit` exits 0, and `grep -n 'timezone' 'app/(storefront)/checkout/page.tsx' components/checkout/CheckoutForm.tsx components/checkout/SlotPicker.tsx` shows the prop declared and passed at each hop. |
| R25 | E2E | **The row that proves `#811`.** First establish the check discriminates: against **deployed staging** (pre-fix code), in Chrome with DevTools → Sensors → timezone overridden to a UTC+1 zone, load `/checkout` with a cart and pick a date whose weekday has slots — the list shown is the **previous** day's. Then, with `npm run preview` running locally (Worker runtime, UTC) on the slice branch: (a) `TZ=UTC npx tsx specs/2026-09-19-p363-vendor-timezone/verify-vendor-timezone.ts --prove-http` and the same command under `TZ=Europe/Berlin` both report the same submitted day string and the same weekday's slots; (b) repeat the Chrome check with the same UTC+1 override and confirm the slot list is now the picked day's; (c) complete the order and confirm the stored `Order.fulfilmentDate` reads exactly `T00:00:00.000Z` for the picked date. |
| R26 | Regression | `npx vitest run tests/slot-capacity.test.ts tests/concurrency-slot-booking.test.ts` exits 0. `git diff origin/staging -- tests/slot-capacity.test.ts tests/concurrency-slot-booking.test.ts` shows no change to any `fulfilmentDate:` line, and its only change is line 78's day argument becoming `"2026-09-14"`. |
| R27 | Unit | `grep -n -A 20 'store timezone' specs/decisions/ADR-004-multi-tenancy.md` shows the section naming `VendorConfig.timezone` and the `VendorProfile` resolution path, with no remaining sentence asserting the timezone is a constant. |
| R28 | Unit | `sed -n '1,60p' lib/local-datetime.ts` shows no current-tense "the timezone is a constant" claim and does show what replaced it. |
| R29 | Unit | `grep -n 'staff/fulfilment' docs/store-admin-guide/admin-tabs-guide.md` locates the section heading (line 173 before this slice); read that section and confirm it documents the timezone setting. Then open `/staff/fulfilment` under `npm run preview` and confirm each capability sentence added there names a control that is actually on the page — no test enforces this, so it is a read-and-compare step, not a command. |
| R30 | Integration | `npm run kms:validate` exits 0; `npm run kms:build-index` then `git status --short` shows no unexpected change; `npm run kms:assemble:internal` followed by a real `next build` in `kms/site-internal` exits 0. |
| R31 | Unit | `grep -n '2026-09-19-p363-vendor-timezone' ARTIFACT_INDEX.md` returns the plan entry. |
| R32 | Unit | `git diff origin/staging -- CHANGELOG.md` shows an entry naming `#363` and `#811` (Gate 4). |
| R33 | Regression | `npm run lint`, `npm run typecheck`, `npm run format:check` each exit 0, and `npx vitest run` — **run alone** — exits 0 with no unexpectedly skipped files. |
