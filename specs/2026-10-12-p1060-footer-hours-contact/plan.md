---
id: p1060-footer-hours-contact
title: "Storefront footer — holiday-aware opening hours, contact channel buttons, three-column bottom bar (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-12
visibility: internal
summary: "Follow-up to #1055: structured weekly opening hours plus dated holiday overrides with today highlighted, FloatingContact's channel buttons in the footer from one shared source, and a 50/25/25 bottom bar the floating buttons no longer cover."
tags: [storefront, footer, multi-vendor, staff-panel, opening-hours]
related: [p1055-storefront-footer, design-system, app-conventions]
---

# Plan — #1060 storefront footer: hours, contact channels, bottom bar

**Goal:** a shopper can see the shop's real opening hours, with today's row highlighted and any
holiday or closure in the next fortnight shown. They can reach the shop through the same contact
channels the floating contact button offers. They can read the legal and payment bar without a
floating button covering it. A store admin manages the weekly schedule and the holiday dates on
`/staff/storefront`.

This builds on #1055 (`specs/2026-10-12-p1055-storefront-footer/`). That slice is merged to
`staging` (PR #1059) and **deliberately held there**: the owner decided on 2026-10-12 that #1055 and
#1060 are promoted to production together. As a result, production never receives #1055's free-text
`VendorOpeningHours` table, which this slice replaces. Where this plan and #1055's spec disagree,
this plan wins. The parts of #1055 that this slice does not touch stay as specified there: column 1,
the colours, the column-3 links, the contact & legal form, and the badges.

## Owner decisions (2026-10-12, recorded on #1060)

1. **Hours are real times, not free text.** The weekly schedule stores, per weekday, an open time
   and a close time (`HH:mm`), or "closed all day". The display text ("9am – 8pm") is formatted from
   the times. This follows the `VendorExpressSchedule` precedent (`dayOfWeek`, `openTime`,
   `closeTime` as `HH:mm` strings).
   - **Consequence:** the `[OPEN]` / `[CLOSE]` / `[HOURS]` placeholders seeded by #1055 cannot be
     stored. The owner confirmed real hours for Aheed's seed: **Mon–Sat 09:00–20:00, Sun
     09:00–19:00**.
   - Every other placeholder (`[YOUR EMAIL]`, `[NUMBER]`, `[PLATFORM NAME]`) is unchanged.
2. **Holiday / closure overrides:** each is `{ date, label, open–close times | closed all day }`.
3. **The footer contact row mirrors `FloatingContact` exactly**, including the help-assistant
   button. That button opens the same assistant panel, through state shared between the two
   components.
4. **Staging's existing free-text rows are not migrated.** An admin re-enters them on the staff form
   after the deploy. Production has no rows, because #1055 never reached it.

## Scope (this slice)

### 1. Data model — `prisma/schema.prisma` + one migration

- **Drop** `VendorOpeningHours`, which #1055 created (staging and dev only).
- **Add** `VendorWeeklyHours`: `id`, `vendorId` (Cascade), `dayOfWeek Int` (0 = Sunday … 6 =
  Saturday, matching `VendorExpressSchedule` and JavaScript's `getDay()`), `openTime String?`,
  `closeTime String?` (both `HH:mm`) and `closed Boolean @default(false)`, with
  `@@unique([vendorId, dayOfWeek])`. A weekday with no row is "not set", and the footer omits it.
- **Add** `VendorHoursOverride`: `id`, `vendorId` (Cascade), `date DateTime @db.Date` (the same
  calendar-day convention as the existing `@db.Date` column at `prisma/schema.prisma` and
  `lib/local-datetime.ts`), `label String`, `openTime String?`, `closeTime String?`,
  `closed Boolean @default(false)`, with `@@unique([vendorId, date])`. There is one override per
  day, so saving a date that already has one **replaces** it. That is the edit path.
- `VendorConfig.openingHoursNote` stays as it is.
- **Invariant**, enforced by the parsers (not the database, matching the express-schedule
  precedent): `closed = true` means both times are null; `closed = false` means both times are
  present and `openTime < closeTime`. Hours that run past midnight are excluded (see below).

### 2. Pure logic — `lib/footer-hours.ts` (new)

`buildOpeningHoursView(weekly, overrides, now)` is a pure function with no I/O. The current instant
is passed in, so the unit tests can pin "today", including across BST/GMT and late-evening UTC
instants.

- **"Today"** is the calendar day and weekday in `STORE_TIMEZONE`, from `calendarDayInZone` and
  `zoneWallClock` in `lib/local-datetime.ts`. It is never the server's UTC day: at 23:30 UTC on a
  Sunday in BST, it is already Monday in London.
- **Weekly rows** are returned in **Monday → Sunday** order (UK convention, and the owner's
  screenshot), each with a weekday name, a display string, and `isToday`.
- **Override on today:** if an override exists for today, today's weekly row shows that override
  instead (`"{label} · {hours | Closed}"`) and stays highlighted. It is not repeated under Holiday
  hours. If today's weekday has no weekly row, the today override leads the Holiday hours list,
  highlighted.
- **Holiday hours:** overrides dated from today + 1 to today + 14 inclusive, in date order. Each is
  formatted `"{Ddd D Mmm} · {label} · {hours | Closed}"`, e.g. `Fri 25 Dec · Christmas Day · Closed`.
  Past overrides and overrides beyond the window are not shown.
- **Time format:** `formatTime("09:00") = "9am"`, `"09:30" = "9:30am"`, `"12:00" = "12pm"`,
  `"00:00" = "12am"`, `"20:00" = "8pm"`. A range is `"{open} – {close}"`, with an en dash and a
  space on each side.

### 3. Rendering — `components/layout/StorefrontFooter.tsx`

- **Column 2** renders the view. Today's row carries `aria-current="date"` and is bold in the footer
  heading colour (`--footer-heading`, already AA-clamped). When the "Holiday hours" sub-heading
  exists, it comes after the weekly rows and before `openingHoursNote`.
  - Column 2 is hidden when there are no weekly rows, no today override, no override in the window,
    and no note. This is #1055's null-hides rule.
- **Column 3**: the stand-alone Facebook button from #1055 is replaced by a **row of channel
  buttons**: circular, 44 × 44px, the existing bordered style, wrapping if needed. The row is a
  small client component, because the assistant button needs client state.
- **Bottom bar**: one grid. At `md` and up it has three columns sized 2fr / 1fr / 1fr (50 / 25 /
  25):
  1. © line, company no., VAT and registered office; then "Powered by …" on its own line.
  2. Terms · Privacy · Cookies on one line. The `·` separators are `aria-hidden`. All three links
     share one style: no underline by default, underline on hover.
  3. The Stripe line, with the lock icon, on one line; underneath it, the payment badge images on
     one row.

  Below `md`, the order is payment/Stripe, then legal links, then company details, reordered with
  `order-*` utilities so the DOM order stays the reading order on desktop.
- **Floating-button clearance**: the footer gets enough bottom padding that, scrolled to the end of
  the page, no footer link, button, image or text box intersects the Rewards launcher, the cart
  button or the floating contact trigger. This applies at 375px **and** at 1280px: #1055's
  validation saw the overlap at desktop width too. The cookie banner is excluded, because it is
  dismissible.

### 4. Shared contact channels

- **`lib/contact-channels.ts`** (new, pure) exports
  `contactChannels({ vendorName, facebookUrl, instagramUrl, whatsappNumber, assistantAvailable })`.
  It returns an ordered list of `{ kind, href?, label }`, where `kind` is
  `"facebook" | "instagram" | "whatsapp" | "assistant"`.
  - It holds today's `FloatingContact` rules verbatim: each channel appears only when its value is
    set; WhatsApp is hidden when the assistant is available (#1051); the assistant appears only when
    available; and the WhatsApp link carries the same prefilled message.
  - **Order:** facebook, instagram, whatsapp, assistant. That is the order a shopper reads the open
    floating panel from top to bottom today: the panel is `flex-col-reverse` over DOM order
    assistant, whatsapp, instagram, facebook.
- **`components/layout/contact-channel-icons.tsx`** (new) holds the glyphs: Facebook and Instagram
  move out of `FloatingContact` (and #1055's duplicate Facebook glyph out of `StorefrontFooter`),
  alongside lucide `MessageCircle` and `HelpCircle`. One icon per kind.
- **`FloatingContact`** renders the list instead of four hand-written blocks. Its visual order,
  labels, links, `tabIndex` behaviour and hidden-when-empty rule are unchanged.
- **Shared assistant state**: a client provider (`components/assistant/AssistantLauncher.tsx`, new)
  owns the "assistant open" state and mounts `HelpAssistant` **once**. `StorefrontChrome` wraps the
  page with it. `FloatingContact` and the footer row both call its `open(trigger)`. On close, focus
  returns to whichever control opened the panel.
  - **Unchanged behaviour:** when opened from the floating panel, the disclosure stays open so that
    control is visible.

### 5. Staff editing — `/staff/storefront`

- **"Opening hours & payment badges"** (the existing form, renamed sections inside it):
  - The eight free-text rows become **seven weekday rows**, Monday → Sunday. Each has an
    `<input type="time">` for opening, one for closing, and a "Closed all day" checkbox.
  - A weekday with both times blank and the box unticked is "not set".
  - The badges are unchanged. One submit replaces the weekly rows and the badges in one WebSocket
    `$transaction`, as #1055 did.
- **"Holiday & closure dates"** (a new form in the same component file):
  - An add form takes a date, a label, open/close times, and "Closed all day".
  - Below it is a list of the vendor's overrides from today on, each with a Delete button.
  - Saving a date that already has an override replaces it (`upsert` on `vendorId_date`).
  - Saving also deletes the vendor's overrides dated before today, which keeps the table bounded.
  - A vendor may hold at most 50 overrides from today onwards.
- **Pure parsers** in `lib/footer-hours-form.ts` (the existing file, rewritten), unit-tested:
  - **Weekly:** times match `^([01]\d|2[0-3]):[0-5]\d$`. If not closed, both times are required
    and open < close. If closed, the times are ignored and stored as null. One time without the
    other is a field error.
  - **Override:** the date is a real `YYYY-MM-DD` from today to today + 365 in `STORE_TIMEZONE`.
    The label is required, 1–40 characters after trimming. The times follow the weekly rules.
  - The badge rules are unchanged.
- **Server actions** in `features/admin/storefront.ts`: `updateFooterHours` (rewritten),
  `saveHoursOverride` and `deleteHoursOverride` (new). Each:
  - starts with `requireVendorRole("ADMIN")`;
  - takes the vendor only from the session;
  - writes only its own rows;
  - is `export async function` (the file stays async-only).

  `deleteHoursOverride` deletes by `{ id, vendorId }`, so one vendor cannot delete another's row.
- **Repository** (`lib/repositories/vendor.ts`):
  - `replaceVendorFooterHours` writes weekly rows instead of free-text rows, still through
    `getPrismaWs()`, because `createMany` must not run over HTTP.
  - `saveVendorHoursOverride` runs `deleteMany` (past dates) then `upsert`, which is fine on
    `getPrisma()` (CLAUDE.md). It counts first, to enforce the cap of 50.
  - `deleteVendorHoursOverride` uses `deleteMany({ where: { id, vendorId } })`.
  - Each takes its client and `vendorId` as parameters.
- **Read path:** `fetchVendorProfile` replaces `openingHours` with `weeklyHours` and
  `hoursOverrides` (all of the vendor's override rows, which are bounded by the cap and the prune).
  They are read in the **same single `findUnique`**, so no query is added to the page render.

### 6. Seed — `prisma/seed.ts` `seedFooterDefaults`

- The free-text hours rows are removed.
- When Aheed has **no** weekly rows, it seeds Mon–Sat 09:00–20:00 and Sun 09:00–19:00.
- No overrides are seeded.
- The fill-only rule for every other footer value is unchanged. SriMart is untouched.

### 7. Docs

- `docs/store-admin-guide/admin-tabs-guide.md` describes the new hours form and the holiday-dates
  form. `app/(admin)/staff/runbook/docs.ts` is regenerated from it, never hand-edited.
- `specs/design-system.md`'s footer section records the bottom-bar grid, the channel-row style and
  the floating-button clearance rule.

## Deliberately excluded

- **"Open now / closed" badge, LocalBusiness JSON-LD, and checking Click & Collect against
  hours:** these stay in **#1057**. This slice delivers the data model those need.
- **Hours that run past midnight** (e.g. 18:00–02:00) and **split days** (e.g. 9–1 and 2–6): a day
  has one interval, and close is after open. No vendor has asked for either.
- **Recurring overrides** ("every 25 December") and **imported UK bank-holiday calendars**: each
  override is a single dated entry the admin adds.
- **Migrating staging's free-text rows:** the owner will re-enter them (decision 4).
- **Any change to colours, fonts, column 1, or the column-3 text links:** the owner said to keep
  them as they are.
- **The cookie banner overlapping the footer:** it is dismissible, and its own layout is not part
  of this slice.
- **#1055's `/document` stage and promotion:** both are deferred until this slice ships, then done
  together (decision on #1060).

## Open items carried forward

- **After deploy to staging**, an Aheed admin re-enters the weekly hours on `/staff/storefront`. Or
  the seed is run against staging, which needs the user, because auto mode blocks staging writes.
- **#1058:** the owner still owes the real email, company and VAT numbers, platform name and badge
  logos. Staging already shows some real values, entered by an admin.
- **#1057:** open-now badge and JSON-LD, which become buildable on this data model.
