# Shared page container and a three-step width scale (requirements / acceptance criteria)

Closes `#1180`. Sixty pages each pick their own `max-width` while every chrome element above them
is `max-w-7xl`, so the admin hub sits 128px inboard of the nav that heads it and the admin's table
pages render in as little as 672px. This slice introduces one `PageContainer` with three widths and
one shared gutter, applies it to every page, and adds a guard test so the pages cannot drift apart
again. Narrative and the reasoning behind the per-page assignment: `plan.md`.

R1. `components/layout/PageContainer.tsx` exists and default-exports nothing; it exports a named
    `PageContainer` component and a `PageWidth` type whose members are exactly `"wide"`,
    `"standard"` and `"narrow"`.

R2. `PageContainer` renders a `<main>` element whose `className` begins with
    `mx-auto w-full px-4`, followed by exactly one width class — `max-w-7xl` for `wide`,
    `max-w-5xl` for `standard`, `max-w-2xl` for `narrow` — and exactly one vertical padding class,
    `py-8` for `padY="default"` (the default) or `py-6` for `padY="tight"`.

R3. `PageContainer`'s `width` prop is required: `npx tsc --noEmit` fails on a `<PageContainer>`
    usage that omits it.

R4. `PageContainer` accepts an optional `className` that is appended after its own classes, and an
    optional `padY`. It accepts no other layout prop.

R5. `PageContainer` is a plain module with no `"use server"` directive and no React hooks, so it
    renders inside both server and client components.

R6. Every page under `app/(admin)` renders its top-level container as `PageContainer` with exactly
    this width, and contains no other `mx-auto`-plus-`max-w-` top-level container:

    | Page | Today | Width |
    |---|---|---|
    | `staff/page.tsx` | `5xl` | `wide` |
    | `staff/orders/page.tsx` | `3xl` | `wide` |
    | `staff/products/page.tsx` | `3xl` | `wide` |
    | `staff/inventory/page.tsx` | `5xl` | `wide` |
    | `staff/customers/page.tsx` | `3xl` | `wide` |
    | `staff/fulfilment/page.tsx` | `3xl` | `wide` |
    | `staff/payments/page.tsx` | `7xl` | `wide` |
    | `staff/errors/page.tsx` | `7xl` | `wide` |
    | `staff/runbook/page.tsx` | `7xl` | `wide` |
    | `staff/reports/page.tsx` | `5xl` | `wide` |
    | `staff/categories/page.tsx` | `2xl` | `wide` |
    | `staff/promotions/page.tsx` | `2xl` | `wide` |
    | `staff/brands/page.tsx` | `3xl` | `wide` |
    | `staff/attributes/page.tsx` | `3xl` | `wide` |
    | `staff/net-content/page.tsx` | `3xl` | `wide` |
    | `staff/search-synonyms/page.tsx` | `3xl` | `wide` |
    | `staff/bundles/page.tsx` | `2xl` | `wide` |
    | `staff/feedback/page.tsx` | `5xl` | `wide` |
    | `staff/team/page.tsx` | `5xl` | `wide` |
    | `staff/faqs/page.tsx` | `5xl` | `standard` |
    | `staff/discounts/page.tsx` | `2xl` | `standard` |
    | `staff/loyalty/page.tsx` | `2xl` | `standard` |
    | `staff/delivery-areas/page.tsx` | `3xl` | `standard` |
    | `staff/storefront/page.tsx` | `5xl` | `standard` |
    | `staff/assistant/page.tsx` | `5xl` | `standard` |
    | `staff/ai-usage/page.tsx` | `3xl` | `standard` |
    | `staff/orders/[orderNumber]/page.tsx` | `2xl` | `narrow` |
    | `staff/products/[id]/page.tsx` | `2xl` | `narrow` |
    | `staff/products/new/page.tsx` | `2xl` | `narrow` |
    | `staff/categories/[id]/page.tsx` | `2xl` | `narrow` |
    | `staff/bundles/[bundleId]/page.tsx` | `2xl` | `narrow` |
    | `staff/promotions/[categoryId]/page.tsx` | `2xl` | `narrow` |

