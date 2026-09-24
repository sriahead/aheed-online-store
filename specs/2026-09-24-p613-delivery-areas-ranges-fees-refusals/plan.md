---
id: p613-delivery-areas-ranges-fees-refusals-plan
title: "P10 #613/#890/#889 — Delivery areas: district ranges, per-area pricing, refusal counts (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-24
visibility: internal
summary: "Store admins enter postcode districts as lists or ranges, give any area or district its own delivery charge, minimum order and free-delivery threshold, and see which out-of-area districts shoppers tried; also specifies the district matching #402 shipped unspecified."
tags: [delivery, postcode, pricing, staff-panel, p10, "613", "890", "889"]
related: [adr-006-store-locations, store-admin-tabs-guide, discovery-log]
---

# P10 #613/#890/#889 — Delivery areas: district ranges, per-area pricing, refusal counts (plan)

**Goal:** a store admin can describe the real delivery footprint — "all of Milton Keynes except
MK17, and the outlying villages cost more" — on one page, `/staff/delivery-areas`, and can see
which districts outside it shoppers actually try. Shoppers are charged, and told, the rules for
their own district everywhere the price appears.

Three issues, one page, one owner decision each:

| Issue | What | Decided at |
|---|---|---|
| `#613` | District lists and ranges; specify `#402`'s district matching | `/propose`, 2026-09-24 (exclusions dropped) |
| `#890` | Per-area delivery charge, minimum order, free-delivery threshold | `/spec`, 2026-09-24 — overrides on each row |
| `#889` | Count out-of-area refusals per district per day | `/spec`, 2026-09-24 — header and checkout only |

## What already exists

`#402`'s build commit `2f0f20c` (2026-09-12), never specified, made `lib/delivery.ts`'s
`isDeliverable()` match a stored **area** (`MK`) against every district in it and a stored
**district** (`MK9`) against exactly that outward code. Its only caller is
`lib/delivery-eligibility.ts`, which serves checkout (`features/checkout/place-order.ts`), the
storefront header and `GET /api/address/lookup`. The staff form already accepts both shapes. So
"MK9 but not MK17" is already expressible by listing districts; what is missing is a practical way
to enter them, proof, and truthful documentation.

Delivery money rules are three vendor-wide columns on `VendorConfig` (`deliveryFeePence`,
`freeDeliveryThresholdPence`, `minimumOrderPence`), read through `VendorProfile` by: the checkout
page and its summary, `place-order` (authoritative), the header's cart drawer (`CartContents`),
`/cart`, and the landing-page delivery banner. `computeTotals` (`lib/order-totals.ts`) already
treats a threshold of `null` or `0` as "free delivery not offered". Nothing records a refused
postcode.

## Scope (this slice)

### A. District lists and ranges (`#613`)

- `lib/delivery-area-form.ts` gains `parsePrefixListInput`: comma lists and ranges (`MK1-MK10`,
  hyphen or en dash) expanded into ordinary rows, de-duplicated, capped at 100 entries per
  submission (the width of the widest possible range, `X0`–`X99`). `parsePrefixInput` is unchanged
  and stays the per-entry rule.
- Bulk insert `createDeliveryAreasForVendor` uses `createMany({ skipDuplicates: true })` on the
  **WebSocket** client — `createMany` crashes unconditionally through the HTTP adapter (`#382`).
- A single entry keeps today's single-row path and duplicate error unchanged.
- The add form's feedback is currently inside `sm:sr-only`, so on screens 640px and wider its errors
  and success text are visually hidden; this slice makes it visible at every width.

### B. Per-area pricing (`#890`)

- **Schema:** three nullable `Int` columns on `VendorDeliveryArea` — `deliveryFeePence`,
  `minimumOrderPence`, `freeDeliveryThresholdPence`. `null` = use the vendor default. One additive
  migration, generated `--create-only` and read before it applies (the `pg_trgm` drop hazard).
- **Meaning of zero**, deliberately matching `VendorConfig`: fee `0` = free delivery in that area;
  minimum `0` = no minimum there; threshold `0` = free delivery never offered there (what
  `computeTotals` already does with `0`). This is how an area opts *out* of a vendor-wide
  free-delivery offer, which `null` could not express.
- **Which row applies:** `lib/delivery.ts` gains `matchDeliveryArea(postcode, areas)`, returning the
  most specific matching row — a district row beats an area row. `isDeliverable` becomes "a match
  exists" and keeps every existing test.
