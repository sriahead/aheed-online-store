# Storefront footer — three-column, vendor-configured (build notes)

Written at the end of Build, before the Clear. Branch `feature/p1055-storefront-footer`: spec commit
`6cebdb5`, implementation commit `d42c9eb`, and this notes commit. Built in one Opus 5.5 session.

## What changed and why

- **Schema and migration `20261012120000_p1055_storefront_footer`.** Additive only: one enum, seven
  `VendorConfig` columns, two tables, two indexes, two foreign keys, and no `DROP`.
  - The SQL was generated **without a database**, using
    `prisma migrate diff --from-schema-datamodel <origin/staging schema> --to-schema-datamodel prisma/schema.prisma --script`.
    This is the `specs/architecture.md` §3.1 fallback; neither datamodel contains the `pg_trgm`
    indexes, so the diff cannot propose dropping them. The SQL was read in full before commit.
  - **The migration has NOT been applied to any database** (see "Known-shaky areas").
- **Read path: `lib/repositories/vendor.ts` `fetchVendorProfile`.** The single existing
  `vendor.findUnique` now also selects:
  - the seven new config fields;
  - `config.loyaltyEnabled`;
  - `location`;
  - `openingHours` (ordered by `sortOrder`);
  - `paymentBadges`.

  `VendorProfile` gains `contactPhone`, `contactEmail`, `companyNumber`, `vatNumber`,
  `registeredOffice`, `openingHoursNote`, `showSecureCheckoutNote`, `location`, `openingHours`,
  `paymentBadges` and `loyaltyEnabled`. Badges are re-sorted into display order in code
  (`orderPaymentBadges`), not by row order. The page render makes no new query.
- **Write path.**
  - The footer contact fields go through the existing `updateVendorStorefrontConfig`, which was
    already a WebSocket `$transaction`. I extended `VendorStorefrontConfigInput` with the seven
    optional fields, using the same "undefined leaves alone" rule as the other forms.
  - Hours and badges go through a new `replaceVendorFooterHours(prismaWs, vendorId, data)`. In one
    `$transaction` it runs `deleteMany` then `createMany` for both tables. The service wrapper in
    `lib/vendor-service.ts` passes `getPrismaWs()`.
- **Pure modules, each with unit tests.**
  - `lib/payment-badges.ts`: the method list, labels and static `src` values.
  - `lib/footer-contact-form.ts`: `parseFooterContact`, plus the href guards `isDiallablePhone`,
    `isEmailAddress` and `telHref`.
  - `lib/footer-hours-form.ts`: `parseFooterHours`.
  - `lib/footer-palette.ts`: `footerPalette` and `footerStyle`.
- **Server actions.** `updateFooterContact` and `updateFooterHours` in
  `features/admin/storefront.ts`. Both are ADMIN-gated and take the vendor from the session.
- **UI.**
  - `components/layout/StorefrontFooter.tsx` is a server component. It replaces the inline footer
    in `StorefrontChrome.tsx`, which now passes `getPlatformBrandingEnv().PLATFORM_NAME`.
  - `components/staff/FooterSettingsForms.tsx` holds the two client forms, rendered on
    `/staff/storefront` between `StorefrontConfigForm` and `ReviewLinksManager`.
- **Anchors.** I added `id="delivery"` (`/help`), `id="refunds"` (`/terms`) and `id="cookies"`
  (`/privacy`), each with `scroll-mt-24`.
- **Config.**
  - `lib/config.ts` gains `getPlatformBrandingEnv()`, which has its own zod schema. A blank value
    becomes `undefined`.
  - `wrangler.toml` sets `PLATFORM_NAME = "[PLATFORM NAME]"` under both `[env.staging.vars]` and
    `[env.production.vars]`.
  - **The local `.dev.vars` (gitignored) also got `PLATFORM_NAME="[PLATFORM NAME]"`**, because
    `npm run preview` reads no `[env.*]` block. Without it, R12's "Powered by" check fails locally
    for a reason that has nothing to do with the code.
- **Seed: `prisma/seed.ts` `seedFooterDefaults` (Aheed only).** This step is fill-only:
  - the `VendorLocation` is created only if missing;
  - each string column is written only while it is null;
  - opening-hours and badge rows are created only when the vendor has none;
  - `showSecureCheckoutNote` is turned on only on the first fill, when the phone and email are
    both still null.

  SriMart is untouched.
- **Static assets.** Five placeholder SVGs in `public/payment-methods/`, each a text label on white
  with a comment asking for replacement under the same file name.
- **Docs.**
  - `docs/store-admin-guide/admin-tabs-guide.md` 2.10.0 covers the two new forms and the footer.
    It also **corrects a line that became false**: "nothing social appears in the page footer".
    The footer now shows a Facebook icon.
  - `ARTIFACT_INDEX.md` and `app/(admin)/staff/runbook/docs.ts` are regenerated.
  - `specs/design-system.md` 1.18.0 records the dark-surface footer rule.

## Decisions taken during the build

- **Badge images go through `ImageWithFallback`, not a bare `<img>`.**
  `tests/storefront-image-fallback.test.ts` allows only `components/ui/ImageWithFallback.tsx` to
  write JSX `<img>`. The fallback is a bordered text chip with the method name, so a deleted logo
  file degrades to text instead of a broken-image icon.
