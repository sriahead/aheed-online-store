# Storefront & panel accessibility remediation (requirements / acceptance criteria)

Closes **#649** (alpha-modified text fails WCAG AA at 299 sites and discards `brandStyle()`'s
contrast clamp), **#650** (`focus:outline-none` at 27 sites with 2 replacements), **#651**
(reduced-motion opt-out misses 24 utility transforms) and **#652** (six pages render with no mobile
gutter). Builds on `specs/design-system.md` and ADR-004 decision 5. In one sentence: two
contrast-clamped foreground tokens replace every alpha modifier on a themed colour token, one shared
focus-visible ring replaces every suppressed outline, `motion-reduce:` reaches the transforms the
class-scoped block cannot, six pages get padding — and three filesystem-walking tests make each rule
an exit code rather than prose.

Throughout, **"the app source"** means files matching `*.tsx` under `app/`, `components/` and
`features/`, **excluding** the generated bundle `app/(admin)/staff/runbook/docs.ts`. Ratios are
computed by `lib/color-contrast.ts`'s `contrastRatio`. **"The five surfaces"** means white
(`#ffffff`), the vendor's `cream` primitive, and the vendor's `green-tint`, `orange-tint` and
`red-tint` primitives — the same list `brandStyle()` already clamps `--color-primary` against.

## Group A — contrast tokens and sweep (#649)

R1. `lib/color-contrast.ts` exports `mutedForeground(hex, backgrounds, alpha, minRatio)`, which
    composites `hex` over `#ffffff` at `alpha` and returns `clampForContrast(composite, backgrounds,
    minRatio)`. Called with `("#1b5e20", fiveAheedSurfaces, 0.7, 4.5)` it returns `"#49784e"`; with
    `("#1b5e20", fiveAheedSurfaces, 0.4, 3)` it returns `"#77917a"`.

R2. `design-system/tokens/tokens.css` declares exactly two new semantic tokens in its `@theme`
    block: `--color-primary-muted: #49784e;` and `--color-primary-subtle: #77917a;`, each with a
    comment naming its minimum ratio (4.5:1 and 3:1 respectively) and stating that it is an audited
    platform default overridden per vendor by `brandStyle()`.

R3. `lib/vendor-theme.ts`'s `brandStyle()` return object contains the keys `--color-primary-muted`
    and `--color-primary-subtle`, whose values are produced by `mutedForeground(p["green-dark"],
    primarySurfaces, 0.7, 4.5)` and `mutedForeground(p["green-dark"], primarySurfaces, 0.4, 3)`
    respectively, where `primarySurfaces` is the existing five-surface array already declared in
    that function.

R4. For the `AHEED_PRIMITIVES` and `SRIMART_PRIMITIVES` fixtures already defined in
    `tests/vendor-theme.test.ts`, `brandStyle()`'s returned `--color-primary-muted` measures at least
    **4.5:1** against each of that vendor's five surfaces, and `--color-primary-subtle` measures at
    least **3:1** against each. `tests/vendor-theme.test.ts` contains a test asserting this, using the
    file's existing per-vendor table pattern.

R5. `tests/design-tokens-contrast.test.ts` asserts, for the platform-default values in `tokens.css`,
    that `--color-primary-muted` is at least 4.5:1 and `--color-primary-subtle` at least 3:1 against
    white, `--color-surface-muted`, `--color-action-tint`, `--color-accent-tint` and
    `--color-danger-tint`. Its existing pair-count guard is raised to match the new total.

R6. Searching the app source for the pattern
    `(text|fill|stroke|decoration)-(primary|action|accent|danger)[a-z-]*\/[0-9]+`
    returns **zero** matches. (This covers `placeholder:text-primary/30`, whose
    `text-primary/30` substring matches the pattern.)

