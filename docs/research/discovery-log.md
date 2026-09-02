---
id: discovery-log
title: "Discovery log"
audience: [dev, product]
type: doc
status: approved
version: "1.0.0"
updated: 2026-09-02
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
