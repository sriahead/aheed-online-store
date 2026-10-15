# Vendor-neutral browser storage keys, and a referral cookie that waits for consent (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Unit tests cover every migration path: cart, consent, referral and checkout details, plus the jar
helper. The end-to-end rows (R25–R28) prove the same paths against the real Worker runtime, under
`npm run preview`, because the cart touches the database and `npm run dev` cannot load the WASM
engine. R29 is a live read of staging and production. Security-relevant: the referral cookie's
consent gate (R14–R17, R27).

## Before you start

- **Hosts under `npm run preview`.** Use `http://localhost:8787` for Aheed and
  `http://srimart.localhost:8787` for SriMart. Chrome treats `localhost` and its subdomains as secure
  contexts, so `Secure` cookies work there over HTTP.
- **Driving `addToCart` with `curl`.** Follow the recipe in
  `docs/developer-portal/local-dev-playbook.md`: search it for `Next-Action`. Take the action id
  for `features/cart/add-to-cart.ts` / `addToCart` from `.next/server/server-reference-manifest.json`,
  then `POST` the body `["<productId>", 1]`. Take product ids from the storefront HTML of `/` or
  `/search?q=a`.
- **Reading cookies.** In a browser, use DevTools → Application → Cookies, which also shows HttpOnly
  cookies that `document.cookie` cannot. With `curl`, read the `Set-Cookie` response headers (`-D -`)
  rather than trusting a cookie jar. The playbook records that a jar silently drops `Secure`
  cookies for `srimart.localhost`.
- **jsdom and `Secure` cookies.** If a jsdom test cannot see a cookie written with `Secure`, the test
  environment URL is probably `http://`. Set it to `https://localhost/` for that file. Do not drop
  `Secure` from the code.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | Read `lib/storage-keys.ts`: all nine exports have exactly R1's values. `grep -nE "next/headers\|server-only" lib/storage-keys.ts` prints nothing. Then for each relative or `@/` import in that file, grep the imported file for the same two strings. Both must print nothing. |
