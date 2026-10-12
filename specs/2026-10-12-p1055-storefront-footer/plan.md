---
id: p1055-storefront-footer
title: "Storefront footer — three-column, vendor-configured (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-12
visibility: internal
summary: Replaces the one-line storefront footer with a three-column footer (contact, opening hours, shop links) and a legal and payment-trust bar, every value vendor-configured on /staff/storefront and hidden when unset.
tags: [storefront, footer, multi-vendor, staff-panel]
related: [app-conventions, design-system]
---

# Plan — #1055 storefront footer

**Goal:** a shopper on any storefront page can find the shop's address, phone, email and opening
hours, along with help links, the shop's legal identity and a payment-trust line, all in the footer. Every
value is vendor data, edited by a store admin on `/staff/storefront`. Shipping this proves that the
footer is now a vendor-configured surface, with no platform-written copy in it.

The owner approved this proposal on 2026-10-12. The approval included a three-column layout matching
the supplied mockup, and **placeholder values seeded for the details the owner has not yet
supplied** (`[YOUR EMAIL]`, `[OPEN]`, `[CLOSE]`, `[HOURS]`, `[NUMBER]`, `[PLATFORM NAME]`).

## Scope (this slice)

### Rendering — `components/layout/StorefrontFooter.tsx` (new, server component)

This component replaces the inline `<footer>` in `components/layout/StorefrontChrome.tsx`. The
landing page and every storefront page already share that chrome, so one change covers both. It
receives everything it needs as props: the `VendorProfile` the chrome already loads, plus the
platform name. **The page render adds no extra database query.** The footer's new data is
fetched inside the existing `fetchVendorProfile` query, which follows the #1015
`assistantEnabled` precedent.

Layout:

- **Desktop (≥ `md`):** three columns, then a bottom bar.
- **Mobile:** columns stacked. Two full-width buttons sit above them: **Call** (`tel:`) and **Get
  directions**. Each button renders only when its data exists.
- **Column 1, "Visit & contact us":** vendor name, address, a *Get directions* link, phone, email.
  - The address comes from `VendorLocation` (line 1, line 2, city, postcode).
  - The *Get directions* link is
    `https://www.google.com/maps/search/?api=1&query=<encodeURIComponent(name + ", " + address)>`.
  - The phone is a `tel:` link and the email is a `mailto:` link.
- **Column 2, "Shop opening hours":** the vendor's ordered opening-hours rows, each shown as a
  label and a value, followed by an optional note line.
- **Column 3, "Shop with us":**

  | Link | Target | Shown when |
  |---|---|---|
  | Help guide | `/help` | always |
  | Delivery areas & slots | `/help#delivery` | always |
  | Returns & refunds | `/terms#refunds` | always |
  | Rewards | `/account/loyalty` | the vendor's loyalty is enabled (same gate as #1023) |
  | Leave a review | `/feedback` | always |
  | Facebook icon | `facebookUrl` | `facebookUrl` is set |

- **Bottom bar:**
  - `© {year} {vendor name}`, then `· Company no. {n}`, `· VAT {n}` and `· Registered office {text}`,
    each only when set.
  - `Powered by {platform name}`, only when that name is set.
  - Terms (`/terms`), Privacy (`/privacy`) and Cookies (`/privacy#cookies`).
  - "Secure checkout powered by Stripe", only when the vendor's toggle is on.
  - A row of payment-method `<img>` badges for the methods the vendor has enabled.

This slice adds `id` anchors to three existing headings: `delivery` on the Help Centre's
"Delivery & Minimums" section, `refunds` on the Terms "Order Cancellations & Refunds" section, and
`cookies` on the Privacy "Cookies and Local Storage" section. It changes nothing else on those pages.

