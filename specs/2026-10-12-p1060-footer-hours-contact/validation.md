# Storefront footer — holiday-aware hours, contact channels, three-column bottom bar (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

The risks in this slice:

- a schema migration that **drops** a table;
- timezone-sensitive "today" logic;
- a refactor of `FloatingContact` (an existing shopper surface) with shared client state;
- three server actions writing vendor data;
- a layout change on every storefront page.

How each kind of check runs:

- **Unit tests** cover the hours view, the time format, the channel list and both parsers.
- **Integration and E2E checks** run under `npm run preview` against the **dev** Neon project, never
  `npm run dev`.
- **Browser checks** need a real browser at 1280px, 1024px and 375px. Use the Claude-in-Chrome
  extension, or headless Chrome driven over the DevTools protocol
  (`chrome --headless=new --remote-debugging-port=<port>`, then `Runtime.evaluate` and
  `Emulation.setDeviceMetricsOverride`). jsdom does no layout, so a jsdom test cannot satisfy any
  layout row.

## Setup (once, before the Integration/E2E rows)

1. **Confirm which database is local.** Compare the `DATABASE_URL`/`DIRECT_URL` hosts in `.env` and
   `.dev.vars` against `secrets/staging.vars` and `secrets/production.vars`, printing hosts only.
   They must match **neither** of those files: they are the dev project (`ep-dry-morning-…` as of
   2026-10-12).
2. **Migrate dev.** Run `npx prisma migrate status`. If this slice's migration is pending, ask the
   user to apply it (`! npx prisma migrate deploy`), because auto mode blocks it. Re-run status until
   it reports "Database schema is up to date!".
3. **Seed.** Run
   `SEED_AHEED_HOST=localhost:8787 SEED_SRIMART_HOST=srimart.localhost:8787 npm run db:seed`. The
   seed also re-uploads placeholder product images to the configured bucket; that is expected.
4. **Start the preview.** Kill leftover `workerd` and `node` preview processes (CLAUDE.md), then
   run `npm run preview` and wait for `GET / 200`. SriMart is reached at `srimart.localhost:8787`.
   For headless Chrome, add `--host-resolver-rules="MAP srimart.localhost 127.0.0.1"`.
5. **Sign in for staff rows.** Sign in as `demo-store-admin@example.com` with
   `DEMO_ACCOUNT_PASSWORD`, taken **from `.dev.vars`** (the `.env` value differs and is rejected
   under preview). In the browser, POST `{ email, password }` to `/api/auth/sign-in/email`. Never
   print the password.
6. **Fix today's date.** `TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" })`
   (`YYYY-MM-DD`). `TODAY+n` means `n` calendar days after it.
7. **Snapshot before writing.** Before any staff-form row, read Aheed's `vendor` with `config`,
   `weeklyHours`, `hoursOverrides` and `paymentBadges` into a JSON file, using a read-only `tsx`
   script that builds `PrismaClient({ adapter: new PrismaNeon(...) })`. After the last row, restore
   the values and confirm a diff against the snapshot is empty, ignoring `id` and `updatedAt`.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1 | Unit | Run `grep -n "model VendorOpeningHours" prisma/schema.prisma`; there is no match. Read `model VendorWeeklyHours` and `model VendorHoursOverride`. Each has the listed fields, `onDelete: Cascade`, and its `@@unique`. `date` is `DateTime @db.Date`. Neither has a `Json` field. |
