# P7.5c+f — Per-vendor storefront identity (build notes)

Written at the end of Build, **before** the Clear. The validating context is fresh and has only the
spec, the artifact, and this file.

## What changed and why

**The slice has three halves that share one validation rig.** Copy, promotions and colour are
independent changes, combined because none of them can be proven by the test suite: `brandStyle()`
injects per-vendor CSS custom properties as an **inline style on the root element**, which outranks
`tokens.css` on specificity, and the copy/promo changes are per-vendor data that only differ when a
real request resolves a real host. Everything load-bearing here is observable only in live rendered
HTML for two hosts.

**Copy (#239).** `components/layout/Header.tsx` and `app/(storefront)/page.tsx`. The inventory taken
at `/propose` found ~12 hardcoded strings; the shape the fix took is *classification*, not
columnisation:

- The hero's `Free Delivery Over £30` became `formatPrice(freeDeliveryThresholdPence)`. **This was a
  data bug wearing a copy bug's clothes.** Aheed's threshold genuinely is £30, so the literal was
  accidentally correct for the vendor it was written for, and silently wrong for SriMart at £50 —
  the kind of defect that survives review because the page looks right to whoever is looking. A
  minimum-order badge follows the same rule. Both disappear when the underlying value says the rule
  doesn't apply (`null` threshold, `0` minimum), which is why they are two separate guards rather
  than one block.
- `100% Certified Halal Meat` and `Same-Day Local Dispatch` were **deleted rather than made
  per-vendor**. The first has a proper home (`bannerNote`); the second is a service promise nothing
  in this system can substantiate for any vendor, so making it configurable would just distribute
  the problem.
- The four trust tiles became three, each a claim about the **platform** that is checkable against
  this repo: delivery to the vendor's own `localityName`, Stripe card payment (`lib/payments.ts`),
  order-status email (`lib/email.ts`). This is why `HeartHandshake`/`CheckCircle2` left the imports
  and `CreditCard`/`BellRing` arrived.
- Only genuine vendor identity became columns: `VendorConfig.bannerNote` and `.heroSubtitle`, both
  nullable, both **hiding their element when null**. There is no neutral fallback because
  platform-written marketing is still a claim made on a vendor's behalf.

**Three copy surfaces the issue never named**, all found by grepping the *source* during Build
rather than by reading #239's list:

1. `Header.tsx`'s search-placeholder fallback — `"Search vine tomatoes, halal lamb chops, basmati,
   lentils..."`. Only fires when no vendor resolves at all (the repository already substitutes the
   neutral `DEFAULT_SEARCH_PLACEHOLDER`), but a platform default naming one vendor's trade is the
   same defect.
2. The hero `h1`'s tagline fallback — `"Fresh Produce, Halal Meat & Cultural Staples."` Now the
   vendor's name. **This is the one slot that keeps a fallback rather than hiding**, because it is
   the page's `h1` and an empty `h1` is an accessibility defect.
3. `Header.tsx`'s logo-fallback wordmark — `{localityName} Groceries`, which rendered **"Reading
   Groceries"** under SriMart's name. It only appears for a vendor with **no `logoStorageKey`**,
   which is exactly why it survived: Aheed has a logo, so nobody looking at Aheed ever saw it.

