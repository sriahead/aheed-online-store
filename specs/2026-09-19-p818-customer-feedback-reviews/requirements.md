# P9.2 — Customer Feedback & Reviews (requirements / acceptance criteria)

Closes `#818`. Adds first-party business-level customer feedback: signed-in customers submit a
rating and comment, staff approve it before publication, approved feedback renders on the landing
page in a reusable Cards Stack Slider, and external review platforms appear only as
vendor-configurable outbound links. Supersedes `#406`, whose embedded-widget approach is rejected —
see `plan.md`. Builds on `Review`/`parseRating` (P2.5a, `#39`), the hashed-IP rate-limit pattern
(`#409`), the `PanelRefusal` rule (`#350`), the nav-parity rule (`#612`) and P7b data rights
(`#216`).

**Definitions used below, stated once so no reader has to infer them.**

- **Completed order** — an `Order` whose `status` is `DELIVERED` or `COLLECTED`. No other status
  counts, including `CONFIRMED` and `OUT_FOR_DELIVERY`.
- **The demo customer** — a seeded customer account on the Aheed vendor that has at least one
  completed order. **The no-order customer** — a seeded Aheed customer with none.
- **The second vendor** — SriMart.
- **Comment maximum length** — 1000 characters after trimming.
- **Write attempt** — one submit or one edit of a `CustomerFeedback` row, counted identically.

`npm run preview` is required wherever a step touches the database; `npm run dev` cannot load the
WASM Prisma engine and silently renders an error state.

## Schema and migration

R1. `prisma/schema.prisma` declares `enum FeedbackStatus` whose members are exactly `PENDING`,
    `APPROVED`, `REJECTED`.

R2. `prisma/schema.prisma` declares `model CustomerFeedback` with fields `id`, `vendorId`, `userId`,
    `authorName` (String), `rating` (Int), `comment` (String?), `verifiedPurchase`
    (Boolean, `@default(false)`), `status` (`FeedbackStatus`, `@default(PENDING)`), `moderatedById`
    (String?), `moderatedAt` (DateTime?), `moderationNote` (String?), `ipHash` (String?),
    `submittedAt` (DateTime), `createdAt`, `updatedAt`; with `@@unique([vendorId, userId])` and
    `@@index([vendorId, status, submittedAt])`. The `userId` relation is `onDelete: Cascade` and the
    `moderatedById` relation is `onDelete: SetNull`.

R3. `prisma/schema.prisma` declares `model CustomerFeedbackAttempt` with fields `id`, `vendorId`,
    `ipHash`, `createdAt` and `@@index([vendorId, ipHash, createdAt])`.

R4. `prisma/schema.prisma` declares `model VendorReviewLink` with fields `id`, `vendorId`,
    `platform` (String), `url` (String), `sortOrder` (Int), `isActive` (Boolean, `@default(true)`),
    `createdAt`, `updatedAt`; with `@@unique([vendorId, platform])` and
    `@@index([vendorId, isActive, sortOrder])`.

R5. Exactly one new directory exists under `prisma/migrations/`, added by this slice, and its
    `migration.sql` contains no `DROP INDEX` statement naming any trigram index.

R6. No field added to `prisma/schema.prisma` by this slice is `Json`-typed, and no file added or
    modified by this slice outside `prisma/migrations/` contains `$queryRaw`, `$executeRaw` or
    `$queryRawUnsafe`.

## Repository and service layers

R7. `lib/repositories/customer-feedback.ts`, `lib/repositories/customer-feedback-rate-limit.ts` and
    `lib/repositories/vendor-review-links.ts` exist, and every exported function in each takes its
    Prisma client as its first parameter and `vendorId` (and `userId` where user-scoped) as explicit
    parameters, reading no request context.

R8. `tests/repository-purity.test.ts` and `tests/repository-client-injection.test.ts` pass with the
    new repositories present.

