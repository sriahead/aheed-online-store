# Deferred-abstraction sweep (build notes)

Implements `requirements.md` R1–R45 for **#662**, closing **#656**, **#653**, **#351**, **#639**,
**#75** and the derivation half of **#398**. Three commits on
`feature/deferred-abstraction-sweep`: `3532dd8` (spec), `cdb444e` (a mid-build spec correction,
below) and `c2b6569` (implementation).

Built by three agents in parallel — radius, primitives + card, branding + theme — then unit pricing
sequentially, since it depended on all three. Persistent docs (`specs/design-system.md`,
`ADR-004`, the operator guides, `CLAUDE.md`, `CHANGELOG.md`) were written by the integrating
context, not delegated, so their voice stays consistent with what is already there.

## What changed and why

**#653 — the radius fix is a retirement, and that direction is the whole point.** Tailwind v4's
`@theme` *merges* with its default scale rather than replacing it, so overriding only `--radius-sm`
and `--radius-md` made `rounded-sm` identical to `rounded-lg` and `rounded-md` identical to
`rounded-2xl`, while the two most-used radii in the app (`rounded-2xl`, 141 uses; `rounded-xl`, 94)
named no token at all. The obvious reading of "fix the scale" is to break the tie by choosing new
values — which restyles real screens days before UAT. So the 37 `rounded-sm`/`rounded-md` call
sites were rewritten to their **identical-rendering** twins and those two tokens retired.
`tests/radius-scale.test.ts` resolves every `rounded-*` utility in use (tokens.css first, Tailwind's
default otherwise) and fails if two distinct ones collide.

**Bare `rounded` is declared, and the reason is a corrected factual error.** The building agent's
test asserted that bare `rounded` "compiles to a fixed `0.25rem` literal, not a variable reference,
unaffected by any `--radius` theme override," and stated it had confirmed this by compiling through
`@tailwindcss/postcss`. That is wrong: the whole rounded family registers `themeKeys: ["--radius"]`
in `node_modules/tailwindcss/dist/lib.js`, and Tailwind's own default theme sets `--radius: 0.25rem`
(`theme.css:508`). Left as written, bare `rounded` (8 uses) would have been the one radius still
depending on an un-overridden default — failing R3 — with a test comment asserting the opposite.
Both the comment and `declaredTokens()`/`resolveStep()` were corrected, and `--radius: 0.25rem` was
added to `tokens.css` at its current value so nothing moved. **This is the CLAUDE.md lesson about a
docstring laundering an unenforced claim, recurring**: the test's own assertion was sound, but its
prose opined on a neighbouring fact it had got backwards.

