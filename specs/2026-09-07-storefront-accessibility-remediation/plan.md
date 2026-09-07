---
id: storefront-accessibility-remediation-plan
title: "Storefront & panel accessibility remediation (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-07
visibility: internal
summary: "Two contrast-clamped foreground tokens replace 299 alpha-modified colour utilities that silently discard brandStyle's WCAG clamp, plus a shared focus-visible ring, per-field error association, reduced-motion coverage and the missing mobile gutter."
tags: [accessibility, design-system, tokens, wcag, motion]
related: [design-system, adr-004-multi-tenancy, discovery-log]
---

# Storefront & panel accessibility remediation (plan)

Closes **#649**, **#650**, **#651**, **#652** — four findings from the 2026-09-07 Discover pass
(`docs/research/discovery-log.md`). One slice rather than four because #649 and #650 edit the *same*
eleven duplicated style constants, and because all four need the same expensive Gate 3 check: live
rendered output for both seeded vendors.

**Goal:** remove every WCAG 2.2 AA contrast failure caused by alpha-modifying a contrast-clamped
colour token, give every focusable control a visible focus indicator, extend the reduced-motion
opt-out to the transforms it currently misses, and restore the missing mobile gutter — so that
**#442** (accessibility launch validation) validates a candidate rather than discovering a backlog.

## Why the contrast half is not cosmetic

`lib/vendor-theme.ts`'s `brandStyle()` passes every semantic foreground through `clampForContrast`,
which raises the value until it clears 4.5:1 against white, the vendor's cream and all three tints.
That clamp is the mechanism ADR-004 decision 5 relies on to deliver per-vendor colour *and* an AA
guarantee at the same time.

**A Tailwind alpha modifier composites that clamped value back down and the guarantee is gone** —
silently, because `tests/design-tokens-contrast.test.ts` measures token values at full opacity and
an alpha modifier is applied by the browser at paint time. The worse case is counter-intuitive: the
*better* the clamp does its job, the closer a vendor lands to exactly 4.5:1, and the further `/70`
drops below it.

Measured with the repo's own `clampForContrast`, against the five surfaces `brandStyle()` already
clamps `--color-primary` against:

| Utility | Uses | Aheed worst-surface | SriMart worst-surface |
|---|---:|---:|---:|
| `text-primary/80` | 60 | **4.41:1** | 4.60:1 |
| `text-primary/70` | 101 | **3.54:1** | **3.72:1** |
| `text-primary/60` | 102 | **2.87:1** | **2.99:1** |
| `text-primary/50` | 12 | **2.32:1** | **2.43:1** |
| `text-primary/40` | 10 | **1.93:1** | **1.99:1** |
| `text-primary/30` | 3 | **1.61:1** | **1.65:1** |
| `text-primary/20` | 1 | **1.36:1** | **1.39:1** |
| `text-black/50` | 10 | **3.98:1** | 3.98:1 |

`text-primary/80` is the instructive row: it passes on white (4.80:1) and fails on the tints, for
Aheed only. That is exactly the vendor-dependent, surface-dependent failure the clamp exists to make
impossible, and it is why the fix belongs at the token layer rather than at 299 call sites'
judgement.

`specs/design-system.md` has forbidden this since it was written — "Never use opacity layers below
80% (e.g. `text-primary/70` or `text-black/50`) for functional text" — and names these exact
utilities. Nothing enforced it. This slice adds the enforcement, which is the part that stops it
recurring.

## Scope (this slice)

