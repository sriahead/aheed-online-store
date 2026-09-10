# Mobile nav visibility and Value Bundles card size (build notes)

Written at the end of Build, before Validate. Applied directly per the owner's "fix these before
continuing" request, in the same session as the `social-contact-surface` slice — not because that
slice caused either defect (both predate it, confirmed by `git log` on the touched files), but
because the owner found them while reviewing that slice's own staging deploy.

## What changed and why

**`components/layout/Header.tsx`.** The "Shop" (`/categories`) and "Shop List"
(`/shop-your-list`) nav links were `hidden lg:flex` — completely absent from the DOM below 1024px,
on every route, with no mobile equivalent anywhere in the codebase (no bottom nav, no hamburger
menu — confirmed by grep, nothing matches). The account/sign-in control and the cart trigger in the
same file already solve this correctly: icon always visible, text label wrapped in
`hidden sm:inline`. Applied the identical pattern to both links rather than inventing a new one.
Tightened padding (`px-2 sm:px-3`) and the nav row's gap (`gap-1.5 sm:gap-2`) slightly, since the
row now carries two more always-visible controls than before on phone widths — estimated from the
other elements' known dimensions (see "Known-shaky" below; not confirmed in a browser).

**`components/layout/PostcodeChecker.tsx`.** The `badge` variant (rendered on every non-landing,
non-portal route) was `hidden lg:inline-flex` — same defect. Already compact (one icon, a few
characters of postcode), so no icon-only intermediate step was needed; just removed the breakpoint
gate. Padding nudged from `px-3` to `px-2.5` for the same reason as above.

**`components/bundle/BundleRow.tsx`.** `itemWidthClassName` was `[&>*]:w-72 [&>*]:shrink-0
sm:[&>*]:w-80` (288px/320px) against `ProductRow`'s `[&>*]:w-40 [&>*]:shrink-0 sm:[&>*]:w-44
lg:[&>*]:w-52` (160px/176px/208px) for the same page's other card row — nearly double. Now
byte-identical. `BundleCard` already shares `ProductCard`'s content padding (`p-3.5`) and
`.skew-card` treatment, so no change was needed there — the mismatch was purely the outer width.

## Decisions taken during the build

**Icon-always/label-hidden-below-sm, not a new mobile nav surface.** A bottom tab bar or hamburger
menu would also solve reachability, and might end up the more scalable answer as more header
controls accumulate — but that is a bigger decision than a same-session bug fix should make
unilaterally. The chosen fix reuses a pattern this exact file already committed to for two other
controls, so it costs nothing structurally and is trivially reversible if the owner later wants
something more elaborate.

**`BundleCard`'s internal content was left untouched.** At the narrower width its constituent-item
list and "Add all N to basket" button may wrap onto more lines than before. That makes the card
taller, not narrower-than-its-content — expected, and not something "same size as the other cards"
asked for changing. No test asserts the card's literal height or button text (checked:
`tests/horizontal-scroller.test.tsx` only comments on `BundleCard` rendering an `<li>`).

## Deviations from the spec

None — the three className changes match `plan.md`'s scope exactly.

## Known-shaky areas

**Nothing in this slice was visually confirmed in a browser.** No browser tool was available in the
building session. What WAS confirmed: `npm run build` succeeds, and the specific utility classes
involved (`hidden`, `sm:inline`, `flex`, `inline-flex`, `px-2`, `px-2.5`, `gap-1.5`, `sm:gap-2`,
`w-40`/`w-44`/`w-52`) are present in the generated CSS output — ruling out the documented "Tailwind
silently never generated this class" failure mode, but not proving the row actually fits or looks
right at a real 320-414px phone width. The mobile-row width estimate in the padding/gap tightening
above is arithmetic from the other header elements' known Tailwind classes (icon size, padding,
gaps), not a measurement.

**The cart trigger does NOT occupy space in this header row** — it is `fixed bottom-6 right-6`
(`components/cart/CartDrawerShell.tsx`), a floating action button outside normal document flow. The
header nav row's mobile-width budget only has to fit Shop, Shop List, the postcode badge, and
account/sign-in — four controls, not five. Worth recording because it is easy to double-count the
cart button as part of this row's crowding risk when it visually sits nearby but isn't actually in
it.

**Suite totals unchanged: 118 files / 1589 tests.** No test file added or removed by this slice; no
existing test's count moved (`tests/horizontal-scroller.test.tsx` doesn't assert the specific width
class, and no test targets `Header.tsx`/`PostcodeChecker.tsx` directly — confirmed by grep before
starting).

**Ask the owner to re-check all four originally-reported pages/breakpoints on staging once this
ships**, and treat the visual half of R1-R5 as open until they confirm — this build-notes file says
so rather than claiming a check that didn't happen.
