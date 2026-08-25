---
id: p8-5e-hero-campaigns-plan
title: "P8.5e — Staff-Editable Hero Campaigns (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-25
visibility: internal
summary: A new per-department campaign model with a real staff CRUD UI and photographic banner upload, layered onto DepartmentHero (#346) — reopening the "general campaign surface" ADR-004 named as future work, this time with the staff UI that made the first attempt (VendorPromotion) inert.
tags: [p8.5, storefront, staff-panel, hero, campaigns, adr-004]
related: [adr-004-multi-tenancy]
---

# P8.5e — Staff-Editable Hero Campaigns (plan)

## Why this slice exists

P8.5b (#346) replaced the homepage's `PromoCarousel` with `DepartmentHero`: a hero generated
entirely from real categories and real product prices, with no staff-authored content at all. That
was correct against the failure it was fixing (`VendorPromotion` shipped an unbacked "20% off all
fresh produce" claim, #233) — but a human review of the live result against the AI Studio prototype
(`docs/ui-ref-revised/src/components/FlipBookHero.tsx`) found it doesn't deliver what the brief
asked for: a photographic hero with real vendor artwork and benefit-led marketing copy per
department. `DepartmentHero` can't produce that from data alone — there is no product field that
means "Craft Halal Butchery Cut Fresh Daily", and there was never a way for staff to say it.

`ADR-004` 1.7.0 anticipated exactly this return trip: "If a general campaign surface is wanted
again, it needs a staff UI as part of its scope — that absence is what made the first attempt
inert." This slice is that surface, built with the staff UI this time, **by explicit human decision
at `/propose` (#356)**, having been shown and having accepted the specific risk this reopens: a
campaign's `headline`/`subtitle` are free text, not derived from product or discount data, so
nothing in the schema stops a future campaign from repeating #233's failure. That tradeoff buys the
creative freedom a data-only hero cannot have. It is narrowed everywhere it can be without losing
that freedom — see Scope and Deliberately excluded below.

**Goal:** give staff a real, discoverable way to upload department artwork and write hero copy,
without discarding the safety properties `DepartmentHero` already has for the (common, expected)
case where a department has no campaign.

## Scope (this slice)

- **New model, `DepartmentCampaign`** — one row per top-level `Category`, `categoryId` unique.
  `headline` (required), `subtitle` (optional), `imageKey`/`altText` (optional, `altText` required
  whenever `imageKey` is set), `linkUrl` (optional, overrides the department's default catalogue
  link — relative path only, matching the deleted `VendorPromotion.linkUrl`'s convention, e.g.
  `/search?isOffer=true`; documented as a convention, not additionally validated at runtime, same
  posture the deleted model had), `isActive` (boolean), `startsAt`/`endsAt` (optional scheduling
  window). One row per
  department, edited in place — not a history of campaigns.
- **`lib/repositories/campaigns.ts`** — pure functions, `prisma`/`vendorId` explicit, no request
  context (matches every repository since #252/P8.1b; enforced by `tests/repository-purity.test.ts`).
  **`lib/campaigns-service.ts`** — the request-scoped facade beside it, same split as
  `lib/roles-service.ts`.
- **`DepartmentHero` (#346) gains an optional per-panel override**, not a rewrite. `HeroDepartment`
  gains `campaign?: { headline; subtitle; imageKey; altText; linkUrl } | null`. A panel with a
  **live** campaign (see below) renders `campaign.headline` as its heading, `campaign.subtitle` if
  present, and — when the campaign has an image — the image as a full-bleed background with a text
  scrim, replacing today's small corner icon/thumbnail for that panel only. A panel with no live
  campaign renders exactly as it does today: unchanged. The live product spotlight price callout
  keeps rendering underneath a campaign's copy, unchanged — the one piece of the panel that is
  always real data, campaign or not, which is what keeps this from being a second `PromoSlider`.
  Rotation, pause, keyboard-focus handling and `prefers-reduced-motion` are the existing mechanism,
  untouched.
  - "Live" = `isActive` true, and (no `startsAt` or `startsAt <= now`), and (no `endsAt` or
    `endsAt >= now`). One pure, unit-tested function decides this — not four ad-hoc checks
    scattered across the repository and the component.
- **Staff CRUD at `/staff/promotions`** — lists the vendor's top-level departments with each one's
  campaign status and an edit form (headline, subtitle, link, schedule, active toggle, banner
  upload). Gated by `requireVendorRole("ADMIN")`, refusal branch renders `<PanelRefusal>` (matches
  every other `/staff/*` page — CLAUDE.md's staff-panel section names the `return null` trap this
  avoids).
- **Banner upload** — a new single-image uploader component, built by copying
  `components/staff/VendorLogoUploader.tsx`'s shape (resize/re-encode to WebP client-side, presign,
  PUT to storage, attach), not by generalizing it into a shared abstraction this slice doesn't need.
  Reuses `IMAGE_CONTENT_TYPE`/`IMAGE_QUALITY`/`MAX_IMAGE_EDGE_PX`/`fitWithinEdge`/`ImageActionResult`
  from `lib/product-image.ts` as-is (those are already generic, not product-specific in logic).
  Key shape `categories/{categoryId}/{uuid}.webp`, checked the same way
  `isProductImageKey` checks its own shape: refused if it doesn't match, never normalized.
- **`ADR-004` amendment** — decision 5 records that this slice is the campaign surface it deferred,
  names the accepted free-text risk explicitly, and notes what stays structured (image, link,
  schedule) versus what doesn't (headline, subtitle).
- **Folds in #352** — this slice's banner upload covers what #352 asked for (real department
  artwork). #352 closes as superseded once this ships; see build-notes for the final call if
  anything about it turns out not to be fully covered.

## Deliberately excluded

- **Campaign history / multiple campaigns per department.** One row per category, edited in place.
  A vendor wanting a future campaign queued up edits the same row when the time comes, the same way
  editing a `Product` or `Category` works everywhere else in this repo. A scheduling *queue* is a
  different, larger feature.
- **Free-text CTA button label.** The button stays "Shop {name}" — data-derived, not
  campaign-authored — deliberately narrower than the approved direction's implied scope, to avoid
  opening a second uncontrolled a11y-relevant text surface beyond headline/subtitle. If this turns
  out to matter, it's a small follow-up, not a blocker to this slice.
- **Campaigns on sub-categories.** `DepartmentHero` only ever renders `listTopLevel()`'s results, so
  only top-level categories get an edit row on `/staff/promotions`. The schema doesn't forbid a
  campaign row pointed at a sub-category, but nothing ever creates one through the UI, and it would
  render nowhere if it existed — a self-limiting no-op, not a guarded case.
- **Automatic cleanup of expired campaigns or orphaned images.** An expired campaign (past
  `endsAt`) simply stops being "live" and the panel reverts to its data-only rendering; the row and
  its image object are not deleted. Matches the existing, already-accepted gap at #174 for
  abandoned product-image uploads.
- **A general "campaigns list" admin view across all vendors, or approval workflow.** One staff role
  (`ADMIN`) can publish immediately, matching `CategoryForm`/`ProductForm`'s existing posture.

## Open items carried forward

- **#352** is folded in, not separately implemented — build-notes records whether it closes clean
  or needs a residual follow-up.
- Whether a live-but-imageless campaign (headline/subtitle only, no photo) should still trigger the
  full-bleed treatment with a solid brand-colour background instead of the icon corner: this spec
  resolves it as **no** — an imageless campaign renders exactly like an auto-generated panel except
  for the swapped heading/subtitle text, keeping the visual language change tied strictly to "a
  real photo exists," which is the actual gap #279/#352 identified. Recorded here so it reads as a
  decision, not an oversight.
