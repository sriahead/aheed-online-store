# #981, #982 — Mobile finish: Quick View review tap targets and the logo-less header wordmark (build notes)

Written at the end of Build, **before** the Clear. This is the one artifact the Clear bets on:
the validating context is fresh and has only the spec, the artifact, and this file.

Branch `feature/981-982-mobile-finish`, cut from `origin/staging` at `85f55eb`.

- Spec commit: `5531f68`.
- Implementation commit: `d2de5f9`.
- This file, the CHANGELOG and the handoff are in the commit after that.

Nothing has been pushed, and no PR is open yet.

## What changed and why

### `#981` — the tap targets

- **`components/product/StarRatingInput.tsx` is where most of the value is.** The per-star
  `<label>` carries `min-h-tap min-w-tap … lg:min-h-0 lg:min-w-0`. The label is the real tap
  target: the `<input type="radio">` is `absolute inset-0 h-full w-full opacity-0`, so it fills
  whatever box the label has. `STAR_SIZES` is deliberately untouched, so the visual star is the
  same size it has always been — this is `design-system.md`'s "small visual, large hit area" rule
  applied to a label rather than a button. One component fixes the stars on all three surfaces.
- **That same row now carries `flex-wrap`.** Five 44px stars fit; the stars *plus* the rating
  label do not. See the measurement under Decisions.
- **`components/product/QuickViewDrawer.tsx`**: `data-tap-surface="quick-view-body"` on the
  Reviews & Ratings section, and the tap size on Submit/Update review, each review's Delete, the
  error state's Try again and the signed-out Log in link.
- **`app/(storefront)/products/[slug]/page.tsx`**: `data-tap-surface="product-reviews"` on the
  review `<section>`, plus the tap size on its own per-review Delete button and its signed-out
  Log in link. **This surface is the scope addition the spec folded in at Gate 1** — the product
  page renders the same `ReviewForm` and the same `StarRatingInput`, so the defect existed twice.
- **`features/reviews/components/ReviewForm.tsx`**: the tap size on its submit button.
- **`components/storefront/FeedbackForm.tsx`**: `data-tap-surface="feedback-form"` and the tap
  size on its submit. It is in scope only because it shares `StarRatingInput`; the accepted blast
  radius is verified rather than assumed.
- **`tests/tap-targets.test.ts`** gains the three new surfaces. `StarRatingInput.tsx` and
  `ReviewForm.tsx` are entered with an **empty** hook array: they carry tap classes but no hook of
  their own, because they render inside a hooked ancestor. The existing loop reads an empty array
  as "no hook to assert" and still runs the tap-utility check, so no test change was needed.

### `#982` — the wordmark

