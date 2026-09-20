---
id: p818-customer-feedback-reviews
title: "P9.2 — Customer Feedback & Reviews: first-party submission, moderation and the Cards Stack Slider (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-19
visibility: internal
summary: "Adds first-party business-level customer feedback with pre-publication moderation, renders approved feedback in a reusable Cards Stack Slider on the landing page, and replaces #406's embedded third-party review widgets with vendor-configurable outbound links."
tags: [feedback, reviews, moderation, storefront, staff-panel, multi-tenancy, data-rights]
related: [adr-004-multi-tenancy, p7a-compliance-hardening-plan, roadmap]
---

# P9.2 — Customer Feedback & Reviews: first-party submission, moderation and the Cards Stack Slider (plan)

**Goal:** give the storefront business-level social proof that the platform owns end to end —
customers leave feedback about the shop, staff approve it before anyone sees it, and approved
feedback renders on the landing page. Shipping this closes `#818` and supersedes `#406`, whose
embedded-widget premise is rejected.

## Why this shape, and not `#406`'s

`#406` asked for embedded live Google and Trustpilot widgets, and correctly identified that doing so
means relaxing `script-src`, `frame-src`, `connect-src` and probably `style-src`, gating the load
behind PECR consent, and spending LCP budget that `#243` fought back from roughly 12s.

`/propose` costed the API alternative it asked for and found a harder blocker underneath:
**Google's Places API terms forbid storing or caching review content.** Only the place ID may be
stored indefinitely; only coordinates may be cached, for 30 days. So the only compliant use is a
live call per render — on a `force-dynamic` landing page that is one billed *Place Details
Enterprise + Atmosphere* call per view, capped at **5 reviews**. The Business Profile API removes
the cost and the cap but needs a Google access request measured in weeks, a separate OAuth client,
and per-vendor OAuth onboarding that does not fit a multi-tenant platform.

The owner's decision was to stop trying to import other platforms' content at all. This slice
therefore builds the first-party equivalent, and represents external platforms as **outbound links
only**. The consequence worth stating plainly: **no CSP change and no consent-banner change**, which
is the entire reason `#406` was hard.

## Scope (this slice)

**Schema** — one additive migration adding `FeedbackStatus`, `CustomerFeedback`,
`CustomerFeedbackAttempt` and `VendorReviewLink` to `prisma/schema.prisma`.

`CustomerFeedback` is a **new model, not an extension of `Review`**. `Review`
(`prisma/schema.prisma:736-751`) requires `productId`, is uniquely keyed on it, and its writes
recompute `Product.averageRating` inside a transaction (`lib/repositories/reviews.ts:53`). Making
`productId` nullable would break that unique constraint's meaning and push a null branch through the
aggregate recompute. This is feedback about the *shop*, with a moderation lifecycle `Review` has
never had — note that `#406`'s body claims otherwise, and is wrong: **product reviews are
unmoderated today**.

**Eligibility** — any signed-in customer may submit; a purchase is **not** required. A completed
order, looked up server-side at submit time, stamps `verifiedPurchase` and earns a "Verified
customer" badge. One feedback per customer per vendor (`@@unique([vendorId, userId])`), written as
an upsert, the same shape as `upsertReview`.

**The rule that carries the most weight:** editing returns the row to `PENDING` and clears the
moderation stamp. Without it, approve-then-edit publishes unmoderated text, which is a complete
bypass of the feature's only content control.

**Anti-abuse**, in descending order of load borne:

1. A verified email address is already mandatory to sign in — `lib/auth.ts:198` sets
   `requireEmailVerification: true`. Submission is session-gated, so this is inherited, not rebuilt.
2. `@@unique([vendorId, userId])` — a customer can replace their one row, never accumulate rows.
3. Rate limiting on **submit and edit**, by SHA-256-hashed IP over a short window, copying
   `OrderLookupAttempt`/`AuthenticationAttempt` (`prisma/schema.prisma:1166`, `:1178`) and the
   separate-facade pattern of `lib/order-lookup-rate-limit-service.ts`. Limiting only submit would
   convert flooding into edit churn through the moderation queue.
4. Server-side validation, reusing `parseRating` from `features/reviews/validate-rating.ts`.
5. Plain text only — the comment is never rendered as markdown or HTML.
6. Moderation as the final backstop.