**Every vendor value that is null or empty HIDES its element, with no platform fallback (#239).** A
column with nothing to show is not rendered. Column 1 counts as empty when the location, phone
and email are all null, since the vendor name alone is not contact information. Column 3 always
has content.

### Colours: derived, not invented

The footer background is the vendor's `--color-primary`, the dark brand green shown in the mockup.
Foregrounds come from a new pure function, `footerPalette(primitives)` in `lib/footer-palette.ts`.
It derives three colours from the vendor's own primitives and passes each through `clampForContrast`
against the footer background at ≥ 4.5:1:

- body text from `cream`
- headings from `orange`
- secondary text from a muted `cream`

The colours are applied as inline custom properties on the `<footer>` element.

The clamp is needed because Aheed's raw orange (`#f57c00`) on its dark green (`#1b5e20`) measures
about 3.1:1, which fails AA for the small uppercase headings the mockup uses. No new hex literal is
added to `tokens.css` or to any component. Alpha modifiers on themed foregrounds stay banned
(`tests/token-alpha-purity.test.ts`).

### Data model (one migration, generated `--create-only` and read before it applies)

New nullable `VendorConfig` columns. Under the #239 rule, null hides the element.

| Column | Type | Footer element |
|---|---|---|
| `contactPhone` | `String?` | phone link and mobile Call button |
| `contactEmail` | `String?` | email link |
| `companyNumber` | `String?` | Company no. |
| `vatNumber` | `String?` | VAT number |
| `registeredOffice` | `String?` | Registered office |
| `openingHoursNote` | `String?` | line under the hours |
| `showSecureCheckoutNote` | `Boolean @default(false)` | Stripe line |

`VendorOpeningHours` is a new model with these fields:

- `id`
- `vendorId` (foreign key, `onDelete: Cascade`)
- `label String`, for example "Monday – Friday"
- `hours String`, for example "9am – 8pm"
- `sortOrder Int`
- `@@index([vendorId, sortOrder])`

**Why free-text rows and not structured times.** The approved defaults are placeholders such as
`[OPEN] – 8pm`, which no `HH:mm` column can hold. The owner's own grouping (Mon–Fri / Sat / Sun /
Bank holidays) is a label choice, not a fixed seven-day grid. Bank holidays become one more row.

This **refines the table in #1055**, which proposed per-day `opensAt`/`closesAt` columns.
Machine-readable hours (an "open now" badge, schema.org `openingHours`) are deliberately deferred;
see the exclusions below.

`VendorPaymentBadge` is a new model with these fields:

- `id`
- `vendorId` (foreign key, `onDelete: Cascade`)
- `method PaymentBadgeMethod`, a new enum: `VISA`, `MASTERCARD`, `AMEX`, `APPLE_PAY`, `GOOGLE_PAY`
- `@@unique([vendorId, method])`

A row's presence means that badge is shown. Display order is the enum order, fixed in code, so there
is no `sortOrder`.

**Badge images are platform static assets, not vendor uploads.** They live at
`public/payment-methods/{visa,mastercard,amex,apple-pay,google-pay}.svg`. This slice ships text-label
placeholder SVGs, and the owner replaces the files with real logos. They are not vendor data:
Visa's logo is the same for every vendor. ADR-003's relative-key rule covers vendor- and
catalogue-uploaded images, which these are not.

### Platform name

The platform name is configured with a new **`PLATFORM_NAME`** variable, read through a dedicated
getter in `lib/config.ts`, `getPlatformBrandingEnv()`. The getter has its own small zod schema,
following the email and payment getters, so a missing database URL can never break it. Where the
variable is unset, the "Powered by" line is hidden.

`wrangler.toml` sets `PLATFORM_NAME = "[PLATFORM NAME]"` under both `[env.staging.vars]` and
`[env.production.vars]`. This is the approved placeholder, and it lives in committed config rather
than in code. The owner changes it there.

### Staff editing — `/staff/storefront` (existing page, no new page)

Two new forms are added to `components/staff/StorefrontConfigForm.tsx`. Each has its own `"use
server"` action in `features/admin/storefront.ts`, following the separate-form pattern
`updateSocialContact` set. Each requires `requireVendorRole("ADMIN")` and takes the vendor from
the session. Each has a pure, DB-free parser with unit tests; the parsers' state types live in those
plain modules, because a `"use server"` file exports only async functions.