**`/fix` (2026-09-08) — `declaredTokens()` itself had a second, more serious defect: it parsed
`tokens.css` without stripping comments first.** The explanatory comment added above the token
declarations (the previous paragraph's fix) quotes the literal string `` `--radius: 0.25rem` `` in
prose — the regex `/--radius(?:-...)?:\s*([^;]+);/g` matched that occurrence *inside the comment*,
then greedily captured everything up to the next `;`, which is the real declaration's own
terminator. The `DEFAULT` (bare `rounded`) token's parsed value was silently corrupted into a
garbage multi-line string instead of `"0.25rem"`, which meant the collision check could never see a
collision on that step — confirmed at `/validate`: reintroducing `rounded-sm` into
`components/product/ProductCard.tsx` (which now falls to Tailwind's un-overridden default of
`0.25rem`, genuinely colliding with bare `rounded`) left the test's 3 assertions all green. This is
the reverse of the CLAUDE.md/`sdd-workflow.md` "grep bites its own explanatory comment" trap
recorded throughout this repo (which causes a false FAILURE) — here an unrelated parser silently
absorbed the comment as if it were code, causing a false PASS on a real, provable defect. Fixed by
stripping `/\*[\s\S]*?\*\//g` before running the token regex in `declaredTokens()`. Re-verified the
same way `/validate` found the bug: reintroduce `rounded-sm`, confirm the test now fails naming the
`rounded`/`rounded-sm` pair, revert. `validation.md`'s own R4 row was also corrected in the same
commit — it named `rounded-md` as the probe, which no longer collides with anything post-fix (`md`
is no longer overridden at all, so it falls to Tailwind's default `0.375rem`); `rounded-sm` is the
probe that actually demonstrates a live collision, and is now what the row says.

**#656 — `lib/form-classes.ts` is the floor this builds on, not a thing to redo.** That module
shipped hours earlier (#649/#650) and had already deduplicated `inputClass`, `labelClass`,
`errorInputClass`, `buttonClass` and `uppercaseInputClass`; its own doc comment names #656 as the
follow-on. So `components/ui/`'s three primitives add **markup** on top and import those strings
rather than re-declaring them. All three are server components — progressive enhancement is
load-bearing here, and a primitive needing client JS to render a field would remove a capability.
`FormField` generalises the `fieldProps(name)` closure the staff forms adopted in #650 so a field
cannot be styled invalid without also being announced invalid.

**#351 — the fix converged on a shape already in production.** `ProductCard`'s whole-card `<Link>`
carried both `.skew-card` and Tailwind's `group`, with `AddToCartButton`/`CartQuantityStepper`
rendered inside it — invalid HTML whose correctness rested on every handler calling
`stopPropagation()`. `BundleCard` already carried `.skew-card group` on a plain `<div>`, and every
`.skew-card*` rule in `app/globals.css` is class-keyed with no tag selectors, so moving those
classes to a `<Card variant="product">` wrapper and putting a stretched link (`after:absolute
after:inset-0`) on the title needed **no CSS change at all**. Both `stopPropagation()` calls are
gone; `preventDefault()` stays.

**#639/#75 — the write path was already built and unused.** `lib/repositories/vendor.ts`'s
`BRAND_FIELDS` loop has always written whichever of the eight brand primitives are supplied;
`StorefrontConfigForm` supplied two. The `initialConfig: any` / `initialBranding: any` props are
what hid that — the row objects always carried all eight at runtime. Typing the props and surfacing
the six unused fields really was one piece of work, as #639 said. The `Theme` catalogue then sits on
top: selecting a theme **copies** its eight values onto the vendor's row, `lib/vendor-theme.ts` is
untouched and `brandStyle()` performs no join, so every existing contrast clamp applies unchanged
and a vendor can edit one colour afterwards without the picker fighting them.

**#398 — two derived values, because they answer different questions.** `unitLabel` was free text,
written from one form field, validated only for non-emptiness and parsed by nothing anywhere in the
repo. `components/product/unit-price.ts` now derives the **displayed** price exactly at render time
from `basePrice` and net content, while `Product.unitPricePencePerBaseUnit` is a denormalised
whole-pence **sort key**, written by the create and update paths and never displayed. The issue
framed these as either/or; taking both is what stops a rounding artefact in the sort key from
reaching a price a shopper reads, which for a Price Marking Order exposure is the entire point.

## Decisions taken during the build

- **`Theme` carries no `vendorId`.** A curated catalogue exists to be reused *across* vendors and
  holds no tenant data, so there is nothing for Decision 2's filter to protect. Recorded as an
  explicit exception in `ADR-004` **and** as a comment on the model, because an un-scoped table in a
  row-scoped schema otherwise looks exactly like the defect that rule forbids. The ADR names the
  condition that would end the exception: a vendor's own saved palette.
- **Selecting a theme copies rather than references.** Resolving through the FK at render time was
  rejected: it buys a join on every request's hot path in exchange for making divergence *harder*,
  which is backwards for a starting-point catalogue. `themeId` records provenance, not authority.
- **`NetContentUnit` is `GRAM`/`KILOGRAM`/`MILLILITRE`/`LITRE`/`EACH`, and the amount is a whole
  number in the chosen unit's own scale.** A half-kilogram product is typed as `500 GRAM`, never
  `0.5 KILOGRAM` — no fractional amounts, matching the integer-pence discipline.
- **Net content is all-or-nothing.** An amount with no unit, or a unit with no amount, is refused
  with the offending field named; neither half prices anything alone.
- **`listProductsByUnitPrice` excludes null rows and is deliberately not wired into `findPage`.**
  Postgres would otherwise surface every unpriced row first under `ASC`.
- **The primitives' adoption targets were chosen to avoid concurrent-agent collisions**, not by
  design merit: `Card` at `ProductCard` plus two staff pages using the exact duplicated string,
  `Button` at the two files that already imported `buttonClass`, `FormField` at three staff forms.

## Deviations from the spec

- **`scripts/verify-unit-price-sort.ts` is committed, where `validation.md`'s R37 row says to write
  a scratch script and delete it afterwards.** `scripts/verify-repository-injection.ts` is a
  committed precedent for exactly this kind of harness, and a check that has to be re-authored from
  memory to re-run is a check nobody re-runs. Flagged rather than assumed: if the reviewer prefers
  the spec's letter, deleting the file costs nothing and R37 is still provable by hand.
- **Four `validation.md` rows were corrected mid-build**, committed separately as `cdb444e` to match
  how #537 corrected its own R2 and #539 its R9. R17, R20, R23 and R35 each grepped for a bare
  substring that a *correct* implementation matches — `Json` inside the `Theme` model's own "never
  Json" comment; `name="brand..."` as a JSX literal when the eight fields are data-driven through
  `.map()`; `Theme` inside a file *named* `vendor-theme.ts`; `OrderItem` in a schema diff's context
  lines. The requirements were right; only the rows verifying them were wrong. Left unfixed, the
  post-Clear validator would have read a correct build as four failures.
- **The theme picker is a client-side `onClick`, not a progressive-enhancement form.**
  `StorefrontConfigForm` is already a client component (`useState`, `startTransition`,
  `router.refresh()`), so this matches the file; but it does mean the picker alone does not work
  with JavaScript disabled. The eight colour inputs and the delivery-rules form are unaffected.
  Noted rather than filed, because it is consistent with the component as it already existed.

## Known-shaky areas

- **Nothing here has been exercised under `npm run preview`.** Every live row in `validation.md` —
  the real form submissions, the two-vendor palette comparison, the theme apply-then-edit
  divergence check, the derived unit price on a real product page — is untouched by Build, by
  design. That is the largest single block of unverified surface.
- **`validation.md`'s "Before you start" note 2 matters here.** Do **not** assume the
  `nocaped.com` hostnames; query `VendorDomain` in the database the preview server is actually
  pointed at. That assumption cost a round trip at #649.
- **Agent C restored Aheed's branding row by hand** after live-testing `applyThemeToVendor` against
  the dev database. If the palette looks wrong on Aheed under preview, suspect residue from that
  restore before suspecting the code.
- **`tests/repository-transaction-safety.test.ts` (#538) fails under full-suite load** and passes in
  1.8s alone. Pre-existing, but this slice added exports to two of the `lib/repositories/` files it
  parses, so it is closer to the edge than it was. A file-count shortfall is the forks-pool trap;
  this one is a real 5000ms timeout and reports as a failure. CI's Linux runners are the authority.
- **The unit-pricing agent stalled** (watchdog, 600s) after finishing most of its work. Its output
  was verified against R28–R37 by the integrating context rather than by the agent itself — the
  migration, the two-function split, `OrderItem` being byte-identical, `PRODUCT_FIELDS` wiring and
  both display fallbacks were all checked directly. Worth a second look at anything it touched that
  R28–R37 do not explicitly name.
- **`hover:bg-primary/90` on the new Apply Theme button** is an alpha modifier on a themed
  background. It passes `tests/token-alpha-purity.test.ts`, which scopes to *foreground* utilities
  only, but it is the same class of not-a-token-equivalent debt as **#641**. New code, small, and
  out of this slice's requirements — filed rather than fixed.
- **Adoption of the primitives is partial by design**, so the codebase now has two idioms side by
  side: 87 card-surface lines and 24 button call sites still carry hand-written geometry. That is
  intended (see `plan.md`), but it means "why does this page not use `Card`?" has no interesting
  answer yet.

## Closing keywords — what this PR may and may not close

Issues and PRs share one number space, and a closing keyword in front of the wrong number silently
closes live work (this repo has done it before — see `#174`/`#214`).

**May close:** `#662` (umbrella), `#656`, `#653`, `#351`, `#639`, `#75`.

**Must NOT close:**

- **`#398`** — only its derivation half shipped. The variant model is `#663`.
- `#663`, `#664`, `#665` — filed by this slice as deferred work, not delivered by it.
- `#601` (three unsynchronised filter-key lists), `#641` (alpha-modifier hover debt, commented on
  with a new instance), `#538` (the repository-transaction-safety timeout), `#513` (the board's
  missing P9/P10 Phase options) — all touched or referenced here, none resolved.
