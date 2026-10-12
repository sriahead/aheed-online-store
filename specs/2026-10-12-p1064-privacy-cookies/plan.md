---
id: p1064-privacy-cookies
title: "Privacy page — accurate Cookies and Local Storage section (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-12
visibility: internal
summary: "Rewrites section 4 of the privacy page in the owner's wording, listing every cookie and local-storage item the storefront actually sets under its real name, instead of one sentence naming one cookie that does not exist."
tags: [privacy, cookies, compliance, storefront]
related: [p1055-storefront-footer]
---

# Plan — #1064 privacy page: Cookies and Local Storage

**Goal:** a shopper who reads `/privacy#cookies` sees every cookie and browser-storage item this
store sets, under the name their browser shows, with a plain-language purpose for each. The
footer's "Cookies" link (#1055) already lands here; today it lands on one sentence.

**Why this slice exists.** The owner supplied fuller wording for section 4. Checking it against the
code found that the existing sentence and the supplied wording both use names that are not what
browsers hold, and both leave out items the storefront sets. A privacy page that misnames cookies
is worse than a short one, so the owner chose "their wording, real names, nothing missing"
(option 3 of the proposal on #1064).

## What the code actually sets (evidence the list is built from)

| Item | Kind | Set by | Lifetime |
|---|---|---|---|
| `__Secure-better-auth.session_token` | cookie | Better Auth 1.6.26 (`lib/auth.ts` does not set `cookiePrefix` or `useSecureCookies`; the name and the `__Secure-` prefix over HTTPS come from `node_modules/better-auth/dist/cookies/index.mjs`) | Better Auth default, 7 days |
| `aheed_cart` | cookie | `lib/cart-identity.ts` (`CART_COOKIE`) | 30 days, HttpOnly, host-only |
| `aheed_cookie_consent` | cookie | `components/consent/CookieBanner.tsx` | 1 year |
| `delivery-postcode` | cookie | `features/storefront/delivery.ts` (`DELIVERY_POSTCODE_COOKIE`, `lib/delivery-cookie.ts`) | 30 days, HttpOnly |
| `fulfilment-method` | cookie | `features/storefront/delivery.ts` (`FULFILMENT_METHOD_COOKIE`, `lib/fulfilment-cookie.ts`) | 30 days, HttpOnly |
| `aheed_referral_code` | cookie | `components/rewards/RewardsLauncher.tsx`, only when the URL carries `?ref=` | 30 days |
| `aheed_checkout_details` | localStorage | `components/checkout/CheckoutForm.tsx`, saved as the form is edited | until cleared |

The current page text names `aheed_session`. That string appears nowhere in code; it is wrong.

**Scope (this slice):**

- Replace the body of the `<section id="cookies">` in `app/(storefront)/privacy/page.tsx` with the
  owner's wording (intro, lead-in, list, closing line), extended so the intro, lead-in and closing
  line also cover the added items. `requirements.md` fixes the exact text so there is nothing left
  to interpret.
- One new test, `tests/privacy-cookies-section.test.tsx`, pinning the text, the order, and the
  three names that already exist as exported constants (so a renamed cookie fails a test instead of
  silently making the page wrong again).
- `CHANGELOG.md` entry (Gate 4).

**Deliberately excluded:**

- **`admin-tier`.** A cookie set by `components/layout/ViewSwitcher.tsx` for signed-in staff and
  admins to remember which panel view they last used. It is not set for shoppers, and this is the
  shopper-facing policy. Recorded here so the omission is a decision, not an oversight; reverse it
  by adding one list item and one test line if the owner wants staff cookies disclosed too.
- **Cookie lifetimes in the copy.** The owner's wording has none and did not ask for them.
- **The cookie banner's copy** (`components/consent/CookieBanner.tsx`). Its sentence ("essential
  cookies to manage your cart, authentication, and store preferences") stays true.
- **Any change to what is set, or when.** No code under `lib/`, `features/` or `components/`
  changes.
- **Other privacy-page sections.**

**Open items carried forward** (none block this slice; each is for the owner):

1. **The referral cookie is set without consulting the consent choice.** `RewardsLauncher.tsx`
   writes `aheed_referral_code` whenever `?ref=` is present, whether the shopper picked "Essential
   Only" or not. This slice describes it honestly ("only set when you arrive through a referral
   link") rather than as "essential", and does not change the behaviour. Whether it should be
   gated on consent is a PECR question for the owner; it needs its own issue if wanted.
2. **Infrastructure cookies are unobserved.** Cloudflare can set its own cookies (for example for
   bot management) in front of the Worker. None appear under `npm run preview`, and staging and
   production were not inspected for this slice. Check a live response's `Set-Cookie` headers
   before the promotion to `main` and file a follow-up if any exist.
3. **`__Secure-` on the session cookie is confirmed by reading Better Auth's source and by
   `localhost` behaviour, not yet by a live HTTPS sign-in.** `validation.md` records the HTTP
   observation; the HTTPS one is a post-deploy check on staging (see the last row).
