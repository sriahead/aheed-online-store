# P10 — Eleven quick UI and copy fixes from the 2026-10-13 user-testing pass (build notes)

Issue `#1077`. Branch `feature/p1077-quick-ui-copy-fixes`, off `staging`.

Commits, in order: `7bee5ad` (the triage evidence document), `b0cb045` (spec), `063c43a`
(implementation and tests), plus this stage's own commit.

## What changed and why

**Header brand, `components/layout/HeaderBrand.tsx` (item 1a).** The logo-and-mark branch was
**deleted**, not adjusted. #1069 rendered the square mark below 768px and swapped the logo in from
768px via one `<picture>`; owner testing the next day found the mark too small to identify the store
on a phone. Because a vendor with a logo now renders that logo at every width, the branch became
identical to the logo-only branch below it, so the two collapsed into one. That is why the diff
removes more than it adds, and why `R1` is expressible as a single equality:
`render(LOGO, MARK) === render(LOGO, null)`. Any regression that brings the mark back below `md` — a
`<source>`, a second `<img>`, an `md:hidden` — breaks that one assertion.

Consequence worth knowing: `ImageWithFallback`'s `sources` prop now has **no caller anywhere**. It
was added by #1069 for exactly this `<picture>`. It is kept deliberately (`plan.md` records this);
`#1072`, a footer logo with a light-on-dark variant, is its likely next user. A reader finding it
unused has not found dead code left by accident.

**Header banner, `components/layout/Header.tsx` (item 2).** `contactPhone` renders as a `tel:`
anchor in the banner's right-hand cluster. It **reuses `isDiallablePhone` and `telHref` from
`lib/footer-contact-form.ts`** rather than formatting a number here — and that reuse is load-bearing
rather than tidiness: a bracketed placeholder such as `[YOUR PHONE]` is a *legal stored value* in
this schema, and only a value passing `isDiallablePhone` may become an `href`. The footer renders a
non-diallable value as text; this banner renders **nothing**, because a terse promo bar is not the
place to show a shopper an unfilled placeholder. So the element has two hiding conditions, not one:
`null`, and "stored but not diallable".

**Department carousel, `components/layout/DepartmentHero.tsx` (items 11a, 11b).** `paused ||
interactionPaused` became one resolved predicate, `rotating`. The bug was that the control sits
*inside* the region whose `onMouseEnter`/`onFocus` latch `interactionPaused`, so on any pointer
device reaching for the control was itself what stopped rotation, and Play could not outlive the
pointer hovering it. Precedence is now: `paused` (which is also where `prefers-reduced-motion` lands
at mount) → an explicit press → hover/focus. `ROTATE_MS` 6000 → 4000.

**Shop your list (items 18, 19, 20).** The quantities hint moved above the textarea. The
ambiguous-line `<select>`'s first option is reworded and **keeps `value=""`** — that empty value *is*
the skip, read positionally by `features/cart/add-list-to-cart.ts`, so changing it would silently
drop lines. Item 18 took a different route from the spec; see **Deviations** below.

**Rewards (items 12a, 12b, 13, 15).** Four claims the code did not back:

- `maxMultiplier` is a new **required** field on `RewardsData`, supplied by `lib/rewards-service.ts`.
  Required rather than optional on purpose: `WaysToEarnAccordion`'s own prop already defaults to `1`,
  and that default is precisely how the tier-boost line came to be dead on the rewards panel while
  rendering correctly on `/account/loyalty` — nothing failed when nobody passed it. A required field
  forces a future producer to answer.
- `maxTierMultiplier` was **extracted to `lib/loyalty.ts`** beside `resolveTier`, because
  `/account/loyalty` already computed it inline and the service needed the same number. Two inline
  copies of a rate calculation is how two surfaces come to quote the same vendor differently.
