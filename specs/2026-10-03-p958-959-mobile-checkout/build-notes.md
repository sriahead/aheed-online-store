# #958, #959 — Mobile checkout (build notes)

Written at the end of Build on 2026-10-03, **before** the Clear. The validating context is fresh
and has only the spec, the artifact and this file.

No front-matter: like `requirements.md` and `validation.md`, this file is slice-local, not a KMS
artifact, and it gets no `ARTIFACT_INDEX.md` entry.

Branch `feature/958-959-mobile-checkout`, cut from `origin/staging` at `0ff0380`. Its first
commit, `2d8bd29`, is slice 1's Document pass (`#960`–`#962`) cherry-picked from the merged slice-1
branch, where it was never pushed. It is a docs-only carry-forward (roadmap 1.125.0, handoff
1.58.0, playbook 1.15.0, KMS index) and not part of this slice's scope. Then `12edf14` (spec),
`b09d923` (feature), `58b6d2f` (R18a grid fix plus spec amendment), and this notes commit.

## What changed and why

- **`lib/checkout-sections.ts`** (new, plain module). `checkoutSections()` returns the ordered
  section keys, using the same conditions the JSX renders each section under.
  `CHECKOUT_SECTION_TITLES` holds the six titles. Every heading in `CheckoutForm` is now
  `heading(key)`, which renders `${indexOf + 1}. ${title}`. The six hardcoded ternaries are gone,
  and Fulfilment Method is numbered.
- **`components/checkout/CheckoutForm.tsx`**:
  - Eight `autoComplete` tokens.
  - A new required `totalPence` prop.
  - A `data-checkout-total` row (`md:hidden`, `bg-surface-muted`) just before the submit button,
    showing `Total`, `formatPrice(totalPence)` and one of the two note strings, chosen on
    `redeemable`.
  - `data-checkout-form` on the `<form>`.
  - Button `Continue to payment` / `Continuing to payment…`.

  Single-line inputs were reflowed onto several lines by Prettier, so the diff looks bigger than
  it is.
- **`components/checkout/CheckoutSummary.tsx`**: `data-checkout-summary` on the `<aside>` and
  `data-checkout-summary-total` on the Total `<dd>`. No visual change.
- **`app/(storefront)/checkout/page.tsx`**:
  - Passes `totalPence={totals.totalPence}`, the same `totals` object given to the summary.
  - **R18a:** the grid is now `grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_18rem]`. See
    Deviations.
- **`features/auth/components/{Login,Register,ResetPassword,ForgotPassword}Form.tsx`**: one
  `autoComplete` per `<input>`, placed as the first attribute.
- **`tests/autocomplete-tokens.test.ts`** (new). It splits each source file into `<input … />`
  elements with a non-greedy regex and reads each one's `autoComplete`.
  - Auth files: the exact ordered list.
  - `CheckoutForm`: a lookup by `name="…"`.
  - Mutation-checked during Build: removing `autoComplete="postal-code"` made it fail, and the
    file was restored.
- **`tests/checkout-sections.test.ts`** (new): all 16 combinations with exact lists (a
  `prettier-ignore` table), a uniqueness check, the four named cases from R12, and the titles.
- **`scripts/verify-mobile-layout.ts`**:
  - `--then <path>`. It requires `--add-first`, otherwise exits 2. Git Bash's drive-letter guard
    now covers it too.
  - `load(path)` is parameterised.
  - `MEASURE` gains `formInputs` and `checkout`. Both are read at scroll 0, before the existing
    scroll-to-600 step. Positions are document coordinates (rect plus `scrollY`).
- **Docs:**
  - `docs/developer-portal/app-conventions.md` 1.3.0: new section, "Form fields that collect the
    user's own data", with a summary line updated.
  - `docs/shopper-help/shopping-guide.md` 1.1.0: a **Paying** bullet.
  - `docs/developer-portal/local-dev-playbook.md` 1.16.0: `--then`, and the `viewportWidth`
    zoom trap.

## Decisions taken during the build

- **Section titles live in the lib module**, not in the JSX, so the test pins them and the form
  can't drift from `plan.md`'s table. "Delivery address & instructions" is now a JS string, so it
  renders `&` directly, where the JSX had `&amp;`. The output is identical.
- **`totalPence` is required, not optional.** `CheckoutForm` has one caller, the checkout page, so
  a default would only hide a missing total.
- **The total row is formatted in the client** with `components/product/format-price.ts`, the
  same formatter the server summary uses. That is why the R18 amount comparison is exact.
