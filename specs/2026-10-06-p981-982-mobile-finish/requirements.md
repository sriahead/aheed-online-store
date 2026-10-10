# #981, #982 — Mobile finish: Quick View review tap targets and the logo-less header wordmark (requirements / acceptance criteria)

This slice closes `#981` (Quick View's review form, Delete, Try again and Log in controls are under
44px) and `#982` (a logo-less vendor's header wordmark widens a 360px page). Gate 1 was approved by
the owner on 2026-10-06; the scope and the owner's wordmark choice are in the "Gate 1 — approved
scope" comment on each issue. The reasoning, the measured sizes and the deliberately-excluded list
are in `plan.md`, which a validator should read first. No schema change, no migration, no server
change.

Terms used below:

- **Spec folder:** `specs/2026-10-06-p981-982-mobile-finish/`.
- **The tap utilities:** `h-tap`, `w-tap`, `size-tap`, `min-h-tap`, `min-w-tap`, generated from
  `--spacing-tap: 2.75rem` in `design-system/tokens/tokens.css`. 44 CSS px.
- **The measuring script:** `scripts/verify-mobile-layout.ts`. It prints one JSON object per width
  and exits 0 when every page loaded; it has no thresholds of its own, so every numeric threshold
  below is the validator's to compare.
- **Requested width:** the value passed in `--widths`, e.g. `360`. A page that overflows widens the
  emulated layout viewport, so `viewportWidth` and `documentScrollWidth` must each be compared
  against the requested width, never only against each other.
- **The two review surfaces:** the Quick View drawer (`components/product/QuickViewDrawer.tsx`) and
  the product page's review form (`features/reviews/components/ReviewForm.tsx`, rendered at
  `app/(storefront)/products/[slug]/page.tsx:205`).

## Measuring tooling (prerequisite for R9–R13)

R1. `scripts/verify-mobile-layout.ts` accepts `--sign-in <email>:<password>`. With it, the script
    authenticates against `/api/auth/sign-in/email` on `--base` and installs the resulting session
    cookie into the browser profile **before** the first measured page load, so a page gated on
    `session?.user` renders its signed-in branch. Without the flag the script behaves exactly as it
    does today (a guest, fresh profile).

R2. The script's header comment documents `--sign-in`, including that the password is read from the
    command line and that the flag is for local `npm run preview` use only.

## `#981` — tap targets, source level

R3. Three `data-tap-surface` hooks exist, because the measuring script reports a control **only**
    when it carries such a hook or sits inside one:
    - `components/product/QuickViewDrawer.tsx` carries exactly one
      `data-tap-surface="quick-view-body"`, an ancestor of the review form, the review list and the
      "Log in to leave a review" block;
    - `app/(storefront)/products/[slug]/page.tsx` carries exactly one
      `data-tap-surface="product-reviews"`, an ancestor of the review form and the "Log in to leave
      a review" paragraph;
    - `components/storefront/FeedbackForm.tsx` carries exactly one
      `data-tap-surface="feedback-form"`, an ancestor of its star input and submit button.

R4. In `components/product/QuickViewDrawer.tsx`, each of these four controls carries at least one
    tap utility together with an `lg:` reset on the same element, so it is at least 44×44 below
    `lg` and keeps its current size from `lg`:
    - the Submit review / Update review submit button;
    - the per-review Delete button;
    - the error state's Try again button;
    - the "Log in" link inside the "Log in to leave a review" block.

R5. In `components/product/StarRatingInput.tsx`, the per-star `<label>` is at least 44×44 below
    `lg` and keeps its current size from `lg`. The `Star` icon's own size classes
    (`STAR_SIZES`, `h-5 w-5` / `h-6 w-6` / `h-7 w-7`) are unchanged, so the visual star is the same
    size it is today at every width.

R6. In `features/reviews/components/ReviewForm.tsx`, the Submit review / Update review button is at
    least 44×44 below `lg` and keeps its current size from `lg`.

R7. `tests/tap-targets.test.ts` passes, and its `surfaces` map includes
    `components/product/QuickViewDrawer.tsx` → `quick-view-body`,
    `app/(storefront)/products/[slug]/page.tsx` → `product-reviews`,
    `components/storefront/FeedbackForm.tsx` → `feedback-form`, plus
    `components/product/StarRatingInput.tsx` and `features/reviews/components/ReviewForm.tsx`
    for their tap classes.

