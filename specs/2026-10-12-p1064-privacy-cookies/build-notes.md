# Privacy page — Cookies and Local Storage (build notes)

Written at the end of Build, before the Clear. Supporting context only: where to look and what was
decided. The artifact and `requirements.md` are the authority; if this file and the artifact
disagree, the artifact is the fact.

## What changed and why

Two files of source, both small:

- `app/(storefront)/privacy/page.tsx` — only the body of `<section id="cookies">` (42 lines added,
  2 removed). The section keeps its `id`, its `<h2>` and its place; nothing else on the page moved.
  It now reads: intro paragraph, lead-in paragraph, a `<ul>` of seven `<li>`, closing paragraph.
  Each `<li>` is `<code>name</code> — description`, with the exact strings from `requirements.md`
  R5. The intro, lead-in and closing line are the owner's wording, extended only so they also cover
  the added items (delivery and collection preferences, checkout convenience, referral links, local
  storage).
- `tests/privacy-cookies-section.test.tsx` (new) — renders `PrivacyPage` with
  `getCurrentVendorProfile` mocked and pins R1–R7 and R12. It follows the pattern of
  `tests/help-vendor-facts.test.tsx`.

Why the shape: the old sentence named `aheed_session`, a string that appears nowhere in code, and
left out four items the storefront does set. The evidence table of what is set, with the file that
sets each item, is in `plan.md`. No code that sets a cookie changed.

Besides the slice files: `CHANGELOG.md` (Gate 4), and `docs/model-handoff.md` (the stale `#1055` /
`#1060` In-Flight entry corrected, and a `#1064` entry added).

## Decisions taken during the build

- **List markup.** A `<ul className="list-disc space-y-1 pl-5 …">` with `<code>` for names. No new
  component and no new token: the section sits among prose paragraphs that already use
  `text-sm text-primary-muted leading-relaxed`. Rejected: a table (heavier for seven short rows;
  harder to read on a phone) and a definition list.
- **The session name is the HTTPS form.** `__Secure-better-auth.session_token`, because that is
  what a shopper's browser shows on the live site. Over `http://localhost` the same cookie is
  `better-auth.session_token` (no prefix); R9 in `validation.md` makes the validator observe both
  that and Better Auth's prefix rule. Rejected: listing the unprefixed name, which is what devtools
  would show only in local development.
- **Test imports the three cookie-name constants from their modules** (`CART_COOKIE`,
  `DELIVERY_POSTCODE_COOKIE`, `FULFILMENT_METHOD_COOKIE`) so a rename fails a test. To load
  `lib/cart-identity.ts` the test mocks `next/headers` and `@/lib/auth-rbac` (`getUserId`); that
  module calls `cookies()` only inside functions, never at import. The other three cookie names
  (`aheed_cookie_consent`, `aheed_referral_code`) are written as literals in code that is not
  importable without side effects, so the test cannot tie them to code; the browser flow in
  validation R8 is what covers those.
- **`admin-tier` is left out on purpose** (staff-only view preference, set by
  `components/layout/ViewSwitcher.tsx`). The plan records this as a decision with the one-line way
  to reverse it.
- **Mutation check done in Build.** Renaming `aheed_cart` to `cart` in the page turned three tests
  red (R5, R7, R12); restoring it turned them green. That is evidence the test can fail, not
  evidence the page is correct.
- **Issues filed for the two deferred items:** `#1065` (referral cookie is set without checking the
  consent choice, a PECR question for the owner) and `#1066` (check live `Set-Cookie` headers on
  staging and production for infrastructure cookies, before the promotion that carries this
  slice). Both are on the delivery board, Phase P10, Backlog.

## Deviations from the spec

None. Every requirement was built as written; the exact strings in R2–R5 were typed from the spec,
not paraphrased.

## Known-shaky areas

- **R8–R11 were not run in Build.** They need a real browser, the dev database and a signed-in
  customer; Build only ran the unit test, `eslint`, `prettier` and `tsc` on the touched files.
  The full suite, `npm run build` and `kms:validate` also remain for Validate. Everything about
  whether the list is *true* of a real cookie jar is unproven until then.
- **Unexpected Better Auth cookies.** The list assumes sign-in sets only the session cookie.
  `better-auth.dont_remember` or a `session_data` cookie would appear if "remember me" is off or
  the cookie cache is on; `lib/auth.ts` configures neither, but this was read from source, not
  observed. R10 ("no other cookie in the jar") is where it would show up.
- **The referral cookie needs Aheed.** `aheed_referral_code` is written by `RewardsLauncher`, which
  only renders when the vendor's loyalty is on. SriMart (loyalty off) never sets it, yet its
  privacy page lists it; the wording ("Only set when you arrive through a referral link") stays
  true, and R6 requires the two vendors' sections to be identical. Run R8 on Aheed.
- **HTTPS session name is unobserved.** Confirmed only from `node_modules/better-auth/dist/cookies/
  index.mjs` (prefix added when the base URL starts with `https://`) and from the `localhost`
  behaviour. The last row of `validation.md` is a post-deploy check on staging and will be reported
  unverified if not run before Ship.
- **Whitespace and the em dash.** R5 compares the text with whitespace collapsed and an em dash
  (U+2014) either side. A formatter that rewraps JSX could not change that, but a hyphen or an en
  dash typed by hand would; the unit test checks the exact character.
- **No consent gating was changed.** Whether the referral cookie should wait for consent is
  `#1065`; do not treat its absence from this slice as an omission.