- **`footerPalette` sanitises primitives the way `brandStyle()` does.** A malformed stored hex falls
  back to the platform default before it reaches `hexToOklch`, which throws. Without this, one bad
  colour row would 500 every storefront page, because the footer is on all of them.
  `tests/storefront-chrome-rewards-gate.test.tsx` surfaced this: it passes `primitives: {}`. There
  is a unit test for the fallback.
- **That gate test now mocks `StorefrontFooter`**, in the same way it already mocks `Header`,
  `FloatingContact` and the cookie banner. The footer has its own test,
  `tests/storefront-footer.test.tsx`.
- **The muted foreground** starts from `cream`, reduced by 0.12 OKLCH lightness, and is then
  clamped to 4.5:1 against the footer background. It is not an alpha composite, because alpha
  modifiers on themed text are banned.
- **The footer background is `brandStyle()`'s clamped `--color-primary`**, computed again inside
  `footerPalette`. It is not `var(--color-primary)` read at paint time. That keeps the palette a
  pure function that the unit test can measure.
- **Phone placeholders are accepted too.** The spec named only email placeholders. The phone
  validator also accepts any wholly bracketed value (for example `[PHONE]`), for symmetry. A
  bracketed value can never become a `tel:` href.
- **Mobile Call button text is "Call {phone}"**, with a solid fill in the footer's heading colour,
  to match the mockup's prominent yellow-orange button.
- **The staff hours form always submits 8 row slots.** Empty slots are dropped by the parser. The
  "ninth row is an error" branch is reachable only by a forged post. It exists so the parser cannot
  be made to write unbounded rows.

**Deferred items, filed 2026-10-12 (P10, Backlog):**

- `#1056`: real "Delivery areas & slots" and "Returns & refunds" pages. Low.
- `#1057`: structured, machine-readable opening hours. Low.
- `#1058`: the owner supplies the real footer values, the platform name and the badge logos.
  Medium.

## Deviations from the spec

- **The two staff forms live in a new `components/staff/FooterSettingsForms.tsx`**, rendered from
  `app/(admin)/staff/storefront/page.tsx`. `plan.md` said they would be added to
  `components/staff/StorefrontConfigForm.tsx`.
  - Why: that file is already 933 lines, and the page already renders a sibling component
    (`ReviewLinksManager`) for its last section. This follows that precedent.
  - No requirement names the file. R19 checks only that the page renders both sections.
- **R21 names `app/(admin)/staff/runbook/docs.ts` as the place to update.** That file is
  **generated** by `kms:build-index` from `docs/store-admin-guide/admin-tabs-guide.md`. The guide
  was edited, and `docs.ts` regenerated from it, so `docs.ts` does name both forms. Validate R21 by
  reading the regenerated `docs.ts`, or the guide's Storefront section. Editing `docs.ts` by hand
  would be overwritten.
- **R23's "`showSecureCheckoutNote` is set to `true`"** is implemented as "set to `true` on the
  first fill only", as `plan.md` describes ("only when the column is still at its default"). On a
  fresh seed the result is `true`. A re-seed after an admin deliberately switches it off leaves it
  off.

## Known-shaky areas

- **The migration is unapplied everywhere, including the local dev database.** Auto mode blocked
  `npx prisma migrate deploy`, even against the dev project (`.env` → `ep-dry-morning-…`, which is
  neither staging `ep-empty-scene-…` nor production `ep-young-glitter-…`). Until the user runs it:
  - three DB-backed tests fail with "column `showSecureCheckoutNote` does not exist":
    `tests/slot-capacity.test.ts`, `tests/concurrency-slot-booking.test.ts` and
    `tests/express-sla.test.ts`. They create a `Vendor`, so they read the whole new `VendorConfig`
    shape. This is expected, not a regression;
  - nothing under `npm run preview` can be validated.

  Staging gets the migration from CI on the merge to `staging` (deploy builds, then migrates).
- **The full suite under load:** `tests/add-to-cart-feedback.test.tsx` failed once in the full run
  and passed 12/12 alone. It is unrelated to this slice. Several guard tests hit the 5-second
  timeout in the first full run and passed alone; that is the documented Windows forks-pool
  behaviour. Run `npx vitest run` alone.
- **Never driven in a browser.** No row of R6–R14, R19 or R24 has been seen in a real page. The
  footer render test covers the logic in jsdom: hide-when-null, a placeholder never becoming a
  link, badge order, gated links, and the directions URL. **jsdom does no layout**, so these remain
  real-browser-only:
  - three columns side by side at 1280px;
  - stacked columns at 375px;
  - no horizontal scroll;
  - every `a`/`button` at least 44px tall.

  The 44px risk sits in the bottom bar's inline legal links. They use the shared `LINK` class
  (`min-h-tap md:min-h-0`), which should hold.
- **The seed has not been run against any database**, so R23 (fill-only and idempotent) is untested.
  The function uses `prisma.vendorConfig.findUnique` and indexes it with `config[key]`, typed
  through `keyof FooterDefaults["config"]`. Check it on the first real seed run.
- **The header's `Get directions` URL uses `profile.name`**, the branding name, plus the location
  fields. On staging, Aheed may already have a `VendorLocation` from the collection-address form
  that differs from `13 N 11th St` (the seed is fill-only). R7 allows for "whatever the database
  actually holds".
- **Colours were checked by unit test only.** Contrast is measured for both vendors, but nobody has
  looked at the result. Compare the footer against the mockup on both Aheed and SriMart.