- **One resolver:** a new pure `lib/delivery-pricing.ts` `resolveDeliveryRules(vendorDefaults,
  areas, postcode, method)` returns the effective fee, minimum and threshold, field by field (an
  area can override only its fee and inherit the rest), plus the matched prefix. For
  `COLLECTION`, or with no postcode, or no match, it returns the vendor defaults. Every consumer
  listed above calls it — with the delivery address postcode in `place-order`, and with the
  `delivery-postcode` cookie everywhere else — so no surface can quote a different price.
- **No silent price change at checkout.** The checkout summary is priced from the cookie
  postcode, but the order is priced from the postcode typed into the address form, and a shopper
  can type a different one. The form therefore submits the money values it was quoted;
  `place-order` refuses when the address resolves to different values, sets the cookie to the
  address postcode, and asks the shopper to review the updated total. It compares values, not
  area prefixes, so a shopper with no cookie whose area carries no overrides is never refused. The order's own
  `deliveryFeePence` snapshot is unchanged in shape.
- **Staff UI:** the add form takes three optional money fields (blank = store default) applied to
  every district in the submission; each listed row shows its charges ("Store default" where
  null) with an edit form. Editing uses `updateMany` scoped by `{ id, vendorId }` on the WebSocket
  client (the same reason as `createMany`). A bulk add's `skipDuplicates` leaves an existing row's
  charges untouched; the success message says so.
- `VendorProfile` gains `deliveryAreas` (prefix plus the three overrides); `deliveryPrefixes` stays,
  derived from it, so no other consumer changes.

### C. Refusal counts (`#889`)

- **Schema:** `DeliveryRefusalCount` — `vendorId`, `district` (outward code, e.g. `MK17`), `day`
  (`@db.Date`, the vendor's own calendar day via `VendorConfig.timezone`), `source` (enum
  `HEADER` / `CHECKOUT`), `count`; unique on the four keys. Same migration as B.
- **Recorded only** when eligibility is `OUTSIDE_DELIVERY_AREA` — a real postcode (confirmed by the
  reference database) this vendor does not serve. Invalid or `UNVERIFIED` postcodes are never
  counted, which keeps typos and coverage gaps out of the evidence.
- **Two sources, owner-chosen:** the header postcode control (`setDeliveryPostcode`) and a
  checkout refusal in `place-order`. Counted separately, so one shopper hitting both shows as one
  of each rather than a silently doubled figure. The public lookup API does **not** count
  (unauthenticated, trivially inflatable).
- **Write:** an `upsert` incrementing `count` — safe on the HTTP client (`CLAUDE.md`). A failure to
  record is caught and logged and **never** changes what the shopper sees.
- **No personal data:** district and day only — no full postcode, user, session, cookie or IP. It is
  therefore outside data-rights export and erasure, stated in the admin guide.
- **Staff view:** a "Districts you turned away (last 30 days)" table on `/staff/delivery-areas`:
  district, header count, checkout count, total, highest first, top 20.

### D. Proof and documentation

- A committed script, `scripts/verify-delivery-areas.ts`, drives the bulk insert, the override
  update, pricing resolution against real rows, and the refusal upsert against the dev database
  through the real adapters, then restores what it found.
- Live proof under `npm run preview` across lookup, header, cart drawer, checkout and a placed
  order.
- Stale documentation corrected at its source (four files still describe a `RegExp` matcher that no
  longer exists; the schema comment; the staff page intro; the admin guide); ADR-006 gets a dated
  note; `specs/architecture.md` records per-area pricing and the refusal table.
- Carry-forward: the `specs/roadmap.md` change-log row for PR #887.

## Deliberately excluded (owner: defer)

- **Exclusion rules** — dropped at `/propose`; exclusion is listing the served districts.
- **Radius-from-store eligibility** — `#888`, moved to **Deferred** (milestone "Deferred —
  owner/external gated") 2026-09-24.
- **Per-area slot capacity** — the 2026-09-02 capacity finding, `RESEARCH MORE`, no issue.
- **Drive-time isochrones and route optimisation** — Discover `DO NOT PURSUE`.
- **Recording refusals from `/api/address/lookup`**, and any retention/pruning job for the counts
  table.

**Separate, not deferred:** the consented "notify me when you deliver here" email list is its own
Backlog issue, **`#891`** (owner, 2026-09-24). It needs consent handling, data-rights coverage,
and a verified sending domain (`#104`), so it is kept out of this slice.
- Redundancy warnings, range shorthand (`MK1-10`), bulk removal, per-area charges for Click &
  Collect, and changing the landing banner's wording.
- `#761`'s folder-name citation cleanup.

## Open items carried forward

- Aheed's real districts and charges are staff configuration, entered in production by the owner.
  Seeds stay `MK` and `RG` with no overrides, so current behaviour is unchanged until someone sets
  one.
- No financial figure here is a realised number — the platform has not traded.
