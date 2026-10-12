# Storefront footer — holiday-aware hours, contact channels, three-column bottom bar (build notes)

Written at the end of Build, before the Clear. Branch `feature/p1060-footer-hours-contact`, cut
from `origin/staging` after #1055 (PR #1059) had merged there. Commits:

- `7cf7718`: the spec;
- `3a6e371`: the R22a amendment;
- `104e284`: the implementation;
- the build-notes commit containing this file.

Built in one Opus 5.5 session, the same one that validated and shipped #1055.

**#1055 is held on `staging`** (owner decision on #1060): its `/document` stage and its promotion
both wait, so that #1055 and #1060 go to production in one promotion PR.

## What changed and why

- **Schema and migration `20261012180000_p1060_footer_weekly_hours`.**
  - The SQL was generated **without a database**, with
    `prisma migrate diff --from-schema-datamodel <origin/staging schema> --to-schema-datamodel prisma/schema.prisma --script`.
    This is the same fallback #1055 used; neither datamodel holds the `pg_trgm` indexes.
  - I read it in full. It drops the `VendorOpeningHours` foreign key and table, creates
    `VendorWeeklyHours` and `VendorHoursOverride` with their unique indexes and foreign keys, and
    does nothing else. A header comment records why the drop is safe: #1055's table exists only on
    staging and dev.
- **`lib/footer-hours.ts` (new, pure).**
  - `formatTime`, `formatHours` and `formatOverrideDate` format times and dates.
    `formatOverrideDate` works on the calendar day itself, so no zone is involved.
  - `buildOpeningHoursView(weekly, overrides, now)` takes "today" from
    `calendarDayInZone`/`zoneWallClock` in `lib/local-datetime.ts`.
  - The window compares `YYYY-MM-DD` strings, from `today + 1` to `addCalendarDays(today, 14)`.
- **`lib/contact-channels.ts` (new, pure)** and **`components/layout/contact-channel-icons.tsx`
  (new)**. The channel rules move out of `FloatingContact` unchanged.
- **`components/assistant/AssistantLauncher.tsx` (new)** is the provider holding "assistant open"
  and the opening element. It mounts `<HelpAssistant>` once. `StorefrontChrome` wraps the header,
  the content, the footer and `FloatingContact` in it. `CookieBanner`, `QuickViewDrawer` and
  `RewardsLauncher` stay outside, because they don't need it.
- **`FloatingContact`** maps `contactChannels()` in a `flex-col` panel. The old panel was
  `flex-col-reverse` over the reverse DOM order, so the visual top-to-bottom order is the same. It
  no longer owns any assistant state.
- **The footer.**
  - Column 2 renders the view. Today's weekly row is a `display: contents` wrapper carrying
    `aria-current="date"` plus `font-bold text-[var(--footer-heading)]`.
  - The new client component `FooterContactChannels` renders the channel row. The channel list
    itself is computed on the server, in `StorefrontFooter`, and passed down as props.
  - The bottom bar is one grid with `order-*`.
  - The new `assistantAvailable` prop comes from a single value computed in `StorefrontChrome`
    and passed to both the footer and `FloatingContact`.
- **Staff forms (`components/staff/FooterSettingsForms.tsx`).**
  - The hours form now has 7 `fieldset` rows, Monday to Sunday, each with two `type=time`
    inputs and "Closed all day".
  - New "Holiday & closure dates" section: an add form whose date input has `min={today}`, plus a
    list where each row has its own `useActionState` delete form.
  - `app/(admin)/staff/storefront/page.tsx` passes `weeklyHours`, the overrides from today on, and
    `today`.
- **Actions (`features/admin/storefront.ts`).** `updateFooterHours` is rewritten;
  `saveHoursOverride` and `deleteHoursOverride` are new. Each starts with
  `requireVendorRole("ADMIN")`. "Today" is `calendarDayInZone(new Date())`.
- **Repository.**
  - `fetchVendorProfile` selects `weeklyHours` and `hoursOverrides`, including the override `id`,
    which the staff Delete needs, in the same single `findUnique`. It maps `@db.Date` to
    `YYYY-MM-DD` with `toISOString().slice(0, 10)`.
  - `replaceVendorFooterHours` keeps the WebSocket transaction.
  - `saveVendorHoursOverride` takes the HTTP client and runs prune, `findUnique`, `count`, then
    `upsert`.
  - `deleteVendorHoursOverride` runs `deleteMany({ id, vendorId })`.
  - The service wrappers are in `lib/vendor-service.ts`.
- **Seed.**
  - `prisma/seed-footer.ts` (new) holds `FooterDefaults`, `AHEED_FOOTER_DEFAULTS`,
    `AHEED_VENDOR_ID` and `seedFooterDefaults(prisma, vendorId, d)`. `prisma/seed.ts` imports it.
  - `scripts/seed-footer-defaults.ts` (new, R22a) runs only that step against `DIRECT_URL`. It
    prints the target host and exits 1 when Aheed is absent.
- **Docs.**
  - `docs/store-admin-guide/admin-tabs-guide.md` is at 2.11.0. `ARTIFACT_INDEX.md` and
    `app/(admin)/staff/runbook/docs.ts` were regenerated with `kms:build-index`.
  - `specs/design-system.md` 1.19.0 adds "Footer layout rules (#1060)".
