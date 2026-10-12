# Storefront footer — holiday-aware hours, contact channels, three-column bottom bar (requirements / acceptance criteria)

This slice closes #1060. It builds on #1055 (`specs/2026-10-12-p1055-storefront-footer/`), which is
merged to `staging` and held there so that both slices are promoted together. Where this file and
#1055's spec disagree, this file wins. Every #1055 requirement this file does not restate still
holds.

What the slice does:

- Opening hours become a structured weekly schedule (real open and close times, or closed all day)
  plus dated holiday/closure overrides.
- Today's row is highlighted, and overrides in the next 14 days are listed.
- The footer gains the floating contact button's channels, from one shared source.
- The bottom bar becomes a 50 / 25 / 25 grid that the floating buttons no longer cover.

`plan.md` has the rationale and the owner's decisions.

Terms used below:

- **"Aheed" and "SriMart"** mean the two seeded vendors, served under `npm run preview` at
  `localhost:8787` and `srimart.localhost:8787`, or on staging.
- **"Today"** means the calendar day in `Europe/London` (`STORE_TIMEZONE`).
- **"The floating buttons"** are the Rewards launcher (`components/rewards/RewardsLauncher.tsx`),
  the cart button (`components/cart/CartDrawerShell.tsx`) and the floating contact trigger
  (`components/layout/FloatingContact.tsx`).

## Data model

R1. `prisma/schema.prisma` no longer contains `model VendorOpeningHours`. It contains:
    - `model VendorWeeklyHours`, with `id`, `vendorId` (relation to `Vendor`,
      `onDelete: Cascade`), `dayOfWeek Int`, `openTime String?`, `closeTime String?`,
      `closed Boolean @default(false)` and `@@unique([vendorId, dayOfWeek])`;
    - `model VendorHoursOverride`, with `id`, `vendorId` (relation, `onDelete: Cascade`),
      `date DateTime @db.Date`, `label String`, `openTime String?`, `closeTime String?`,
      `closed Boolean @default(false)` and `@@unique([vendorId, date])`.
    Neither model has a `Json` field.

R2. Exactly one new directory under `prisma/migrations/` belongs to this slice. Its
    `migration.sql`:
    - drops only the table `VendorOpeningHours`;
    - creates the two R1 tables;
    - contains no `DROP INDEX` for any `_trgm` index;
    - contains no other `DROP`.

## Hours logic

R3. `lib/footer-hours.ts` exports `formatTime(hhmm)`. It returns:

    | Input | Output |
    |---|---|
    | `"09:00"` | `"9am"` |
    | `"09:30"` | `"9:30am"` |
    | `"12:00"` | `"12pm"` |
    | `"00:00"` | `"12am"` |
    | `"20:00"` | `"8pm"` |
    | `"23:45"` | `"11:45pm"` |

    An hours range renders as `"{open} – {close}"`: an en dash (U+2013) with one space on each side.
    A closed day or override renders as `"Closed"`.

R4. `lib/footer-hours.ts` exports a pure `buildOpeningHoursView(weekly, overrides, now: Date)`. It
    performs no I/O and reads no clock other than `now`. It returns:
    - `weekly`: one entry per weekday that has a row, ordered Monday → Sunday. Each entry is
      `{ day: "Monday" | … | "Sunday", text, isToday }`. Exactly one entry has `isToday: true` when
      today's weekday has a row.
    - `holidays`: entries `{ text, isToday }` for overrides dated today + 1 through today + 14
      inclusive, in ascending date order. Each `text` is
      `"{Ddd} {D} {Mmm} · {label} · {hours | Closed}"`, e.g. `"Fri 25 Dec · Christmas Day · Closed"`.

    The current calendar day and weekday come from `now` read in `Europe/London`, via
    `lib/local-datetime.ts`. They never come from the UTC date.

R5. An override dated today is handled as follows:
    - When today's weekday has a weekly row, that row's `text` becomes `"{label} · {hours | Closed}"`
      and `isToday` stays true. The override does not also appear in `holidays`.
    - When today's weekday has no weekly row, the override is the **first** `holidays` entry, with
      `isToday: true`, and is formatted as in R4.
    - Overrides dated before today, or after today + 14, appear nowhere in the view.

R6. `lib/footer-hours.test.ts` passes, and covers each of these cases:
    - every R3 row;
    - Monday → Sunday ordering from rows stored in any order;
    - a closed weekday shows `"Closed"`;
    - `now = 2026-06-14T23:30:00Z` (a Sunday in UTC, but Monday 00:30 in BST) marks **Monday** as
      today;
    - `now = 2026-12-20T23:30:00Z` (GMT) marks **Sunday** as today;
    - an override today replaces today's row;
    - an override today with no weekly row for that weekday leads `holidays`;
    - an override at today + 14 is included and one at today + 15 is excluded;
    - a past override is excluded;
    - a closed override renders `"Closed"`.

## Rendering

