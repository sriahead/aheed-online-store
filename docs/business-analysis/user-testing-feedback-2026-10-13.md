---
id: user-testing-feedback-2026-10-13
title: "User testing feedback — triage, 2026-10-13"
audience: [dev, product]
type: doc
status: draft
version: "1.4.0"
updated: 2026-10-15
visibility: internal
summary: "Owner user-testing feedback of 2026-10-13, 21 items, each traced to code or to live production evidence and sorted into already-handled, owner-configurable, code-change-needed and blocked. Carries a dated status register re-verifying every item after #1077 and #1083/#1078/#1079 shipped."
tags: [user-testing, feedback, triage, gap-register, uat, p10]
related: [gap-register-audit, roadmap, product-requirements]
---

# User testing feedback — triage, 2026-10-13

**Nothing here is approved scope.** This is evidence, not a plan: no issue has been opened and no
`/propose` has run for any item below. `status: draft` stays until the items are either filed or
dismissed.

**Source.** 21 numbered observations from the owner after a pass over the live storefront and staff
panel. The original wording is preserved in each item's heading so a later reader can match this
back to the message.

**Method.** Every item was traced to a file and line, and the claims that could be checked against
production were checked against production rather than inferred from code. Where the two disagree,
the live measurement wins and the item is marked accordingly.

## Live production evidence (2026-10-13)

Measured against `https://aheedfoodcentre.nocaped.com` by HTTP GET, not from the seed or from
`secrets/*.vars`:

