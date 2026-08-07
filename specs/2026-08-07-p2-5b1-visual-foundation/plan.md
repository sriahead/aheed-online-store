---
id: p2-5b1-visual-foundation
title: "P2.5b1 — Visual Redesign Foundation (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-08-07
visibility: internal
summary: Plan for the foundation half of P2.5b — design tokens ingested from the real brand kit, schema/filter extensions, and expanded seed data — laying real material for P2.5b2's UI work to consume.
tags: [p2.5, design-system, prisma, seed]
related: [design-system, architecture, roadmap]
---

# P2.5b1 — Visual Redesign Foundation (plan)

**Goal:** give P2.5b2's UI work real tokens, real schema fields, and real varied seed data to
render against — same "data before display" reasoning that split P2.5a from P2.5b, applied one
level deeper to split P2.5b itself.

**Trigger — why this split exists:** confirmed during `/spec`: P2.5b as originally scoped (issue
#40) combined tokens/schema/seed with layout/header/hero/sidebar/cards — bigger than any slice
this session, including P2a+P2b combined. Every slice that caught a real bug did so because it
stayed small enough to validate end-to-end before the next one started. Split into #40 (this
slice, renumbered) and #43 (P2.5b2, UI).

**Scope (this slice):**
- **Design tokens**: `design-system/tokens/tokens.css` gains tint primitives (`#E8F5E9` light
  green, `#FFF3E0` light orange, `#FFEBEE` light red — confirmed against both `docs/brandkit.png`
  and the mockup's actual `docs/ui-ref/src/index.css`) mapped to semantic
  `--color-action-tint`/`--color-accent-tint`/`--color-danger-tint` — named relative to their
  existing base color (`--color-action`/`--color-accent`/`--color-danger`), matching the pattern
  already established for the hover/active shades, not inventing generic "success/warning"
  status-color vocabulary this project has never used. **Not** adding a fourth "light neutral"
  tint — brandkit.png's `#FAFAFA` is near-identical to the already-existing `--color-surface-muted`
  (`#F5F5F0`); treating it as already covered rather than adding a confusing near-duplicate.
- **Typography**: `specs/design-system.md` documents the brand kit's explicit type scale (H1 32px
  Bold, H2 24px Semibold, H3 18px Semibold, Body 14px Regular, Small 12px Regular) as Tailwind
  utility-class mappings (`text-3xl md:text-4xl font-bold` for H1, etc.) — Tailwind's existing
  scale already covers this closely enough; no new CSS tokens needed, just a documented
  convention P2.5b2 follows.
- **Icon library**: adds `lucide-react` as a dependency — confirmed as the mockup's actual choice
  (every icon in `docs/ui-ref/src/components/*.tsx` imports from it), matching
  `design-system.md`'s existing icon-set section. Reused, not hand-rolled or guessed.
- **Resolves two open items already on record in `design-system.md`**: "real logo source files"
  (now committed — `docs/logo.png`) and "red's exact role" (confirmed via the mockup's
  `ProductCard.tsx`: both alert/danger and the sale-discount badge color).
- **Prisma**: `Product` gains `origin` (String?), `originalPrice` (Int? pence — a discount badge
  is derived from `originalPrice - basePrice` when set, not a separate boolean flag, avoiding
  data that can drift out of sync), `isHalal`/`isFresh`/`isOrganic` (Boolean, `@default(false)`)
  — matches the mockup's actual `Product` type (`docs/ui-ref/src/types.ts`), not invented fresh.
- **Repository/filters**: `ProductFilters` (from P2b) gains `isHalal`/`isFresh`/`isOrganic`
  alongside the existing price/in-stock filters — one shared filter shape, not a second parallel
  one. `ProductSummary`/`ProductDetail` gain the new fields for P2.5b2 to render.
- **Seed expansion**: adds 6 new categories (halal-meat, groceries, international, beverages,
  snacks, household) with 2 placeholder products each, bringing the total to 9 categories — the
  mockup's 8 real departments (`fresh-produce`→our `fruit-veg`, `dairy-eggs` already present, plus
  the 6 listed here) plus our existing `bakery`, which the mockup doesn't have and isn't being
  removed (see below). **Existing categories (`fruit-veg`, `bakery`, `dairy-eggs`) are
  left untouched** — they're already live in production with real URLs; renaming/removing them to
  exactly match the mockup's slugs (`fresh-produce` instead of `fruit-veg`, no `bakery` at all)
  would be a real breaking change to already-shipped functionality, not worth it for placeholder
  data. Content parity (halal badges, ratings, origin, discount pricing) matters more here than
  exact slug-naming parity with the mockup.
- **Postcode validator**: `lib/delivery.ts` exports a pure `isDeliverable(postcode: string):
  boolean` — checks the Leicester LE1–LE5 prefix, tolerant of case and spacing (`"LE1 1AA"`,
  `"le11aa"` both work). No persistence, no checkout interaction (P3's job later) — small and
  self-contained.

**Deliberately excluded:**
- Any layout/component/visual application of these tokens — P2.5b2 (issue #43), once this lands.
- Real product photography — still deferred, per P2a's original note; new seed products use the
  same placeholder SVG approach, uploaded through the real storage pipeline (not the mockup's
  external Unsplash URLs, which would violate the "relative keys, never a URL" schema rule).
- Renaming/consolidating the existing 3 categories to exactly match the mockup's slugs — see above.
- Cart/checkout, order tracking, loyalty, staff/admin, Dev Toolbar — unchanged future phases.

**Open items carried forward:** P2.5b2 (issue #43), once this lands.