1. **"Footer contact & legal"**, saved by `updateFooterContact`, parsed by
   `lib/footer-contact-form.ts`.

   | Field | Rule |
   |---|---|
   | phone | digits, spaces and `+()-` only, 6–20 characters |
   | email | must match `^[^\s@]+@[^\s@]+\.[^\s@]+$`, at most 254 characters |
   | company no. | at most 20 characters |
   | VAT no. | at most 20 characters |
   | registered office | at most 200 characters |
   | hours note | at most 200 characters |
   | Stripe-line checkbox | on or off |

   Blank parses to `null` and hides the element. A non-blank value that breaks its rule is a
   field-level error.

   **Bracketed placeholders are accepted as-is.** For example, `[YOUR EMAIL]` is stored and
   rendered as text, not as a link. The renderer produces a `mailto:` link only when the value
   passes the email pattern, and a `tel:` link only when the phone value passes the phone pattern.
   The validator therefore lets a placeholder through as text without ever turning it into an
   `href`. This is how the approved placeholders and the href-safety rule (#407) coexist.

2. **"Opening hours & payment badges"**, saved by `updateFooterHours`, parsed by
   `lib/footer-hours-form.ts`.
   - Up to 8 rows, each with a label (at most 40 characters) and hours (at most 40 characters).
   - A row with both fields blank is dropped. A row with only one field filled is a field error.
   - Five checkboxes, one per badge method.
   - The save replaces the vendor's hours rows and badge rows in one interactive `$transaction`
     through **`getPrismaWs()`**, because `deleteMany` plus `createMany` must be atomic and
     `createMany` crashes under `getPrisma()` (CLAUDE.md).

The repository functions go in `lib/repositories/vendor.ts`. They take the client and `vendorId`
explicitly; the request-scoped wrappers go in `lib/vendor-service.ts`.

After either save, the action revalidates `/staff/storefront` and `"/", "layout"`.

The runbook entry for `/staff/storefront` in `app/(admin)/staff/runbook/docs.ts` is updated to name
both new forms. That entry is the operator guide for this page, and the "trace every capability
sentence" rule applies.

### Defaults (seed)

`prisma/seed.ts` gains a `seedFooterDefaults(vendorId, defaults)` step for Aheed. **It only fills
values that are absent and never overwrites an admin's edit on re-seed.** This is unlike
`upsertVendorSatellites`'s config `update`, which resets the declared baseline.

| Value | Seeded as |
|---|---|
| `VendorLocation` | created only if missing: `13 N 11th St`, `Milton Keynes`, `MK9 3BU` |
| `contactPhone` | `01908 239130` |
| `contactEmail` | `[YOUR EMAIL]` |
| `companyNumber` | `[NUMBER]` |
| `vatNumber` | `[NUMBER]` |
| `registeredOffice` | not seeded (null) |
| `openingHoursNote` | `Click & Collect orders are ready to pick up during opening hours.` |
| `showSecureCheckoutNote` | `true` |
| opening hours | created only when the vendor has zero rows: Monday – Friday `[OPEN] – 8pm`, Saturday `[OPEN] – 8pm`, Sunday `[OPEN] – [CLOSE]`, Bank holidays `[HOURS]` |
| payment badges | created only when the vendor has zero rows: all five |

`contactPhone`, `contactEmail`, `companyNumber`, `vatNumber`, `openingHoursNote` and
`showSecureCheckoutNote` are each set only where the column is currently null; for the boolean,
only when the column is still at its default.

**SriMart gets nothing new.** Its footer shows only what it already has: its name, Facebook if
set, the always-on links, and the legal links. That is the second-vendor check.

## Deliberately excluded

- **A real "Delivery areas & slots" page and a real "Returns & refunds" page.** Neither exists. The
  footer links to anchors on `/help` and `/terms`. Building those pages is separate work.
- **A separate Cookies page.** `/privacy` section 4 is the cookies policy, so the footer links to it
  by anchor.
- **Structured, machine-readable opening hours** (per-day times, an "open now" badge, schema.org
  `openingHours` / `LocalBusiness` JSON-LD). The free-text rows are a deliberate first step; see the
  refinement note above. Not filed as an issue, because no consumer exists yet.
- **Vendor-uploaded badge images.** Badges are platform static assets.
- **Instagram or WhatsApp in the footer.** The mockup shows Facebook only. The floating contact
  cluster still carries all three.
- **Populating production.** The seed is not run by any CI workflow. Production values come from a
  store admin on `/staff/storefront`, or from a seed run the user performs; production commands need
  the user. Until then, production's footer hides each unset element, which is safe.
- **Any change to the header, the cookie banner or `FloatingContact`.**

## Open items carried forward

- The real values for email, opening times, bank-holiday hours, company and VAT numbers, the
  platform name and the badge logo files are **owner-supplied**. Placeholders render literally
  until they are replaced; this was approved on 2026-10-12.
- "Secure checkout powered by Stripe" renders while live Stripe keys are still pending (#113). The
  wording is accurate for the integration, but the platform has not yet taken a live payment.
