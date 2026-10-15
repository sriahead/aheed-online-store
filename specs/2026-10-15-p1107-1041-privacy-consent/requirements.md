# Privacy and consent honesty — banner copy, cookie settings, hashed-IP disclosure (requirements / acceptance criteria)

Closes `#1107` (banner copy and a way to change a consent choice; saved checkout details stay
essential by owner ruling) and `#1041` (disclose the search log), widened by owner ruling to every
record that stores a hashed IP. Builds on `#1065`/`#1080`
(`specs/2026-10-15-p1080-1065-neutral-storage-keys/`). `plan.md` carries the measurements and the
rulings; read it for the "why".

Wherever a requirement quotes copy, it is the **exact visible text**, compared after collapsing
every run of whitespace to one space. Text in `{braces}` is a value rendered from the named
constant, shown with its current value.

## Retention: one source

R1. `lib/data-retention.ts` exists, has no `import` statements, and exports exactly these numeric
    constants with these values: `SEARCH_QUERY_LOG_RETENTION_DAYS = 90`,
    `ASSISTANT_CONVERSATION_RETENTION_DAYS = 90`, `ATTEMPT_RECORD_RETENTION_HOURS = 1`.
R2. Each of the seven files `lib/repositories/search-query-log.ts`,
    `lib/repositories/assistant-conversations.ts`, `lib/repositories/auth-rate-limit.ts`,
    `lib/repositories/order-lookup-rate-limit.ts`, `lib/repositories/discount-code-throttle.ts`,
    `lib/repositories/customer-feedback-rate-limit.ts` and
    `lib/repositories/list-normalisation-rate-limit.ts` imports its retention constant from
    `lib/data-retention.ts`, and its `RETENTION_MS` initialiser contains no numeric literal other
    than the unit conversions `1000`, `60` and `24`, multiplied by that imported constant.
R3. A test asserts, for each of the five attempt tables, that its rate-limit window in milliseconds
    is strictly less than `ATTEMPT_RECORD_RETENTION_HOURS × 3,600,000`. Each window is read from an
    exported constant of its repository (exporting a window that is not yet exported is allowed;
    no window value changes).

## Banner copy

R4. `CookieBanner`'s body text, between its "We value your privacy" heading and its buttons, reads
    exactly: "We use essential cookies and browser storage to keep you signed in, hold your basket,
    and remember your delivery choice and checkout details. One optional cookie remembers a
    referral code from a link you followed, and it is set only if you choose Accept All. Read our
    Privacy Policy and Terms of Service." The "Privacy Policy" and "Terms of Service" links keep
    their `/privacy` and `/terms` hrefs.

## Cookie settings

R5. `lib/storage-keys.ts` exports `CONSENT_SETTINGS_OPEN_EVENT` with the value
    `"store-consent-open"`.
R6. `components/consent/CookieSettingsButton.tsx` is a client component that renders one
    `<button type="button">` whose accessible name is exactly "Cookie settings"; clicking it
    dispatches `CONSENT_SETTINGS_OPEN_EVENT` on `window`.
R7. With a valid choice stored in `store_cookie_consent`, `CookieBanner` renders nothing until
    `CONSENT_SETTINGS_OPEN_EVENT` is dispatched, and then renders, including the line
    "Your current choice: Essential Only." when the stored value is `essential` and
    "Your current choice: Accept All." when it is `accepted`.
R8. On a first visit (no stored choice), the banner renders with no "Your current choice" line.
R9. When the banner opens in response to `CONSENT_SETTINGS_OPEN_EVENT`, focus moves to its
    "Essential Only" button. On a first visit the banner does not move focus.
R10. After a reopen, either button overwrites `store_cookie_consent` with the new value, hides the
    banner, and dispatches `store-consent-change` with `{ value }`, exactly as a first-visit choice
    does.
R11. Choosing "Essential Only" (first visit or reopen) writes an expiring cookie (`max-age=0;
    path=/`) for both `store_referral_code` and its legacy name, from `CookieBanner` itself — the
    test renders `CookieBanner` without `RewardsLauncher`. Choosing "Accept All" writes no referral
    cookie from `CookieBanner`.
