---
id: p2-5b2-visual-ui
title: "P2.5b2 — Storefront Visual Redesign UI (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-07
visibility: internal
summary: Plan for the UI half of P2.5b — applies P2.5b1's tokens/schema/seed to a real storefront layout, header, hero, redesigned product cards, category sidebar, and speciality filters matching the AI Studio mockup.
tags: [p2.5, ui, design-system, storefront]
related: [design-system, roadmap, p2-5b1-visual-foundation]
---

# P2.5b2 — Storefront Visual Redesign UI (plan)

**Goal:** make the live storefront actually look like the project's AI Studio mockup
(`docs/ui-ref/`) — a real header, a hero homepage, redesigned product cards with badges/ratings,
a category sidebar, and speciality filters — consuming the real tokens, schema fields, and seed
data P2.5b1 already landed. This is the slice that closes the "current site is nowhere near the
mockup" gap that opened P2.5.

**Trigger — why this split exists:** P2.5b was split during `/spec` into #40 (data foundation,
shipped) and #43 (this slice, UI) because combining them was larger than any slice this session.
This is #43.

## What's already true (from Orient — don't re-derive)
- **No `app/(storefront)/layout.tsx` exists.** The root `app/layout.tsx` wraps everything in
  `max-w-2xl p-8`, silently constraining every storefront page since P2a. Each page self-wraps with
  its own `mx-auto max-w-{3xl,4xl,5xl}`; there is no shared header anywhere.
- **The homepage `/` is still M0's walking-skeleton stub at `app/page.tsx`** — at the app root, not
  inside `(storefront)`, so it renders under the root layout, not any storefront layout.
- **The data layer already has everything the cards need from P2.5b1** — `origin`, `originalPrice`,
  `isHalal`/`isFresh`/`isOrganic` on `ProductSummary`/`ProductDetail`, and 9 categories / 18
  products seeded — **except two things** this slice must add itself (below).

## Scope (this slice)

**Layout & header:**
- **Root `app/layout.tsx`**: drop the `max-w-2xl p-8` body constraint (keep only html/body/font
  shell) so a full-width sticky header and page-controlled widths are possible.
- **New `app/(storefront)/layout.tsx`**: `force-dynamic` (it reads the session, which touches
  Prisma — same static-prerender-in-Node crash guard as every DB-touching route), renders a shared
  `<Header/>` above `{children}`. It does **not** add its own `<main>` — every existing page already
  renders one, and nesting `<main>` is invalid; pages keep their own `<main>`/width container.
- **`components/layout/Header.tsx`** — a **Server Component** (no `"use client"`), so it reads
  `getAuth().api.getSession()` and renders auth state with zero client JS, matching the
  progressive-enhancement pattern used everywhere since P2a:
  - Promo/trust bar: brand tagline + a **static** "delivering across Leicester LE1–LE5" note.
  - Logo linking to `/`.
  - Global search: a plain `<form method="GET" action="/search">` with a `q` field — the same
    zero-JS GET pattern the `/search` page already uses.
  - Auth-aware account control: signed-in → a link to `/account` showing the user's first name;
    signed-out → a "Sign in" link to `/login`. (Sign-out stays on `/account`, where the existing
    client `LogoutButton` already lives — not duplicated into the server header.)
  - An **inert, visual-only** cart button (lucide `ShoppingBag`, no count badge) — there is no cart
    until P3, so a fake count would be a lie; it renders for layout fidelity and does nothing.

