---
id: p2-5a-ratings-reviews
title: "P2.5a — Ratings & Reviews Backend (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-08-07
visibility: internal
summary: Plan for the first P2.5 slice — a real Review model, auth-gated submission, and denormalized rating aggregation — laying the real data P2.5b's visual redesign will display.
tags: [p2.5, reviews, ratings, prisma]
related: [architecture, roadmap, adr-002-auth-library]
---

# P2.5a — Ratings & Reviews Backend (plan)

**Goal:** real product ratings/reviews backed by real data, so P2.5b's visual redesign displays
actual numbers from day one instead of placeholders that need revisiting later.

**Trigger — why this exists at all:** confirmed during `/propose`: comparing the live site
against the project's own AI Studio design mockup (`aheedfoodcentre.ai.studio`) surfaced that
ratings/reviews were never in the original P0–P8 roadmap. Inserted as P2.5 between P2 and P3
(`specs/roadmap.md` v1.2.0), split into this slice (real data) and P2.5b (display), reviews
before visuals so the card component P2.5b builds gets built once, against real data.

**Scope (this slice):**
- Prisma: `Review` (`rating` 1–5 `Int`, `comment` `String?`, `userId`/`productId` FKs,
  `@@unique([userId, productId])` — one review per user per product, resubmitting updates the
  existing row rather than creating a duplicate). `Product` gains denormalized `averageRating`
  (`Float`, not a money field — see the ADR cross-check below) and `reviewCount` (`Int`),
  recomputed from a full aggregate (not incremental) inside the same transaction as every
  create/update/delete — avoids floating-point drift and matches the existing
  `Inventory.quantity`-is-denormalized precedent, needed because product grids render this on
  every card and a live join per card would be an N+1 risk.
- `lib/repositories/reviews.ts` — `ReviewRepository`: `upsert()`, `delete()` (ownership-checked
  via a compound `WHERE id = ? AND userId = ?`, not a separate read-then-check — atomic, no
  TOCTOU gap), `listByProduct()` (newest-first, bounded, no pagination UI — see excluded below),
  `getByUserAndProduct()` (pre-fills the submitter's existing review, if any).
- `features/reviews/` — the **first real use of `features/` beyond auth**, and for the same
  reason auth needed it: this is a genuine write use-case (session-gated Server Action), not
  read-only browsing (which correctly stayed in `components/product/` for P2a/P2b). Two Server
  Actions (`submit-review.ts`, `delete-review.ts`) session-checked via P1's `getAuth()`, plus
  `components/ReviewForm.tsx` — a plain `<form action={submitReview}>`, no client component
  needed (Server Actions progressively enhance a normal form the same way P2's GET forms did).
  `validate-rating.ts` — pure `parseRating(value: string): number | null`, unit-tested, same
  pattern as `parsePriceInput`.
- `app/(storefront)/products/[slug]/page.tsx` extended: review list + `ReviewForm` for
  authenticated users, a login prompt (not a redirect — browsing stays guest-accessible) for
  everyone else.

**Checked against existing ADRs:** `averageRating: Float` might look like it violates CLAUDE.md's
"money = integer pence, no floats" rule — it doesn't; that rule governs currency values
specifically (`Product.basePrice` stays `Int` pence, untouched here), not every float in the
schema. A rating score is not money.

**Deliberately excluded:**
- Any visual/component redesign — P2.5b, once this lands.
- Review moderation (staff/admin removing others' reviews) — fits P6 (admin panel) better; a user
  can only edit/delete their *own* review here.
- "Verified purchase" gating — impossible before P3 (cart/checkout) exists.
- Review list pagination UI — shows the most recent reviews only, bounded, no "load more" control.
  Full keyset pagination (matching P2's pattern) can follow if a product ever gets enough reviews
  to need it; premature now.
- Photo reviews, review replies, helpfulness voting — not in the mockup, not requested.
- Client-side form validation/error UX beyond native HTML5 (`required`, `min`/`max` on the rating
  select) — an invalid direct POST throws and shows the nearest error boundary. Acceptable for a
  minimal first slice; not the primary UX path since the form itself constrains valid input.

**Open items carried forward:** P2.5b (issue #40), once this lands.