- The referral sentence states the £20 minimum, formatted from `MIN_REFERRAL_ORDER_PENCE`. That
  threshold is genuinely enforced and gates **both** halves of the offer, which is why it is safe to
  state: it is written as the referral code's `minSubtotalPence`
  (`lib/repositories/referral-codes.ts`), `evaluateCode` refuses below it, and the referrer's points
  are awarded only where a referral `DiscountRedemption` exists on the order
  (`lib/repositories/orders.ts`).
- `AvailableRewardsSection`'s thresholds are multiples (1x, 2x, 5x) of the vendor's own
  `minRedeemPoints`. The 500 and 1000 figures it used before were platform inventions — not vendor
  data at any level — and the section called them vouchers when no voucher exists, redemption being a
  points field on the checkout form.

**Persistent doc updated on this branch** (not deferred to the final pass): `specs/design-system.md`
→ `1.21.0`. Its "Brand assets: lockup and mark (#1069)" header-rule table carried the decision this
slice reverses, so the table now shows the new rule and states plainly that it *is* a reversal, what
the mark still does everywhere else, and why 72×40 was chosen over anything larger. A second bullet
was added under "Accessibility & Compliance" recording the placeholder-contrast measurement below.

## Decisions taken during the build

- **`choiceMade` as a separate boolean, not a tri-state.** The first draft introduced
  `explicitChoice: "paused" | "playing" | null`, which duplicated information `paused` already held
  and — worse — would have blocked a reduced-motion visitor who *deliberately* pressed Play, since
  the draft also tested a `reducedMotion` ref inside the predicate. Replaced with one boolean
  recording only *that* a press happened; `paused` still records *which way*. A visitor who asks for
  no motion and then presses Play is now obeyed, which is the point of giving them a control.
- **`maxTierMultiplier` floors at `DEFAULT_MULTIPLIER_BPS`**, which the inline version it replaced
  did not. Visibly equivalent — the only consumer hides its line unless the value exceeds 1, so a
  vendor whose every tier sits below the default rendered nothing before (`0.5`) and renders nothing
  now (`1`) — and it means the number reads as "best available" rather than a penalty if a second
  consumer ever shows it unguarded. Recorded in the function's own docstring.
- **The `select` wording keeps the skip explicit**: "Please choose an item — or skip this line". The
  owner's note suggested "please select your item", which alone would be false, since choosing
  nothing is a supported outcome that silently drops the line.
- **`AvailableRewardsSection` renders `null` at `minRedeemPoints` of 0** rather than three cards all
  reading "0 pts" — #239's rule that a missing value hides its element. Its heading also changed
  ("Available rewards" → "Points milestones") because the old one, paired with per-card progress
  bars, is what made these read as issued vouchers.
- **A new test file, `tests/shop-list-review-copy.test.tsx`**, rather than extending a shopping-list
  test: every existing `tests/shopping-list*.test.ts` covers the pure parsing modules, and these two
  defects were in rendered copy, which those cannot see.
- **`R14` is checked against the source, not the DOM.** `ShopYourList`'s first hook is
  `useActionState` bound to a `"use server"` action, so mounting it would drag a server action into
  a unit test in order to assert the order of two elements. The property is static — no runtime state
  can reorder them — so the test reads the file and says why in a comment.

## Deviations from the spec