R12. `components/layout/StorefrontFooter.tsx`'s `nav[aria-label="Legal"]` contains, in order, the
    "Terms" link, the "Privacy" link, the "Cookies" link and the "Cookie settings" button, separated
    by the existing `·` separators.
R13. Under `npm run preview`, at a 360px-wide viewport on both the Aheed and the SriMart local host,
    the home page has `document.documentElement.scrollWidth <= 360`, and every child of the Legal
    nav has a bounding box fully inside the viewport.
R14. `/privacy`'s `#cookies` section ends with a paragraph reading exactly "You can change your
    choice at any time." followed by the "Cookie settings" button.

## Owner ruling 1 holds

R15. `components/checkout/CheckoutForm.tsx` and `lib/checkout-details-storage.ts` are unchanged on
    this branch (`git diff origin/staging -- <both files>` is empty), and `/privacy#cookies` still
    lists `{CHECKOUT_DETAILS_KEY}` and still contains the sentence "All of them except the referral
    cookie are used to provide core website functionality."

## `/privacy` section 5 ("How Long We Keep Your Data")

R16. Section 5 contains a paragraph reading exactly: "Searches. When you search the shop, we record
    what you searched for and how many results it found, together with a scrambled (hashed) form of
    your network address, so the shop can see what shoppers look for and cannot find. This record is
    not linked to your name or your account. It becomes due for deletion after
    {SEARCH_QUERY_LOG_RETENTION_DAYS = 90} days and is removed by routine clean-up after that."
    "Searches." is bold.
R17. Section 5 contains a paragraph reading exactly: "Records that protect the shop from abuse. When
    you sign in, create an account or reset a password, look up an order, enter a discount code we
    do not recognise, send feedback, or paste a shopping list for the shop to match, we briefly
    record that it happened, together with a scrambled (hashed) form of your network address, so
    that repeated attempts can be slowed down. These records are not linked to your name or your
    account. Each becomes due for deletion after {one hour} and is removed by routine clean-up after
    that." "Records that protect the shop from abuse." is bold. `{one hour}` is rendered from
    `ATTEMPT_RECORD_RETENTION_HOURS`: "one hour" when it is 1, otherwise "{n} hours".
R18. The help-assistant paragraph ("The help assistant.") ends exactly: "This record is not linked
    to your name or your account. It becomes due for deletion after
    {ASSISTANT_CONVERSATION_RETENTION_DAYS = 90} days and is removed by routine clean-up after
    that." Its earlier sentences are unchanged.
R19. The feedback paragraph ("Feedback you leave about the shop.") ends, after its existing
    sentences, with exactly: "We also keep a scrambled (hashed) form of your network address with
    your feedback, used only to investigate abuse, and it is removed with your feedback."
R20. A test that mocks `lib/data-retention.ts` with different values (for example 30, 45 and 2)
    sees section 5 render those values ("30 days", "45 days", "2 hours") in R16, R18 and R17.

## Neutrality, accessibility, docs

R21. `tests/vendor-neutral-copy.test.ts` passes with no change to its forbidden-word list or its
    file globs.
R22. `tests/a11y/cookie-banner.test.tsx` gains a case that reopens the banner with a stored choice
    and asserts zero axe violations; all its cases pass.
R23. `docs/developer-portal/app-conventions.md` states, in one bullet or paragraph, that a record
    storing a hashed IP takes its retention from `lib/data-retention.ts` and must be disclosed on
    `/privacy`, citing `#1041`.
R24. Under `npm run preview` on the Aheed local host, in a real browser: open `/?ref=TESTREF`, choose
    Accept All (`store_referral_code=TESTREF` now present), click the footer's "Cookie settings",
    see "Your current choice: Accept All.", choose Essential Only. Afterwards
    `store_cookie_consent=essential` and no `store_referral_code` cookie exists.

## Gates

R25. `CHANGELOG.md` updated on this branch (Gate 4).
R26. `npm run lint`, `npm run typecheck`, `npx vitest run` (run alone) and `npm run format:check`
    all exit 0 after this slice.
