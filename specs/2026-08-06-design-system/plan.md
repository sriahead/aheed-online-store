---
id: p0-design-system-tokens
title: "P0 — Design-System Tokens (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-08-06
visibility: internal
summary: Plan for installing Tailwind CSS v4 and encoding the Aheed brand kit as design tokens, closing the last item deferred from P0's first slice.
tags: [p0, design-system, tailwind, tokens]
related: [design-system, p0-foundation]
---

# P0 — Design-System Tokens (plan)

**Goal:** close the last item explicitly deferred from P0's first slice ("design-system tokens (no
`specs/design-system.md` spec exists yet)") — install Tailwind CSS and turn the Aheed brand kit
into real tokens, proven live rather than left as unused config.

**Trigger:** this was blocked on two open questions — actual brand colors (none existed) and a
Tailwind config-style decision (CSS-first `@theme` vs `tailwind.config.ts`). The user supplied a
real Aheed brand kit image (colors, Poppins typography, UI shape cues) mid-session, unblocking it.

**Scope (this slice):**
- Tailwind CSS v4, CSS-first `@theme` config — v4's own recommended default, and
  `docs/repo-structure.md`'s `tailwind.config.ts` sketch was already stale elsewhere in that same
  doc (it tags `tsconfig.json` as P6, which already existed), so it isn't treated as authoritative.
- `design-system/tokens/tokens.css` — primitive brand-kit colors layered under semantic tokens
  (`--color-primary`/`--color-action`/`--color-accent`/`--color-danger`/`--color-surface-muted`),
  plus radius tokens, so component code reads the semantic layer, never a raw hex.
- Poppins via `next/font/google` (self-hosted at build — no runtime request to Google Fonts, which
  matters on Workers), one family at two weights, not two families.
- Restyle the existing walking-skeleton page (`app/page.tsx`, `app/globals.css`) with the tokens,
  so they're proven to actually flow through, not just sit as config nobody consumes.

**Deliberately excluded:**
- Real logo files — the brand kit is a reference image, not exportable SVG/PNG source assets.
  `public/images/brand/` stays an empty scaffold until real files exist.
- `components/`, `design-system/{components,patterns,pages,guidelines}/` — nothing consumes tokens
  yet; the first real UI consumer is P1+ feature work. Building these now would be speculative.
- Dark mode — no requirement yet.
- The eslint rule banning raw hex/px in components — `docs/repo-structure.md` already tags this P6,
  not P0.

**Open items carried forward:**
- Red's exact role (`--color-danger`) — the brand kit shows no UI example using it (no alert/badge
  in the kit). Confirm whether it's system-error-only or also a "sale/clearance" badge color before
  P2 storefront UI work makes badges customer-visible.
- Real logo source files, whenever Aheed provides them.

See `specs/design-system.md` for the persistent decision doc (the full color/typography/shape
tables) — this plan covers the implementation slice, that doc is what future sessions read as
current truth on the token values themselves.
