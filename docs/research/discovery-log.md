---
id: discovery-log
title: "Discovery log"
audience: [dev, product]
type: doc
status: approved
version: "1.2.0"
updated: 2026-09-05
visibility: internal
summary: "Append-only record of Discover-phase findings — customer problems, opportunities, friction, gaps, risks and assumptions — each separating observed evidence from interpretation, and each ending in exactly one governance next action."
tags: [research, discovery, opportunities, risk, sdd]
related: [research-index, sdd-workflow, roadmap]
---

# Discovery log

Newest entry first. Written by the **Discover** phase (`/discover`, and automatically at every
milestone close). Nothing here is approved scope — see `docs/research/README.md`.

## Entry template

```
### YYYY-MM-DD — <short finding title>

**Trigger:** <milestone close | explicit /discover | incidental>
**Status of the area:** <already implemented | already tracked as #NN | genuinely unowned>

**Observed (verifiable today):** file, line, schema field, issue number, or command output.
**Interpretation:** what I think it means. Clearly separated from the line above.
**Confidence:** Known / Inferred / Needs validation.

**Why it matters commercially:** which customer behaviour would change, and the business value.
**Options considered:** including the cheapest one and doing nothing.
**Cost of delay:** what gets more expensive the longer this waits.

**Next action:** RESEARCH MORE | PROPOSE | ADD TO ROADMAP/BACKLOG | READY FOR SPEC | DO NOT PURSUE
```

---

## 2026-09-05 — third Discover pass (P2.6 milestone close)

