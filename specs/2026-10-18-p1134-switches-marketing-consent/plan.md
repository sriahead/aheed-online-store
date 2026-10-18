---
id: p1134-switches-marketing-consent
title: "Slice B — feature switches and marketing consent (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-18
visibility: internal
summary: "Slice B of the owner's website brief (#1134, absorbing #1136): every Rewards surface follows the loyalty switch, cheap mismatches on the other switches are fixed, and a per-vendor, opt-in, recorded marketing consent ships dark behind a new switch."
tags: [loyalty, feature-switches, marketing-consent, pecr, uk-gdpr, privacy, p10]
related: [p1107-1041-privacy-consent, p1131-storefront-navigation-catalogue, app-conventions, architecture]
---

# Slice B — feature switches and marketing consent (plan)

Issue `#1134` (slice B of the owner's "Website Updates" brief, 2026-10-17), absorbing `#1136`. The
owner approved the approach on 2026-10-18; the record is the Gate 1 comment on `#1134`. Two
owner rulings were made at Propose and are not open for re-derivation: (1) marketing consent is
a **real, per-vendor, recorded opt-in**, not wording only and not a cookie-banner category; (2) it
sits behind a **new per-vendor switch** that is off by default.

**Goal:** a store can switch Rewards off and have nothing on the storefront still offer it, and a
store can ask shoppers for marketing consent in a way that would stand up under UK PECR and UK GDPR
— separate, unticked, specific, recorded with the exact wording shown, and as easy to withdraw as to
give. Shipping it proves the switch pattern (`loyaltyEnabled`, `assistantEnabled`) holds across
every surface, and leaves the platform ready to send marketing later without retrofitting consent.

## Scope (this slice)

### 1. Rewards follows `loyaltyEnabled` everywhere

Grounded at Propose: most surfaces already gate on the switch — the footer
(`components/layout/StorefrontFooter.tsx`), `/help`, the floating Rewards launcher
(`StorefrontChrome`), `/checkout`, `/account/loyalty` (404s), and the assistant content. The gaps:

- `components/account/AccountNav.tsx:82` renders "Loyalty & Rewards" unconditionally. With the
  switch off it is a link to a 404. `AccountNav` is a client component rendered from
  `app/(storefront)/account/layout.tsx` and `app/(storefront)/feedback/page.tsx`; both pass the
  switch in as a required prop.
- `/account` (`app/(storefront)/account/page.tsx`) shows a greyed "Loyalty rewards are currently not
  enabled for this store" card and names "loyalty rewards" in its intro. The owner's instruction is
  *hidden*, not *disabled*, so both go when the switch is off.
- `/privacy` sections 5 and 6 and `/account/data` name "loyalty points" in what is kept and what
  erasure removes. These lines name loyalty only when the switch is on. The data **export** and
  **erasure** themselves are unchanged — they keep handling any loyalty rows that exist, because a
  store that switched loyalty off may still hold balances (the guide says they are kept).

Turning Rewards off **for Aheed** is an owner data action at `/staff/loyalty` after deploy, not
code and not a migration. It is on in staging and production today; the platform has never
traded, so no real balance is affected.

### 2. Cheap mismatches on the other switches

Audited at Spec against `assistantEnabled`, `offerCollection`, `offerDeliverySlots` and
`expressCollectionEnabled`. Collection and the assistant are already gated on `/help` and in the
footer. One mismatch was found: the footer's "Delivery areas & slots" link names slots whatever
`offerDeliverySlots` says. It becomes "Delivery areas" when slots are off. Anything else Build finds
is recorded in `build-notes.md` and filed as an issue, not fixed here.

### 3. Marketing consent (from `#1136`)

`#1107`'s consent is a browser cookie — per device, not attributable, no record — so it cannot be
valid consent to marketing email. Users are global across vendors (`User.email` is unique), so
consent is per (user, vendor), the same shape as `LoyaltyAccount`.

- **Switch.** `VendorConfig.marketingConsentEnabled Boolean @default(false)`, exposed on the vendor
  profile like `assistantEnabled`, set by a store ADMIN in a new section on the existing
  `/staff/storefront` page (no new `/staff/*` page, so the three-surface rule does not trigger).
  Form state lives in a plain module; the action in a `"use server"` file exporting only async
  functions (CLAUDE.md).
- **Record.** An append-only `MarketingConsentEvent` table: `id`, `vendorId` (FK), `userId` (FK,
  cascade on user delete), `granted Boolean`, `statement String` (the exact text the shopper saw),
  `source` (enum `MarketingConsentSource`: `REGISTRATION`, `ACCOUNT`), `createdAt`. The current
  state is the newest event for the pair; no event means not opted in. An event log rather than a
  mutable row because the ICO expects a record of who consented, when, how, and to what wording —
  overwriting a row on withdraw-then-regrant loses that. Storing the rendered statement is an audit
  snapshot (like an order line's price), not a 3NF breach.
- **Effective consent requires a verified email.** A sign-up can name an email the person does not
  own; until `User.emailVerified` is true the consent is recorded but not effective.
  `hasEffectiveMarketingConsent` is the one function a future sender must call.
- **The statement** is built by one pure function from the vendor's name (from the database, never
  a literal): `Email me marketing and promotional offers from <vendor name>. You can change this at
  any time in your account.` Email only — the platform collects a phone number at checkout, but
  consent to email is not consent to SMS, so the wording names the channel.
- **Registration.** `/register` shows an unticked checkbox with that statement, below the password
  and above the submit button, only when the switch is on. It is not required. The form sends
  `marketingOptIn: true` in the Better Auth sign-up body. Better Auth 1.6.26's sign-up schema
  accepts extra keys and `parseUserInput` ignores unknown ones (read at Spec in
  `node_modules/better-auth/dist/api/routes/sign-up.mjs`), and `databaseHooks.user.create.after`
  receives the endpoint context, body included (`dist/db/with-hooks.mjs`). The hook resolves the
  vendor from the request, re-checks the switch server-side, rebuilds the statement server-side
  (never trusts client text), and writes one `REGISTRATION` event. A sign-up for an email that
  already exists creates no user, so the hook does not fire and no consent is written for someone
  else's account. Google sign-up carries no body flag, so it records nothing; those shoppers opt in
  from the account. A failure to write the event must not fail the sign-up; it is recorded through
  the existing error-event path.
- **Account.** `/account/data` gains a "Marketing emails" section showing the current state and a
  single button to opt in or withdraw, each writing an `ACCOUNT` event. Opt-in shows only while the
  switch is on; **withdraw stays available while the shopper's current state is granted even if the
  switch is later turned off** — withdrawal must never be harder than consent.
- **Data rights.** The export includes every consent event for that vendor. Erasure deletes them for
  that vendor, inside the existing erasure transaction. `countOtherVendorData` counts consent events
  at other vendors, so erasing here never deletes the sign-in of someone who has only consented
  elsewhere (that delete would cascade their other consent away).
- **Privacy policy (switch on only).** Section 3 currently says data is used "solely" for orders; with
  the switch on, that is no longer true. Section 3 gains: "If you opt in, we may use your details for
  marketing and promotional purposes." plus that opting in is separate from creating an account or
  ordering, never required, and can be withdrawn at any time from "your data" in your account.
  Section 5 states the record is kept while the account exists, and section 6's erasure list names
  marketing preferences. With the switch off, `/privacy` sections 3, 5 and 6 render as today apart
  from the loyalty gating above.
- **Migration.** Generated with `--create-only` and read before it applies: it may only create the
  enum, the table, its indexes and FKs, and the `VendorConfig` column — any proposed drop of the
  hand-authored `pg_trgm` indexes is removed by hand (CLAUDE.md, since `#508`). Turning the switch
  on for Aheed is an owner action at `/staff/storefront`; the migration leaves it off everywhere.

### 4. Documentation carried on this branch

`sdd:audit` reported three gaps at the 2026-10-18 Orient. They ride this branch (post-merge doc
changes ride the next slice):

- `specs/roadmap.md` change-log rows citing `specs/2026-10-17-p1142-header-dropdown-search-room/`,
  `specs/2026-10-18-p1145-quick-shop/` and `specs/2026-10-18-p1147-fish-products/`, plus the PR #1151
  promotion row (merge `d30165e`, 2026-10-18). The `#1142` row reuses the text already written on
  the unmerged `docs/p1142-merged-handoff` branch (commit `bc89de1`), so nothing on it is lost.
- `#1149` item 1: `specs/2026-10-18-p1145-quick-shop/` R5 and its validation row wrongly claim
  `app/sitemap.ts` lists `/shop-your-list`. They are corrected to "the route is unchanged and is
  deliberately absent from the sitemap".
- `#1149` item 2: once this branch carries `bc89de1`'s content, that branch is superseded. **It is
  not deleted by the assistant** (it is unmerged; see the standing rule on unmerged branches); the
  owner is asked at Ship.
- The store admin guide documents the new switch and the Rewards-off procedure; the
  `#1123` / handoff state is reconciled at the final `/document`, not here.

## Deliberately excluded

- **Sending marketing.** Nothing sends marketing today and this slice adds no sender. Any future
  sender must call `hasEffectiveMarketingConsent`, include an unsubscribe link in every message, and
  honour withdrawal — filed as a follow-up issue at Build notes, not built here.
- **A staff view or export of opted-in customers.** Only useful once there is a sender; it belongs
  with the follow-up above.
- **SMS or phone marketing consent.** The statement names email only.
- **PECR "soft opt-in"** for existing customers. The owner chose explicit opt-in; soft opt-in needs
  its own opt-out-at-collection wording and is not used.
- **A cookie-banner marketing category.** Rejected at Propose: device-scoped and not attributable.
- **Re-asking existing account holders.** No prompt or banner nudges current customers to opt in;
  they find the control in their account.
- **FAQ answers that mention Rewards.** `VendorFaq` rows are the vendor's own content (`#1021`,
  owner action) and are not rewritten here.
- **Legal sign-off.** The assistant is not a lawyer. The owner has been asked to have the final
  wording read before switching the feature on for Aheed; the switch ships off, so nothing is live
  until then.
- **Flipping either switch for Aheed.** Both are owner actions after deploy.

## Open items carried forward

- Owner: switch Rewards off for Aheed at `/staff/loyalty`, and marketing consent on at
  `/staff/storefront` after legal review — both after promotion.
- Owner: approve deleting `docs/p1142-merged-handoff` once this branch merges.
- Follow-up issue (filed at Build notes): consent-checked, unsubscribe-carrying marketing sends.
- `#1123` (reference database write path, first failure 2026-11-03) is unaffected and still open.
