# Vendor-neutral browser storage keys, and a referral cookie that waits for consent (build notes)

Build commit `1af4c6b` on `feature/p1080-1065-neutral-storage-keys`, cut from `origin/staging` at
`17b9051`. Spec commit `95a5f5c`, KMS index `22df82f`. The branch is **not pushed** and has no PR yet.

**Owner-queued work after this slice (2026-10-15).** It is recorded here and not in
`docs/model-handoff.md`, because PR #1105 is rewriting the handoff, and editing it on this branch
would conflict:

1. **PR #1105** (`docs/p1101-1034-document` → `staging`, the `#1101`/`#1034` Document pass) is open
   and waiting for the owner to merge it.
2. **Then the `staging → main` promotion** carrying `#1101`/`#1034` (PR #1104), with one closing line
   each. This slice can ride in the same promotion if it has reached `staging` by then.

The owner asked for both to happen **after this slice's implementation**. The handoff, the triage
register (item 6 / `#1080`) and the roadmap row are reconciled at this slice's `/document`, once
#1105 has merged.

## What changed and why

- **`lib/storage-keys.ts` (new).** All four new names, the four legacy names, and
  `CONSENT_CHANGE_EVENT`. Also four helpers the spec did not list by name:
  - `isConsentValue`
  - `browserCookieJar()`, a `document.cookie` reader with the same `get(name)` shape as `next/headers`'
    jar
  - `expireBrowserCookie`
  - `readBrowserConsent()`, which reads the new consent cookie first, then the legacy one, and
    treats anything unrecognised as `null`

  Client-safe: no imports at all. Its module comment names `#1106` as the removal issue (R3).
- **`lib/cart-identity.ts`.** `CART_COOKIE` is now re-exported from `./storage-keys`.
  `getCartIdentity` uses `readCookieWithFallback`. `issueGuestToken` checks the new name first.
  Otherwise it takes the legacy value, or a fresh UUID when there is none, writes it under
  `store_cart`, and deletes the legacy cookie only when one existed. The cookie options moved into a
  `GUEST_TOKEN_COOKIE_OPTIONS` constant above the function, with values unchanged. `clearGuestToken`
  deletes both names.
- **`components/consent/CookieBanner.tsx`.** Mount logic:
  - The new cookie present means the banner stays hidden.
  - Otherwise any legacy cookie is expired, whatever its value.
  - A legacy value of `accepted` or `essential` is rewritten under the new name, and the banner stays
    hidden.
  - Anything else shows the banner.

  `saveConsent` writes the cookie through `writeConsent`, then dispatches `store-consent-change` with
  `{ value }`.
- **`components/rewards/RewardsLauncher.tsx`.** The old effect wrote the referral cookie whenever
  `?ref=` was present. The new one reads `readBrowserConsent()` and calls `apply(consent)`:
  - `essential` expires both referral names.
  - `accepted` with a code writes `store_referral_code` (`path=/`, `max-age=2592000`, `SameSite=Lax`,
    `Secure`).
  - With no answer yet, it attaches a `window` listener for the event, removed on unmount.

  The code is held only in the effect's closure. The spec said "a React ref"; the closure is
  equivalent and simpler.
- **`app/(storefront)/checkout/page.tsx`.** `initialDiscountCode` comes from
  `readCookieWithFallback(cookieStore, REFERRAL_COOKIE, LEGACY_REFERRAL_COOKIE)`.
- **`lib/checkout-details-storage.ts` (new)** and **`CheckoutForm.tsx`**: the two `localStorage`
  calls now go through `readCheckoutDetails(localStorage)` and `writeCheckoutDetails(localStorage,
  ...)`.
- **`app/(storefront)/privacy/page.tsx`.** Items 2, 3, 6 and 7 render `{CART_COOKIE}`,
  `{CONSENT_COOKIE}`, `{REFERRAL_COOKIE}` and `{CHECKOUT_DETAILS_KEY}`. The intro, the referral item
  and the closing paragraph carry R21/R22's exact text. The JSX comment explains the change without
  naming any legacy literal (R4). Items 4 and 5 (`delivery-postcode`, `fulfilment-method`) are still
  literals, as before: they were never renamed and R23 covers only 2, 3, 6 and 7.
- **Tests.**
  - New: `tests/storage-keys.test.ts`, `tests/cart-identity.test.ts`,
    `tests/checkout-details-storage.test.ts`, `tests/cookie-banner-consent.test.tsx` and
    `tests/rewards-launcher-referral.test.tsx`.
  - Updated: `tests/privacy-cookies-section.test.tsx` (new names and text; the R12 test also checks
    the three new constants; the R6 test now asserts no `aheed` at all) and
    `tests/a11y/cookie-banner.test.tsx` (clears both consent names in `beforeEach`).
- **Docs.** `specs/architecture.md` 1.40.0 names `store_cart` in the P3a paragraph.
  `docs/developer-portal/app-conventions.md` 1.11.0 gains a "Browser storage names are
  vendor-neutral too" bullet under "User-facing copy".
- **#1066 (R29).** Comment posted, issuecomment-6191032908. No `Set-Cookie` header on `GET /` on
  production Aheed or SriMart, or on staging Aheed or SriMart. The SriMart staging host is
  `srimart-staging.nocaped.com`, **not** `staging.srimart…`, which doesn't resolve. A real sign-in on
  `srimart-staging` (demo SriMart admin, password from `secrets/staging.vars`) set only
  `__Secure-better-auth.session_token`. Nothing was added to the privacy page.
- **Issues filed this stage:** `#1106` (remove the fallbacks, due 30 days after production) and
  `#1107` (checkout details saved without consent, plus the banner's "optional cookies" copy). Both
  are on Project #2 as P10 / Backlog. `#1080`, `#1065` and `#1066` were moved to **In Progress**.

## Decisions taken during the build

- **Any legacy consent cookie is expired on mount, valid or not.** R11 requires that for valid
  values. Doing it for invalid ones too stops a garbage legacy cookie lingering for a year. R12 only
  requires that the banner renders, which it does.
- **The referral listener is attached only when there is no consent answer on mount.** Once an
  answer exists, nothing can change it without a reload, because there is no "change your choice"
  control (see `#1107`).
- **The referral code is trimmed, and an empty `?ref=` counts as no code**, which matches the old
  `refCode.trim() !== ""` check.
- **Cookie-attribute assertions spy on the `document.cookie` setter.** The spy delegates to the real
  `Document.prototype` descriptor, because jsdom drops attributes on read. jsdom **did** store
  `Secure` cookies at the default `http://` test URL, so no environment-URL override was needed. The
  validation.md caveat about that turned out to be unnecessary.
- **The `#1066` sign-in used SriMart staging, not Aheed staging.** It is the only demo password in
  `secrets/staging.vars`. R29 says "one successful sign-in on staging" without naming a host.

## Deviations from the spec

None. Note that the referral code is held in a closure rather than "a React ref", per `plan.md`'s
wording. The behaviour is identical and no requirement names the mechanism.

## Known-shaky areas

- **R25 (the basket survives the rename) is proved only by unit tests with a mocked jar.** Nothing
  has yet driven a real `addToCart` with only an `aheed_cart` cookie under `npm run preview`. Watch
  for two things:
  - the response's `Set-Cookie` carries both `store_cart=<same T>` and an expiring `aheed_cart`;
  - an `addToCart` path that doesn't go through `issueGuestToken`. `add-bundle-to-cart` and
    `add-list-to-cart` both import it.
- **R26/R27 (browser consent and referral) are unexercised in a real browser.** The jsdom tests
  dispatch the event by hand, or click the banner in isolation. Nobody has watched the real
  `StorefrontChrome` mount the banner and launcher together. In particular, effect ordering
  matters: the launcher reads consent on mount, possibly before the banner's migration effect has
  rewritten the legacy cookie. That is safe, because `readBrowserConsent` itself falls back to the
  legacy name, but it is worth confirming.
- **Full-suite flake seen once.** The first full `npx vitest run` had 4 files and 5 tests failing.
  The second had `tests/storefront-chrome-rewards-gate.test.tsx` (2 tests) failing on 5000 ms
  timeouts. That file passes alone, with and without this change, and the third full run was clean:
  257 files, 3263 tests. It looks like the known load/timeout class (compare `#1037`), but the first
  run's failing file list was not captured. If CI fails there, rerun once before investigating.
- **Consent extension.** A migrated consent cookie gets a fresh year, and a migrated cart token a
  fresh 30 days. Both are deliberate (`plan.md`), but they are the parts a privacy reviewer would
  question.
- **The R4 grep must exclude** `app/(admin)/staff/runbook/docs.ts` (generated KMS content that
  quotes the spec). `validation.md` already does.
