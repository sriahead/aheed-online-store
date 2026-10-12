# Privacy page — Cookies and Local Storage (requirements / acceptance criteria)

This slice closes #1064. It rewrites section 4 of the storefront privacy page
(`app/(storefront)/privacy/page.tsx`, the `<section id="cookies">` that #1055's footer "Cookies" link
targets) so it lists every cookie and local-storage item the storefront sets, under the name a
browser shows. `plan.md` has the evidence table of what is set, the owner's decision (option 3 on
#1064), and what is deliberately left out.

Terms used below:

- **"The section"** is the `<section id="cookies">` element in `app/(storefront)/privacy/page.tsx`.
- **"Aheed" and "SriMart"** mean the two seeded vendors, served under `npm run preview` at
  `localhost:8787` and `srimart.localhost:8787`.
- **"The list"** is the `<ul>` inside the section.
- All text comparisons ignore whitespace differences caused by JSX line wrapping, and compare the
  rendered text, not the source.

## Structure

R1. The section keeps `id="cookies"` and an `<h2>` whose text is exactly
    `4. Cookies and Local Storage`. `id="cookies"` occurs exactly once in the rendered `/privacy`
    HTML.

R2. The section's first paragraph is exactly:
    `We use cookies and local storage technologies to support essential website functionality,
    including user authentication, shopping cart management, delivery and collection preferences,
    checkout convenience, referral links, and the storage of cookie consent preferences.`

R3. The section's second paragraph is exactly:
    `The following cookies and local storage items are used for these purposes:`

R4. The section's last paragraph, after the list, is exactly:
    `These cookies and local storage items are scoped to the relevant host and are used to provide
    core website functionality.`

## The list

R5. The list is a `<ul>` with exactly 7 `<li>` elements, in this order. Each `<li>` renders as the
    item name inside a `<code>` element, then ` — ` (a space, an em dash U+2014, a space), then the
    description, with these exact strings:

    | # | Name (in `<code>`) | Description |
    |---|---|---|
    | 1 | `__Secure-better-auth.session_token` | `Maintains your authenticated session.` |
    | 2 | `aheed_cart` | `Stores your shopping cart state.` |
    | 3 | `aheed_cookie_consent` | `Records your cookie consent preferences.` |
    | 4 | `delivery-postcode` | `Remembers the postcode you entered so we can show delivery availability and fees.` |
    | 5 | `fulfilment-method` | `Remembers whether you chose delivery or collection.` |
    | 6 | `aheed_referral_code` | `Remembers a referral code from a link you followed so it can be applied at checkout. Only set when you arrive through a referral link.` |
    | 7 | `aheed_checkout_details` | `Local storage. Keeps the contact and delivery details you type into the checkout form on your device so they are filled in next time. It stays on your device.` |

R6. The section's text contains no vendor name and no grocery wording (no "Aheed Food Centre",
    "SriMart" or product example). The only occurrences of `aheed` are inside the `aheed_`-prefixed
    names in R5 rows 2, 3, 6 and 7. Aheed's and SriMart's rendered sections are identical.

R7. The section's text does not contain `aheed_session`, `admin-tier`, or any of the bare names
    `session`, `cart` or `cookie_consent` as a list item name.

## Truth of the list

R8. Every cookie name in R5 is a name the storefront really sets. In a clean browser profile, after
    this flow — open `/`, submit a delivery postcode, choose a fulfilment method, add a product to
    the cart, accept or decline the cookie banner, open `/?ref=TESTCODE`, sign in as a customer —
    the cookie jar holds each of R5's rows 1–6 (row 1 without its `__Secure-` prefix, because the
    flow runs over `http://localhost`; see R9).

R9. Over `http://localhost`, the sign-in response sets a cookie named `better-auth.session_token`.
    Better Auth adds the `__Secure-` prefix when the site's base URL is HTTPS, which is the case
    on staging and production; R5 row 1 names the HTTPS form because that is what a shopper's
    browser shows on the live site.

R10. After that flow, no cookie is present in the jar other than R5's rows 1–6 and, if the
    browser is signed in as staff, `admin-tier`. Any other name is a failure to be investigated,
    not ignored.

R11. After typing into the checkout form, `localStorage` holds an `aheed_checkout_details` key and
    no other key.

## Names that already exist as constants cannot drift

R12. `tests/privacy-cookies-section.test.tsx` exists, renders `PrivacyPage` with
    `getCurrentVendorProfile` mocked, and passes. It asserts R1–R5 and R7. It also asserts that the
    section contains, as list item names, the values of `CART_COOKIE` (`lib/cart-identity.ts`),
    `DELIVERY_POSTCODE_COOKIE` (`lib/delivery-cookie.ts`) and `FULFILMENT_METHOD_COOKIE`
    (`lib/fulfilment-cookie.ts`), imported from those modules rather than written as literals.

## Scope guards

R13. Relative to `origin/staging`, `git diff --name-only` lists only: `app/(storefront)/privacy/page.tsx`,
    `tests/privacy-cookies-section.test.tsx`, `CHANGELOG.md`, files under
    `specs/2026-10-12-p1064-privacy-cookies/`, and the generated files that `npm run kms:build-index`
    rewrites (`ARTIFACT_INDEX.md`, `app/(admin)/staff/runbook/docs.ts`). In `page.tsx`, every
    changed line lies inside the section; the other numbered sections and the metadata are
    unchanged.

R14. `tests/storefront-footer.test.tsx` passes unchanged: the footer's Cookies link still points
    at `/privacy#cookies`.

## Gates

R15. `CHANGELOG.md` has an added entry referencing #1064 on this branch (Gate 4).

R16. `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build` and
    `npm run kms:validate` exit 0; `npx vitest run`, run alone, exits 0; `npm run kms:build-index`
    followed by `git status --short` shows no change to `ARTIFACT_INDEX.md` or
    `app/(admin)/staff/runbook/docs.ts` that is not already committed; and CI `gates` on the PR is
    green.