- **`components/layout/Header.tsx`**: the brand container swaps `shrink-0` for `min-w-0`, the inner
  name/locality block gains `min-w-0`, the enclosing `<Link>` gains `min-w-0`, and both name spans
  and the locality `<p>` gain `truncate`. The logo `<ImageWithFallback>` takes the `shrink-0` that
  left the container, so the logo path keeps its exact reserved footprint (`#329`'s header jerk
  and `#655`'s fallback both depend on that box not moving).
- **`shrink-0` was not load-bearing for the documented reason.** The comment above that container
  explains `h-10 overflow-clip` — the cap that stops a browser extension's injected element
  stretching the row (`#333`, Coupert). It says nothing about `shrink-0`, which was what forbade
  the block from giving way and so widened the whole document instead of clipping.

### Tooling

- **`scripts/verify-mobile-layout.ts` gains `--sign-in <email>:<password>`.** It loads `/`, then
  POSTs to `/api/auth/sign-in/email` from inside the page so Better Auth's `Set-Cookie` lands in
  the profile Chrome is already using, then throws with the HTTP status if that fails rather than
  silently measuring a signed-out page. The split is on the **first** colon so a password
  containing `:` still works. Header comment documents it, including that it is local-only.

### Persistent docs

- **`specs/design-system.md` 1.17.0**: the three new surfaces added to the Touch targets list, the
  review controls removed from "Still outside the rule", the star-label rule, the wrap rule with
  its measurement, a note that a signed-in control needs `--sign-in`, and a new section recording
  that the header wordmark truncates.

## Decisions taken during the build

- **The star row wraps; the stars do not shrink.** Measured at 360px: Quick View's drawer content
  is `p-5` and the review form `p-4`, leaving **288px**. Five 44px stars plus four 2px gaps is
  **228px** (fits, 60px spare), but the row's `gap-2.5` plus the rating label's `min-w-[75px]`
  needs **313px** — a 25px overflow. At the old 32px stars the same row was 253px, which is why
  this never appeared before. Rejected: shrinking the stars below 44 (defeats the slice), and
  hiding the rating label below `sm` (it is the only text that names what the rating means).
  `flex-wrap` keeps every star at 44 and drops the label to its own line.
- **`min-w-tap` on the two Log in links, added after the first live run.** The spec and I both
  assumed `min-h-tap` was enough for an inline link. The signed-out measurement came back
  **41×44** — the text is only 41px wide. Caught by measuring, not by reading. Both links now
  carry `min-w-tap … lg:min-w-0`.
- **The logo keeps `shrink-0`, moved onto the image itself** rather than loosening the container
  and hoping. R18 demanded the logo header be unchanged; this makes that structural instead of
  incidental, and it measured identical (header height 190 at 360, same as the baseline).
- **The `--sign-in` fetch runs in the page, not in Node.** A Node-side fetch would have meant
  parsing `Set-Cookie` and injecting it via `Network.setCookie` — more code and more to get wrong
  about domain/path/SameSite. Running it in the page lets the browser do its own cookie handling.
- **Baselines are committed.** `baseline/` holds four captures: Aheed with its logo, SriMart
  (logo-less, short name), Aheed logo-less with its real name, and Aheed logo-less with a long
  name. The last is the one that proves the defect; the first is R18's comparison value.
- **The dev fixture toggle was a temporary script, deleted after use.** Its whole content is in
  Known-shaky areas below so a validator can recreate it in a minute rather than reinvent it.

## Deviations from the spec

None in the requirements. Two notes:

- **R17's premise needed correcting, not the requirement.** The spec says to set the vendor's name
  to "a string at least as long as `Aheed Food Centre`". That exact name turned out **not** to
  overflow (see Known-shaky areas), so the Build used a 36-character name to reproduce the defect.
  R17's wording ("at least as long as") still holds; a validator who uses exactly
  `Aheed Food Centre` will measure a pass that proves nothing. Use a longer name.
- **`#981` named five controls; six were fixed per surface.** The product page's own Delete button
  and Log in link are not in the issue's list because the issue only considered Quick View. They
  are the same defect on the surface Gate 1 folded in, so they were fixed rather than left as a
  visible inconsistency. No requirement forbids this and R11 would have failed without it.

## Known-shaky areas

- **`#982`'s original repro does not reproduce, and the issue's own text is now wrong.** `#981`/
  `#982` were filed during slice 5, which observed the wordmark widening a 360px page to 382px
  with Aheed's name. On current `staging` that case measures **360/360 — no overflow**; the header
  has changed since (the search moved to its own row). The defect is only reachable with a longer
  name: a 36-character logo-less name rendered a requested 360px viewport at **477px**. If a
  validator tests with `Aheed Food Centre` alone they will see a pass on unfixed code too.
- **That 477px case is also the `viewportWidth` trap, live.** Both `viewportWidth` and
  `documentScrollWidth` read **477** — equal to each other, 117px past the requested width. A
  check comparing the two fields to each other reports a clean pass on a badly overflowing page.
  Compare each against the width you requested.
- **Two of `#981`'s controls were never measured live, only source-guarded.** Quick View's
  **Try again** renders only when the drawer's product fetch fails, and **Delete** only when the
  signed-in shopper already has a review on that product. Neither appeared in any run. R4 is the
  static guard that covers them; if validation wants them live it needs a seeded review and a
  forced fetch failure.
- **The star labels report an empty `name`** in the script's output (the `aria-label` is on the
  radio inside, not the label). They are identifiable only by `hitArea: "label"` and there being
  five of them. Not a defect — but do not expect to find them by name.
- **Recreating the dev fixture toggle for R17.** A temporary `scripts/_tmp-vendor-logo.ts` did
  this; `logoStorageKey` and `name` live on **`VendorBranding`**, keyed by `vendorId`, not on
  `Vendor` (an easy wrong turn — I took it). Aheed is `a4ed0000-0000-4000-a000-000000000001` and
  its seeded logo key is `vendors/a4ed0000-0000-4000-a000-000000000001/logo.png`. The script built
  its client the way `scripts/verify-data-rights.ts` does (bare `@prisma/client` plus
  `PrismaNeon`, never `@/lib/db`, which Node cannot load) and used singular `update` calls.
  **Both fixtures were restored and read back after the run**; the committed baselines were taken
  around that.
- **The full suite was green on the first run here** (218 files, 2830 tests), but `#983`
  (`tests/add-to-cart-feedback.test.tsx`) and the file-scanning source tests remain known flakes
  under load — re-run a failure alone before treating it as a regression.
- **Nothing here was exercised on a real device.** Headless Chrome at an emulated 360px proves
  geometry, not a finger; that is `#440`'s territory and explicitly out of scope.
