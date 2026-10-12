# Storefront footer — three-column, vendor-configured (requirements / acceptance criteria)

This slice closes #1055. It replaces the one-line footer in `components/layout/StorefrontChrome.tsx`
with a three-column footer and a bottom bar, matching the owner-supplied mockup:

- Column 1, "Visit & contact us"
- Column 2, "Shop opening hours"
- Column 3, "Shop with us"
- Bottom bar: legal identity, "Powered by", the legal links, and the Stripe line with payment badges

Every vendor value comes from the database and is edited on `/staff/storefront`. A null or empty
value HIDES its element (#239). Aheed's defaults are seeded, with the approved placeholders for
unknown values. `plan.md` carries the rationale. In particular, opening hours are free-text rows,
not structured times, so that the placeholders can be stored.

"Aheed" and "SriMart" below mean the two seeded vendors, served under `npm run preview` (or
staging) at their configured hosts.

## Data model

R1. `prisma/schema.prisma` adds these nullable columns to `VendorConfig`: `contactPhone`,
    `contactEmail`, `companyNumber`, `vatNumber`, `registeredOffice` and `openingHoursNote`, all
    `String?`. It also adds `showSecureCheckoutNote Boolean @default(false)`.

R2. `prisma/schema.prisma` adds:
    - model `VendorOpeningHours`, with `id`, `vendorId` (relation to `Vendor`,
      `onDelete: Cascade`), `label String`, `hours String`, `sortOrder Int` and
      `@@index([vendorId, sortOrder])`;
    - enum `PaymentBadgeMethod`, with exactly `VISA`, `MASTERCARD`, `AMEX`, `APPLE_PAY` and
      `GOOGLE_PAY`;
    - model `VendorPaymentBadge`, with `id`, `vendorId` (relation, `onDelete: Cascade`),
      `method PaymentBadgeMethod` and `@@unique([vendorId, method])`.
    None of the new columns is `Json`.

R3. Exactly one new migration directory exists under `prisma/migrations/` for this slice. Its
    `migration.sql` contains no `DROP INDEX` statement for any `pg_trgm` index, and no `DROP` of any
    pre-existing table or column.

## Read path

R4. `fetchVendorProfile` in `lib/repositories/vendor.ts` returns each of these on `VendorProfile`:
    - the seven R1 values, where an absent config row gives `null` for the strings and `false` for
      `showSecureCheckoutNote`;
    - `location`, as `{ addressLine1, addressLine2, city, postcode } | null`;
    - `openingHours`, as `{ label, hours }[]` ordered by `sortOrder` ascending;
    - `paymentBadges`, as `PaymentBadgeMethod[]` in enum declaration order;
    - `loyaltyEnabled: boolean`.
    All of them come from the single existing `prisma.vendor.findUnique` call in that function, and
    the function makes no other database call.

## Rendering

R5. `components/layout/StorefrontFooter.tsx` exists and is rendered by `StorefrontChrome` in place
    of the previous inline `<footer>`. `StorefrontChrome.tsx` no longer contains a `<footer` element
    of its own.

R6. On Aheed's `/` and on `/help`, the served HTML contains one `<footer>` with these three column
    headings: "Visit & contact us", "Shop opening hours", "Shop with us". At a viewport width of
    1280px, the three columns render side by side, meaning their bounding boxes share a top
    coordinate within 8px. At 375px, they render stacked: each column's top is greater than the
    previous column's bottom. At 375px the page also has no horizontal scroll
    (`document.documentElement.scrollWidth <= 375`).

R7. Column 1 is not rendered at all when the location, phone and email are all null. Otherwise it
    renders:
    - the vendor name;
    - the `VendorLocation` address;
    - a "Get directions" link whose `href` starts with
      `https://www.google.com/maps/search/?api=1&query=` followed by the URL-encoded
      `name, addressLine1, [addressLine2,] city, postcode`;
    - the phone, as an `<a href="tel:…">` whose `href` contains only the digits and a leading `+`,
      when present;
    - the email.

    The email is a `mailto:` link only when the value matches `^[^\s@]+@[^\s@]+\.[^\s@]+$`.
    Otherwise it renders as plain text with no anchor. The phone is a `tel:` link only when it
    matches the R16 phone rule. Otherwise it renders as plain text.

R8. At widths below `md`, two full-width controls render above the columns:
    - **Call** (`tel:`), only when the phone is a valid phone;
    - **Get directions**, only when a location exists.
    Neither renders at `md` and above.

R9. Column 2 renders each `openingHours` row as a label and value pair, in `sortOrder` order,
    followed by `openingHoursNote` when it is non-null. When `openingHours` is empty and the note is
    null, column 2 is not rendered at all.

R10. Column 3 renders these links:

    | Link | `href` | Rendered when |
    |---|---|---|
    | Help guide | `/help` | always |
    | Delivery areas & slots | `/help#delivery` | always |
    | Returns & refunds | `/terms#refunds` | always |
    | Rewards | `/account/loyalty` | `loyaltyEnabled` is true |
    | Leave a review | `/feedback` | always |
    | Facebook icon (accessible name "Facebook") | `facebookUrl` | `facebookUrl` is non-null |

R11. These elements exist:
    - `app/(storefront)/help/page.tsx` has an element with `id="delivery"` wrapping the
      "Delivery & Minimums" section;
    - `app/(storefront)/terms/page.tsx` has an element with `id="refunds"` on the
      "Order Cancellations & Refunds" section;
    - `app/(storefront)/privacy/page.tsx` has an element with `id="cookies"` on the
      "Cookies and Local Storage" section.

R12. The bottom bar renders:
    - `© {current year} {vendor name}`, followed by "Company no. {companyNumber}",
      "VAT {vatNumber}" and "Registered office {registeredOffice}", each only when non-null;
    - "Powered by {PLATFORM_NAME}", only when `getPlatformBrandingEnv().PLATFORM_NAME` is set;
    - links Terms (`/terms`), Privacy (`/privacy`) and Cookies (`/privacy#cookies`);
    - "Secure checkout powered by Stripe", only when `showSecureCheckoutNote` is true;
    - one `<img>` per entry in `paymentBadges`, in enum order, with
      `src="/payment-methods/{visa|mastercard|amex|apple-pay|google-pay}.svg"` and non-empty `alt`
      text naming the method.
    When `paymentBadges` is empty, no badge row element renders.

R13. Five files exist: `public/payment-methods/visa.svg`, `mastercard.svg`, `amex.svg`,
    `apple-pay.svg` and `google-pay.svg`. Each is a valid SVG.

R14. At 375px width, every `<a>` and `<button>` inside the `<footer>` has a rendered bounding-box
    height of at least 44px.

## Colour

R15. `lib/footer-palette.ts` exports `footerPalette(primitives: BrandPrimitives)`. It returns
    `{ background, text, heading, muted }` as hex strings, where:
    - `background` is the value `brandStyle()` assigns to `--color-primary`;
    - `text` is derived from `cream`;
    - `heading` is derived from `orange`;
    - `muted` is derived from `cream`.

    A unit test asserts `contrastRatio(x, background) >= 4.5` for `text`, `heading` and `muted`,
    for both Aheed's and SriMart's seeded primitives. No new hex literal is added to
    `design-system/tokens/tokens.css`, and `StorefrontFooter.tsx` contains no hex literal.
    `tests/token-alpha-purity.test.ts` and `tests/vendor-neutral-copy.test.ts` pass.

## Staff editing

R16. `lib/footer-contact-form.ts` exports a pure `parseFooterContact` and its form-state type, and
    has a unit test file covering every rule below. The function returns field-level errors and
    never throws. The rules:

    | Field | Blank | Accepted | Error |
    |---|---|---|---|
    | phone | `null` | a value matching `^[+\d\s()-]{6,20}$`, or a value wholly wrapped in `[...]` | anything else |
    | email | `null` | a value of at most 254 characters that matches `^[^\s@]+@[^\s@]+\.[^\s@]+$`, or is wholly wrapped in `[...]` | anything else |
    | companyNumber | `null` | at most 20 characters | over the limit |
    | vatNumber | `null` | at most 20 characters | over the limit |
    | registeredOffice | `null` | at most 200 characters | over the limit |
    | openingHoursNote | `null` | at most 200 characters | over the limit |
    | showSecureCheckoutNote | — | `true` when the checkbox value is `"on"`, `false` otherwise | — |

R17. `lib/footer-hours-form.ts` exports a pure `parseFooterHours` and its form-state type, and has
    a unit test file covering these rules:
    - It accepts up to 8 rows. A ninth row is an error.
    - A row with both fields blank is dropped.
    - A row with exactly one field blank is a field error.
    - The label and hours must each be at most 40 characters.
    - `sortOrder` is assigned from the submitted order.
    - Badge checkboxes map to a deduplicated `PaymentBadgeMethod[]`, and an unknown method value is
      ignored.

R18. `features/admin/storefront.ts` exports two async server actions, `updateFooterContact` and
    `updateFooterHours`, and still exports only async functions. Each one:
    - calls `requireVendorRole("ADMIN")` and returns a refusal with no write when that check fails;
    - takes the vendor only from the session;
    - writes only its own fields. A save of one form leaves every column and row owned by the other
      forms on the page unchanged.

    `updateFooterHours` replaces the vendor's `VendorOpeningHours` and `VendorPaymentBadge` rows
    inside one `getPrismaWs().$transaction`. It makes no `createMany`, `updateMany` or nested
    `create` call through `getPrisma()`.

R19. `/staff/storefront`, signed in as an Aheed admin, renders two sections, "Footer contact &
    legal" and "Opening hours & payment badges", pre-filled with the current values. Submitting a
    changed value persists it, and the change is visible in Aheed's storefront footer on the next
    page load. Submitting an invalid email such as `bob@` shows a field error naming the email field
    and writes nothing. Clearing a field hides its footer element.

R20. The repository functions added to `lib/repositories/vendor.ts` take their Prisma client and
    `vendorId` as parameters. `tests/repository-purity.test.ts` and
    `tests/repository-client-injection.test.ts` pass.

R21. The `/staff/storefront` entry in `app/(admin)/staff/runbook/docs.ts` names both new forms and
    what each one controls. No new `/staff/*` route is added.

## Config

R22. `lib/config.ts` exports `getPlatformBrandingEnv()`, which returns
    `{ PLATFORM_NAME: string | undefined }`. It reads the variable through `readEnv` and does not
    require `DATABASE_URL`. `wrangler.toml` has `PLATFORM_NAME = "[PLATFORM NAME]"` under both
    `[env.staging.vars]` and `[env.production.vars]`. No code reads `process.env.PLATFORM_NAME`
    directly.

## Seed

R23. `prisma/seed.ts` seeds Aheed's footer defaults, filling only absent values:
    - `VendorLocation` is created only when missing, as `13 N 11th St` / `Milton Keynes` /
      `MK9 3BU`.
    - Each of these is set only where it is currently null: `contactPhone` `01908 239130`,
      `contactEmail` `[YOUR EMAIL]`, `companyNumber` `[NUMBER]`, `vatNumber` `[NUMBER]`,
      `openingHoursNote` `Click & Collect orders are ready to pick up during opening hours.`
    - `showSecureCheckoutNote` is set to `true`.
    - Opening-hours rows are created only when the vendor has none:
      - Monday – Friday: `[OPEN] – 8pm`
      - Saturday: `[OPEN] – 8pm`
      - Sunday: `[OPEN] – [CLOSE]`
      - Bank holidays: `[HOURS]`
    - All five payment badges are created only when the vendor has none.

    Running the seed twice in a row changes no footer value an admin edited in between. SriMart
    receives no new footer values from the seed.

R24. On SriMart, the storefront footer renders:
    - SriMart's own name in the © line, and no Aheed name, address, phone or opening hours;
    - no column 2;
    - column 1 only if a SriMart location, phone or email is already set (R7), showing only the
      values that exist;
    - the R10 always-on links;
    - the R12 legal links.

    It renders no Stripe line and no badge row. Its colours differ from Aheed's because they come
    from SriMart's primitives.

## Gates

R25. `CHANGELOG.md` is updated on this branch with an entry referencing #1055 (Gate 4).

R26. `npm run lint`, `npm run typecheck`, `npx vitest run` (run alone), `npm run format:check`,
    `npm run build` and `npm run kms:validate` all exit 0.