- **Tests.**
  - New: `lib/footer-hours.test.ts` (17 tests), `lib/contact-channels.test.ts` and a rewritten
    `lib/footer-hours-form.test.ts` (19 tests).
  - `tests/storefront-footer.test.tsx` is updated, with a fixture change and new cases for today's
    highlight, holiday hours and the assistant button.
  - `tests/help-assistant-panel.test.tsx` is **unchanged** and passes.

## Decisions taken during the build

- **`FloatingContact` brings its own provider when it has none above it.** R10 requires the
  existing FloatingContact tests to pass unchanged, and they render it bare. When it finds no
  launcher context, it wraps itself in `AssistantLauncherProvider`. Inside the storefront it always
  finds the chrome's provider, so `HelpAssistant` still has exactly one mount point in the source:
  the provider.
- **The today-highlight wrapper is a `contents` div, not a styled `dt`/`dd` pair.** That keeps the
  `dl` grid columns aligned. Font weight and colour inherit to `dt`/`dd`.
  `getComputedStyle(wrapper)` still reports `700` and the heading colour, which R7 measures.
- **Badges shrank from 48×30 to 40×24** (`h-6 w-10`, `gap-1.5`) so that five fit on one row in a
  quarter column at 1024px. That column is about 236px wide, and five badges need 224px.
- **Bottom padding is `pb-40 sm:pb-44`** (160px / 176px), from the measured floating stack: the
  contact trigger's top edge is at `bottom-24` + `h-12` = 144px, or `bottom-28` + `h-12` = 160px
  from `sm`. The tradeoff is a tall empty band at the foot of the footer on desktop. The design
  system now records that raising any floating button means raising this padding too.
- **Separators** are `aria-hidden` `·` spans with the same `min-h-tap` tap-height classes as the
  links, so the legal row stays one line box and passes the 44px rule on mobile.
- **`saveVendorHoursOverride` counts all rows after pruning past ones**, which equals the
  "upcoming" count the cap of 50 is defined on. Replacing an existing date skips the cap check.
- **`seedFooterDefaults` now skips the `vendorConfig.update` when there is nothing to fill.** Before,
  it always wrote, which moved `updatedAt`. R22a's validation compares `config` "byte-identical
  apart from `updatedAt`" either way, but no write is cleaner.
- **`AHEED_VENDOR_ID` is now declared twice**, in `prisma/seed.ts` (unchanged) and in
  `prisma/seed-footer.ts` (for the script). Both values are the literal
  `a4ed0000-0000-4000-a000-000000000001`. I didn't make `seed.ts` import it, to keep its diff
  minimal.
- **Staff copy is vendor-neutral.** The override name placeholder is "e.g. a public holiday", and
  the error examples name days of the week only.

**Deferred items filed 2026-10-12 (P10, Backlog):**

- `#1061`: hours that run past midnight, and split days.
- `#1062`: recurring overrides and UK bank-holiday import.

The open-now badge and JSON-LD stay in `#1057`.

## Deviations from the spec

- **The bottom-bar grid switches at `lg` (1024px), not `md` (768px) as `plan.md` §3 says.**
  - At 768px a quarter column is about 172px. The non-wrapping Stripe line (about 220px) would
    overflow it past the viewport edge, which means horizontal scroll, and that breaks #1055's
    375px/no-scroll intent and good layout generally.
  - R13 measures at 1024 and 1280 and R15 at 375 and 1280, so every requirement still holds.
    Between 768 and 1023 the bar is stacked: payment, legal, company.
- **R7's "today's row … computed `color` equals `--footer-heading`" is satisfied on the wrapper
  element**, the `contents` div carrying `aria-current`. Its `dt`/`dd` children inherit the colour.

## Known-shaky areas

- **The migration is not applied to dev yet.** Before `/validate`, the user must run
  `! npx prisma migrate deploy`; auto mode blocks it. Until then:
  - the DB-backed tests that create a `Vendor` will fail on the missing tables;
  - `npm run preview` 500s on every storefront page, because `fetchVendorProfile` selects
    `weeklyHours`.
  - **After migrating, run the seed** (validation Setup step 3) so that Aheed has weekly rows.
- **Staging, after this slice deploys there:**
  - the migration drops staging's free-text `VendorOpeningHours` rows, which the owner agreed to;
  - the user then runs `DIRECT_URL=<staging direct URL> npx tsx scripts/seed-footer-defaults.ts`
    (the owner asked for staging to be seeded), or re-enters the hours by hand.

  The script fills only weekly hours, badges and null contact/legal values. Staging's admin-entered
  company number, VAT and so on are not null, so they are kept.
- **Never driven in a real browser.** All of these remain browser-only checks: the layout rows
  (R13–R16), the footer assistant button opening the shared panel (R12), today's highlight under
  real `Europe/London` time (R7), and the staff forms (R19). jsdom covers the logic only.
- **R12 focus return from the footer button** is untested by unit test. The provider focuses the
  element passed to `open()`. For the footer that is the `<button>` in the channel row, which is
  always mounted, so it should hold.
- **R16 at 1280px:** the padding is computed from Tailwind's documented offsets, not measured. If
  the Rewards launcher or cart button is taller than assumed (they are about 44–48px), check
  against the real rects.
- **Full-suite timeouts:** `tests/token-alpha-purity.test.ts` timed out (5s) twice in the full
  `npx vitest run` and passed 3/3 alone. That is the documented Windows forks-pool behaviour, not
  a regression.
- **Inherited from #1055 and still true:** a re-seed refills a contact or legal field an admin
  deliberately cleared, because fill-only treats null as "never set". This now also applies to
  `scripts/seed-footer-defaults.ts`. Run it once on staging, not repeatedly.