- **`formInputs` covers every form on the page**, header forms included. Spec R2 defines it that
  way. On the auth and checkout pages, the first four entries belong to the header and landing
  forms (`postcode`, `q`, `q`, `postcode`). Validation rows R7 and R8 already tell the validator
  to pick entries by name or type.

## Deviations from the spec

- **R18a was added at Build** (`requirements.md`, `validation.md`, and `plan.md` §3a, committed
  in `58b6d2f`). The first live measurement showed `/checkout` reporting `viewportWidth` **961 at
  390px and 1272 at 768px, on both vendors**. The page was rendering zoomed out on every phone and
  tablet.
  - **Cause:** the grid's implicit `auto` column below `md` and its `1fr` column at `md` both have
    an automatic minimum equal to min-content. `SlotPicker`'s day strip
    (`components/checkout/SlotPicker.tsx:149`, about 14 `flex-shrink-0` buttons, ~900px) set that
    minimum, so its own `overflow-x-auto` never engaged.
  - **Already present before this slice.** Neither `page.tsx`'s grid nor `SlotPicker` was in this
    slice's diff when it was found.
  - **Fix:** `minmax(0, …)` tracks.
  - **After the fix** (preview, both vendors): `viewportWidth` equals the requested width at
    360, 390, 768 and 1280.
  - **Why it was taken in this slice rather than filed:** without it, the mobile checkout this
    slice exists to fix still renders at the wrong scale, and R18's numbers would describe a
    zoomed-out page. The spec template allows a lettered requirement for a prerequisite found
    mid-slice. **This was not put to the owner before it was done.** Validation should treat R18a
    as a reviewed addition, and the owner may want to know about it at Ship.
- No other deviation.

## Known-shaky areas

- **Build-time smoke results are not validation; re-run them.** Under `npm run preview` after the
  R18a fix, on Aheed (`categories/fruit-veg`) and SriMart (`categories/sri-electronics`):

  | Width | Aheed | SriMart |
  |---|---|---|
  | 360 | row shown, row bottom 1489 / submit 1513–1561 / summary top 1606 | row shown, 1602 / 1626–1674 / 1719 |
  | 390 | row shown, 1489 / 1513–1561 / 1606 | row shown, 1578 / 1602–1650 / 1695 |
  | 768 | row hidden | row hidden |
  | 1280 | row hidden | row hidden |

  - The amount equalled `summaryTotal` everywhere (£1.39 and £32.98).
  - **Aheed rendered Click & Collect**: offerCollection is on in dev and there is no postcode
    cookie. Its headings were `1. Fulfilment Method / 2. Contact information / 3. Choose a Time /
    4. Discount code`. So no address input rendered in the script run (R7's caveat), and R15's
    sequence was effectively seen already.
  - **SriMart** has no collection; delivery with slots: `1. Contact information / 2. Delivery
    address & instructions / 3. Choose a Time / 4. Discount code`.
  - At 390, `/login`, `/register` and `/forgot-password` showed the R5 tokens.
- **R9 (street suggestions plus autofill) was not exercised at Build.** It needs a browser,
  typing, and reference data that has been synced locally. It is the one place a browser could
  behave differently with `autocomplete` and `list` on the same input. The visible "Streets near
  this postcode:" text is unaffected either way.
- **R15 with Delivery selected on Aheed** (the address section present alongside Fulfilment
  Method) was not seen live; only Click & Collect was. The unit test covers the sequence.
- **The loyalty note string** ("…or points you use…") is only reachable signed in, with a balance
  at or above the vendor's minimum. It was not seen live. Unit coverage is a source read (R17), not
  a rendered check.
- **`tests/autocomplete-tokens.test.ts` relies on the regex `<input\b[\s\S]*?\/>`.** An `<input>`
  whose attributes contain the literal text `/>` (for example, inside an arrow-function prop)
  would be truncated. None does today.
- **A full `npx vitest run` writes fixture orders into the dev database** (`#797`). It was run
  once at Build, alone: 199 files and 2627 tests passed.
- **The stub payment adapter** (no `STRIPE_SECRET_KEY` locally) sends "Continue to payment" to the
  order page, not a payment page. This is expected locally; see `plan.md` §4.

**Follow-ups filed at this stage** (P10, Backlog, on Project #2):

- `#966`: the header and landing postcode inputs have no `postal-code` token.
- `#967`: the checkout total ignores a referral code pre-filled from the cookie.
- `#968`: the shopper guide says codes are applied in the cart.

The checkout `tap` sizing stays with the existing `#964`. Real-device autofill (iOS Safari,
Android Chrome) is post-deploy evidence, with no issue.