**Homepage (hero):**
- **Delete `app/page.tsx`** (the M0 stub) and serve `/` from **new `app/(storefront)/page.tsx`**:
  a hero band (using P2.5b1's `--color-action-tint` soft-green background), a **data-driven**
  category grid (renders `getCategoryRepository().listTopLevel()` — whatever N the DB returns, each
  with its icon), and a **postcode deliverability checker**: a `<form method="GET">` that reads a
  `postcode` search param and renders `isDeliverable()`'s result inline. `/api/health` is untouched
  and remains the machine-readable health surface.
  - *Why the checker lives on the hero, not the sticky header:* Next App Router **layouts don't
    receive `searchParams`** — only pages do. A header in the layout literally can't read back a
    submitted postcode to show a result. The hero is a page, so it can; and "do we deliver to you?"
    belongs on the landing page anyway.

**Product card & data it needs:**
- **`ProductSummary`/`ProductDetail` gain `averageRating` + `reviewCount`** (selected in both
  `findPage()` and `getBySlug()`). P2.5a denormalized these onto `Product` *specifically so cards
  could show them*, but no read path ever exposed them — this slice closes that. Small data-layer
  addition, but real, so it's called out, not smuggled into "UI work".
- **`components/product/ProductCard.tsx` redesigned** to the mockup: Halal/Fresh badges (from the
  booleans), a discount badge + "Save £X" + strikethrough `originalPrice` when set, a star rating
  (`averageRating` + `reviewCount`), `origin`, name, `unitLabel`, price, and a visually-present but
  **inert** Add-to-Cart button (P3 wires it). Brand colors via semantic tokens
  (`--color-primary`/`--color-action`/`--color-accent`/`--color-danger` and P2.5b1's tints), not
  raw hex; the gold rating star uses stock Tailwind `amber-400` (a decorative, non-brand color the
  design system already defers to Tailwind for).

**Category sidebar & speciality filters:**
- **`components/layout/CategorySidebar.tsx`** — lists **all** top-level categories (data-driven,
  any N, each with its icon, active one highlighted), shown on the category-detail and search
  pages.
- **`components/product/category-icon.ts(x)`** — maps a category slug to a lucide icon, returning a
  **sensible default for any unmapped slug**, so a brand-new DB category still renders an icon (no
  schema `iconName` field needed; honors the "auto-size to more categories" requirement).
- **`ProductFilterForm` gains Halal/Fresh/Organic checkboxes** wired to the real
  `isHalal`/`isFresh`/`isOrganic` filter fields; the `/search` and `/categories/[slug]` pages parse
  those params, pass them to the repository, and carry them through their pagination `nextPageHref`.

**Dynamic sizing / performance / state (the human's explicit P2.5b2 requirements, tracked on #43):**
- Category grid, sidebar, and product grid render straight from `.map()` over DB results — **no
  hardcoded 8-category or 16-product assumption anywhere**. Grids use responsive CSS that wraps for
  any N.
- Loading stays **Server-Component + keyset-paginated** (the existing P2b cursor pattern, reused
  unchanged) — no client-side fetch-everything. This is the performance guardrail: it's what keeps
  the page fast once real photography and a larger catalogue land.
- The header reflects **real auth state** via the established `getAuth().api.getSession()` — no new
  auth mechanism, no mock.

## Deliberately excluded
- **Cart / "Add to Cart" wiring, cart count/subtotal, order tracking** — P3/P4. The cart button and
  card Add button render but are inert.
- **The Dev Control Toolbar** (role/view switcher, Dev KMS) that dominates the mockup's `Header.tsx`
  — issue #41, needs its own `/propose` (and a redesign of its "Dev KMS" secrets-exposure concept).
- **`next/image`** — the storefront deliberately uses plain `<img>` with `composePublicUrl()`
  (established since P2a; the eslint `no-img-element` warning is already accepted). Introducing an
  image loader is a separate infra decision, not this slice.
- **A `Category.iconName` schema field** — a slug→icon map with a default fallback covers the need
  without a migration; revisit only if categories ever need per-row custom icons from an admin UI
  (P6).
- **Real product photography** — still deferred; seed keeps the placeholder SVG.
- **Mobile app frame, checkout/account/staff/KMS views** from the mockup — later phases.
- **A homepage "popular/featured products" rail** (the mockup's landing shows one). It has no
  backing data: there's no `isPopular`/`isFeatured` field (P2.5b1 didn't add one) and no
  list-all-products repository method — only `listByCategory`/`search`. Adding either is real new
  surface, not "UI work." The homepage navigates via categories instead; a featured rail is a
  clean future add once a featured concept exists.

## Open items carried forward
- None blocking. The Dev Toolbar (#41) and P3 cart wiring are the natural next consumers of this
  header, tracked on their own issues.