| Fact | Live value |
| --- | --- |
| Minimum order | **£15.00** ("Orders must reach £15.00 before you can check out.") |
| Delivery fee | **£3.49** per delivery |
| Free delivery threshold | **£30.00** |
| Collection minimum | **"Collection orders must reach £15.00."** — the defect in item 9 |
| Loyalty | **enabled** (Loyalty Points, Earning Points, Redeeming Points sections all render) |
| Vendor FAQs | **absent** — "Questions we are asked" does not render, so no `VendorFaq` rows exist (#1021) |
| Internal ops doc on `/help` | **absent** — `Order & Fulfilment Operations`, `PENDING_PAYMENT`, `Known Trap` all gone; `Detailed Shopping Guide` and `Guest Checkout` present |
| Header banner | `Aheed Food Centre — local delivery across Milton Keynes & click and collect` |
| Footer phone | **set**, `tel:01908239130` |
| Footer email | **still the placeholder** `[YOUR EMAIL]` (#1058) |
| Header brand assets | **both** present — `mark-…/192.png` and `logo-….webp`, which is why the mark renders below 768px |

## A. Already handled — no work needed

### 5. "Help — Order & Fulfilment Operations needs to be updated"

**Already fixed, verified live.** `lib/public-docs.ts` selects the shopper guide by id and requires
`visibility: "public"`, so the internal operations document cannot surface on `/help` again;
`tests/public-docs-boundary.test.ts` stops any non-staff file from importing the KMS corpus at all.
Shipped 2026-10-10 under `#1013`/`#1012`/`#1022`. The observation predates that promotion.

**Real remainder behind this item:** `Questions we are asked` is absent live, because no vendor FAQ
rows exist. That is **#1021** (owner action — author Aheed's answers at `/staff/faqs`) and needs no
code.

### 9 (first two clauses). "we have minimum order £15 but the free delivery is £30"

**Already configured, and correct.** Seeded at `prisma/seed.ts:478-480` and confirmed live. Editable
with no deploy — see bucket B. Only the collection clause is a real gap; it is carried into bucket C.

### 14. "need to check view full loyalty account detail"

**Works.** `app/(storefront)/account/loyalty/page.tsx` renders balance, lifetime points, current
tier, next-tier progress, vouchers, referral card and the points ledger. It `notFound()`s only when
`loyaltyEnabled` is false, and loyalty is enabled for Aheed live. **Not verified signed in** — if a
404 was actually observed, this moves to bucket C.

### 17 (half). "refunds should remove the points as well"

Points **are** reversed. `reverseEarn` writes an `EARN_REVERSAL` row
(`lib/repositories/loyalty.ts:464`), called from `cancelConfirmedOrder`
(`lib/repositories/orders.ts:1962`), idempotent by `@@unique([orderId, kind])`. A staff cancellation
of a paid order already claws the points back. The other half is blocked — see bucket D.

## B. Owner-configurable today — no deploy

| Item | Surface | Steps |
| --- | --- | --- |
| 9 | `/staff/storefront` → **Delivery rules** | "Delivery fee (£)", "Free delivery over (£)", "Minimum order (£)". Per-postcode overrides at `/staff/delivery-areas` |
| 10 | `/staff/promotions` | The hero panel photo is the **department campaign banner** (`components/layout/DepartmentHero.tsx:153`), not a product image. Upload a banner per department matching what it sells. Related: **#1030**, the AI banner prompt hardcodes "UK grocery store" for every vendor |
| 12 / 15 | `/staff/loyalty` | Points per £1, pence per point, minimum redeem, tier window, tiers. The **referral** numbers are not configurable — see C |
| 5 | `/staff/faqs` | Author Aheed's Q&As (#1021) |
| 2 | `/staff/storefront` → Footer settings | `contactPhone` is already set. Only the banner *rendering* needs code |
| 7 | Resend console | See bucket E |
| 8 | Google Cloud console | See bucket E |

Also outstanding on the same screen: `contactEmail` is still the literal placeholder `[YOUR EMAIL]`
live — **#1058**.

## C. Code change needed

### P1 — before trading

**4. "Once entered the postcode the Delivery option is still not selected — instead shows the edit"**

Real bug, and the symptom matches the code exactly. `features/storefront/delivery.ts`
(`setDeliveryPostcode`) deliberately does **not** set the fulfilment method — a `#748` decision, so
that editing a postcode cannot silently switch a Click & Collect shopper back to Delivery. Once the
`fulfilment-method` cookie holds `COLLECTION`, entering a postcode can never select Delivery, and
`components/layout/LocationControl.tsx:66` only shows the postcode when `method === "DELIVERY"`. The
result is an unselected "Delivery" button plus a pencil, with the shopper's own postcode readable
only by reopening the modal and cancelling it.

Fix: when the modal was opened **from the Delivery affordance**, treat a deliverable postcode as
choosing Delivery — intent-scoped, so `#748`'s rule still holds for an edit — and show the stored
postcode in the control regardless of method.

**9 (third clause). "there shouldn't be minimum order for click and collect"**

Confirmed live and in code. `resolveDeliveryRules(…, "COLLECTION")` returns the vendor-wide defaults
(`lib/delivery-pricing.ts:57`), so `fulfilmentProgress` returns `below-minimum`
(`lib/cart-rules.ts:251`) and `place-order` throws `BELOW_MINIMUM`
(`lib/repositories/orders.ts:289`) for a collection basket under £15. **This blocks real collection
orders.** Fix: a new `VendorConfig.collectionMinimumOrderPence` (configurable and
multi-tenant-correct, one additive migration) rather than a flat "collection has no minimum" rule,
which would be another vendor-wide constant of the kind ADR-004 exists to prevent.

**11. "play and pause button but doesn't seem to do anything or time needs to be reduced"**

Root cause: `components/layout/DepartmentHero.tsx:130-133` latches `interactionPaused` on hover and
focus, and the control sits **inside** the hovered panel — so while the pointer is there, Play can
never resume and Pause changes nothing visible. Rotation is a hardcoded `ROTATE_MS = 6000` (`:67`).
Fix: let an explicit choice win over the hover pause (or exclude the control from the hover region),
and shorten the interval.

**21. "if you don't select one of the items and continue check out, it doesn't give you warning"**

Confirmed. An ambiguous line left on "Skip this line" is silently dropped:
`components/cart/ListReview.tsx` counts only ready lines into the button label, and
`features/cart/add-list-to-cart.ts` ends with a bare `redirect("/cart")` and reports nothing. Fix:
state how many lines will be skipped before submit, and carry a notice to `/cart`.

**1a. "show the full vendor logo on phone view instead of square mark logo"**

`components/layout/HeaderBrand.tsx:103-120` makes the **mark** the below-768px default and swaps the
logo in at `md`, via one `<picture>`. ~5 lines in that one branch; keep the mark for favicon and OG.
**Note this reverses a deliberate `#1069` decision made 2026-10-12**, so the build notes for that
slice should record the reversal rather than letting the two decisions sit side by side.

**18. "Examples in the shop list is solid text — should be faded"**

The textarea placeholder uses `placeholder:text-primary-muted`, which resolves to `#49784e`
(`design-system/tokens/tokens.css:64`) — a saturated dark green that reads as typed content. Fix
with a neutral low-contrast placeholder on the element. **Do not fix this by editing `tokens.css`:**
`brandStyle()` injects competing inline custom properties and inline beats `:root`.

**2. "Banner doesn't have the phone number"**

`contactPhone` is already on the resolved profile (`lib/repositories/vendor.ts:336`) and already set
live. ~6 lines in `components/layout/Header.tsx` beside the `bannerNote` block (`:172`).

### P2 — before release, not blocking

**3. "Wording needs to be simplified — Aheed Food Centre — local delivery across Milton Keynes &
click and collect"**

A hardcoded template at `components/layout/Header.tsx:169-171`, derived from `name` +
`localityName` + `offerCollection`. Not configurable. Preferred fix: render the existing
`bannerNote` config field here instead, so future wording is a setting rather than a deploy.

**12 / 13. "rewards earning needs to be updated before release" / "as well as the refer your friend"**

Three distinct defects:

1. The referral numbers — **£5** off, **100** points, **£20** qualifying minimum — are hardcoded
   platform constants (`lib/referrals.ts:11-13`), not vendor config. They cannot be changed without
   a deploy, which contradicts the standing rule that loyalty and delivery economics are vendor data.
2. The **£20** qualifying minimum is never stated to the shopper. The copy says "their qualifying
   first order" and leaves "qualifying" undefined.
3. "Loyalty tier boosts" never renders in the rewards panel at all: `RewardsPanel` does not pass
   `maxMultiplier` to `WaysToEarnAccordion`, so that branch is dead on that surface (it does render
   on `/account/loyalty`, which passes it).

Also `"Earn {n} point for every £1"` is hardcoded singular
(`components/rewards/WaysToEarnAccordion.tsx`).

**15. "update redeem as well"**

`components/rewards/AvailableRewardsSection.tsx:26-47` invents voucher tiers at **500** and **1000**
points that are not vendor data, and presents them as vouchers when redemption is actually a points
field at checkout. Derive the tiers from `minRedeemPoints`, or drop the two invented ones.

**6. "in Privacy policy — few words are in code base, Cookies and Local Storage"**

The `<code>`-styled cookie names under §4, `app/(storefront)/privacy/page.tsx:63-100`, landed
2026-10-11 as `#1064`. Fix the presentation: plain-language purpose first, technical name secondary
or removed.

**Separate finding made while reading it, worth its own issue.** Four storage keys are platform-wide
and carry one vendor's name: `aheed_cart` (`lib/cart-identity.ts:19`), `aheed_cookie_consent`
(`components/consent/CookieBanner.tsx:6`), `aheed_referral_code`
(`components/rewards/RewardsLauncher.tsx:30`) and `aheed_checkout_details`
(`components/checkout/CheckoutForm.tsx:282`). **SriMart's privacy page therefore publishes a
competitor's name.** Same class as `#239`. Renaming them drops every live cart and consent record,
so it needs a migration plan, not a quiet rename.

**19 / 20. Shop-list wording**

- **19** — reword or move the "Quantities are understood…" hint,
  `components/cart/ShopYourList.tsx:58-68`.
- **20** — the dropdown's first option is `"Skip this line"`,
  `components/cart/ListReview.tsx:107`. It genuinely *is* a skip (`value=""`), so "Please select
  your item" alone would be false; something like "Please choose an item — or skip this line"
  preserves the behaviour.

**1b. "many tab items in the admin or staff view — categorise as per their relevancy"**

24 flat links in one horizontal scroller, `components/staff/PanelNav.tsx:128-157`. Grouping is the
right call but touches three test-enforced surfaces — `PanelNav`, the hub at
`app/(admin)/staff/page.tsx`, and an operator guide — plus `tests/staff-nav-parity.test.ts`, whose
staff-tier expectations are derived from the pages' own gates. Its own slice.

**10 (code half). "the image carousel needs to match the products that are listed"**

Beyond swapping the banner images: `listCategorySpotlights`
(`lib/repositories/products.ts:838-842`) takes `categoryIds.length * 4` rows under a **global**
`isFeatured desc, createdAt desc` order, so one department with many featured products consumes the
whole window and other departments silently get no spotlight. It also matches only products whose
**direct** `categoryId` is the top-level department, so a catalogue organised into subcategories
yields no spotlights at all.

## D. Blocked on existing work

### 17. "refunds should remove the points as well"

**There is no refund path at all.** Nothing in the repository writes `PaymentStatus.REFUNDED`;
refunds are **#606**, ADR-005's open territory. The points reversal already exists (bucket A) and
will fire as soon as a refund path calls it, so there is nothing to build here first. Related:
**#795** — a cancelled-but-unrefunded order drops out of revenue reporting while the money is still
in the bank.

## E. Launch blockers — owner-gated, external

### 7. "Create account email needs to be configured" — the most serious item on the list

`lib/auth.ts:198` sets `requireEmailVerification: true`, so **no new customer can sign in until they
click a verification link**, and that link cannot be delivered until Resend has a verified sending
domain. Production sends from `no-reply@aheedfoodcentre.nocaped.com`, which only works once that
domain is verified. This is **#104** and **GAP-005**.

Steps: add `aheedfoodcentre.nocaped.com` as a domain in Resend → publish the DKIM/SPF/DMARC records
it returns in Cloudflare DNS → wait for verification → place a real test registration end to end.
Until that is green, registration is effectively broken for every customer.

The other blocker on the same footing is **#113** / **GAP-006** — production still runs Stripe test
keys.

### 8. "continue with your google account doesn't sign you in"

The code is correct and the credentials are present: `app/(storefront)/login/page.tsx:20` renders
the button only when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set, and the button was
observed. The failure is on the Google side, and is one of two things:

1. **OAuth consent screen still in "Testing"** — only listed test users can complete sign-in.
   Check this first; it matches "doesn't sign you in" better than a redirect mismatch, which
   normally shows a Google error page.
2. **Redirect URI not registered per host.** `baseURL` is derived **per request from the host**
   (`lib/auth.ts:174`), so every vendor host needs its own authorised redirect URI:
   `https://aheedfoodcentre.nocaped.com/api/auth/callback/google`, and the same for
   `srimart.nocaped.com`, `staging.aheedfoodcentre.nocaped.com` and `srimart-staging.nocaped.com`.

## F. Unresolved — needs the owner

### 16. "refer a friend CTA button is greyed"

**Superseded 2026-10-15; see the status register's update.** The likely cause is the signed-out
`ReferralCard` box's colours, fixed under `#1101`. The original note follows.

**No disabled refer-a-friend button exists anywhere in the code.** The closest candidates are the
`unavailable` branch of `components/rewards/ReferralCard.tsx:64` ("Your referral link isn't
available right now" — it fires when the referral code can neither be read nor created, which is
also the subject of open **#1034**), or the `disabled` "Nothing to add yet" button in the shop-list
review. A screenshot and the page URL would settle it.

## Suggested sequence

1. **No code, today:** #104 Resend domain; Google consent screen and redirect URIs; FAQ answers
   (#1021); footer email (#1058); department campaign images.
2. **One slice, pre-launch storefront fixes:** items 4, 9-collection, 11, 21, 1a, 2, 18 — all small
   and mutually independent.
3. **A second slice:** items 3, 6, 12, 13, 15, 19, 20.
4. **Own slices:** item 1b (staff nav), item 10 (spotlight query), the `aheed_`-prefixed storage
   keys.

## Status register — re-verified 2026-10-14

**Read this before the buckets above.** Everything from `## A.` to `## Suggested sequence` is the
original triage of 2026-10-13. This section is the later reconciliation: every item re-checked
against the code on 2026-10-14, after `#1077` and `#1083`/`#1078`/`#1079` reached production. **Where
this section and a bucket above disagree, this section is newer and wins.** The sequence above is
kept for provenance, not as the plan — its slices 2 and 3 are now mostly shipped, so the live
grouping is "Clubbing" at the end of this section.

### Update — 2026-10-15 (supersedes the tables below where they disagree)

- **Items 4, 21 and 6 are closed and in production** as `#1087`, `#1088` and `#1089` (PR #1092,
  promoted by PR #1093, merge `c3327e4`). The "Remaining — no issue filed" table below still lists
  them; that table was written before they were filed. Club A is done.
- **Item 10 is closed and in production** as `#1096` (with `#1030`, promoted by PR #1099).
- **Item 1b's "37 links" was a mis-count.** `components/staff/PanelNav.tsx` holds **two
  role-dependent lists**: vendor staff see 13 links and store admins see 24. 13 + 24 = 37. The file
  last changed on 2026-10-11, so nothing grew between 2026-10-13 and 2026-10-14. An admin sees 24, as
  originally recorded.
- **Item 16 now has a concrete cause, fixed under `#1101`** (still unconfirmed by the owner). The
  signed-out branch of `components/rewards/ReferralCard.tsx` hardcoded its dark-card pair
  (`bg-black/20` + `text-stone-300`). Both callers render it on a white card, so it showed at about
  1.05:1 and looked like a disabled control. It is visible to any signed-out visitor who opens the
  Rewards panel on a loyalty-on vendor. If the owner was **signed in** when they saw it, the cause is
  elsewhere and the item reopens.
- **`#1034` is folded into `#1101`.** It was not item 16's cause after all: it creates referral codes
  on loyalty-off vendors, which a shopper never sees.
- **Item 12.1 is filed as `#1103`** and parked, because nothing triggers it while only Aheed runs
  referrals.

### Closed — in production, nothing left

Items **1a, 2, 3, 5, 9, 11, 12a, 12b, 13, 14, 15, 17 (points half), 18, 19, 20**.

- `#1077` — 1a, 2, 11a, 11b, 18, 19, 20, 12a, 12b, 13, 15.
- `#1078` — 3 (banner headline is now vendor-editable). `#1079` — the referral **copy** half of
  12/13. `#1083` — 9's collection clause (`VendorConfig.collectionMinimumOrderPence`).
- `#1013`/`#1012`/`#1022` — item 5's code half, shipped 2026-10-10, before the owner's pass.

### Remaining — no issue filed

| Item | Defect | Evidence re-verified 2026-10-14 | Priority |
| --- | --- | --- | --- |
| **4** | A deliverable postcode still does not select Delivery | `features/storefront/delivery.ts` — `setDeliveryPostcode` writes no method cookie; `components/layout/LocationControl.tsx:65-66` builds `deliveryLabel` only when `method === "DELIVERY"` | **P1** |
| **21** | An ambiguous shop-list line is silently dropped | `features/cart/add-list-to-cart.ts:50` is still a bare `redirect("/cart")`; `ListReview` counts only ready lines into the button label | **P1** |
| **6** | Privacy page reads as "code base words" | `app/(storefront)/privacy/page.tsx:78-100` — seven `<code>`-styled storage names | P2 |
| **12.1** | Referral economics are platform constants, not vendor data | `lib/referrals.ts:11-13` (£5 / 100 points / £20). **Confirmed there are no `VendorConfig` referral fields** — `prisma/schema.prisma` carries only the `DiscountCode` referral relations. Needs one additive migration plus every call site | P2 |
| **1b** | Flat staff navigation | `components/staff/PanelNav.tsx` now renders **37** `<NavLink>`s, not the 24 recorded above — it grew between 2026-10-13 and 2026-10-14. Touches `PanelNav`, `app/(admin)/staff/page.tsx`, an operator guide and `tests/staff-nav-parity.test.ts` | P2 |
| **10 (code half)** | Departments starved of spotlights | **Filed as `#1096`, fixed by PR #1097 and in production since PR #1099 (2026-10-15); closed.** Evidence below is the pre-fix state: `lib/repositories/products.ts` had `SPOTLIGHT_ROWS_PER_CATEGORY = 4` and `take: categoryIds.length * 4` under a **global** `isFeatured desc, createdAt desc` order, and the `where` matched only the **direct** `categoryId` | P2 |

### Remaining — issue already filed, all open as of 2026-10-14

- **`#1080`** — the four `aheed_`-prefixed storage keys (the separate finding under item 6).
- **`#1030`** — the campaign banner AI prompt hardcodes "UK grocery store"; the sibling of item 10. **Fixed by PR #1097, in production since PR #1099 (2026-10-15); closed.**
- **`#1034`** — a referral code is created on every signed-in render; the best candidate cause for
  item 16.
- **`#1021`** (FAQ answers) and **`#1058`** (footer email, still `[YOUR EMAIL]` live) — owner
  actions, no code.
- **`#104`** (Resend domain, item 7) and **`#113`** (Stripe live keys) — launch blockers,
  owner-gated, external.
- **`#606`** (no refund path, item 17) and **`#795`** (cancelled-but-unrefunded revenue).

### Needs the owner before it can be filed at all

- **Item 16** — no disabled refer-a-friend button of that description exists anywhere in the code.
  A screenshot and the page URL would settle whether it is `#1034` or `ReferralCard`'s `unavailable`
  branch.
- **Item 14** — the loyalty detail page was never exercised **signed in**. If a 404 was genuinely
  observed it becomes a real defect; until then it stays in bucket A.

### Clubbing

- **Club A — "stop making the shopper guess": items 4, 21 and 6. Owner-approved 2026-10-14**, taken
  to Gate 1 as the next slice. Two P1 pre-trading defects plus one single-file copy change; three
  independent files, **no schema change**.
- **Club B — "departments show what they actually sell": item 10's code half plus `#1030`.** Same
  surface, same defect in two halves — the spotlight query and the vendor-neutral banner prompt.
  **Built, validated and merged to `staging` as PR #1097 (2026-10-15); In Review until promoted.**
- **Deliberately alone:** **12.1** (the only remaining item needing a migration), **1b** (three
  test-enforced surfaces), **`#1080`** (renaming the keys drops every live cart and consent record,
  so it needs a migration plan rather than a rename).

### Backlog clubbing — 2026-10-15 (wider than this triage)

Grouped from the files each open issue's own body names, at the 2026-10-15 Orient; not re-read
against the code, so each club's overlap is confirmed at its own Gate 1. **Club B above is in
production** (PR #1099), and `#1080`/`#1065` shipped by PR #1109. This list now covers the open
backlog that grew out of this pass and its neighbours, not only the 21 items.

| Club | Issues | Shared surface | Gate before build |
| --- | --- | --- | --- |
| **C — privacy and consent honesty** | `#1107` + `#1041` | `app/(storefront)/privacy/page.tsx`, `CookieBanner.tsx`, `CheckoutForm.tsx` / `lib/checkout-details-storage.ts` | **Gate 1, 2026-10-15 — owner rulings:** saved checkout details stay essential (no consent gate); all seven hashed-IP records get disclosed, not only the search log; a "Cookie settings" control is in scope. |
| D — AI allowance visible to staff | `#1029` + `#1031` | staff AI-usage surface, `BackfillImagesButton.tsx` | `#1028` (Workers Free or Paid) decides the copy; a new `/staff/*` page lands on three surfaces |
| E — shopper copy that contradicts the system | `#1045` + `#1043` | `/help`, `lib/assistant-content.ts`, `/orders/lookup` | None; copy only |
| F — `#1088` follow-ups | `#1090` + `#1091` | `ListReview.tsx` / `add-list-to-cart.ts`; `LocationControl.tsx` | None; no shared files, batched for efficiency only |
| Owner-gated or later | `#1057`+`#1061`+`#1062` (opening-hours model, likely one migration); `#1071`+`#1072`+`#1073` (brand assets, `#1072` needs artwork); `#1103`+`#1102` (referral economics, parked); `#1056`+`#1058` (footer pages, owner content) | — | Owner input or a date |
| Alone | 1b (staff nav, unfiled), `#1027` (model switch), `#1106` (due ~2026-11-14) | — | — |