R9. `lib/customer-feedback-service.ts`, `lib/customer-feedback-rate-limit-service.ts` and
    `lib/vendor-review-links-service.ts` exist as the request-scoped facades, resolve their Prisma
    client inside each call, and hold no module-level client.

R10. The bulk-moderation export in `lib/repositories/customer-feedback.ts` accepts the websocket
     client type (`ReturnType<typeof getPrismaWs>`), `lib/customer-feedback-service.ts` passes
     `getPrismaWs()` to it, and every single-row read or write passes `getPrisma()`.

R11. Every export of every `"use server"` file added by this slice is an `async function`; all pure
     validators live in a module without the `"use server"` directive.

## Submission

R12. `app/(storefront)/feedback/page.tsx` exists, renders the submission form to a signed-in
     customer, and renders a sign-in prompt instead of the form to a signed-out visitor.

R13. The submit Server Action rejects a request carrying no session and writes no row, independently
     of whether a form was rendered.

R14. The no-order customer can submit successfully, and the stored row has
     `verifiedPurchase = false`.

R15. The demo customer's submission stores `verifiedPurchase = true`; the value is computed
     server-side from that customer's own orders, and a `verifiedPurchase` field supplied in the
     submitted form data is ignored.

R16. A submission is stored with `status = PENDING` and its comment does not appear in the landing
     page's HTML.

R17. A second submission by the same customer for the same vendor replaces the existing row;
     `CustomerFeedback` holds exactly one row for that (vendor, user) pair.

R18. Editing feedback whose `status` is `APPROVED` sets `status` back to `PENDING`, sets
     `moderatedById` and `moderatedAt` to null, and removes the comment from the landing page's
     HTML.

R19. The submit action rejects any rating that is not an integer from 1 to 5, using `parseRating`
     imported from `features/reviews/validate-rating.ts` rather than a reimplementation.

R20. The submit action rejects a comment that is empty after trimming and a comment longer than 1000
     characters after trimming, and writes no row in either case.

R21. A comment containing HTML or markdown syntax appears in the landing page's HTML as escaped
     literal text; no element is created from it.

R22. `CustomerFeedback.authorName` is stored at submit time as the customer's first name followed by
     their surname initial and a full stop (for example `Sarah M.`), derived server-side from the
     account, and is not re-derived at render.

R23. A link to `/feedback` is present in the landing page's feedback section and in the account
     area.

## Rate limiting

R24. A sixth write attempt from the same (vendor, hashed IP) within 10 minutes is refused, and no
     `CustomerFeedback` row is created or modified by it.

R25. A second write to the same `CustomerFeedback` row within 60 seconds of the previous one is
     refused, and that row is left unchanged.

R26. Every `CustomerFeedbackAttempt.ipHash` value is a 64-character hexadecimal SHA-256 digest, and
     no column added by this slice stores a raw IP address.

## Moderation

R27. `app/(admin)/staff/feedback/page.tsx` exists, lists feedback for the signed-in staff member's
     vendor with `PENDING` rows first, and provides approve, reject, un-approve, bulk-approve and
     internal-note controls, each of which completes without a 5xx.

R28. `app/(admin)/staff/feedback/page.tsx` renders the `PanelRefusal` component on its role-refusal
     branch and never `return null`; `tests/panel-refusal-coverage.test.ts` passes.

R29. `/staff/feedback` appears in both `components/staff/PanelNav.tsx` and the hub at
     `app/(admin)/staff/page.tsx`; `tests/staff-nav-parity.test.ts` passes.

R30. `docs/staff-playbook/staff-tabs-guide.md` contains a `/staff/feedback` section, and every
     capability sentence in that section names a control that exists on the rendered page.

R31. No exported function reachable from a staff surface creates a `CustomerFeedback` row, or
     modifies an existing row's `rating`, `comment` or `authorName`. Staff-reachable writes change
     only `status`, `moderatedById`, `moderatedAt` and `moderationNote`.

R32. Approving a row sets `status = APPROVED`, `moderatedById` to the acting staff user's id and
     `moderatedAt` to a timestamp; rejecting sets `status = REJECTED` and the row still exists
     afterwards.