Run automatically at milestone close, per `specs/sdd-workflow.md`, immediately after `#569`
(P2.6's sixth and final slice) shipped and promoted. One genuinely new finding, plus a
process correction: two 2026-09-02 findings below had carried `PROPOSE` for three days with no
issue filed — an instruction-8 gap in the pass that wrote them, now fixed (filed as **#606** and
**#607**, addenda added in place below rather than duplicating the research). Everything else this
pass surfaced was already owned: the missing brand mega-menu/thumbnails are `#394`; pack size is
`#398`; the three filter-key-list/staff-hub-link gaps found during `#569`'s own Build are `#601`/
`#602`; the AI synonym proposal response-shape risk is `#583`.

### 2026-09-05 — six of `#569`'s seven new facet fields never reach a product card or detail page

**Trigger:** milestone-close Discover, grounding in the code that just shipped (`#569`).
**Status of the area:** genuinely unowned — not required by `#569`'s own requirements (`R20`–`R23`
scoped the filter *controls*, not what a matched product then displays) and not covered by any
other filed issue.

**Observed (verifiable today):** `lib/repositories/products.ts:420`'s `productSummarySelect` — the
one shape every storefront card, list and detail page is built from (`ProductDetail extends
ProductSummary`, line 92) — selects `isHalal`, `isFresh`, `isOrganic`, `origin` and
`originalPrice`, and nothing else from `#569`. It was not touched by `#569`. `ProductCard.tsx`
renders a badge for `isHalal` (line 65) and `isFresh` (line 71) and shows `origin` as plain text
(line 119) — all three pre-existing. There is no badge, label or any rendering anywhere in
`app/(storefront)/` or `components/product/` for `isVegetarian`, `isGlutenFree`, `isHmcCertified`,
`brandId`/`Brand.name`, `hmcReference` or `hmcVerifiedAt`. A shopper can filter `/search` to
"Vegetarian" or "Brand: Shan" or "HMC certified" and get a correctly narrowed result set (confirmed
live at this slice's own `/validate`), but nothing on the resulting product cards or detail pages
confirms *why* a product matched, or shows the brand name, or shows the HMC certificate reference
and verified date the admin form requires before the flag can even be ticked.

**Interpretation:** the filter half of this facet feature is complete; the display half — showing a
shopper the fact that made a product match, which is also how a shopper who is just browsing
(not filtering) discovers these attributes at all — was not built. For three of the six facets
(vegetarian, gluten-free, brand) this is a lost merchandising signal: no badge, no
brand-recognition cue anywhere a shopper is actually looking at a product. For HMC certification
specifically it is sharper than a missing badge: `#569`'s own stated reason for requiring
`hmcReference`/`hmcVerifiedAt` before the flag can be ticked is `#239` — a real incident of this
codebase asserting HMC certification with no basis for it. Storing that provenance but never
showing it to the shopper relying on the claim leaves the shopper in exactly the position `#239`
was about: taking a certification claim on faith, with the safeguard existing only in the database
and the admin form, never reaching the person who needs to trust it.

**Confidence:** the code facts (the shared select, the badge code, the absence everywhere else) are
Known — grepped directly, not inferred. That this is a genuine shopper-trust gap for HMC
specifically, rather than a cosmetic one for the other five fields, is Inferred from `#569`'s own
stated rationale for the provenance requirement.

**Why it matters commercially:** brand and dietary badges are a scan-speed and trust signal in
grocery browsing — a shopper does not read filter chips while scrolling a result grid, they read
badges on the card. For HMC, the gap is closer to a compliance/reputational one: the codebase now
argues internally (in the schema, in the admin form's validation, in this slice's own commit
history) that an HMC claim needs evidence, while showing the shopper no more evidence than existed
before this slice shipped.

**Options considered:** extend `productSummarySelect` and `ProductCard.tsx`/the detail page with
badges for the three new booleans plus a brand name/link, matching the existing `isHalal`/`isFresh`
pattern exactly (smallest change, reuses an established pattern); do the same but additionally
surface `hmcReference`/`hmcVerifiedAt` only on the product detail page (not the card, where space is
tight) as a small "Certified — ref. X, verified DD/MM/YYYY" line, which is the part that actually
closes the `#239` gap rather than just adding cosmetic parity; leave it as-is, accepting that this
slice's facets are filter-only until a future slice's own display work happens to cover them.

**Cost of delay:** low technically (the shape and the badge pattern both already exist to copy), but
every day live is a day the HMC provenance the schema now enforces is invisible to the shopper it
exists to protect.

**Next action:** PROPOSE — filed as **#608**.

---

## 2026-09-03 — second Discover pass (P2.6 search & AI shopping, at /propose)

Five findings from a pass over the search path, the shop-list matcher, the data-rights machinery and
the six slice issues filed for P2.6 the same day (**#564** to **#569**). Everything else the pass
surfaced was **already owned**: fuzzy ranking is `#286`, synonyms `#396`, facets `#397`, pack size
`#398`, saved lists `#116`, stock badges `#400`, the mega-menu `#394`, and the filter-form token
`#512`. The landing page having a postcode checker where every other route has a search box is
**already implemented deliberately** (P8.5f, `components/layout/Header.tsx`) and is not a gap.

Two of these are filed as issues; three are constraints on slices already filed and are recorded
here plus as comments on those issues, because a near-duplicate issue for a rule that belongs in an
unwritten spec is noise rather than tracking.

### 2026-09-03 — a search query log is personal data and nothing connects it to data rights

**Trigger:** explicit /discover on P2.6.
**Status of the area:** genuinely unowned — `#565` proposes the log and does not mention data rights.

**Observed (verifiable today):** `lib/repositories/data-rights.ts` exports exactly ten model sets
(`user`, `account`, `session`, `address`, `order`, `review`, `cart`, `loyaltyAccount`,
`loyaltyLedgerEntry`, `discountRedemption`) and its erasure path deletes reviews, carts and loyalty
accounts, tombstones orders and deletes the user. That function's own comment warns that "a partial
erasure leaves a user half-deleted with no way to tell where it stopped". `#565` proposes a
vendor-scoped search query log recording queries and zero-result queries; its body says nothing
about export or erasure. `ErrorEvent` (`prisma/schema.prisma:962`) is absent from both paths too,
but carries no user link, so it raises the question rather than answering it.

**Interpretation:** a search history tied to a signed-in user is personal data under UK GDPR, and P7
built the data-subject-rights machinery precisely so that new personal data has somewhere to go. A
log added without wiring is a silent compliance regression of exactly the shape this repo has
already paid for elsewhere.

**Confidence:** the code facts are Known. Whether the log will carry a user link at all is **Needs
validation** — it is an open design choice in `#565`'s unwritten spec, and the cheapest resolution
is to decide it never does.

**Why it matters commercially:** a data-subject access request that silently omits a category of
personal data is a regulatory exposure, and search history is unusually revealing — dietary,
religious and health inferences all fall out of grocery queries.

**Options considered:** record no user link at all, storing vendor plus a hashed IP exactly as
`OrderLookupAttempt` and `AuthenticationAttempt` already do ("SHA-256 of the caller's IP, not the IP
itself — this table exists purely as a counter"), which removes the problem at the root and still
serves the curation purpose the log exists for; link to the user and wire the model into both export
and erasure; link and accept the gap, which is not defensible.

**Cost of delay:** after launch this becomes a migration over live rows plus a decision about
backfilling or discarding history already collected.

**Next action:** PROPOSE

### 2026-09-03 — the zero-result AI call is an unmetered, attacker-controlled cost path

**Trigger:** explicit /discover on P2.6.
**Status of the area:** genuinely unowned — `#565` specifies the AI call and no limit on it.

**Observed (verifiable today):** `/search` is public and unauthenticated, and `#565` attaches a
Cloudflare AI call to any query returning zero results — a condition fully controlled by the caller
through the `q` parameter. **There is no middleware layer to limit it centrally:** no `proxy.ts` or
`middleware.ts` exists, and `CLAUDE.md` records that none can ship on this stack at all, because
Next 16 forbids the edge runtime for a Proxy file while `@opennextjs/cloudflare` 1.20.2 exits the
build on a Node-runtime one. Rate limiting therefore exists only per route, in two places:
`lib/auth.ts` (and only as a **plugin** — a bare `onRequest` config key silently never runs, `#483`)
and guest order lookup. Both are backed by the same model shape, `vendorId` plus `ipHash` plus
`createdAt` with a matching index (`OrderLookupAttempt`, `AuthenticationAttempt`).
`lib/image-generation.ts:44` already carries a 429 retry loop with 2s and 4s backoff because
Workers AI rate-limits this account in practice.

**Interpretation:** a trivial script issuing random queries converts each request into a paid
inference. The account's AI quota is **shared with the product image pipeline**, so the failure is
not only a bill — exhausting it also stalls image generation, which `#523` already showed is a
fragile, bounded, scheduled job.

**Confidence:** Known. Every element is a verified code or configuration fact.

**Why it matters commercially:** unbudgeted spend on an endpoint no one is watching, plus a
shared-quota outage in an unrelated subsystem, and neither has an alert behind it — `#437`
(critical production alerting) is still open.

**Options considered:** a per-route limiter reusing the existing counter-model shape, which is a
known-good pattern here; a cheap pre-filter so AI is reached only after the deterministic rungs fail
and only for queries that look like plausible product terms; caching corrections by normalised query
so a repeated attack costs nothing after the first hit; doing nothing, which is only tenable if the
AI rung is never reached by anonymous traffic.

**Cost of delay:** designing the limiter alongside `#565` is nearly free; adding it after an
unexpected bill or a stalled image job means doing it under pressure.

**Next action:** PROPOSE

### 2026-09-03 — the recovery ladder fires on zero results, but the damaging case is one bad result

**Trigger:** explicit /discover on P2.6.
**Status of the area:** genuinely unowned — a design gap between `#564` and `#565` as filed.

**Observed (verifiable today):** `searchProducts` (`lib/repositories/products.ts:359`) ORs `name`
with `description`, so a term hitting prose in an unrelated product's description is a match. P3d
deliberately excluded `description` from **list** matching and recorded why: "A term matching prose
in a description produces a confident-looking wrong match, which is precisely what the review step
exists to prevent." The two paths therefore already disagree, and the storefront takes the looser
one. `#565`'s ladder is specified to run when a search yields no products; `#564` leaves whether
`description` stays in the match set as an open question for its spec.

**Interpretation:** a one-word query such as `haldi` that happens to appear in a single product's
description returns exactly one result, so the correction and synonym rungs never run. The shopper
sees one tangential product instead of the turmeric shelf — worse than zero results, because zero at
least triggers recovery. The trigger should be a relevance or confidence threshold, not a count
of zero.

**Confidence:** the code facts and the P3d ruling are Known. That this pattern occurs in the live
catalogue is **Needs validation** — and it becomes directly measurable from `#565`'s own query log
once that exists, which is an argument for shipping the log before tuning the trigger.

**Why it matters commercially:** grocery staples carry many near-synonyms and shoppers type one
word. A single irrelevant result reads as "they do not stock this" just as firmly as an empty page,
while consuming the one mechanism built to prevent that conclusion.

**Options considered:** fire the ladder on a relevance threshold rather than a result count; drop
`description` from search matching so the storefront agrees with the list matcher; keep
`description` but rank name matches above it and offer a "did you mean" alongside thin results
rather than only in place of empty ones.

**Cost of delay:** `#564` and `#565` are being specced now. The trigger condition is cheap to get
right before staff begin curating synonyms against it and awkward afterwards.

**Next action:** PROPOSE

### 2026-09-03 — the AI shop list accepts pack sizes it has no model to resolve

**Trigger:** explicit /discover on P2.6.
**Status of the area:** genuinely unowned as a **sequencing** question; the underlying unit model is
tracked as `#398`.

**Observed (verifiable today):** `#567` accepts pack sizes as input and requires that "quantities and
specified pack sizes are retained wherever possible". `Product` carries no pack-size field, and
`unitLabel` is free text of the form "GBP 2.40 per kg", unusable as a facet or a comparison. `#569`
avoids this by **excluding** pack size and deferring to `#398`; `#567` cannot, because pack size is
part of its input. `#398`'s unit-price half sits in **P9.3** and its variant and unit-of-measure
model in **P10** — both *after* P2.6, which was sequenced ahead of P9 on 2026-09-03.

**Interpretation:** "2kg atta" against a catalogue holding 1kg, 5kg and 10kg bags has no defined
resolution — two of the small bag, the nearest single pack, or a refusal are all defensible, and
they are not equivalent to the shopper. Without a unit model the AI will pick one confidently, which
is precisely the "materially different product" outcome the requirement forbids. This is a
dependency inversion created by the sequencing decision, not a defect in any single issue.

**Confidence:** Known.

**Why it matters commercially:** weight-denominated staples — atta, rice, keema, dal — are exactly
the vocabulary the Desi shop-list feature exists to serve, so this is the centre of the use case
rather than an edge of it.

**Options considered:** constrain `#567` to count quantities and route weight-denominated lines to
the review step flagged as needing a choice, which is the smallest change, keeps the
never-substitute guarantee intact and needs no unit model; pull `#398`'s unit derivation forward
ahead of `#567`, which reopens the sequencing decision; resolve to the nearest single pack and show
the size prominently in review, which is guessing with a disclosure.

**Cost of delay:** if `#567` is built before this is settled, its matcher encodes a guess that
`#398` then has to unpick, in the one place where a wrong answer charges the customer for the wrong
weight of food.

**Next action:** PROPOSE

### 2026-09-03 — ranking in-stock first can hide that the shop stocks the item at all

**Trigger:** explicit /discover on P2.6; a challenge to `#564` as filed.
**Status of the area:** partly tracked — `#400` (smart stock badges with expected restock date) is
filed and sits in P10.

**Observed (verifiable today):** `#564` will rank in-stock products ahead of out-of-stock ones.
An `inStockOnly` filter **already exists** as an explicit opt-in
(`buildFilterWhere`, `lib/repositories/products.ts:189`, setting the inventory quantity predicate to
greater than zero), so the shopper already has a control for "only show me what I can buy today".
Ordering is currently `createdAt desc, id desc` for every listing including search.

**Interpretation:** making availability the default *ordering* removes the signal that the store
carries the item at all, and the customer already had a way to ask for that behaviour when they
wanted it. In grocery, stock volatility on fresh and chilled lines is routine rather than
exceptional, and the shopper is a weekly returner: "out of stock, back Thursday" retains them,
while a result set that looks empty of their staple sends them to a competitor permanently.

**Confidence:** the code facts are Known. The retention claim is **Inferred** — and it cannot
currently be measured, because no analytics instrumentation exists (see the 2026-09-02 entry on
that, still unresolved).

**Why it matters commercially:** the cost of getting this wrong is asymmetric. Burying an
out-of-stock staple risks losing a weekly shopper outright; showing it with an honest availability
badge costs one line of a result page.

**Options considered:** rank in-stock first but guarantee an exact name match is always visible
regardless of stock, which preserves both signals; keep recency ordering and rely on availability
badges to carry the message; expose ordering as an explicit sort control and default it to
relevance rather than availability.

**Cost of delay:** low in code terms — this is a rule in one spec — but it is much easier to state
now than to revisit once `#568`'s autocomplete inherits the same ranking.

**Next action:** PROPOSE

---

## 2026-09-02 — first Discover pass (pre-launch, P9 in flight)

Three findings from a full pass over the schema, routes, the 99 spec slices and the 88 open issues.
Everything else the pass surfaced was **already owned** — the fourteen issues of the `#408` brief
(`#394` to `#407`), `#116`, `#232`, `#286`, `#146` to `#149` and `#100` are all filed and
sequenced, and are deliberately not repeated here.

### 2026-09-02 — a paid order cannot be reduced, substituted or refunded

**Trigger:** first Discover pass.
**Status of the area:** genuinely unowned — no issue, no spec, no schema support.

**Observed:** `features/orders/` contains only `advance-status.ts`, `advance-status-bulk.ts`,
`guest-data-rights.ts`, `reorder-items.ts` and `send-status-email.ts`; there is no staff
order-line-edit module. `lib/repositories/orders.ts` releases stock on cancellation only for
`PENDING_PAYMENT` orders. `PaymentStatus` declares `REFUNDED` and no code path ever writes it.
`ADR-005` states a paid order's code use cannot currently be reversed and that refunds are that
ADR's undecided territory. `CLAUDE.md` records `#137` and `#151` as structurally unreachable for
the same reason. `OrderItem` has no substitution, fulfilled-quantity or per-line note field.

**Interpretation:** a short pick — routine daily reality for fresh meat and produce — has no
representation. Staff can only deliver short and correct it out of band, after the customer has
already been charged in full, because `lib/payments.ts` pins no `capture_method` and so captures
immediately.

**Confidence:** the code facts are Known. That short picks are frequent at Aheed specifically is
**Inferred** — it is reasonable for a butcher, but it is not observed Aheed data.

**Why it matters commercially:** the first imperfect order is where grocery repeat-purchase rate is
won or lost. The exposure is also consumer-rights shaped, not merely UX shaped.

**Options considered:** a full substitution-preference flow (too large, and `#399`'s variant model
gates the weight half of it); a reduce-only line adjustment with a refund (smallest change that
makes the outcome representable); manual out-of-band refunds through the Stripe dashboard (works
today, leaves no order-level audit trail and cannot reverse loyalty points or a discount code).

**Cost of delay:** it needs an `ADR-005` amendment on refunds and capture, which `#399` also needs.
Deciding it once serves both; deciding it after launch means deciding it while live orders exist.

**Next action:** PROPOSE

**Update 2026-09-05 (P2.6 milestone-close Discover pass):** this finding carried `PROPOSE` for
three days with no issue filed — an instruction-8 gap in the pass that wrote it. Re-verified still
current (the `REFUNDED` enum value still has no writer, `ADR-005`'s own text still calls this "open
territory") and filed as **#606**.

### 2026-09-02 — there is no analytics instrumentation of any kind

**Trigger:** first Discover pass.
**Status of the area:** genuinely unowned.

**Observed:** `package.json` matches nothing for `analytics`, `gtag`, `plausible`, `posthog`,
`segment`, `mixpanel` or `umami`. No event-dispatch call exists in `app/`, `features/`,
`components/` or `lib/`. `lib/repositories/reports.ts` and the staff reports page both state that
sales analytics is deliberately absent while production runs Stripe test keys.

**Interpretation:** no conversion, basket-abandonment or search-success figure can be produced
today, and no baseline can exist for any future change. This is a **measurement** gap rather than a
feature gap, and it silently weakens every prioritisation argument made without it.

**Confidence:** Known.

**Why it matters commercially:** without a baseline, a shipped optimisation cannot be shown to have
worked, so the Learn phase can only report what was delivered, never whether behaviour changed.

**Options considered:** a full product-analytics vendor (cost, and a cookie-consent surface);
a minimal first-party event table written through the existing repository layer (view, add to
basket, begin checkout, purchase — vendor-scoped, no third party, no consent banner); nothing.

**Cost of delay:** every day of live trading without it is a baseline that cannot be recovered
retrospectively.

**Next action:** PROPOSE

**Update 2026-09-05 (P2.6 milestone-close Discover pass):** also carried `PROPOSE` with no issue for
three days. Re-verified still current and filed as **#607** — this gap is now doubly relevant, since
the 2026-09-03 "ranking in-stock first" finding below explicitly cannot be validated without it.

### 2026-09-02 — an order carries no delivery date, slot or capacity ceiling

**Trigger:** first Discover pass.
**Status of the area:** partly tracked — `#401` (delivery calendar) is filed and sits in P10.

**Observed:** `Order` carries `deliveryFeePence` and no date, slot or fulfilment-type field.
`VendorDeliveryArea` carries a postcode district prefix and no capacity. `#401` is gated on `#363`
(the vendor timezone is a hardcoded constant).

**Interpretation:** the *customer-facing* half of this is correctly deferred — the three-step
status in `specs/mission.md` is a deliberate MVP decision. The **operational** half is not the same
question: with no capacity ceiling, nothing stops a day taking more chilled orders than the van can
physically deliver. That is an operational risk that a launch surfaces immediately.

**Confidence:** schema facts Known. Whether Aheed's real delivery capacity is likely to be exceeded
at launch volumes is **Needs validation** — it depends on their van count and round size, which
this repo cannot answer.

**Why it matters commercially:** a missed chilled delivery is a refund plus a lost customer, and it
is the failure mode with the worst word-of-mouth in grocery.

**Options considered:** the full `#401` calendar (P10, gated); a per-day order cap with a simple
cut-off message (small, needs `#363` resolved for the cut-off time to be correct); an operational
answer outside the software, if Aheed's real capacity comfortably exceeds launch volume.

**Cost of delay:** low if the operational answer holds; high if it does not, and only Aheed can say
which.

**Next action:** RESEARCH MORE — ask Aheed for van count, round size and realistic daily order
ceiling before proposing anything.