R7. In Aheed's served HTML, column 2 ("Shop opening hours") contains:
    - the weekly rows in Monday → Sunday order;
    - when present, a "Holiday hours" sub-heading followed by the `holidays` entries;
    - the `openingHoursNote` last, when it is non-null.

    Exactly one element in column 2 carries `aria-current="date"`, and it is today's row. Its
    computed `font-weight` is at least 700, and its computed `color` equals the footer's
    `--footer-heading` value.

    Column 2 is not rendered at all when there are no weekly rows, no override dated today through
    today + 14, and no note. SriMart is in that state.

R8. With no override dated today through today + 14, the text "Holiday hours" is absent from the
    page.

R9. `lib/contact-channels.ts` exports a pure `contactChannels(input)`, where `input` is
    `{ vendorName, facebookUrl, instagramUrl, whatsappNumber, assistantAvailable }`. It returns an
    ordered array of `{ kind, href, label }`, with `href` being `null` for the assistant. The rules:

    | `kind` | Included when | `href` | `label` |
    |---|---|---|---|
    | `facebook` | `facebookUrl` is non-null | `facebookUrl` | `"{vendorName} on Facebook"` |
    | `instagram` | `instagramUrl` is non-null | `instagramUrl` | `"{vendorName} on Instagram"` |
    | `whatsapp` | `whatsappNumber` is non-null **and** `assistantAvailable` is false | `https://wa.me/{whatsappNumber}?text=` + the URL-encoded `Hi {vendorName}, I have a question about my order.` | `"Message {vendorName} on WhatsApp"` |
    | `assistant` | `assistantAvailable` is true | `null` | `"Open help assistant"` |

    The array order is always facebook, instagram, whatsapp, assistant, skipping any kind that is
    not included. `lib/contact-channels.test.ts` covers every row of the table, the order, and the
    empty case.

R10. `components/layout/FloatingContact.tsx` builds its panel from `contactChannels(...)`, and
    contains no hand-written `href` for any channel. With the panel open, the controls read top to
    bottom in the R9 order, as they do today. The R9 labels are its `aria-label`s. Its existing
    behaviour is unchanged:
    - it renders nothing when the list is empty;
    - every channel control has `tabIndex={-1}` while the panel is collapsed.

    Every existing FloatingContact test passes unchanged, apart from mechanical import-path updates.

R11. Column 3 of the footer renders, below the text links, one control per `contactChannels(...)`
    entry, in R9 order. Each control:
    - is an `<a href>` for a link channel or a `<button type="button">` for the assistant;
    - has the R9 `label` as its `aria-label`;
    - shows the same icon `FloatingContact` uses for that kind, imported from
      `components/layout/contact-channel-icons.tsx`, the single place both components get their
      icons;
    - renders at 44 × 44px or larger, with `border-radius` of 50%.

    Link channels open in a new tab with `rel="noopener noreferrer"`. `StorefrontFooter.tsx` no
    longer defines its own Facebook glyph or a stand-alone Facebook link. When `contactChannels`
    returns an empty array, no channel row element renders.

R12. When the help assistant is available, these hold:
    - clicking the footer's assistant button opens the same help assistant dialog that the floating
      panel opens;
    - exactly one help-assistant dialog element exists in the DOM while it is open;
    - closing it returns focus to the footer button.

    Opening from the floating panel still returns focus to the floating panel's assistant control
    on close, with the panel still expanded. `HelpAssistant` is mounted in exactly one place in the
    source: the new shared provider.

R13. The bottom bar is one grid. At 1280px and 1024px widths:
    - its three column elements have widths in the ratio 2 : 1 : 1, each within ±4px of the ideal
      share of the grid's content width after gaps;
    - column 1 contains the © line, then "Powered by …" as a separate block below it;
    - the Terms, Privacy and Cookies anchors share one `getBoundingClientRect().top`, within 2px;
    - the "Secure checkout powered by Stripe" line is a single line box, with height under 24px;
    - with all five badges enabled, every badge `<img>` shares one `top`, within 2px.

R14. The three legal links (`/terms`, `/privacy` and `/privacy#cookies`) have identical computed
    `text-decoration-line` (`none`) and `font-weight` when not hovered, and `underline` while
    hovered. A `·` separator sits between adjacent links, inside an element with
    `aria-hidden="true"`.

R15. At 375px width, the three bottom-bar columns stack vertically in this order:
    1. payment/Stripe;
    2. legal links;
    3. company details.

    Each block's `top` is greater than the previous block's `bottom`. At 1280px, the visual
    left-to-right order is company details, legal links, payment/Stripe.

R16. With the cookie banner dismissed and the page scrolled to the bottom, no element inside
    `<footer>` intersects any floating button's bounding box. "Element" covers `a`, `button`,
    `img`, `p`, `dt` and `dd`. This holds:
    - at 375 × 800 and at 1280 × 800;
    - on Aheed `/` and on SriMart `/`;
    - with the Rewards launcher and the floating contact trigger rendered.

    The cart button counts too when it renders. Add one item to the cart before measuring, so that
    it renders.

## Staff editing