R33. `tests/panel-token-purity.test.ts` passes with the new staff page present.

## Storefront rendering

R34. `components/ui/CardStack.tsx` exists, carries the `"use client"` directive, and contains no
     occurrence of `feedback`, `review` or `rating` in any casing, and imports no `lib/` module.

R35. The storefront feedback section renders only rows whose `status` is `APPROVED` and whose
     `vendorId` is the current vendor's, ordered by `submittedAt` descending.

R36. The section renders no heading, container or placeholder when the current vendor has no
     approved feedback.

R37. The section's header shows the mean rating of approved rows to one decimal place and the count
     of approved rows.

R38. A rendered card contains the rating, the comment, `authorName` and a relative date, and
     contains no email address, no surname beyond the stored initial, no order identifier and no
     `img` element.

R39. A card shows the "Verified customer" badge when and only when its row has
     `verifiedPurchase = true`.

R40. Every card and every previous/next control in the stack is reachable by keyboard in DOM order,
     the controls are `button` elements with distinct accessible names, and the focused element
     shows a visible focus indicator.

R41. The stack container carries `aria-roledescription="carousel"`, each card's accessible name
     includes its position within the set, and moving the stack updates a region with
     `aria-live="polite"`.

R42. The front card does not change without user input.

R43. Under `prefers-reduced-motion: reduce`, the stack renders as a plain scrollable row and applies
     no transform animation when the active card changes.

R44. At a 320px viewport width the page has no horizontal scrollbar and the section's content is
     separated from both viewport edges by a non-zero gutter.

R45. The approved cards are present in the landing page's server-rendered HTML; the section
     performs no client-side fetch to obtain them.

## External review links

R46. The storefront renders a link group built from the current vendor's `VendorReviewLink` rows
     where `isActive = true`, ordered by `sortOrder` ascending, and renders no group at all when the
     vendor has no active rows.

R47. Every rendered external review link carries `target="_blank"` and `rel="noopener noreferrer"`.

R48. Saving a `VendorReviewLink` whose URL does not use the `https:` scheme is refused, using
     `parseSocialUrl` from `lib/social-contact-form.ts` rather than a reimplemented URL check.

R49. External review links are created, edited and deactivated from the existing `/staff/storefront`
     page, and no file added or modified by this slice under `components/` or `lib/` contains the
     literal strings `Google` or `Trustpilot`.

## Data rights and privacy

R50. The P7b data-rights export for a customer includes that customer's `CustomerFeedback` rows with
     their rating, comment and submission date.

R51. The P7b data-rights deletion for a customer deletes that customer's `CustomerFeedback` rows and
     returns a `feedbackDeleted` count in its result.

R52. `app/(storefront)/privacy/page.tsx` states that an approved submission publishes the customer's
     first name, surname initial and rating.

## Boundaries this slice must not cross

R53. The `Content-Security-Policy` header value in `next.config.mjs` is unchanged by this slice.

R54. `components/consent/CookieBanner.tsx` is unchanged by this slice.

R55. No file added or modified by this slice contains `googleapis.com`, `mybusiness`,
     `places.googleapis` or `trustpilot.com/api`, and `package.json` gains no new entry under
     `dependencies`.

## Multi-vendor

R56. With Aheed holding approved feedback and active review links, and the second vendor holding
     neither, Aheed's storefront renders both the section and the link group while the second
     vendor's storefront renders neither.

R57. The section's colours resolve from design tokens, and the section renders in the second
     vendor's palette when served on the second vendor's host.

## Documentation build

R58. `npm run kms:validate` and `npm run kms:check-generated` exit 0; `ARTIFACT_INDEX.md` contains a
     row for this slice's `plan.md`; and `npm run kms:assemble:internal` followed by a real
     `next build` in `kms/site-internal` both succeed.

## Gates

R59. `CHANGELOG.md` updated (Gate 4).

R60. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
