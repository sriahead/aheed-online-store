# Vendor-neutral browser storage keys, and a referral cookie that waits for consent (requirements / acceptance criteria)

Closes `#1080` and `#1065`, and discharges `#1066`. The four `aheed_`-prefixed browser storage keys
become `store_cart`, `store_cookie_consent`, `store_referral_code` and `store_checkout_details`. For
a 30-day compatibility window, each reader falls back to the legacy name and each writer moves the
value across, so no basket or consent choice is lost. The referral cookie is written only once the
shopper's consent is `accepted`. No schema change, no migration, no new dependency. The reasoning is
in `plan.md`.

Terms used below: **legacy name** means one of `aheed_cart`, `aheed_cookie_consent`,
`aheed_referral_code`, `aheed_checkout_details`. **New name** means its `store_` counterpart.
**Source directories** means `app/`, `components/`, `lib/` and `features/`, **excluding** the
generated file `app/(admin)/staff/runbook/docs.ts`.

## Names (`lib/storage-keys.ts`)

R1. `lib/storage-keys.ts` exists and exports `CART_COOKIE = "store_cart"`,
    `CONSENT_COOKIE = "store_cookie_consent"`, `REFERRAL_COOKIE = "store_referral_code"`,
    `CHECKOUT_DETAILS_KEY = "store_checkout_details"`, `LEGACY_CART_COOKIE = "aheed_cart"`,
    `LEGACY_CONSENT_COOKIE = "aheed_cookie_consent"`, `LEGACY_REFERRAL_COOKIE =
    "aheed_referral_code"`, `LEGACY_CHECKOUT_DETAILS_KEY = "aheed_checkout_details"` and
    `CONSENT_CHANGE_EVENT = "store-consent-change"`. It imports nothing from `next/headers`,
    `server-only` or any module that does.

R2. `lib/storage-keys.ts` exports `readCookieWithFallback(jar, name, legacyName)`, where `jar` is
    any object with a `get(name)` method returning `{ value: string } | undefined`. It returns the
    value under `name` when present. Otherwise it returns the value under `legacyName`, or `null`
    when neither is present. Unit-tested for all three cases plus "both present: the new name
    wins".

R3. `lib/storage-keys.ts`'s module comment states that the legacy names are a compatibility window
    and names, by `#` number, the GitHub issue that removes them. That issue exists, is open, and
    states a due date of 30 days after the production promotion that carries this slice.

R4. In the source directories, the strings `aheed_cart`, `aheed_cookie_consent`,
    `aheed_referral_code` and `aheed_checkout_details` occur only in `lib/storage-keys.ts`.

## Cart cookie (`lib/cart-identity.ts`)

R5. `lib/cart-identity.ts` exports `CART_COOKIE` with the value `"store_cart"`, taken from
    `lib/storage-keys.ts`.

R6. `getCartIdentity` returns `guestToken` equal to the `store_cart` value when present. With only
    `aheed_cart` present it returns the `aheed_cart` value. With neither it returns `null`.
    Unit-tested with a mocked `next/headers` cookie jar.

R7. With only `aheed_cart` present (value `T`), `issueGuestToken` returns `T`, sets `store_cart` to
    `T` with `httpOnly: true`, `secure: true`, `sameSite: "lax"`, `path: "/"`,
    `maxAge: 2592000` and no `domain`, and deletes `aheed_cart`. Unit-tested.

R8. With `store_cart` present, `issueGuestToken` returns its value and sets or deletes nothing.
    With neither present, it sets only `store_cart`, to a new random token with R7's options.
    Unit-tested.

R9. `clearGuestToken` deletes both `store_cart` and `aheed_cart`. Unit-tested.

## Consent cookie (`components/consent/CookieBanner.tsx`)

R10. Clicking **Essential Only** or **Accept All** writes `store_cookie_consent` with the value
     `essential` or `accepted`, `max-age=31536000`, `path=/`, `SameSite=Lax` and `Secure`, hides the
     banner, and dispatches a `window` `CustomEvent` named `store-consent-change` whose
     `detail.value` is that same value. Unit-tested (jsdom).

R11. On mount with only `aheed_cookie_consent=accepted` (and again with `=essential`), the banner
     does not render. Afterwards `document.cookie` contains `store_cookie_consent` with the same
     value and does not contain `aheed_cookie_consent`. Unit-tested (jsdom).

R12. On mount with only `aheed_cookie_consent` set to any other value (for example `yes`), or with
     no consent cookie, the banner renders. Unit-tested (jsdom).

R13. On mount with `store_cookie_consent` present, the banner does not render. Unit-tested (jsdom).

## Referral cookie (`components/rewards/RewardsLauncher.tsx`, `#1065`)

R14. Mounted on a URL carrying `?ref=CODE` with no consent cookie, the launcher writes no
     `store_referral_code` and no `aheed_referral_code` cookie, and writes the code to no
     `localStorage` or `sessionStorage` key. Unit-tested (jsdom).

R15. In R14's state, after a `store-consent-change` event with `detail.value === "accepted"`, the
     launcher writes `store_referral_code=CODE` with `path=/`, `max-age=2592000`, `SameSite=Lax` and
     `Secure`. Unit-tested (jsdom).

R16. Mounted on `?ref=CODE` with `store_cookie_consent=accepted` already present, the launcher writes
     R15's cookie on mount. The same holds with only `aheed_cookie_consent=accepted` present.
     Unit-tested (jsdom).

R17. When consent is `essential`, whether present on mount or arriving as a `store-consent-change`
     event, the launcher writes no referral cookie and expires any existing `store_referral_code`
     and `aheed_referral_code`, so afterwards `document.cookie` contains neither. Unit-tested
     (jsdom).

