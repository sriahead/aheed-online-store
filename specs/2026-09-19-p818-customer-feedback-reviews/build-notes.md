# P9.2 — Customer Feedback & Reviews (build notes)

Written at the end of Build, before the Clear. Commit `c58be72` on
`feature/818-customer-feedback-reviews`, cut from `staging` at `6e5b95d`. Spec commit `019b550`.

## What changed and why

**Three new tables, one additive migration** (`20260919155910_p818_customer_feedback_reviews`),
generated `--create-only` and read before applying: no `DROP INDEX`, trigram indexes untouched.

`CustomerFeedback` is a **new model rather than an extension of `Review`**, and the reason is
load-bearing rather than tidiness: `Review` requires `productId`, is uniquely keyed on it, and
every write recomputes `Product.averageRating` inside a transaction. Making `productId` nullable
would have broken the unique key's meaning and pushed a null branch through that aggregate.

**Along the way this slice established that product reviews are not moderated at all.** `#406`'s
body asserts that the `Review` model has moderation; it does not — there is no status column and
`features/reviews/submit-review.ts` publishes on submit. That is a pre-existing gap in shipped
code, not something this slice introduced, and it is now filed as its own issue (see *Deferred
items* below). It is worth knowing because the two features now sit side by side with opposite
publication rules.

**Layering follows the established shape exactly.** Three repositories under `lib/repositories/`
(`customer-feedback`, `customer-feedback-rate-limit`, `vendor-review-links`), each taking its
Prisma client and `vendorId`/`userId` as explicit parameters with a type-only `@/lib/db` import;
three request-scoped facades beside them. The rate limiter's facade exists separately for the
reason `lib/order-lookup-rate-limit-service.ts` records: it is a security control, and a control
that resolves its own client cannot be exercised from a `tsx` script at all.

**The submission path** is a session-gated Server Action behind a plain `<form>`
(`features/feedback/submit-feedback.ts`), matching `submit-review.ts`. Pure validators live in
`features/feedback/validate-feedback.ts` because a `"use server"` file may export only async
functions — enforced at runtime, so a stray value export leaves every build and test green while
every action in the file 500s. `parseRating` is imported from `features/reviews/validate-rating.ts`
rather than reimplemented.

**Moderation** is `/staff/feedback`, landing on all three required surfaces (`PanelNav` both tiers,
the hub, `docs/staff-playbook/staff-tabs-guide.md`) with `PanelRefusal` on the refusal branch.
`tests/staff-nav-parity`, `tests/panel-refusal-coverage` and `tests/panel-token-purity` all pass.

**The card stack** is `components/ui/CardStack.tsx` — generic, no feedback/review/rating reference,
no `lib/` import — with `components/storefront/CustomerFeedbackCards.tsx` supplying content. No
carousel dependency was added; the behaviour is CSS transforms plus Pointer Events.

**P7b data rights** gained three changes in `lib/repositories/data-rights.ts`: the export payload,
the erasure transaction (`feedbackDeleted`), and — the one most easily missed —
`countOtherVendorData`. `CustomerFeedback.userId` cascades, so omitting that third call would have
let an erasure request at one vendor silently delete another vendor's published feedback as a side
effect of deleting the shared identity.

**No persistent doc changed.** This slice sets no new standing decision: it reuses ADR-004 tenancy,
the `#239` null-hides rule, the `#350` `PanelRefusal` rule and the `#409` rate-limit pattern.
`specs/architecture.md` and `specs/design-system.md` were checked and neither enumerates models or
components in a way this invalidates.

## Decisions taken during the build

**`setFeedbackStatus` does a scoped read then an update by primary key** — two queries where one
looks possible. It is not `updateMany({ id, vendorId })` because `updateMany` through the HTTP
client crashes unconditionally, and it is not `update` with a caught `P2025` because the two
adapters report the same Postgres condition under different `.code` values, so any correctness
that rests on matching an error code has to be proven against a real failing request. A scoped read
plus an update by id needs no error code at all and returns `false` for a missing row.

**`VendorReviewLink` is a table, not columns on `VendorConfig`**, so adding a platform is data.
The form module declares `ReviewLinkFormValue` while the repository declares its own
`ReviewLinkInput`: the repository layer in this codebase declares its own shapes rather than
importing them from form modules (`lib/repositories/vendor.ts` is the precedent), and two exported
interfaces sharing one name across layers reads badly.

**Rate-limit numbers**, which the spec fixed but the shape of which it did not: one counter covers
submits and edits identically (5 per vendor+hashed-IP per 10 minutes), plus a 60-second minimum
between writes to the same row. `lastSubmittedAt` is passed *into* the limiter rather than read
inside it, so the limiter stays a pure counter over its own table and the caller keeps a single
read of the feedback row.

**`moderateFeedback` uses `requireVendorRole("STAFF", "ADMIN")`, not `("STAFF")`.**
`requireVendorRole` matches the membership role against the allowed list exactly, so a single
`"STAFF"` argument refuses a vendor ADMIN, who can do strictly more. Found by reading
`lib/auth-rbac.ts:71` rather than by a failing test.

**Review-link admin is a separate `ReviewLinksManager` component** rendered below the existing
form on `/staff/storefront`, rather than spliced into the 750-line `StorefrontConfigForm`. This
follows the existing `*Manager` convention (`BrandManager`, `DeliveryAreaManager`).

