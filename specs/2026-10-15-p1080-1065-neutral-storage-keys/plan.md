---
id: p1080-1065-neutral-storage-keys
title: "Vendor-neutral browser storage keys, and a referral cookie that waits for consent (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-15
visibility: internal
summary: "Renames the four aheed_-prefixed cookies and local-storage keys to vendor-neutral store_ names, with a 30-day compatibility window so no shopper loses a basket or a consent choice, and stops writing the referral cookie until the shopper chooses Accept All."
tags: [privacy, cookies, consent, pecr, multi-tenant, cart, referrals, p10, user-testing]
related: [user-testing-feedback-2026-10-13, app-conventions, architecture, p1101-referral-loyalty-off]
---

# Vendor-neutral browser storage keys, and a referral cookie that waits for consent (plan)

Closes `#1080` and `#1065`. Also discharges `#1066` (the live `Set-Cookie` check) as part of this
slice. Approved at Gate 1 on 2026-10-15, including the owner's decision on `#1065`: the referral
cookie is **optional**, so it is written only after the shopper chooses **Accept All**.

**Goal:** no storefront names another vendor in the browser storage it sets or in the privacy page
that discloses it, and the one storage item that is not strictly necessary waits for consent. No
shopper loses a basket or a cookie choice because of the rename.

## The defects

1. **`#1080`: four platform-wide keys carry one vendor's name.** Every vendor sets them, and since
   `#1064` the privacy page lists each by name, so **SriMart's privacy page tells its shoppers their
   basket is stored under `aheed_cart`.** It is the `#239` defect class (one vendor's identity
   rendering for all), in a legal document.

   | Key | Kind | Written | Read |
   | --- | --- | --- | --- |
   | `aheed_cart` | HttpOnly cookie, 30 days, set on the server | `lib/cart-identity.ts` `issueGuestToken` | `getCartIdentity`, `issueGuestToken`; deleted by `clearGuestToken` |
   | `aheed_cookie_consent` | Browser cookie, 1 year, value `accepted` or `essential` | `components/consent/CookieBanner.tsx` `saveConsent` | the same component, existence only |
   | `aheed_referral_code` | Browser cookie, 30 days, no `Secure` flag | `components/rewards/RewardsLauncher.tsx` on any `?ref=` URL | `app/(storefront)/checkout/page.tsx:48` as the initial discount code |
   | `aheed_checkout_details` | `localStorage` JSON blob | `components/checkout/CheckoutForm.tsx` `handleFormChange` | the same component's mount effect |

2. **`#1065`: the referral cookie is written without consent.** `RewardsLauncher` writes it whenever
   the URL carries `?ref=`. Under PECR the "strictly necessary" exemption covers storage a user
   needs for a service they explicitly asked for. A code set because someone followed a link does
   not meet that test.

3. **Found while specifying: the consent choice is never read.** `CookieBanner` checks only whether
   its cookie *exists*. Nothing anywhere reads whether the value is `accepted` or `essential`, so
   the two buttons do exactly the same thing today. After this slice the referral cookie is the
   first, and only, thing that depends on the answer.

## Why a rename with a window, and not a plain rename

The cookie name *is* the lookup key. Renaming `aheed_cart` alone would empty every guest's basket,
and renaming `aheed_cookie_consent` alone would bring the banner back for everyone. So for one
compatibility window each reader tries the new name first and then the old one, and each writer
moves the value across and deletes the old copy.

**Thirty days is not a guess.** `issueGuestToken` sets the cart cookie with a 30-day `maxAge` and
never refreshes it. It returns early when a token exists. So 30 days after the release reaches
production, no unexpired legacy cart cookie can exist. The referral cookie has the same 30-day life.
The consent cookie lives a year, but the banner mounts on every storefront page and migrates it on
the first visit in the window. A visitor who does not come back within 30 days is shown the banner
once more after the fallback is removed. That is acceptable.

### Per key

- **Cart (server).** `getCartIdentity` reads `store_cart`, then `aheed_cart`. `issueGuestToken`
  returns an existing `store_cart` unchanged. With only `aheed_cart` present, it writes that **same
  token** under `store_cart`, with the existing options (HttpOnly, Secure, SameSite=Lax, path `/`,
  30 days, no `domain`), deletes `aheed_cart`, and returns the token. So the guest's `Cart` row is
  untouched and the basket survives. `clearGuestToken` deletes both. The migration happens on the
  next cart mutation, because Next allows setting a cookie only in a server action or route handler,
  never during a server-component render. Until then the read fallback carries the shopper. Moving
  the token to a fresh 30-day life extends a guest cart by at most 30 days. The reaper
  (`lib/repositories/cart.ts`, whose window equals this `maxAge`) still reaps it 30 days after the
  last write.
- **Consent (browser).** On mount, the banner treats `store_cookie_consent` as the answer. With only
  `aheed_cookie_consent` present and a value of exactly `accepted` or `essential`, it writes that
  value under `store_cookie_consent` (1 year, path `/`, SameSite=Lax, Secure), expires the legacy
  cookie, and stays hidden. A legacy value that is anything else counts as no answer, so the banner
  shows. **The new cookie gets a full year from the migration**, because a page script cannot read a
  cookie's remaining life. This extends an existing choice by at most a year. That is deliberate,
  and the alternative is unknowable.