**Group A — contrast tokens and sweep (#649).** Two new semantic foregrounds, both derived
per-vendor from the vendor's own `green-dark` primitive through the existing `clampForContrast`,
declared in `design-system/tokens/tokens.css` as audited platform defaults **and** re-declared in
`lib/vendor-theme.ts`'s `brandStyle()` — the second half is mandatory, because an inline style beats
a `:root` rule and a token added only to the stylesheet renders the default palette on every real
page (the #251 failure, recorded in `brandStyle()`'s own doc comment).

- `--color-primary-muted` — clamped to **4.5:1**, for secondary and supporting **text**.
- `--color-primary-subtle` — clamped to **3:1**, for decorative `aria-hidden` **graphics** only.

Naming follows the established base-plus-modifier convention already used by
`--color-action-hover`/`--color-accent-hover`, so the relationship to `--color-primary` is readable
at the call site.

The sweep replaces **299 occurrences across 83 files**:

- every `text-primary/{80,70,60}` on text → `text-primary-muted` (263)
- every `text-primary/{50,40,30,20}` → `text-primary-muted` where the element renders text,
  `text-primary-subtle` where it is an `aria-hidden` graphic (26)
- `text-black/50` → `text-black/60` (10), a one-step bump measured at 5.74:1. It stays a neutral
  rather than becoming brand-tinted because `specs/design-system.md` already defers all non-brand
  greys to Tailwind's stock scale, and because `black` is not a themed token — no vendor varies it,
  so no clamp is involved and no guarantee is being discarded.

**Group B — focus indication and error association (#650).** One `focus-visible` ring treatment,
adopted wherever `focus:outline-none` currently stands unreplaced; `focus:` becomes `focus-visible:`
so the ring no longer fires on mouse click. The four staff forms that mark an invalid field by
colour alone gain `aria-invalid` and `aria-describedby`.

**Group C — reduced motion (#651).** `motion-reduce:` variants at the transform-based interaction
sites the class-scoped block in `app/globals.css` cannot reach, including the product card's own
image zoom. Plus the two stale `PromoCarousel.tsx` pointers (that file was replaced by
`DepartmentHero.tsx`).

**Group D — mobile gutter (#652).** Horizontal and vertical padding on the six pages that have
none.

**Group E — the shared constants.** `inputClass` (11 verbatim copies), `labelClass` (15),
`errorInputClass` (8) and `buttonClass` (2) move to one module, `lib/form-classes.ts`. This is the
reason A and B are one slice: both edit the same strings, and leaving them duplicated means the next
accessibility fix is copied eleven times again — which is precisely how #649 and #650 each reached
double-digit site counts from a single author decision.

## Deliberately excluded

- **The UI primitive component layer (`#656`).** `lib/form-classes.ts` deduplicates *strings*, not
  markup. No `Button`, `Input`, `FormField`, `Modal`, `Toast` or `Skeleton` component is created
  here. That consolidation is P10 and depends on decisions this slice does not make.
- **The `Container`/`Page` layout primitive and the eight inconsistent content widths (`#652`'s
  second half, folded into `#656`).** Group D fixes the *missing padding* only; a shopper still sees
  the content column change width between a category grid and the cart.
- **`text-white/{50,70,80,85,90}` — 12 occurrences.** These sit over vendor-uploaded campaign
  imagery in `DepartmentHero.tsx` and over `bg-black/25` glass panels, so the effective background is
  an arbitrary photograph and no arithmetic settles them. `text-white/70` on `bg-action` measures
  3.38:1 and on `bg-primary` 4.78:1 — the same utility passing or failing by container. Fixing text
  over uploaded imagery needs a guaranteed scrim, which is a design change rather than a token swap.
  **Filed as #657** (P10) so it is not lost.
- **Alpha modifiers in background, border and ring positions** (`bg-primary/10`, `border-primary/20`,
  `ring-primary/20` and roughly 30 similar). Those are surfaces and decorative boundaries, not
  foreground text; `bg-primary/{5,10,20,25}` were checked and all carry dark text or are pure
  decoration (timeline dots). `#641` separately tracks `hover:bg-action/20` as a token-equivalence
  question. Keeping them in scope would have made the sweep's stopping rule a judgement call rather
  than a grep.
- **`animate-spin` on the three pending indicators.** A loading spinner is essential feedback of
  short duration; removing it under reduced motion removes information rather than discomfort.
- **The radius token scale (`#653`) and currency hardcoding (`#654`).** Same Discover pass,
  different problems, both post-launch.

## Why per-site `motion-reduce:` rather than one global rule

`/propose` offered a broad rule inside `@media (prefers-reduced-motion: reduce)` as the cheaper
option, and asked whether the existing ban on "global element-selector transition rules"
(`app/globals.css`, after #324's layout thrashing) really applied to a rule that *removes* motion.
Investigating it before writing this spec found **two concrete failure modes**, so the ban stands and
the verbose option is the correct one:

1. **It would regress a deliberate decision.** The existing reduced-motion block keeps `box-shadow`
   and `border-color` transitions on purpose — its own comment: "the card keeps its hover shadow and
   border, so hover is still perceivable without motion." A blanket `transition-duration: 0.01ms`
   removes those too, leaving reduced-motion users with no hover feedback at all.
2. **Any `transform: none` form breaks layout.** Seven transforms in this repo are static centring,
   not motion — `-translate-y-1/2` at `InventoryTable.tsx:38`, `SearchSuggest.tsx:174`,
   `DepartmentHero.tsx:283` and `:291`, `HorizontalScroller.tsx:27`; `-translate-x-1/2` at
   `DepartmentHero.tsx:297` and `HorizontalScroller.tsx:85`. Cancelling them detaches every search
   icon from its field and mis-positions the carousel controls, for reduced-motion users only.

The "a new component silently forgets it" cost of the per-site approach is paid off by R18's test.

## Enforcement is the deliverable, not the sweep

Three of the four groups fix defects that were written once and copied. A sweep alone leaves the
next author with the same defaults, so each group ships with the check that makes its rule an exit
code:

| Rule | Check |
|---|---|
| No alpha modifier on a themed foreground token | `tests/token-alpha-purity.test.ts` (new) |
| The two new tokens hold their ratios, per vendor | `tests/design-tokens-contrast.test.ts`, `tests/vendor-theme.test.ts` (extended) |
| A transform-based interaction carries `motion-reduce:` | `tests/motion-reduce-coverage.test.ts` (new) |

All three walk the filesystem rather than an allowlist, matching
`tests/panel-token-purity.test.ts` and `tests/repository-client-injection.test.ts` — so a new file is
covered the moment it exists.

## Validation posture

**Gate 3 cannot be cleared by the unit suite.** `brandStyle()` returns an inline style on the root
element, which outranks `tokens.css` on specificity; #251 shipped a passing contrast test while every
real page served the AA-failing hex, and it was found only by pulling live HTML. So `validation.md`
requires **rendered output from `npm run preview` for both Aheed and SriMart**, per `CLAUDE.md`'s
design-tokens section and `brandStyle()`'s own doc comment.

`npm run preview`, not `npm run dev` — the pages under test are `force-dynamic` and read the vendor
through Prisma, which real Node cannot load.

## Open items carried forward

- **`text-white/*` over uploaded imagery** — filed as **#657**, milestone P10.
- **`#656`** (primitive components) and **`#653`** (radius scale) remain the P10 consolidation this
  slice deliberately stops short of.
- **The board's `Phase` field still has no P9 or P10 options (`#513`)**, so all four issues carry the
  correct GitHub milestone (P09.3) and an unset Phase rather than a wrong one.