R18. `app/(storefront)/checkout/page.tsx` passes the referral cookie into the form as the initial
     discount code through `readCookieWithFallback(cookieStore, REFERRAL_COOKIE,
     LEGACY_REFERRAL_COOKIE)`. Checked by reading the file.

## Checkout details (`lib/checkout-details-storage.ts`, `CheckoutForm.tsx`)

R19. `lib/checkout-details-storage.ts` exists and exports `readCheckoutDetails(storage)` and
     `writeCheckoutDetails(storage, json)`, where `storage` is a `Storage`.
     `readCheckoutDetails` returns the `store_checkout_details` string when present. With only the
     legacy key present, it returns that string, sets `store_checkout_details` to it, and removes
     the legacy key. With neither present it returns `null`. `writeCheckoutDetails` sets
     `store_checkout_details` and removes the legacy key. Unit-tested for each case.

R20. `components/checkout/CheckoutForm.tsx` reads and writes checkout details only through R19's
     two functions, passing `localStorage`. It contains no direct `localStorage.getItem` or
     `localStorage.setItem` call for checkout details. Checked by reading the file.

## Privacy page (`app/(storefront)/privacy/page.tsx`)

R21. Section 4's seven list items are, in order and as rendered text (whitespace collapsed):
     1. `Keeps you signed in. Shown in your browser as __Secure-better-auth.session_token.`
     2. `Keeps the items in your basket. Shown in your browser as store_cart.`
     3. `Remembers your cookie choices. Shown in your browser as store_cookie_consent.`
     4. `Remembers the postcode you entered, so we can show delivery availability and fees. Shown in your browser as delivery-postcode.`
     5. `Remembers whether you chose delivery or collection. Shown in your browser as fulfilment-method.`
     6. `Remembers a referral code from a link you followed, so it can be applied at checkout. Optional: set only if you arrive through a referral link and choose Accept All. Shown in your browser as store_referral_code.`
     7. `Keeps the contact and delivery details you type at checkout, so they are filled in next time. Stored on your device, not on our servers. Shown in your browser as store_checkout_details.`

     If R29 finds an infrastructure cookie the page omits, it is appended as item 8 or later, with
     a purpose-led entry in the same shape. No other change to the seven items is allowed.

R22. Section 4's three paragraphs are, in order: (1) `We use cookies and local storage technologies
     to support essential website functionality, including user authentication, shopping cart
     management, delivery and collection preferences, checkout convenience, and the storage of
     cookie consent preferences. One optional cookie remembers a referral code, and it is set only if
     you choose Accept All.` (2) `The following cookies and local storage items are used for these
     purposes:` (unchanged) (3) `These cookies and local storage items are scoped to the relevant
     host. All of them except the referral cookie are used to provide core website functionality.`

R23. The names in items 2, 3, 6 and 7 are rendered from `lib/storage-keys.ts`'s constants, not
     string literals in the page. Section 4's text contains no occurrence of `aheed`, in any case.
     The `#1089` rule still holds: no `<code>` element in the section.

R24. `tests/privacy-cookies-section.test.tsx` asserts R21–R23. Its R6 test asserts section 4 has no
     `aheed` substring at all; the current exemption for `aheed_`-prefixed names is removed.

## End to end, under `npm run preview`

R25. **The basket survives the rename.** On the Aheed host, a guest adds a product. In the browser
     the `store_cart` cookie is replaced by `aheed_cart` with the **same value**. `/cart` still lists
     that product. After the guest adds a second product, the browser holds `store_cart` with the
     **original value** and no `aheed_cart`, and `/cart` lists both products.

R26. **The consent choice survives the rename.** In a browser holding only
     `aheed_cookie_consent=accepted`, loading `/` shows no consent banner. Afterwards the browser
     holds `store_cookie_consent=accepted` and no `aheed_cookie_consent`.

R27. **The referral cookie waits for Accept All.** In a fresh browser profile on the Aheed host,
     `/?ref=TESTREF1` sets no referral cookie. Clicking **Accept All** sets
     `store_referral_code=TESTREF1`, and with a basket, `/checkout`'s discount-code input holds
     `TESTREF1`. In a second fresh profile, `/?ref=TESTREF1` followed by **Essential Only** sets no
     referral cookie, even after a reload.

R28. **SriMart names no other vendor.** On the SriMart host, `/privacy` section 4 contains no
     `aheed` substring, in any case, and a guest add-to-cart sets `store_cart`, not `aheed_cart`.

## Live cookie check (`#1066`)

R29. Build records on GitHub issue `#1066`, in a comment, the cookie names from every `Set-Cookie`
     header of (a) `GET /` on `https://aheedfoodcentre.nocaped.com`,
     `https://srimart.nocaped.com` and `https://staging.aheedfoodcentre.nocaped.com`, and (b) one
     successful `POST /api/auth/sign-in/email` on staging, from no prior cookies. Every name recorded
     appears in section 4's list (R21), or is one of the legacy names. The comment states whether
     the session cookie was named `__Secure-better-auth.session_token`.

## Documentation, changelog and gates

R30. `specs/architecture.md`'s P3a cart paragraph names the guest cookie `store_cart`.
     `docs/developer-portal/app-conventions.md` states, under "User-facing copy", that browser
     storage names are vendor-neutral and defined once in `lib/storage-keys.ts`, and that a storage
     item that is not strictly necessary is written only after Accept All. Its `version` is bumped.

R31. `CHANGELOG.md` updated (Gate 4).

R32. `npm run lint`, `npm run typecheck`, `npx vitest run` (run alone) and `npm run format:check`
     all exit 0 after this slice.
