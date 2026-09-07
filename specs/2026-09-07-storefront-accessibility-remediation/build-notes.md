# Storefront & panel accessibility remediation (build notes)

Implements `requirements.md` R1–R26 for **#649**, **#650**, **#651**, **#652**. Two commits on
`feature/storefront-accessibility-remediation`: `db82421` (spec) and `e7e9ebc` (implementation).

## What changed and why

**The contrast fix is a token, not a sweep, and that ordering is the whole design.** The defect was
never "these 299 class names are wrong" — it was that `lib/vendor-theme.ts`'s `brandStyle()`
guarantees a contrast floor per vendor and **a Tailwind alpha modifier composites the guaranteed
value straight back below it at paint time**. Fixing the call sites without a token would have left
the same trap one keystroke away. So:

- `lib/color-contrast.ts` gains **`mutedForeground(hex, backgrounds, alpha, minRatio)`** — composite
  over white at `alpha`, then `clampForContrast`. It deliberately mirrors `darkenForHover`'s
  existing derive-then-clamp shape rather than inventing a new one. Compositing at the *same alpha
  the old call sites used* (0.7 for text, 0.4 for graphics) is what makes this a refactor rather
  than a redesign: it reproduces the appearance those sites were reaching for, then guarantees the
  floor they missed. An arbitrary OKLCH lightness step would have been a new visual decision wearing
  a refactor's clothes.
- It composites over **white specifically**, not over each background, because one token must serve
  every surface and white is the lightest — the worst case for a light foreground. Clamping the
  result against all five surfaces then yields a single value that clears the floor everywhere.
- `design-system/tokens/tokens.css` declares `--color-primary-muted` (`#49784e`, 4.5:1) and
  `--color-primary-subtle` (`#77917a`, 3:1) as audited platform defaults; `brandStyle()` re-declares
  both per vendor. **The second half is not optional** — an inline style outranks a `:root` rule, so
  a token added only to the stylesheet renders the default palette on every real page. That is the
  #251 failure, and `brandStyle()`'s own doc comment now records these two as subject to it.

**`lib/form-classes.ts` exists because the duplication was the delivery mechanism for the defects,
not a tidiness observation.** `labelClass` carried `text-primary/70` and was copy-pasted into 15
files; `inputClass` carried the suppressed focus outline and into 11. One author decision, 26 failing
surfaces. It deduplicates **strings only** — no `Input`/`Button`/`FormField` component, because that
is `#656` and every call site must stay a plain server-rendered element for the
progressive-enhancement stance to hold.

**`fieldClass(name)` became `fieldProps(name)` in the four staff forms.** It now returns the
`className` **and** `aria-invalid`/`aria-describedby` from one call, so a field cannot be styled
invalid without also being announced invalid. All 28 call sites moved from
`className={fieldClass("x")}` to `{...fieldProps("x")}`.

**The reduced-motion fix is per-site `motion-reduce:`, and `app/globals.css` gained a long comment
saying why it is not a global rule** — the next reader will otherwise reach for the obvious
one-liner. Both rejection reasons are recorded there and in `specs/design-system.md`'s new Motion
rule 4.