- **Referral (browser, `#1065`).** `RewardsLauncher` keeps a `?ref=` code **in memory** (a React ref,
  not any storage) and writes `store_referral_code` only when consent is `accepted`. It writes at
  once if the shopper has already accepted, or later when the banner reports acceptance. The banner
  dispatches a `window` event carrying the choice, and the launcher listens for it. The launcher
  sits in the storefront layout, so a held code survives client-side navigation but not a full
  reload. A shopper who declines, or never answers, can still type the code at checkout. When the
  choice is `essential`, the launcher drops the held code and deletes any existing
  `store_referral_code` or `aheed_referral_code`, so declining also clears a code written before
  gating existed. The cookie now carries `Secure`. The checkout page reads `store_referral_code`,
  then `aheed_referral_code`.
- **Checkout details (browser `localStorage`).** Read `store_checkout_details`, then
  `aheed_checkout_details`. When the legacy key is the one found, copy it across and remove it.
  Every write goes to the new key and removes the legacy one.

### Where the names live

A new client-safe module, `lib/storage-keys.ts`, exports all four new names, the four legacy names,
and one helper that reads a cookie jar under a name with a legacy fallback. "Client-safe" means no
`next/headers` and no server-only import, because `CookieBanner`, `RewardsLauncher` and
`CheckoutForm` import it too. `lib/cart-identity.ts` keeps exporting `CART_COOKIE` (tests import it)
with its value taken from the new module. **The legacy names appear as string literals only in
`lib/storage-keys.ts`**, which makes removing the fallback a single-file job. That module's comment
names the follow-up issue that removes the fallbacks, so the window cannot be forgotten.

### The privacy page

`app/(storefront)/privacy/page.tsx` renders each name from the exported constant, so a future rename
cannot drift from the page again. It lists **only the new names**. Naming the legacy keys, even as
"older versions used…", would put `aheed` back on SriMart's page, which is the defect being fixed.
The referral entry and the section's intro and closing paragraphs change wording, because the
referral cookie is no longer essential. The exact text is in `requirements.md`.

### `#1066`, folded in

`#1066` asks whether Cloudflare sets cookies in front of the Worker that the privacy page omits. That
is the same list this slice rewrites, so it is checked here. Build reads the `Set-Cookie` headers of
`GET /` and a sign-in on staging and production. A cookie found there that is not on the page is
added to the page in this slice. The result, including "none found", is recorded on `#1066`.

## Scope (this slice)

- `lib/storage-keys.ts` (new): the names and the jar helper.
- `lib/cart-identity.ts`: the fallback read, migrate-on-issue, and delete-both on clear.
- `components/consent/CookieBanner.tsx`: the new name, legacy migration, and the consent event.
- `components/rewards/RewardsLauncher.tsx`: consent-gated, `Secure` referral cookie.
- `app/(storefront)/checkout/page.tsx`: referral read with fallback.
- `components/checkout/CheckoutForm.tsx`: details read and write through a small helper module,
  `lib/checkout-details-storage.ts` (new), which makes the migration unit-testable without rendering
  the whole form.
- `app/(storefront)/privacy/page.tsx`: constant-driven names and the revised referral wording.
- Tests: `tests/privacy-cookies-section.test.tsx` and `tests/a11y/cookie-banner.test.tsx` are
  updated, and new unit tests cover each migration path.
- Persistent docs: `specs/architecture.md` (the cart cookie's name in the P3a paragraph), and
  `docs/developer-portal/app-conventions.md`, which gains the standing rule below.

**Standing rule this slice adds** (to `app-conventions.md`, under "User-facing copy"): browser
storage names are vendor-neutral and are defined once in `lib/storage-keys.ts`. A storage item that
is not strictly necessary is written only after the shopper chooses Accept All, and the privacy page
names it as optional.

## Deliberately excluded

- **Per-vendor prefixes** (`<slug>_cart`, `#1080`'s option 3). These cookies are already host-only
  per vendor, so a prefix adds no isolation. It would also make the privacy list dynamic and reopen
  ADR-004 slice 3c's host-only decision.
- **Removing the legacy fallbacks.** That is the follow-up issue, filed during Build and due 30 days
  after this slice reaches production.
- **Whether `store_checkout_details` is itself strictly necessary.** Remembering typed details for
  the next visit is a convenience, so the same PECR question as `#1065` applies to it. It is
  out of the approved scope, and gating it changes checkout behaviour for every shopper. **File it as
  its own issue during Build** and leave the item listed as before.
- **The banner's copy.** "Optional cookies help us improve site experience" describes analytics that
  do not exist. Rewording it is copy work outside the approved scope. File it alongside the item
  above if Build agrees it is wrong.
- **A "change your cookie choice" control.** Once the banner is answered there is no way to reopen
  it. That is a real PECR expectation, but it is a new feature, not part of either issue.
- **`delivery-postcode` and `fulfilment-method`** are already vendor-neutral, so they are untouched.
- **Historical documents** (roadmap, handoff, earlier slice specs, the local-dev playbook's
  dated `#748` note) keep the old names as history.

## Open items carried forward

- The fallback-removal issue (filed at Build) is the only owed follow-up. Its due date is 30 days
  after the production promotion that carries this slice.
- `#1065`'s legal reading is the owner's ("gate it", 2026-10-15). It has not been reviewed by a
  lawyer, and nothing here claims it has.
