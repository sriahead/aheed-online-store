# Slice B — feature switches and marketing consent (requirements / acceptance criteria)

Closes `#1134` (which absorbs the already-closed `#1136`). The reasoning, the owner's two rulings and
everything deliberately excluded are in `plan.md`. In one line: every Rewards surface follows
`loyaltyEnabled`, one footer label follows `offerDeliverySlots`, and a per-vendor, opt-in, recorded
marketing consent ships dark behind a new `marketingConsentEnabled` switch.

"Switch on/off" below means the value of the named `VendorConfig` column for the vendor resolved from
the request host. Locally the two seeded vendors are Aheed on `localhost:8787` and SriMart on
`srimart.localhost:8787` (see `docs/developer-portal/local-dev-playbook.md` for SriMart's
`x-forwarded-proto: http` sign-in trap). Every DB-touching check runs under `npm run preview`, never
`npm run dev`.

## Rewards follows `loyaltyEnabled`

R1. `components/account/AccountNav.tsx` takes a required `loyaltyEnabled: boolean` prop and renders
    the `/account/loyalty` link only when it is `true`. Both callers
    (`app/(storefront)/account/layout.tsx`, `app/(storefront)/feedback/page.tsx`) pass the resolved
    vendor's value.
R2. With `loyaltyEnabled` off, `/account` renders no Loyalty & Rewards card (neither the link nor
    the greyed "not enabled" card) and its intro sentence does not contain the word "loyalty". With
    it on, the card and the link to `/account/loyalty` render as before.