R7. Every page under `app/(storefront)` and `app/(landing)` renders its top-level container as
    `PageContainer` with exactly this width and `padY`, and contains no other `mx-auto`-plus-`max-w-`
    top-level container:

    | Page | Today | Width | `padY` |
    |---|---|---|---|
    | `(landing)/page.tsx` | `7xl` `py-6` | `wide` | `tight` |
    | `(storefront)/categories/page.tsx` | `7xl` `py-6` | `wide` | `tight` |
    | `(storefront)/categories/[slug]/page.tsx` | `7xl` `py-6` | `wide` | `tight` |
    | `(storefront)/search/page.tsx` | `7xl` `py-6` | `wide` | `tight` |
    | `(storefront)/bundles/page.tsx` | `7xl` `py-6` | `wide` | `tight` |
    | `(storefront)/account/page.tsx` | `5xl` `py-8` | `standard` | `default` |
    | `(storefront)/account/data/page.tsx` | `5xl` `py-8` | `standard` | `default` |
    | `(storefront)/account/lists/page.tsx` | `5xl` `py-8` | `standard` | `default` |
    | `(storefront)/account/lists/[listId]/page.tsx` | `5xl` `py-8` | `standard` | `default` |
    | `(storefront)/account/loyalty/page.tsx` | `5xl` `py-8` | `standard` | `default` |
    | `(storefront)/account/orders/page.tsx` | `5xl` `py-8` | `standard` | `default` |
    | `(storefront)/account/orders/[orderNumber]/page.tsx` | `5xl` `py-8` | `standard` | `default` |
    | `(storefront)/cart/page.tsx` | `3xl` `py-6` | `standard` | `tight` |
    | `(storefront)/products/[slug]/page.tsx` | `4xl`, **no padding** | `standard` | `default` |
    | `(storefront)/checkout/page.tsx` | `3xl` `py-6` | `narrow` | `tight` |
    | `(storefront)/checkout/[orderNumber]/page.tsx` | `2xl` `py-8` | `narrow` | `default` |
    | `(storefront)/checkout/[orderNumber]/cancel/page.tsx` | `xl` `py-8` | `narrow` | `default` |
    | `(storefront)/shop-your-list/page.tsx` | `3xl` `py-6` | `narrow` | `tight` |
    | `(storefront)/orders/lookup/page.tsx` | `3xl` `py-8` | `narrow` | `default` |
    | `(storefront)/feedback/page.tsx` | `2xl` `py-10` | `narrow` | `default` |
    | `(storefront)/help/page.tsx` | `4xl` `py-8`, `<div>` | `narrow` | `default` |
    | `(storefront)/privacy/page.tsx` | `4xl` `py-8` | `narrow` | `default` |
    | `(storefront)/terms/page.tsx` | `4xl` `py-8` | `narrow` | `default` |
    | `(storefront)/login/page.tsx` | `sm` `py-8` | `narrow` | `default` |
    | `(storefront)/register/page.tsx` | `sm` `py-8` | `narrow` | `default` |
    | `(storefront)/forgot-password/page.tsx` | `sm` `py-8` | `narrow` | `default` |
    | `(storefront)/reset-password/page.tsx` | `sm` `py-8` | `narrow` | `default` |
    | `(storefront)/dev/page.tsx` | `md` `py-16` | `narrow` | `default` |

R8. `/login`, `/register`, `/forgot-password` and `/reset-password` each keep a `max-w-sm`
    element **inside** the `PageContainer`, so the sign-in card's measure is unchanged from today.

R9. `app/(storefront)/help/page.tsx` renders a `<main>` landmark (supplied by `PageContainer`); the
    page's rendered HTML contains exactly one `<main>`.

R10. `app/(storefront)/products/[slug]/page.tsx`'s top-level container carries `px-4`, and its
     `grid gap-6 sm:grid-cols-2` moves to an element inside `PageContainer` rather than onto the
     container itself.

R11. `tests/page-container.test.ts` exists and fails if any `page.tsx` under `app/(admin)`,
     `app/(storefront)` or `app/(landing)` contains a top-level element carrying both `mx-auto` and
     a `max-w-` class, and fails if any `PageContainer` `className` prop contains `max-w-`,
     `mx-auto` or `px-`.

R12. `scripts/verify-mobile-layout.ts` accepts `--desktop`, which sets `mobile: false` and
     `deviceScaleFactor: 1` on `Emulation.setDeviceMetricsOverride` (today `mobile: true` is
     hardcoded at `:782`, which is wrong for a desktop-width measurement), and `--measure <selector>`
     (repeatable or comma-separated), which adds a `measured` object to every printed width keyed by
     selector, each value `{ top, left, width, height }` or `null` when the selector matches nothing.
     Its existing output fields and default behaviour are unchanged when neither flag is passed.

R13. At a 1280px viewport on `/staff`, the `left` of `nav[aria-label="Store admin"] > div` and the
     `left` of `main` differ by no more than 1px.

R14. At a 1280px viewport, every measured page reports
     `documentScrollWidth <= viewportWidth` on `/staff`, `/staff/orders`, `/`,
     `/categories/fruit-veg` and a `/products/<slug>` page, for **both** the Aheed and the SriMart
     vendor hosts.

R15. The product grid on `/categories/fruit-veg` renders the same number of columns at 1280px
     after this slice as before it, in both the expanded and the `#1173` collapsed-sidebar states.

R16. `specs/design-system.md` documents the three-variant scale, the shared `mx-auto w-full px-4`
     gutter, and the rule that a page uses `PageContainer` rather than its own width container.

R17. `docs/developer-portal/app-conventions.md` records that a new page's container is
     `PageContainer`, and `CLAUDE.md`'s staff-panel rule names it alongside `nav-items.ts`.

R18. `CHANGELOG.md` updated (Gate 4).

R19. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