**Promotions (#233).** `components/layout/PromoSlider.tsx` is **deleted**. It held a static array of
three invented offers — `"Get up to 20% off on all fresh produce this weekend only."`, `"Fresh
spices, lentils, and cultural staples just landed in store."`, `"Bulk Buy Discounts"` — rendered on
every vendor's homepage. Beyond being Aheed's voice on SriMart's site, it **advertised discounts
nothing backs**: SriMart has zero `DiscountCode` rows by design, and neither vendor has a "20% off
fresh produce" promotion in the engine. Its slide backgrounds were raw Tailwind gradients
(`from-amber-500`, `from-emerald-600`), so it ignored vendor branding entirely.

Replaced by `VendorPromotion` (1:N) → `lib/repositories/promotions.ts` →
`lib/promotions-service.ts` → `components/layout/PromoCarousel.tsx`, occupying the hero's image slot.
The hero's left column (tagline, subtitle, badges, **postcode deliverability checker**) is untouched
— the checker is real functionality, not decoration, and a "refactor the hero into a carousel" that
removed it would have been a regression.

**Colour (#255).** New zero-import `lib/color-contrast.ts` and a rewritten `brandStyle()` in
`lib/vendor-theme.ts`. The measured outcome, which is the point:

```
Aheed   #4caf50  2.78:1  ->  #1e8929  4.50:1   (still green)
Aheed   #f57c00  2.70:1  ->  #ba5d00  4.51:1   (still orange)
Aheed   #d32f2f  4.98:1  ->  unchanged          (already compliant)
SriMart #1e88e5  3.68:1  ->  #0078d3  4.54:1   (still blue)
SriMart #8e24aa  7.04:1  ->  unchanged
--color-primary (both vendors)  ->  unchanged (7.87:1 / 8.63:1)
```

Both vendors are visibly distinct **and** compliant — which is what #251 had to give up and what
#255 asked to get back.

**Persistent docs**, updated on this branch because a future session reads them and not this folder:
`specs/decisions/ADR-004-multi-tenancy.md` decision 5 (v1.4.0 → **1.5.0**) and
`specs/design-system.md` (v1.7.1 → **1.8.0**).

## Decisions taken during the build

**Deterministic promo ids instead of a `@@unique` constraint, for seed idempotency.**
`VendorPromotion` has no natural unique key. Adding `@@unique([vendorId, sortOrder])` would have
given upsert a target, but it would also permanently forbid two promotions sharing a position —
a schema constraint bought purely to make the seed convenient. Instead the seed carries literal
UUIDs (`5217a4a7-0000-4000-b000-0000000001xx`), matching the existing `AHEED_VENDOR_ID` /
`SRIMART_VENDOR_ID` convention. Verified by running the seed twice: 3 and 2 rows both times.

**The seed's promo `update` set deliberately excludes `imageKey` and `altText`.** Same reasoning as
the existing discount-code upsert: the seed declares the *copy*, but artwork is something an owner
uploads afterwards, and a re-seed must not wipe it. Title/description/linkUrl/sortOrder/isActive
*are* reset, matching how loyalty tiers are treated.

**Slide backgrounds cycle `bg-primary` → `bg-action` → `bg-accent`.** These are the three semantic
tokens now guaranteed AA against white by the clamp, so white slide text is safe by construction for
any vendor. Rejected: storing a colour per promotion (a second colour system outside the token
layer, un-clamped, and exactly the class of thing ADR-004 decision 5 exists to prevent).

**Chroma reduction rather than RGB clipping for out-of-gamut OKLCH.** Clipping channels is one line
shorter and shifts hue — which would silently defeat the only property the whole module exists to
preserve. A vendor's blue becoming a slightly different blue would pass every contrast assertion and
still be wrong.

**The clamp searches in both directions and never throws.** `clampForContrast` asks whether black or
white can satisfy every background before binary-searching, because a foreground can be trapped
between a light and a dark background and a naive one-directional loop would spin. When neither
extreme works it returns the better of the two rather than throwing: an under-contrast button is a
defect a test should catch; a 500 on the storefront is worse. **Nothing currently exercises that
branch** — every background in play is light — which is noted below.

**`--color-primary` is clamped against five surfaces, not one** (white, the vendor's cream, and all
three tints), because `bg-action-tint text-primary` really is rendered in the trust strip. Clamping
against white alone would have left the others unguarded.

**Hover shades are derived then re-clamped**, rather than derived from the raw primitive. `tokens.css`
defines no `--color-danger-hover`, so only two are emitted; inventing a third would have put a token
in the inline style that no stylesheet declares.

**The carousel auto-rotates with a pause control**, rather than not rotating at all. R22 permits
either. Rotation preserves the old component's behaviour (multiple offers get seen), and SC 2.2.2 is
satisfied by a control that is **always visible** — not revealed on hover, since a control a keyboard
or touch user cannot find does not satisfy the criterion. Also pauses on hover/focus and starts
paused under `prefers-reduced-motion`.

**`lib/promotions-service.ts` memoizes the result with React `cache()`, not the Prisma client.**
Matches `getCurrentVendorProfile`; `getPrisma()` is still constructed per call, so nothing pins an
I/O object across requests (the #187 failure mode).

## Deviations from the spec

**Three spec corrections, all written back into the spec files themselves** (not just recorded here):

1. **R26/R27 split — `#d32f2f` was wrong to include.** R27 originally required the clamp's result to
   *differ* from its input for all four listed primitives. Aheed's red measures **4.98:1 and already
   passes**, so the requirement was demanding the clamp damage a compliant colour. Caught by the
   first test run. R26 now keeps all four (all clear AA afterwards); R27 covers only `#1e88e5`,
   `#4caf50`, `#f57c00` — the three that measurably fail — and a separate assertion pins that
   `#d32f2f` comes back untouched.
2. **R18 retargeted — the P4a trap, fourth occurrence in this repo.** It forbade any file under
   `app/`/`components/`/`features/` "referencing" `PromoSlider`. `PromoCarousel.tsx`'s doc comment
   names it twice, deliberately, to record what it replaced and why the unpausable auto-rotation was
   not copied across. A bare-word grep could only be "passed" by deleting that explanation. Now
   targets `^import.*PromoSlider` and `<PromoSlider`.
3. **`validation.md` preflight P2 gained the seed gate** (see below) and the `PrismaNeon` adapter
   requirement, both discovered by running the preflight during Build.

**One in-scope addition beyond the requirements' literal text:** the three extra copy surfaces listed
above (search-placeholder fallback, tagline fallback, wordmark "Groceries"). R12/R17 are written
against *rendered output*, and the wordmark one would have failed R17 for SriMart, so this is the
requirements being satisfied rather than scope widening. The other two are the same defect class in
code paths R17 doesn't reach; fixing them alongside was cheaper than filing an issue to do it later.

**No `VendorBranding.heroImageStorageKey`.** The original spec draft (pre-`/propose` revision) had a
single hero-image column; the approved decision replaced it with the 1:N table. The spec files were
rewritten before commit, so this is a deviation from an earlier *draft* only — noted because the
issue title on #263 still mentions "hero image", and it is satisfied by promo `imageKey`.

## Known-shaky areas

**1. Nothing here has been seen in a browser.** Build ran `lint`, `typecheck`, 512 tests and
`next build --webpack`, and never started `npm run preview`. The carousel's transform-based sliding,
the two-column hero collapse at `lg:`, and the pause control's actual behaviour are all unverified
visually. **The pause control and `prefers-reduced-motion` need a real browser** — no lint rule
checks SC 2.2.2, so `npm run lint` exiting 0 says nothing about R22.

**2. The seed gate is the single most likely cause of a false failure.** `npm run db:seed` **does not
seed SriMart**: `prisma/seed.ts` hides the entire second vendor — catalogue, satellites, and this
slice's copy and promotions — behind both `SEED_AHEED_HOST` and `SEED_SRIMART_HOST`, and neither is
set in `.env`. The seed logs success for Aheed and exits 0. If R17/R23 fail, check `VendorConfig`'s
columns are non-`NULL` for SriMart **before** concluding the code is wrong. `validation.md` P2 now
carries the exact command. Filed as **#276**.

**3. `localhost` resolves to Aheed in the dev branch.** A bare `curl http://127.0.0.1:8787/` is an
*Aheed* request, not a neutral one. Every two-vendor row needs an explicit `Host:` header for **both**
vendors, not just for SriMart — otherwise "Aheed's page looks right" is being read off a request that
was never SriMart's.

**4. The positive hero-image path is the least-exercised code in the slice.** Both vendors seed
`imageKey: null`, so the `<img>` branch of `PromoCarousel` renders in no test and in no seeded state.
R20 exercises it by temporarily pointing a row at an existing `ProductImage.storageKey`. Related:
`.env` sets `S3_BUCKET="aheed-images-dev"` but `CDN_BASE_URL="https://images.staging...."` — the
composed URL is still correct (which is what R20 asserts), but the image itself will not load
locally. Filed as **#277**; see also #235.

**5. `clampForContrast`'s "neither extreme works" branch is dead code today.** Every background in
play is light, so the darkening path always succeeds. The branch exists for correctness and is
covered by no test, because constructing a case needs a background pair no vendor has. If a future
vendor gets a dark `cream`, this is where to look first.

**6. Only two vendors exist, and both were *seeded* by this branch.** Every colour and copy assertion
is against Aheed and SriMart. A vendor whose satellites are unseeded takes the `?? null` paths in
`fetchVendorProfile` and the `DEFAULT_BRAND_PRIMITIVES` fallback — reachable in principle, exercised
nowhere.

**7. One full-suite run failed with `tests/vendor-profile.test.ts` timing out at 5000ms**, on the
first run after `prisma generate`; it passed alone and on every subsequent full run (512/512, 8–15s
versus that run's 62s). Treated as load flake, not a regression, but if it recurs in CI it is not
this slice's change to `fetchVendorProfile`'s `select` — that test mocks `@/lib/db` entirely.