R7. Searching the app source for `text-black/[1-5]0` returns **zero** matches. **Corrected at
    `/document`, 2026-09-07** — this requirement originally also claimed the `text-black/60` count
    "increases by exactly the pre-slice `text-black/50` count," which conflicted with its own first
    clause: the `[1-5]0` range already covers `text-black/40`, so a zero-match result requires
    converting those sites too, not just `/50`'s. Live validation found the real rise was 15 (10
    from `/50` plus 5 from `/40` that `plan.md`'s inventory table had undercounted), not 10 — the
    artifact was correct throughout; only this sentence's arithmetic was wrong. The corrected
    claim: the count of `text-black/60` **increases by exactly the combined pre-slice count of
    `text-black/50` and `text-black/40`** (each of those fifteen sites is bumped one step, to a
    measured 5.74:1), and the counts of `text-black/70`, `text-black/80` and `text-black/90` are
    unchanged. Those survivors are 5.74:1 or better already, and `black` is not a themed token — no
    vendor varies it, so no clamp is involved and none is being discarded. `validation.md`
    re-derives all counts from both branches rather than quoting absolute numbers here, so an
    unrelated edit landing between spec and validation cannot make this row falsely fail.

R8. Every site formerly carrying `text-primary/{80,70,60}` now carries `text-primary-muted`. Every
    site formerly carrying `text-primary/{50,40,30,20}` now carries `text-primary-muted` when the
    element it is applied to renders text content, or `text-primary-subtle` when that element is a
    graphic marked `aria-hidden`. No element carrying `text-primary-subtle` renders text content.

R8a. **The consolidation preserves a legible three-step text hierarchy in both vendor themes.**
     Collapsing `text-primary/{80,70,60}` (263 sites) onto one tone is this slice's main visual risk,
     so the resulting ladder is pinned rather than assumed. For **each** of `AHEED_PRIMITIVES` and
     `SRIMART_PRIMITIVES`, computed from `brandStyle()`'s returned values:
     `relativeLuminance(--color-primary-muted)` is greater than
     `relativeLuminance(--color-primary)`, and `relativeLuminance(--color-primary-subtle)` is greater
     than `relativeLuminance(--color-primary-muted)` — the three are ordered, not merged.
     `contrastRatio(--color-primary, --color-primary-muted)` and
     `contrastRatio(--color-primary-muted, --color-primary-subtle)` are each **at least 1.4:1**, so
     each step is perceptible rather than a nominal difference. (Measured at spec time: Aheed
     1.53:1 and 1.50:1; SriMart 1.57:1 and 1.51:1.) `tests/vendor-theme.test.ts` asserts this for
     both vendors.