**Persistent docs updated on this branch, not deferred:** `specs/design-system.md` (1.10.0 → 1.11.0:
both tokens in the colour table, the alpha ban replacing the old "opacity minimums" rule, the
focus-visible standard, the error-association rule, Motion rule 4),
`specs/decisions/ADR-004-multi-tenancy.md` (1.10.0 → 1.11.0: implementation note recording that
`brandStyle()`'s clamped list grew from five to seven; **decision 5 itself is unchanged**), and
`CLAUDE.md`'s vitest baseline (107/1431 → **109/1456**).

## Decisions taken during the build

- **One muted tone, not two, for `/80`+`/70`+`/60`.** The spec set this direction; the build
  confirmed the evidence held. `/80` sites are `<p className="mt-1 text-sm text-primary/80">` page
  descriptions on the staff hub — the same *kind* of content as `/70` and `/60` (descriptions,
  metadata, empty states). Three values doing one job; collapsed deliberately.
- **The `/50`–`/20` band split by what the element renders, not by its alpha.** 16 went to
  `-subtle` (all `aria-hidden` graphics), 10 to `-muted` (timestamps, tier keys, the "(optional)"
  label hint, a struck-through price, a placeholder). A mechanical alpha-to-tier mapping would have
  put `OrderTimeline`'s timestamps at 3:1 — real text held to a graphics threshold.
- **`components/cart/CartContents.tsx:155` went to `-subtle` (3:1), not `-muted`.** The class sits
  on a `<button aria-label="Remove …">` whose only child is an `aria-hidden` `Trash2`. The colour
  paints a graphic that identifies a control, so WCAG SC 1.4.11 governs it at 3:1 rather than
  SC 1.4.3's 4.5:1.
- **`text-black/50` → `text-black/60` rather than `text-primary-muted`.** These stay neutral grey:
  `specs/design-system.md` already defers all non-brand greys to Tailwind's stock scale, and `black`
  is not a themed token — no vendor varies it, so no clamp is bypassed and 5.74:1 is verified once
  rather than per vendor. Turning them brand-green would have been an unrequested visual change.
- **`uppercaseInputClass` is derived from `inputClass`, not re-typed.** `DeliveryAreaManager`'s
  postcode field needs `uppercase`; deriving it means a future focus or contrast change reaches
  both. It imports as `uppercaseInputClass as inputClass`, so that file's call sites are unchanged.
- **Two new tests walk the filesystem rather than holding a file list**, matching
  `tests/panel-token-purity.test.ts` and `tests/repository-client-injection.test.ts`. Both exclude
  generated artefacts via `GENERATED_ARTIFACTS` from `kms/scripts/build-index.ts` rather than naming
  them — `CLAUDE.md` records hand-enumeration as how a generated file silently stopped being checked.
- **`tests/motion-reduce-coverage.test.ts` checks per LINE, not per file.** "Does this file mention
  `motion-reduce` anywhere" would pass a file whose second animating element forgot it.
- **`--color-primary-subtle` got its own `NON_TEXT_PAIRS` table in
  `tests/design-tokens-contrast.test.ts`** rather than joining `PAIRS` with a per-row threshold. A
  mixed table with two thresholds is how the weaker bar quietly becomes the default for its
  neighbours; the existing table's "meets 4.5:1" assertion stays literally true of everything it
  holds.
- **Both new tests carry a non-vacuity guard** (`files.length > 100`, `withScale.length > 10`), so a
  regex that silently stops matching fails loudly instead of passing over nothing.

## Deviations from the spec

- **The sweep was 304 replacements, not the 299 `plan.md` tabulates.** `plan.md`'s table listed
  `text-black/50` (10 sites) but not **`text-black/40` (5 sites)** — which R7's regex
  (`text-black/[1-5]0`) does cover. R7 is the checkable contract and it is the stricter, more correct
  one, so the code satisfies R7 and this note records that `plan.md`'s arithmetic was one row short.
  Nothing in the spec becomes false; the narrative undercounted.
- **One of those five is a `disabled` control** (`AddToCartButton`'s "Out of stock", previously
  `text-black/40`). WCAG SC 1.4.3 exempts inactive UI components from contrast minimums, so it was
  arguably already compliant. Converted anyway: the exemption is a floor, not a cap, and the
  `disabled` attribute, `cursor-not-allowed`, `bg-surface-muted` and the literal label all still
  carry the state. Deviating from an approved requirement on my own judgement would have been worse
  than a slightly darker disabled label.
- **`fieldClass` was renamed to `fieldProps`, which R14 did not require.** R14 asks only that the
  fields carry the ARIA pair. Returning both from one call is what makes the guarantee structural —
  a field added to these forms next year gets the association by construction rather than by the
  author remembering. Recorded here because the rename touches 28 call sites and a validator reading
  R14 alone will not expect it.
- **R19 was violated by my own first fix and then corrected.** The `specs/design-system.md`
  historical note initially read "This line named `components/layout/PromoCarousel.tsx` until
  2026-09-07" — reintroducing the exact string R19 requires be absent. Reworded to "the since-deleted
  promo-carousel component", which keeps the history and satisfies the check. Final state: zero
  occurrences in both files.

Everything else matches the spec as written.

## Known-shaky areas

**Point validation here first.**

1. **The live two-vendor render is the one thing that can still be wrong, and nothing local proves
   it.** `brandStyle()` returns an inline style that outranks `tokens.css`; #251 shipped a green
   contrast suite while every real page served the failing hex. I confirmed the *utilities generate*
   by inspecting `.next/static/css` after `npm run build` —
   `.text-primary-muted{color:var(--color-primary-muted)}`, `--color-primary-muted:#49784e`, and all
   four `focus-visible:ring-*` rules are present — but **that is the stylesheet, not a rendered
   page.** `validation.md`'s mandatory two-vendor `curl` section is the real check. Expect Aheed
   `#49784e`/`#77917a` and SriMart `#4369a7`/`#7287aa`; **identical values across the two vendors
   means R3 silently failed** even though its grep passes.
2. **Two of my own greps gave confidently wrong readings during this build.** `grep -c` counts
   *lines*, and minified CSS is one line — it reported "1 focus-visible" for 14 occurrences. And a
   rule-dump regex with a short `[^{]{0,60}` bound made the `ring-2` rules look absent when they
   exist. If a validation row's count looks alarming, check the command before believing it.
3. **R8's 26 judgement calls are the only non-mechanical part of the sweep** and the only place a
   human disagreement is likely. R8's validation row asks you to read every `text-primary-subtle`
   line; the borderline ones are `CartContents.tsx:155` (interactive icon → 3:1, argued above) and
   `ProductFilterForm.tsx:98` (an en-dash separator that took the *text* tier because R8 forbids
   `-subtle` on anything rendering text — filed as **#658**).
4. **Reduced motion cannot be proven by the unit test alone.** `tests/motion-reduce-coverage.test.ts`
   asserts the class is *present*; only a browser with the preference emulated proves the transform
   actually stops. R15's row is the check that matters, and the specific thing to watch is the
   product-card image: the card must stop skewing, lifting **and zooming**, while keeping its hover
   shadow and border.
5. **The 375px gutter check (R20) was never run in a browser here.** The class strings are right and
   `max-w-sm` is 384px, so the arithmetic is sound, but nobody has looked at the page.
6. **`SearchSuggest` and `PostcodeChecker` got a `ring-offset-2` on controls that sit in joined or
   tinted containers** (the postcode field is `rounded-l-xl border-r-0`, joined to a button). The
   ring is correct for contrast; whether the 2px white offset looks right against
   `bg-surface-muted` on a joined control is a visual judgement nobody has made yet.
7. **Not shaky, and worth stating so validation does not go looking:** `ProductCard.tsx`'s diff is
   **one line** and `app/globals.css`'s diff contains **zero non-comment lines** — verified with
   `git diff --numstat` and a comment-stripped diff. The card motion is byte-identical.

## Addendum (`/document`, 2026-09-07) — corrections `/validate` found and this stage fixed

Validate confirmed all 30 requirements live and found three wording defects, none of them code
defects. `requirements.md` and `validation.md` were corrected in place — both merged, so this
supersedes what shipped in the `db82421`/`ffec38c` commits above:

- **R7's own two clauses were mutually inconsistent.** Its general clause (`text-black/[1-5]0`
  returns zero matches) already required converting `/40`, but its specific arithmetic clause
  ("`/60` rises by exactly the pre-slice `/50` count") was written as if only `/50` were in scope —
  itself downstream of `plan.md`'s inventory table missing `/40`'s 5 sites (deviation #1 above). The
  artifact was correct throughout — the code always satisfied the general clause. Corrected the
  specific clause to state the real, internally-consistent number: `/60` rises by 15 (the combined
  `/50` + `/40` pre-slice count), confirmed live against the merged `staging` tree (21 → 36).
- **R10's and R13's validation.md commands were script false-positives**, not defects in
  `lib/form-classes.ts` or the sweep. `grep -c "use server" lib/form-classes.ts` returns 1 because
  the file's own doc comment explains it is *not* a `"use server"` file — the explanation contains
  the phrase being searched for. And R13's `--include=*.ts` (added to reach `lib/form-classes.ts`)
  collaterally re-includes the generated `runbook/docs.ts` bundle, which legitimately quotes this
  spec's own prose. Both rows corrected with a command that isolates the real claim.

No code changed as a result of any of the three. `sdd:audit` and the delivery board were reconciled
separately at `/document`; see the roadmap change log for the closure entry.