**Moderation** — a new `/staff/feedback` page. Staff may set `status` and `moderationNote` and
nothing else; no repository function exists that can alter `rating`, `comment` or `authorName`, so
staff cannot fabricate or edit a customer's words.

**Storefront** — `components/ui/CardStack.tsx`, a generic client component that knows nothing about
feedback, and `components/storefront/CustomerFeedbackCards.tsx`, the server component that supplies
the cards. Rendered on `app/(landing)/page.tsx` below the hero and the three trust claims, which is
where the hero-first design (P8.5f) leaves room for below-the-fold social proof. The cards are
server-rendered, so the section costs one indexed read and no client fetch.

**Entry points** — a link to `/feedback` from the landing section and from the account area. Two,
not three: an order-detail entry point would touch a fourth page for no behaviour this slice needs,
and is listed as excluded below.

**External links** — `VendorReviewLink` rows, managed on the existing `/staff/storefront` page,
rendered as a link group beneath the stack.

**Data rights** — `CustomerFeedback` is added to the P7b export and deletion paths in
`lib/repositories/data-rights.ts`, which today cover product reviews only (`:114`, `:242`, `:313`,
`:493`, `:530`).

## Key design decisions

**A table, not columns, for external links.** `VendorReviewLink` rather than
`googleReviewUrl`/`trustpilotUrl` on `VendorConfig`, because the ask named "other future review
platforms" explicitly. Adding a platform becomes data, not a migration, and no platform name is
compiled into the application.

**No new dependency for the slider.** The design reference
(`cards-stack-slider.uiinitiative.com`) is Swiper-based; this repo has no carousel library and the
landing page's LCP history makes adding one a real cost. A stacked-card slider is CSS transforms
plus Pointer Events, and hand-rolling it keeps full control of focus order and the reduced-motion
path. `components/layout/HorizontalScroller.tsx` is the in-repo precedent for the component's shape.

**`verifiedPurchase` is a snapshot, not a derivation.** Recomputed on every submit and edit, never
at render, and never accepted from the client. Published text and its badge should not silently
change months later because order history moved; the moment a customer edits is the moment they
re-assert the content, and that is when it is recomputed.

**Null hides the element.** A vendor with no approved feedback renders no section; a vendor with no
active links renders no link group. The `#239` rule, and what makes the slice honest for SriMart on
day one.

## Deliberately excluded

- **Any fetching, syncing, caching or display of review content from Google, Trustpilot or any other
  external platform.** Not deferred — rejected. This is the defining boundary of the slice.
- **Any third-party review widget, script, API key or OAuth integration.** Same.
- **Staff creating or editing feedback on a customer's behalf.** That is fabricating reviews.
  Permanently out of scope, and enforced by the absence of any repository function that could do it.
- **Moderating the existing product reviews** (`Review`). They remain unmoderated. Bringing them
  under a moderation lifecycle is a separate, larger change to a shipped feature and is not smuggled
  in here.
- **Replying to feedback publicly.** No reply field, no reply UI. `moderationNote` is internal only.
- **Photo or file attachments** on feedback. No storage surface, no upload path, no moderation
  burden for images.
- **An order-detail entry point** ("how did we do?" on a completed order). The account-area and
  landing links are enough to exercise the journey; adding a fourth touched page buys no new
  behaviour. Worth a follow-up if submission volume turns out to need it.
- **Email notifications** on submission, approval or rejection. `#104` means outbound email has no
  verified sending domain, so a notification requirement could not be validated live.
- **Aggregate rating on `VendorConfig`.** The average and count are computed at read; the row count
  does not justify a denormalised column, and `Product.averageRating` exists because product
  listings are a hot path that this section is not.
- **Feedback about a specific order, or per-order feedback threads.** One row per customer per
  vendor, deliberately.
- **A public "all feedback" page.** The card stack on the landing page is the only public surface in
  this slice.

## Open items carried forward

- **Zero content at launch.** The platform has never traded (`#113`, `#104`), so the section will
  render nothing in production until real customers submit. That is the correct behaviour, not a
  defect, and dev/staging are exercised through the demo accounts that `#818`'s validation relies on.
- **Moderation is unowned operational work.** Someone at Aheed must actually work the queue. Named
  in the staff guide by this slice; staffing it is not a repository concern.
- **`#406` should be closed as superseded.** The decision and its reasoning are recorded as a
  comment on `#406` already; closing it is an owner action, not taken by this slice.