R17. `lib/footer-hours-form.ts` exports pure `parseWeeklyHours` and `parseHoursOverride`, plus
    their form-state types. Both return field-level errors and never throw. The rules:

    **Time format:** a time must match `^([01]\d|2[0-3]):[0-5]\d$`.

    **`parseWeeklyHours`:**
    - takes 7 weekday entries `{ dayOfWeek, open, close, closed }` and the badge values;
    - an entry is "not set", and is dropped, when both times are blank and `closed` is false;
    - when `closed` is true, it stores `openTime: null` and `closeTime: null`, whatever the times
      say;
    - otherwise both times are required (one blank is a field error), each must match the time
      format, and `open < close`;
    - a `dayOfWeek` outside 0–6, or repeated, is an error;
    - badges keep #1055's dedupe and ignore-unknown rules.

    **`parseHoursOverride`:**
    - the date must be a real `YYYY-MM-DD` from today to today + 365 inclusive, where today is
      passed in as a parameter;
    - the label is required, 1–40 characters after trimming;
    - closed and times follow the weekly rules.

    `lib/footer-hours-form.test.ts` passes and has at least one case per rule above, including
    `2026-02-30` rejected, yesterday rejected, today + 366 rejected, `"20:00"`–`"09:00"` rejected,
    and `"24:00"` rejected.

R18. `features/admin/storefront.ts`:
    - exports `updateFooterHours`, `saveHoursOverride` and `deleteHoursOverride`;
    - every export in the file is `export async function`.

    Each of the three actions:
    - begins with `requireVendorRole("ADMIN")` and returns a refusal, with no write, when that
      check fails;
    - takes the vendor only from the session, never from `formData`;
    - writes only its own rows.

    Further rules:
    - `updateFooterHours` replaces the vendor's `VendorWeeklyHours` and `VendorPaymentBadge` rows
      inside one `getPrismaWs().$transaction`.
    - `saveHoursOverride` deletes the vendor's overrides dated before today, then `upsert`s on
      `vendorId_date`. When the vendor already has 50 overrides dated today or later and the date is
      new, it refuses with a form error and writes nothing.
    - `deleteHoursOverride` deletes with a `where` that includes both `id` and the session
      `vendorId`.
    - No `createMany`, `updateMany` or nested `create` runs through `getPrisma()`.

R19. `/staff/storefront`, signed in as an Aheed ADMIN, shows two forms:
    - **"Opening hours & payment badges"** has exactly 7 weekday rows, Monday → Sunday. Each row
      has two `<input type="time">` fields and a "Closed all day" checkbox, pre-filled from the
      stored rows. The badges sit below.
    - **"Holiday & closure dates"** has a date input, a label input, two time inputs, a "Closed all
      day" checkbox and a save button. Below them is a list of the vendor's overrides dated today
      onwards, ascending, each with a Delete button.

    Behaviour, each change visible in Aheed's footer on the next storefront load:
    - saving a weekly change persists it;
    - saving an override for a date that already has one replaces it, and does not add a second row;
    - Delete removes the override;
    - an invalid submission (close before open, a blank label, or a past date) shows an error
      naming the field and writes nothing.

R20. The repository functions added or changed in `lib/repositories/vendor.ts` take their Prisma
    client and `vendorId` as parameters. `fetchVendorProfile` still contains exactly one `prisma.`
    call, which selects `weeklyHours` and `hoursOverrides`. `VendorProfile` exposes both, and no
    longer exposes `openingHours`. `tests/repository-purity.test.ts` and
    `tests/repository-client-injection.test.ts` pass.

R21. `docs/store-admin-guide/admin-tabs-guide.md` describes:
    - the weekly-hours form, including "Closed all day";
    - the "Holiday & closure dates" form: one override per date, saving a date again replaces it,
      the footer shows the next 14 days, and today's override replaces today's hours.

    `app/(admin)/staff/runbook/docs.ts` is regenerated by `npm run kms:build-index` and names
    "Holiday & closure dates". No new `/staff/*` route is added.

## Seed

R22. In `prisma/seed.ts`, `seedFooterDefaults`:
    - seeds Aheed's weekly rows only when Aheed has none: `dayOfWeek` 1–6 at `09:00`–`20:00`, and
      `dayOfWeek` 0 at `09:00`–`19:00`, all with `closed: false`;
    - seeds no `VendorHoursOverride`;
    - no longer references `VendorOpeningHours` or the `[OPEN]`, `[CLOSE]` or `[HOURS]` strings;
    - leaves every other #1055 footer default and rule unchanged.

    Running the seed twice in a row leaves an admin-edited weekly row unchanged. SriMart receives no
    weekly rows.

## Docs, gates

R23. `specs/design-system.md`'s storefront footer section records:
    - the bottom-bar 2fr / 1fr / 1fr grid and its mobile order;
    - the 44px circular channel-button row sourced from `lib/contact-channels.ts`;
    - the rule that the footer clears the floating buttons.

R24. `CHANGELOG.md` has an added entry referencing #1060 on this branch (Gate 4).

R25. `npm run lint`, `npm run typecheck`, `npx vitest run` (run alone), `npm run format:check`,
    `npm run build` and `npm run kms:validate` all exit 0.