| R2  | Unit | `npx vitest run tests/storage-keys.test.ts` passes. Read it for four cases: new only, legacy only, neither (`null`), and both present (the new value returned). |
| R3  | Unit | Read the module comment in `lib/storage-keys.ts` and note the `#NN` it names. `gh issue view NN --json state,body` (prefix `GH_TOKEN=$(gh auth token -u sriahead)`) shows `OPEN`, and the body states removal 30 days after the production promotion carrying `#1080`. |
| R4  | Unit | `grep -rnE "aheed_(cart\|cookie_consent\|referral_code\|checkout_details)" app components lib features \| grep -v "app/(admin)/staff/runbook/docs.ts"`. Every line printed is in `lib/storage-keys.ts`. |
| R5  | Unit | `grep -n "CART_COOKIE" lib/cart-identity.ts` shows it exported, and imported or re-exported from `./storage-keys` (or `@/lib/storage-keys`). There is no `"store_cart"` literal in `lib/cart-identity.ts`. |
| R6  | Unit | `npx vitest run tests/cart-identity.test.ts` passes. Read it for the three `getCartIdentity` cases R6 lists, each asserting `guestToken`. |
| R7  | Unit | Same file: the legacy-only `issueGuestToken` case asserts the returned value is `T`, the jar's `set` was called once with `("store_cart", "T", {...})` whose options equal R7's exactly (including no `domain` key), and `delete` was called with `"aheed_cart"`. |
| R8  | Unit | Same file: the new-name-present case asserts `set` and `delete` were not called. The neither case asserts one `set` with name `"store_cart"` and R7's options, and no `delete`. |
| R9  | Unit | Same file: the `clearGuestToken` case asserts `delete` was called with both `"store_cart"` and `"aheed_cart"`. |
| R10 | Unit | `npx vitest run tests/a11y/cookie-banner.test.tsx tests/cookie-banner-consent.test.tsx` passes. Read the consent test: for each button it asserts the written cookie string (name, value, `max-age=31536000`, `path=/`, `SameSite=Lax`, `Secure`), that the banner is gone, and that a `store-consent-change` listener received `detail.value` equal to the value. Spying on the `document.cookie` setter is acceptable for the attribute assertions. |
| R11 | Unit | Same consent test: two cases (`accepted`, `essential`) set only the legacy cookie before render. Each asserts no banner, `document.cookie` contains `store_cookie_consent=<value>`, and contains no `aheed_cookie_consent`. |
| R12 | Unit | Same consent test: the legacy `=yes` case and the no-cookie case each assert the banner renders (`getByRole("complementary", { name: "Cookie Consent Banner" })`). |
| R13 | Unit | Same consent test: with `store_cookie_consent=accepted` set before render, the banner does not render. |
| R14 | Unit | `npx vitest run tests/rewards-launcher-referral.test.tsx` passes. Read it: with the URL set to `/?ref=CODE` (for example via `window.history.replaceState`) and no consent cookie, after render `document.cookie` contains neither referral name, and `localStorage` and `sessionStorage` both have `length === 0`. |
| R15 | Unit | Same file: R14's state, then `window.dispatchEvent(new CustomEvent("store-consent-change", { detail: { value: "accepted" } }))` inside `act`. It asserts `store_referral_code=CODE`, and the written string carries `path=/`, `max-age=2592000`, `SameSite=Lax` and `Secure`. |
| R16 | Unit | Same file: two cases, `store_cookie_consent=accepted` and only `aheed_cookie_consent=accepted`, set before render. Each asserts `store_referral_code=CODE` right after mount. |
| R17 | Unit | Same file: (a) `store_cookie_consent=essential` plus pre-set `store_referral_code=OLD` and `aheed_referral_code=OLD`, rendered on `?ref=CODE`. Afterwards `document.cookie` contains neither referral name. (b) No consent on mount, then an `essential` event. Afterwards `document.cookie` contains neither referral name. |
| R18 | Unit | `grep -n "readCookieWithFallback" "app/(storefront)/checkout/page.tsx"` shows the call with `REFERRAL_COOKIE` and `LEGACY_REFERRAL_COOKIE`, and its result feeds `initialDiscountCode`. |
| R19 | Unit | `npx vitest run tests/checkout-details-storage.test.ts` passes. Read it for: new only (returned, legacy untouched); legacy only (returned, new key now holds it, legacy key gone); neither (`null`); and `writeCheckoutDetails` (new key set, legacy key gone). |
| R20 | Unit | `grep -n "localStorage" components/checkout/CheckoutForm.tsx`: every match is an argument to `readCheckoutDetails` or `writeCheckoutDetails`. No `localStorage.getItem` or `localStorage.setItem` remains for checkout details. |
| R21 | Unit | `npx vitest run tests/privacy-cookies-section.test.tsx` passes. Read its expected-items table: it holds R21's seven entries, word for word, in order. |
| R22 | Unit | Same file: the paragraphs assertion holds R22's three strings, word for word. |
| R23 | Unit | `grep -nE "store_\|aheed_" "app/(storefront)/privacy/page.tsx"` prints no string literal containing a storage name. Matches in a comment are acceptable only if they contain no `aheed`. The test asserts zero `<code>` elements in `#cookies`. |
| R24 | Unit | Read the R6 test in `tests/privacy-cookies-section.test.tsx`: it asserts `not.toMatch(/aheed/i)` on the whole section text, with no `.replace(...)` exemption. |
| R25 | E2E | `npm run preview`. (1) `curl -s -D - -o /dev/null -X POST http://localhost:8787/ -H "Next-Action: <addToCart id>" -H "Content-Type: text/plain;charset=UTF-8" --data-raw '["<productA>", 1]'`. The headers show `Set-Cookie: store_cart=<T>`; record `T`. (2) `curl -s -H "Cookie: aheed_cart=<T>" http://localhost:8787/cart` lists product A's name. (3) Repeat (1) for product B, sending `-H "Cookie: aheed_cart=<T>"`. The response headers set `store_cart=<T>` (the **same** `T`) and expire `aheed_cart` (`Max-Age=0` or a past `Expires`). (4) `curl -s -H "Cookie: store_cart=<T>" http://localhost:8787/cart` lists both products. |
| R26 | E2E | `npm run preview`, Chrome with a fresh profile (or after clearing site data). Open `http://localhost:8787/`, and in DevTools → Application → Cookies, delete everything and add `aheed_cookie_consent` = `accepted` (path `/`). Reload. No cookie banner is visible, and the cookie list shows `store_cookie_consent` = `accepted` and no `aheed_cookie_consent`. |
| R27 | E2E | `npm run preview`, fresh Chrome profile. (1) Open `http://localhost:8787/?ref=TESTREF1`. The cookie list has no `*_referral_code`. (2) Click **Accept All**. `store_referral_code` = `TESTREF1` appears, `Secure` ticked. (3) Add a product, then open `/checkout`. The discount-code input's value is `TESTREF1`. (4) In a second fresh profile, open `/?ref=TESTREF1` and click **Essential Only**. No `*_referral_code` cookie. Reload, and still none. |
| R28 | E2E | `npm run preview`. (1) `curl -s -H "Host: srimart.localhost:8787" http://127.0.0.1:8787/privacy`. Extract the `id="cookies"` section; a case-insensitive grep for `aheed` in it prints nothing. (2) Run R25 step (1) with `-H "Host: srimart.localhost:8787"` and a SriMart product id. The response sets `store_cart`, and no `aheed_cart`. |
| R29 | Integration | `gh issue view 1066 --comments` shows a comment from this slice listing every cookie name observed for each of the four requests R29 names, and whether the session cookie was `__Secure-better-auth.session_token`. Every listed name is either in R21's list (including any item 8+ added for it) or a legacy name. To spot-check one row: `curl -s -D - -o /dev/null https://srimart.nocaped.com/ \| grep -i set-cookie`. If it prints nothing, retry once (the Windows-`curl` empty-body trap). |
| R30 | Unit | `grep -n "store_cart" specs/architecture.md` matches inside the P3a cart paragraph, and `grep -n "aheed_cart" specs/architecture.md` prints nothing. `grep -n "storage-keys" docs/developer-portal/app-conventions.md` matches in the "User-facing copy" section, beside the Accept All rule. Its front-matter `version` is higher than `1.10.0`. |
| R31 | Unit | `git diff origin/staging -- CHANGELOG.md` shows an entry naming `#1080` and `#1065`. |
| R32 | Unit | Run each alone, with no build running alongside: `npm run lint`, `npm run typecheck`, `npm run format:check`, then `npx vitest run`. All exit 0. Read the vitest summary: the count of test **files** is not lower than on `origin/staging`, which detects the forks-pool trap. CI on the PR is the ground truth. |