| R2 | Integration | Run `git diff --name-only origin/staging -- prisma/migrations`. It lists exactly one new directory. Read its `migration.sql` in full. The only `DROP` is `DROP TABLE "VendorOpeningHours"` (plus any FK/index drops belonging to that table). It has `CREATE TABLE` for both R1 tables and no `_trgm` index statement. |
| R3 | Unit | Run `npx vitest run lib/footer-hours.test.ts`; it passes. Read the test: each R3 input/output pair is asserted, and the range format is asserted with the U+2013 en dash. |
| R4 | Unit | Same file passes. Read `lib/footer-hours.ts`. `grep -nE "new Date()|Date.now(" lib/footer-hours.ts` has no match: the clock comes only from the `now` parameter. It imports its zone helpers from `@/lib/local-datetime`. The tests assert Monday → Sunday order and the exact holiday `text` format. |
| R5 | Unit | Same file passes, and it contains named cases for: today's override replacing today's row; today's override leading `holidays` when there is no weekly row; and past or beyond-window overrides excluded. |
| R6 | Unit | Same file passes. `grep -n "2026-06-14T23:30:00Z\|2026-12-20T23:30:00Z" lib/footer-hours.test.ts` matches both instants, asserting Monday and Sunday respectively. There are cases for today + 14 (included) and today + 15 (excluded). |
| R7 | E2E | On Aheed `/` (after seeding, with no overrides), column 2 lists Monday → Sunday as `9am – 8pm` ×6 then `Sunday 9am – 7pm`. `document.querySelectorAll('footer [aria-current="date"]').length === 1`, and that row's weekday is today's London weekday. Its `getComputedStyle(...).fontWeight >= 700`, and its `color` equals the computed colour of an element styled `color: var(--footer-heading)` (compare with the column heading `h2`). On SriMart `/`, "Shop opening hours" is absent. |
| R8 | E2E | On Aheed with no overrides, `document.body.innerText.includes("Holiday hours") === false`. Then, on `/staff/storefront`, add three overrides: **(a)** `TODAY`, "Test today", Closed; **(b)** `TODAY+3`, "Test soon", 10:00–16:00; **(c)** `TODAY+20`, "Test later", Closed. Reload `/`. Today's highlighted row reads `Test today · Closed`. "Holiday hours" is present, followed by exactly one entry, `{Ddd D Mmm of TODAY+3} · Test soon · 10am – 4pm`. "Test later" is absent. "Test today" appears exactly once in the footer. Delete all three overrides afterwards. |
| R9 | Unit | Run `npx vitest run lib/contact-channels.test.ts`; it passes. The test asserts each table row, including WhatsApp hidden when `assistantAvailable` is true, the exact WhatsApp `href`, the fixed order, and `[]` when nothing is set. |
| R10 | Unit + E2E | Run `grep -n "wa.me\|facebookUrl}\|instagramUrl}" components/layout/FloatingContact.tsx`; no `href` is built in that file. Run `npx vitest run` on every test file that imports `FloatingContact` (`grep -rl FloatingContact tests components lib`); all pass. Run `git diff origin/staging -- <those test files>` and confirm only import paths changed. In the browser on Aheed, open the floating panel and read the controls' `aria-label`s in top-to-bottom screen order (sort by `getBoundingClientRect().top`). The order is Facebook → Instagram → WhatsApp → assistant, restricted to the channels configured. |
| R11 | E2E | On Aheed `/` at 1280px, column 3's channel row contains one control per channel configured in `FloatingContact`, in the same order and with the same `aria-label`s as R10's reading. Each is ≥ 44 × 44 (`getBoundingClientRect()`), with `getComputedStyle(el).borderRadius === "50%"` or a px value ≥ half its width. Link controls have `target="_blank"` and `rel="noopener noreferrer"`. Then run `grep -n "FacebookGlyph\|InstagramGlyph" components/layout/StorefrontFooter.tsx components/layout/FloatingContact.tsx`: the only definitions are in `components/layout/contact-channel-icons.tsx`. On SriMart (no social links, assistant off), check that no channel row element exists in the footer. |
| R12 | E2E | The assistant is available only when `assistantEnabled` is on **and** a WhatsApp number is set (`StorefrontChrome.tsx`). If either is missing for Aheed on dev, turn the assistant on at `/staff/assistant` and set the WhatsApp number on `/staff/storefront`, and restore them afterwards. Then, on Aheed: **(1)** Click the footer assistant button. `document.querySelectorAll('[role="dialog"]').length === 1` and the dialog is the help assistant. Close it via its close control; `document.activeElement` is the footer button. **(2)** Open the floating panel and click its assistant control. One dialog opens. Close it; `document.activeElement` is the floating assistant control, and the panel toggle has `aria-expanded="true"`. Finally, run `grep -rn "<HelpAssistant" components app`; it returns exactly one match, in the new provider. |
| R13 | E2E | At 1280×800 and 1024×800 on Aheed, with all five badges ticked: take the three bottom-bar column elements' widths (`w1`, `w2`, `w3`). Let `unit = (w1 + w2 + w3) / 4`. Check `|w1 − 2·unit| ≤ 4` and `|w2 − unit| ≤ 4` and `|w3 − unit| ≤ 4`. The "Powered by" element's `top` is greater than the © line's `bottom`. The three legal anchors' `top` values are within 2px of each other. The Stripe line's element `height < 24`. All five badge `img` `top` values are within 2px of each other. `document.documentElement.scrollWidth <= innerWidth`. |
| R14 | E2E | For each of the three legal anchors, `getComputedStyle(a).textDecorationLine === "none"`, and all three `fontWeight` values are equal. Hover each one (CDP `Input.dispatchMouseEvent` move, or the extension's hover). It reads `underline` while hovered. Two `·` separators exist between the anchors, each inside an `[aria-hidden="true"]` element. |
| R15 | E2E | At 375×800 on Aheed, find the payment block (contains "Secure checkout"), the legal block (contains the `/terms` anchor) and the company block (contains "©"). Check `payment.bottom < legal.top` and `legal.bottom < company.top`. At 1280×800, check `company.left < legal.left < payment.left`. |
| R16 | E2E | Dismiss the cookie banner ("Essential Only"). Add any product to the cart so the cart button renders. Then, for each of Aheed `/` and SriMart `/`, at 375×800 and 1280×800: scroll to the bottom; collect the rects of the Rewards launcher, the cart button and the floating contact trigger. Use those that render: Rewards needs loyalty on, and contact needs at least one channel. For each `footer a, footer button, footer img, footer p, footer dt, footer dd`, assert no rect intersects any of them. Report which floating buttons were present per vendor; at least one vendor must exercise all three. |
| R17 | Unit | Run `npx vitest run lib/footer-hours-form.test.ts`; it passes. Read it: there is at least one case per rule, including `2026-02-30`, yesterday, `TODAY+366`, `20:00`→`09:00`, `24:00`, a half-filled day, a closed day with times stored as null, a duplicate `dayOfWeek`, and a 41-character label. |
| R18 | Integration | Read `features/admin/storefront.ts`. Run `grep -n "^export" features/admin/storefront.ts`; every match is `export async function`. Each of the three actions starts with `requireVendorRole("ADMIN")` and reads no vendor id from `formData`. Read the repository functions: the weekly replace uses a `getPrismaWs`-typed client and `$transaction`; the override save prunes past rows, checks the cap of 50, and `upsert`s; the delete's `where` includes `vendorId`. Run `grep -n "createMany\|updateMany" lib/repositories/vendor.ts`; every match sits in a function whose client parameter is `ReturnType<typeof getPrismaWs>`. Unauthenticated, POST each action under preview (`Next-Action` header, IDs read from the `$ACTION_n:0` hidden inputs on `/staff/storefront`). Each returns the sign-in refusal, and a fresh DB read equals the snapshot. |
| R19 | E2E | Under preview, as the Aheed admin on `/staff/storefront`: **(1)** Both form headings exist. The hours form has 7 rows labelled Monday … Sunday, with `input[type=time]` values `09:00`/`20:00` (Mon–Sat) and `09:00`/`19:00` (Sun), and every "Closed all day" box unticked. **(2)** Tick "Closed all day" for Wednesday and save. The storefront shows `Wednesday Closed`. **(3)** Set Wednesday to `20:00`–`09:00` and save. An error names Wednesday's time field, and the DB is unchanged. **(4)** Add override `TODAY+5` "Test A" Closed, then add `TODAY+5` "Test B" 12:00–15:00. The list shows one `TODAY+5` row, labelled "Test B", and the DB holds one override for that date. **(5)** Delete it; the list and the DB have none. **(6)** Submit an override with a blank label, then one dated yesterday (remove any `min` attribute from the date input first, so the browser's own check does not stop the submit before it reaches the server). Each shows a field error and writes nothing. Restore Wednesday to 09:00–20:00, then diff against the snapshot. |
| R20 | Unit | Read `fetchVendorProfile`. It has exactly one `prisma.` call, its `select` includes `weeklyHours` and `hoursOverrides`, and `grep -n "openingHours" lib/repositories/vendor.ts` has no match on `VendorProfile`. Run `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts`; it passes. |
| R21 | Unit | Read the Storefront section of `docs/store-admin-guide/admin-tabs-guide.md`. It covers the weekly form with "Closed all day", one-override-per-date replacement, the 14-day window and the today-replacement rule. Run `grep -n "Holiday & closure dates" "app/(admin)/staff/runbook/docs.ts"`; it matches. Run `npm run kms:build-index` and then `git status --short "app/(admin)/staff/runbook/docs.ts"`; it shows no change (the file is up to date). Run `git diff --name-only --diff-filter=A origin/staging -- "app/(admin)/staff"`; no new `page.tsx` appears. |
| R22 | Integration | Read `seedFooterDefaults`. Run `grep -n "VendorOpeningHours\|vendorOpeningHours\|\[OPEN\]\|\[CLOSE\]\|\[HOURS\]" prisma/seed.ts`; there is no match. After Setup step 3, a read-only query shows Aheed with 7 weekly rows: days 1–6 at `09:00`–`20:00`, day 0 at `09:00`–`19:00`, none closed. It also shows 0 overrides, and SriMart with 0 weekly rows. Change Aheed's Monday close to `21:00` on the staff form, re-run the seed, and confirm Monday still closes at `21:00`. Restore it to `20:00`. |
| R23 | Unit | Read `specs/design-system.md`'s storefront footer section. It states the 2fr/1fr/1fr bottom-bar grid and its mobile order, the 44px circular channel row from `lib/contact-channels.ts`, and the floating-button clearance rule. |
| R24 | Unit | Run `git diff origin/staging -- CHANGELOG.md`; it shows an added entry containing `#1060`. |
| R25 | Unit | `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build` and `npm run kms:validate` each exit 0. `npx vitest run`, run alone with no build running, exits 0 with no "failed to start" or skipped files. CI on the PR is green. |