R8b. **The muted and subtle tones clear their floors on every surface they actually render on, for
     both vendors** — not only against white. For each vendor, `--color-primary-muted` measures at
     least 4.5:1 and `--color-primary-subtle` at least 3:1 against that vendor's `cream`,
     `green-tint`, `orange-tint` and `red-tint` primitives as well as white. This is the surface set
     that made `text-primary/80` a vendor-dependent failure (4.41:1 on Aheed's tints, 4.60:1 on
     SriMart's), so a check against white alone would not have caught the defect this slice exists
     to fix.

R9. `tests/token-alpha-purity.test.ts` exists. It walks `app/`, `components/` and `features/` from
    the filesystem (no hardcoded file list), excludes the generated artefacts derived from
    `GENERATED_ARTIFACTS` in `kms/scripts/build-index.ts`, and fails when any scanned file matches
    R6's pattern or R7's pattern. Its docstring states that background, border and ring alpha
    modifiers are deliberately **out** of its scope, and names `#641` as the issue tracking one of
    those.

## Group B — focus indication and error association (#650)

R10. `lib/form-classes.ts` exists and exports `inputClass`, `labelClass`, `errorInputClass` and
     `buttonClass` as string constants. It contains no `"use server"` directive and imports nothing
     from `next/headers`, `@/lib/db`, `@/lib/auth` or `@/lib/auth-rbac`.

R11. No file in the app source declares a local `const inputClass`, `const labelClass`,
     `const errorInputClass` or `const buttonClass`; every file that previously did imports the
     constant it uses from `@/lib/form-classes`.

R12. `inputClass` as exported from `lib/form-classes.ts` contains `focus-visible:` and does **not**
     contain the substring `focus:outline-none`.

R13. Searching the app source and `lib/form-classes.ts` for `focus:outline-none` returns **zero**
     matches. Every element that previously carried it carries a `focus-visible:` ring utility
     instead.

R14. In each of `components/staff/ProductForm.tsx`, `components/staff/CategoryForm.tsx`,
     `components/staff/BundleForm.tsx` and `components/staff/CampaignForm.tsx`, every field that can
     receive `errorInputClass` also carries `aria-invalid` set to `true` exactly when that field is
     the errored field, and an `aria-describedby` referencing the `id` of the element rendering that
     form's error message. That error element carries a matching `id`.

## Group C — reduced motion (#651)

R15. `components/product/ProductCard.tsx` and `components/bundle/BundleCard.tsx` each render their
     product/bundle image with a `motion-reduce:` variant that cancels the `group-hover:scale-105`
     transform, so that under `prefers-reduced-motion: reduce` the image does not scale on hover.

R15a. **The existing product-card motion is preserved exactly, and `ProductCard.tsx`'s diff proves
      it.** The `.skew-card`, `.skew-card-inner`, `.skew-card-badge` and `.skew-card-price` rules in
      `app/globals.css` — their `transform` values, their `380ms`/`350ms`/`300ms` durations, their
      `ease-out`/`ease` timing functions, the `:hover` `skewX(0deg) translateY(-6px)` and the
      `color-mix` box-shadow — are **byte-identical** to `origin/staging`. `git diff
      origin/staging -- components/product/ProductCard.tsx` shows changes on the image element's
      `className` only (the added `motion-reduce:` variant from R15) and **no other line**: this file
      carries no in-scope alpha token, its only alpha utilities being `text-black/{60,70,90}`, all of
      which pass and are explicitly out of scope per R7. No geometry, spacing, radius, badge or price
      class in either card file changes.

R15b. `components/bundle/BundleCard.tsx`'s diff against `origin/staging` is limited to the R15
      `motion-reduce:` variant plus exactly two token swaps — its `aria-hidden` `Package` icon
      (`text-primary/30` to `text-primary-subtle`) and its item-count label (`text-black/50` to
      `text-black/60`). Its `.skew-card` classes, `aspect-4/3` image container and layout are
      unchanged, so it continues to share `ProductCard`'s treatment as its own docstring requires.

R16. Every element in the app source carrying an interaction-variant scale utility — matching
     `(active|hover|group-hover|focus):scale-` — also carries a `motion-reduce:` variant cancelling
     that transform on the same element.

R17. The three `animate-spin` occurrences are unchanged. The **rules inside** `app/globals.css`'s two
     existing `@media (prefers-reduced-motion: reduce)` blocks are unchanged (the comment above the
     first block does change, per R19), and no new global element-selector rule — a rule whose
     selector is `*` or a bare element name — is added to `app/globals.css`.

R18. `tests/motion-reduce-coverage.test.ts` exists, walks the app source from the filesystem, and
     fails when a file contains an interaction-variant scale utility on an element with no
     corresponding `motion-reduce:` variant.

R19. Neither `app/globals.css` nor `specs/design-system.md` contains the string `PromoCarousel`;
     both name `components/layout/DepartmentHero.tsx` as the JS-driven reduced-motion reference
     implementation instead.

## Group D — mobile gutter (#652)

R20. Each of `app/(storefront)/login/page.tsx`, `register/page.tsx`, `forgot-password/page.tsx`,
     `reset-password/page.tsx`, `account/page.tsx` and `account/data/page.tsx` renders its `<main>`
     with a horizontal padding utility and a vertical padding utility in addition to its existing
     `mx-auto max-w-sm`.

R21. `components/layout/StorefrontChrome.tsx`'s wrapper around `children` is unchanged, so the
     eighteen storefront pages that already supply their own container are not double-padded.

## Documentation and gates

R22. `specs/design-system.md` is updated to record, as current standing decisions: the two new
     tokens with their ratios and roles in its Shape/Colors tables; that an alpha modifier on a
     themed foreground token is forbidden because it discards the clamp, naming
     `tests/token-alpha-purity.test.ts` as the enforcement; the `focus-visible` ring as the standard
     focus treatment; and the `motion-reduce:` requirement as Motion rule 4, naming
     `tests/motion-reduce-coverage.test.ts`. Its front-matter `version` is bumped and `updated` set
     to the slice date.

R23. `specs/decisions/ADR-004-multi-tenancy.md` carries a dated implementation note under decision 5
     recording that `brandStyle()`'s clamped-foreground list grew by two tokens, and that the
     decision itself is unchanged.

R24. `CLAUDE.md`'s recorded vitest baseline (currently "107 files / 1431 tests") is updated to the
     figure a clean `npx vitest run` actually reports after this slice.

R25. `CHANGELOG.md` updated (Gate 4).

R26. `lint`, `typecheck`, `test` and `format:check` all remain green after this slice.