**Item 18 / `R13` — the placeholder's prominence was fixed with content, not colour.** `R13` required
a placeholder colour utility other than `placeholder:text-primary-muted`. **That requirement is
unsatisfiable, and the measurement is the finding**: `tests/token-alpha-purity.test.ts` (#649) bars
black text dimmer than 60%, the lowest value it permits (`text-black/60`) measures **5.74:1**, and
the `text-primary-muted` already in place measures **5.21:1** — so every legal colour is *more*
prominent than the status quo, and the two fainter options (`/50` at 3.98:1, `/40` at about 3.0:1)
fail AA for text. The first implementation used `text-black/40` and the suite correctly rejected it.

Raised with the owner mid-build and **approved explicitly**: the placeholder is now a one-line prompt
("Type or paste your list, one item per line") that cannot be read as data, and the worked
vendor-derived example lives in the hint, which item 19 had just moved above the box — so a shopper
reads it before typing rather than after. `lib/shopping-list-examples.ts` changed (its `placeholder`
is now the constant `LIST_PLACEHOLDER`; `exampleName` and all of the vendor-name picking rules are
untouched) along with `tests/shopping-list-examples.test.ts`. Contrast is unchanged and #649 is
intact. Validation should check `R13` against **this** outcome; the durable version of the rule is
now in `specs/design-system.md`.

**`R23`'s file-level `grep` for `voucher` was not used as written.** `validation.md`'s row greps the
component file, which would force deleting the comment that explains *why* the word was removed —
exactly the trap `specs/sdd-workflow.md` documents under Spec ("the check rewards deleting the
rationale"). The loop variable was renamed `voucher` → `threshold`, so the only remaining occurrence
in the file is that explanatory comment. The property `R23` actually cares about — no **rendered**
text promises a voucher — is asserted instead by
`tests/rewards-components.test.tsx` ("promises no voucher anywhere in its rendered copy"), which
checks `container.textContent`. Flagged here as a spec/check mismatch rather than patched, matching
how the workflow says to handle one.

## Known-shaky areas

- **The full local `vitest` run is not a clean signal, and this is pre-existing (#1037).** Six
  different files failed across three full runs — `token-alpha-purity`, `motion-reduce-coverage`,
  `product-grid-usage`, `add-to-cart-feedback`, `prune-branches.integration`,
  `pagination-guard-coverage` — every one with `Test timed out in 5000ms`, and **all six pass in
  isolation** (28 tests, verified). They are whole-tree file-scanning tests that overrun the 5s
  default under load. Best full-run result was **3144/3145**. CI is the ground truth here; a local
  red is not evidence of a defect in this slice. Re-run any failure alone before investigating it.
- **Nothing in this slice was exercised in a browser.** `lint`, `typecheck`, `build` and the unit
  tests are all green, but every `npm run preview` row in `validation.md` is still outstanding —
  including the two that matter most: `scripts/verify-mobile-layout.ts` reporting `brand.file`,
  `brand.width` 72 and no `192.png` in `brand.requested` at 360px (item 1a), and the banner's
  `tel:` anchor wrapping rather than overflowing at that width (item 2).
- **The second-vendor check (`R24`) is the one most likely to find something.** Three of these
  changes touch per-vendor surfaces, and CLAUDE.md's warning applies directly: several checks
  false-positive against Aheed because its values happen to look right. SriMart's local host needs
  its **port** in the `Host:` header (`srimart.localhost:8787`) or the request resolves to Aheed
  instead — the #729 trap.
- **`R17`'s "no new query" claim rests on reading a diff, not on a measurement.** The signed-in
  branch of `getRewardsDataForUser` already fetched `tiers`, so no `await` was added; nothing counts
  queries at runtime. Related and untouched: **#1034**, which is that this function runs loyalty
  reads and creates a referral code on *every* signed-in render even for a loyalty-off vendor. This
  slice neither fixes nor worsens that.
- **`WaysToEarnAccordion` still carries the claim item 13 removed from `ReferralCard`** — "when a
  referred friend places their qualifying first order", with the same undefined "qualifying" and the
  same unenforced "first order". Out of scope here (`R19`/`R20` are scoped to `ReferralCard`) and now
  tracked as its own issue, but a validator comparing the two rewards surfaces will see the
  contradiction and should recognise it as known rather than a defect in this slice.
- **`misc/`** is an untracked directory of brand assets from the #1069 work. It fails
  `npm run format:check` locally and is **not** part of this slice; untracked files are not checked
  out in CI, so it does not affect the build. Do not read it as a regression.