R3. With `loyaltyEnabled` off, the rendered HTML of `/privacy` and `/account/data` contains no
    occurrence of "loyalty points"; with it on, both pages name "loyalty points" in the same places
    they do today (`/privacy` sections 5 and 6, `/account/data`'s export and erasure descriptions).
R4. The personal-data export and erasure in `lib/repositories/data-rights.ts` still export and erase
    loyalty data whatever `loyaltyEnabled` is (no behaviour change; existing tests stay green).
R5. With `loyaltyEnabled` off for a vendor, a signed-in customer's rendered HTML for `/`, `/help`,
    `/account`, `/account/orders` and `/account/data` contains no `href="/account/loyalty"`.

## Other switches

R6. The footer link to `/help#delivery` reads "Delivery areas & slots" when `offerDeliverySlots` is
    on and "Delivery areas" when it is off.
R7. `build-notes.md` lists, for each of `assistantEnabled`, `offerCollection`, `offerDeliverySlots`
    and `expressCollectionEnabled`, the storefront surfaces checked and the result; every mismatch
    not fixed in this slice has an issue number on the delivery board.

## Marketing consent — schema

R8. `prisma/schema.prisma` adds `VendorConfig.marketingConsentEnabled Boolean @default(false)`, an
    enum `MarketingConsentSource { REGISTRATION ACCOUNT }`, and a model `MarketingConsentEvent` with
    exactly: `id` (uuid), `vendorId` (FK to `Vendor`), `userId` (FK to `User`, `onDelete: Cascade`),
    `granted Boolean`, `statement String`, `source MarketingConsentSource`, `createdAt DateTime
    @default(now())`, and an index on `(vendorId, userId, createdAt)`. No `Json` column.
R9. One new migration directory under `prisma/migrations/` contains only `CREATE TYPE`,
    `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE ... ADD CONSTRAINT` (foreign keys) and
    `ALTER TABLE "VendorConfig" ADD COLUMN` statements — no `DROP` of any kind (in particular none of
    the `pg_trgm` indexes) and no `UPDATE`/`INSERT`.
R10. The vendor profile returned by `lib/repositories/vendor.ts` carries `marketingConsentEnabled`
    (`false` for a vendor with no config row), read in the same query as `assistantEnabled`.

## Marketing consent — logic

R11. A plain (non-`"use server"`) module exports `marketingConsentStatement(vendorName: string):
    string`, returning exactly `Email me marketing and promotional offers from ${vendorName}. You
    can change this at any time in your account.` It has no default parameter and the file contains
    no vendor name literal.
R12. `lib/repositories/marketing-consent.ts` exports functions that each take the Prisma client plus
    explicit `vendorId` and `userId` and read no request context: `recordMarketingConsent` (writes
    one event with a singular `create` and no nested writes), `getMarketingConsentState` (returns the
    newest event for the pair, or `null`), and `hasEffectiveMarketingConsent` (true only when the
    newest event has `granted: true` AND the user's `emailVerified` is `true`).
    `tests/repository-purity.test.ts` and `tests/repository-client-injection.test.ts` pass with no
    new allowlist entry.
R13. Unit tests cover: no events → state `null` and not effective; granted then withdrawn → not
    effective; withdrawn then granted → effective when verified; granted but unverified → not
    effective; events for another vendor or another user are ignored.

## Marketing consent — staff switch

R14. `/staff/storefront` renders a "Marketing consent" section to an ADMIN with a single checkbox
    bound to `marketingConsentEnabled` and a save button; saving persists the value for the
    ADMIN's vendor only. Its form state and field-name constants live in a plain module; the action
    lives in a `"use server"` file whose every export is an async function.
R15. A non-ADMIN request to the save action changes nothing and returns an error state (the page's
    existing `requireVendorRole("ADMIN")` / `PanelRefusal` behaviour is unchanged).

## Marketing consent — registration

R16. With `marketingConsentEnabled` off, `/register` renders no marketing checkbox. With it on,
    `/register` renders an unticked, not-`required` checkbox whose label text is exactly
    `marketingConsentStatement(<that vendor's name>)`, placed after the password field and before
    the submit button.
R17. Ticking the checkbox sends `marketingOptIn: true` in the sign-up request body; leaving it unticked
    sends no `marketingOptIn: true`.
R18. A `databaseHooks.user.create.after` hook in `lib/auth.ts` writes exactly one `REGISTRATION`
    event with `granted: true` when, and only when, all hold: the request path is
    `/sign-up/email`, the body's `marketingOptIn` is the boolean `true`, a vendor resolves from the
    request, and that vendor's `marketingConsentEnabled` is on. The event's `statement` is built
    server-side from the resolved vendor's name (any statement text in the body is ignored). The
    decision is a pure, unit-tested function separate from the database write.
R19. Sign-up with `marketingOptIn: true` on a vendor whose switch is off, sign-up without the flag,
    a sign-up for an email that already has an account, and a Google sign-up each write no
    `MarketingConsentEvent`.
R20. If writing the event throws, the sign-up still returns success and the failure is recorded
    through the existing error-event path (`recordErrorEvent`).

## Marketing consent — account

R21. On `/account/data`, a signed-in customer sees a "Marketing emails" section that states whether
    they are opted in. With the switch on and no current consent, it offers "Opt in" (showing the
    statement); with a current `granted: true` it offers "Withdraw". Each writes one `ACCOUNT` event
    (`granted: true` / `false`) for the current vendor and user via a server action that requires a
    session; with no session the action writes nothing. The event's `statement` is built
    server-side by `marketingConsentStatement` from the resolved vendor's name.
R22. With the switch off: a customer with no current consent sees no Marketing emails section; a
    customer whose newest event is `granted: true` still sees the section with "Withdraw", and the
    withdraw action still works.

## Marketing consent — data rights

R23. `exportPersonalData` includes every `MarketingConsentEvent` for that vendor and user (granted,
    statement, source, createdAt), newest first; none from another vendor.
R24. `eraseVendorData` deletes that vendor's `MarketingConsentEvent` rows for the user inside its
    existing transaction and leaves other vendors' events untouched; `countOtherVendorData` counts
    other vendors' consent events, so a user whose only other-vendor data is a consent event keeps
    their sign-in.

## Marketing consent — privacy policy

R25. With `marketingConsentEnabled` on, `/privacy` section 3 contains the sentence "If you opt in, we
    may use your details for marketing and promotional purposes." and states that opting in is
    separate from creating an account or ordering, is never required, and can be withdrawn at any
    time from your data in your account (with a link to `/account/data`); the word "solely" no
    longer appears in section 3. Section 5 states how long the marketing-consent record is kept and
    section 6's erasure description names marketing preferences.
R26. With `marketingConsentEnabled` off, `/privacy` section 3 is unchanged from `staging` at
    `02b25cc` and the page contains no occurrence of "marketing and promotional".
R27. No new or changed component or default parameter in this slice contains a vendor's name or a
    grocery example; the existing user-facing-copy guard test passes.

## Live behaviour (two vendors)

R28. Under `npm run preview` against the dev database, with Aheed's switch on and SriMart's off: a
    sign-up on `localhost:8787` with the box ticked produces one `REGISTRATION` event for Aheed whose
    statement names Aheed's vendor name; the same request shape on `srimart.localhost:8787`
    produces none; a signed-in seeded customer can opt in and then withdraw on Aheed, producing two
    `ACCOUNT` events in order. A read-only script `scripts/verify-marketing-consent.ts`, taking an
    email argument, prints each seeded vendor's `marketingConsentEnabled` value and that user's
    events per vendor, and exits 0.
R29. `/register` and `/account/data` with the marketing section visible pass
    `scripts/verify-mobile-layout.ts` (no horizontal overflow) at its mobile and desktop widths.

## Documentation carried on this branch

R30. `docs/store-admin-guide/admin-tabs-guide.md` documents the Marketing consent switch under
    `/staff/storefront` (what it turns on, that nothing sends marketing yet, and that the wording
    should be legally reviewed before switching it on), and its Loyalty section states that switching
    loyalty off hides every Rewards link, setting and help entry. Every capability sentence added
    maps to a real control.
R31. `specs/roadmap.md`'s change log has rows citing `specs/2026-10-17-p1142-header-dropdown-search-room/`,
    `specs/2026-10-18-p1145-quick-shop/` and `specs/2026-10-18-p1147-fish-products/`, and a row for
    promotion PR #1151 (merge `d30165e`); `npm run sdd:audit` reports no gap for those three slices
    and no carry-forward flag for PR #1151.
R32. `specs/2026-10-18-p1145-quick-shop/requirements.md` R5 and its `validation.md` row state that
    `/shop-your-list` is unchanged and deliberately absent from `app/sitemap.ts`, and no longer claim
    the sitemap lists it.
R33. A follow-up issue for consent-checked marketing sending (must call
    `hasEffectiveMarketingConsent`, carry an unsubscribe link, honour withdrawal) exists on the
    delivery board with Phase set and Status `Backlog`, and is cited in `build-notes.md`.

## Gates

R34. `npm run kms:validate` exits 0, and `npm run kms:assemble:internal` followed by a Next build in
    `kms/site-internal` succeeds.
R35. `CHANGELOG.md` updated (Gate 4).
R36. `lint`, `typecheck`, `test` (`npx vitest run`, run alone), `format:check` all remain green after
    this slice.