R8. No file under `app/`, `components/` or `features/` has a changed rendering at `lg` and above as
    a result of this slice: every class this slice adds is either prefixed with a breakpoint below
    `lg` or paired with an `lg:` reset on the same element.

## `#981` — tap targets, measured live

R9. Under `npm run preview`, signed in as the dev demo shopper, on a **category page whose grid
    renders at least one product card** (Quick View opens from a card, not from a product page),
    with the drawer opened at requested widths 360 and 390: the measuring script reports a non-empty
    set of entries under the `quick-view-body` surface, and every one of them has both `width` and
    `height` of at least 44.

R10. In the same runs as R9, at both widths, `viewportWidth` equals the requested width **and**
     `documentScrollWidth` equals the requested width. (The page does not scroll sideways, and the
     star row does not widen it — see `plan.md` for the 25px computation this guards.)

R11. Under `npm run preview`, signed in as the dev demo shopper, on a product page
     (`products/<slug>`) at requested widths 360 and 390: every entry under the `product-reviews`
     surface measures at least 44×44 — the set is non-empty and includes the review submit button
     and five star labels — and `viewportWidth` and `documentScrollWidth` each equal the requested
     width.

R12. Under `npm run preview`, **signed in** as the dev demo shopper (the page redirects a signed-out
     visitor), on `/feedback` at requested widths 360 and 390: every entry under the `feedback-form`
     surface measures at least 44×44, including five star labels, and `viewportWidth` and
     `documentScrollWidth` each equal the requested width. (`StarRatingInput` is shared with
     `components/storefront/FeedbackForm.tsx`; this is the accepted blast radius, verified rather
     than assumed.)

R13. Signed out, at requested widths 360 and 390, the Quick View drawer still renders the "Log in to
     leave a review" block, its "Log in" link measures at least 44×44, and `viewportWidth` and
     `documentScrollWidth` each equal the requested width.

## `#982` — the logo-less wordmark

R14. In `components/layout/Header.tsx`, the logo/wordmark container and the inner block that holds
     the name and locality both allow shrinking (`min-w-0` or equivalent), and the two name spans
     and the locality paragraph each truncate rather than overflow.

R15. The wordmark still renders the vendor's name at every width: no breakpoint hides the name
     spans or the locality. (Owner decision at Gate 1 — the rejected alternative was hiding the
     name below `sm`.)

R16. Under `npm run preview`, on the storefront home page of a vendor whose `logoStorageKey` is
     null, at requested widths 360 and 390: `viewportWidth` equals the requested width **and**
     `documentScrollWidth` equals the requested width.

R17. R16 also holds when that vendor's name is long: with the vendor's name temporarily set to a
     string at least as long as `Aheed Food Centre`, both values still equal the requested width at
     360. The name's rendered text is visibly truncated rather than wrapped onto a second row that
     changes the header's height.

R18. Under `npm run preview`, a vendor that **has** a `logoStorageKey` renders the same header as
     before this slice: the logo image is present, no wordmark initial tile is rendered, and the
     header's height at 360 equals the value in the spec folder's `baseline/` capture. That
     baseline is taken during Build, **before** any class in `Header.tsx` is changed, and is
     committed with the slice.

## Documentation, Gate 4, Gate 3

R19. `specs/design-system.md`'s "Touch targets" section is updated so that it no longer lists Quick
     View's review form, Delete, Try again and Log in controls under "Still outside the rule", names
     all three new surfaces (`quick-view-body`, `product-reviews`, `feedback-form`) alongside the
     existing ones, records that `StarRatingInput`'s star `<label>` is the tap target while the icon
     keeps its size, and records that a logo-less vendor's wordmark truncates rather than widening
     the page. Its `version` and `updated` front-matter fields are bumped.

R20. `npm run kms:validate` exits 0. `npm run kms:build-index` followed by
     `npm run kms:check-generated` exits 0. `npm run kms:assemble:internal`, then
     `npx next build --webpack` in `kms/site-internal`, exits 0.

R21. `CHANGELOG.md` is updated (Gate 4), with an entry naming `#981` and `#982`.

R22. `npm run lint`, `npm run typecheck`, `npx vitest run` (run alone), `npm run format:check` and
     `npm run build` all exit 0 after this slice.