**Unfilled stars use `text-primary-subtle`.** The first attempt used `text-black/20` and
`tests/token-alpha-purity.test.ts` rejected it; `text-primary-subtle` is that test's own designated
token for aria-hidden graphics.

**The `jsx-a11y/no-noninteractive-tabindex` suppression on the stack container is deliberate and
narrow.** Under `prefers-reduced-motion: reduce` that container becomes a horizontally scrollable
region, and a scrollable region must be keyboard-reachable (WCAG 2.1.1) — `tabIndex={0}` is the
recommended way to provide that. Removing it to satisfy the linter would make the reduced-motion
path unreachable by keyboard, which inverts what the rule protects.

**The reduced-motion fallback is a real CSS media query in `globals.css`, not a JS check or an
opt-out class.** This project's existing class-scoped opt-out was found missing 24 utility
transforms; a media query clearing `transform` on the item selector cannot forget one.

## Deviations from the spec

Three, all recorded in `requirements.md` at the point of the requirement rather than only here.

**R40 — amended.** As written it required every card to be individually tabbable. On
implementation that specifies an accessibility anti-pattern: the cards carry static text, making
static text focusable is a known screen-reader nuisance, and cards fanned behind the front one are
visually hidden, so tabbing would put focus somewhere a sighted keyboard user cannot see. Replaced
with the standard focusable-container carousel pattern — the container takes focus and arrow keys
drive it, every card stays readable to assistive technology, nothing is `aria-hidden` or
`display: none`. `validation.md`'s R40 row was rewritten to match and says explicitly not to
validate against the original wording.

**R49 and R6 — clarified.** Both were comment-blind as written. R49 said no file under
`components/`/`lib/` may contain `Google` or `Trustpilot`; three docstrings state that no platform
is hardcoded, so the words appear in comments explaining their own absence. R6 forbade
`$queryRaw` in changed files; the generated `app/(admin)/staff/runbook/docs.ts` embeds
documentation prose discussing raw SQL. Both now scope to executable, hand-written code. This is
the same comment-vs-code distinction that `tests/panel-refusal-coverage.test.ts` documents — and
this slice's own `tests/customer-feedback-client-choice.test.ts` had to be fixed for it after it
failed against correct code by matching the docstring warning against `createMany`.

**One ambiguity resolved rather than deviated from.** R36 (no section with zero approved feedback)
and R46 (link group renders from active rows) did not say, read together, whether the outbound
links survive an empty feedback section. They must: at launch there will be no approved feedback,
and `plan.md` states the links carry the load meanwhile. `ReviewLinkGroup` is therefore a sibling
component rendered independently, not a child of the section. An empty-state "Shopped with us?"
invite was built on the landing page during this work and then **reverted** — it contradicted R36
and was UI nobody asked for. Discovery in that state is the account-area link, which suffices
because only a signed-in customer can submit at all.

## Known-shaky areas

**Look here first.**

**R10's live proof is incomplete, and this is the single biggest gap.**
`scripts/verify-customer-feedback.ts --bulk-approve` passes, but it runs in Node against
`PrismaNeon` over `DIRECT_URL` — **not** the Worker's HTTP adapter. It proves the query shape and
the zero-row case; it cannot reproduce the HTTP-adapter crash that the whole `getPrismaWs()` rule
exists for. The only conclusive check is pressing **"Approve all"** on `/staff/feedback` under
`npm run preview` with two or more `PENDING` rows. A wrong client 500s there while the script and
the unit test both pass. The validation row says so.

**Nothing has been exercised through a browser.** The keyboard path, the live region, the
reduced-motion fallback, the drag gesture, the 320px gutter and the focus rings are all
implementation-by-reading. The drag handler in particular has never had a real pointer on it — it
uses `onPointerDown`/`onPointerUp` on the container with a 60px threshold and no pointer capture,
so a drag that leaves the element mid-gesture may not register. That is the most likely place for a
real defect.

**The second vendor has not been rendered.** R56/R57 (SriMart renders neither section, and the
palette resolves from that vendor's tokens) are unverified. `brandStyle()` injects inline custom
properties that beat `:root`, and several colour checks in this repo false-positive against
Aheed's values, so this needs a real second-vendor host, not an inference from Aheed.

**Session gating is unproven end to end.** `submitFeedback` checks the session before any write,
but that has only been read, not exercised. R13's validation step (replay the Server Action POST
with the cookie removed) is the check that matters, and the verification script deliberately cannot
cover it — it calls the repository directly and so never touches the action.

**The moderation queue's ordering depends on Postgres enum declaration order.**
`listFeedbackForModeration` orders by `status: "asc"`, which sorts by the order the enum members
are declared (`PENDING`, `APPROVED`, `REJECTED`) rather than alphabetically. That is why the enum
is declared in that order. Reordering the enum would silently reorder the queue.

**`relativeDate` uses `Intl.RelativeTimeFormat` with a hardcoded `en-GB`** and a `now` injected for
test determinism. It has no unit test. It is display-only and cannot affect what is published, but
the month/year buckets are rough (30-day months).

**The landing page now issues three additional queries** (`listApproved`, `approvedSummary`,
`listActive`), parallelised with each other but sequential after the existing category/campaign
reads. All are indexed and vendor-scoped; none has been measured against the LCP budget `#243`
established. Worth one look during validation rather than an assumption.

**`FEEDBACK_CARD_LIMIT` is 12** with no pagination. A vendor with hundreds of approved reviews
shows the newest twelve and no more. Deliberate for this slice, but it is an unstated product
decision rather than a spec'd one.
