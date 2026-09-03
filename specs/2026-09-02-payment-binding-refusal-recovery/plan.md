---
id: payment-binding-refusal-recovery-plan
title: "Recovery path for an order stranded by a refused webhook binding (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-02
visibility: internal
summary: "A refused Stripe webhook binding leaves only a console.error line and an order stuck PENDING_PAYMENT. This persists every refusal, surfaces the stranded orders to staff, and resolves one against Stripe's own record rather than by re-driving the refused event — closes #454."
tags: [payments, stripe, observability, admin, database]
related: [roadmap, error-event-log-plan]
---

# Recovery path for an order stranded by a refused webhook binding (plan)

**Goal:** an order left `PENDING_PAYMENT` by a refused payment binding is discoverable by staff
without reading logs, and resolvable by asking Stripe what actually happened — never by re-driving
an event that may have been refused correctly.

## Background

`#429` made the Stripe webhook fail closed. `lib/repositories/orders.ts`'s `confirmPayment` proves
the event against the stored `Payment` row inside the same statement that performs the transition,
and `failPayment` does the same on session identity. That is the right posture and is not being
changed here. Its cost is what this slice addresses: **if it ever fires against a genuine payment,
a real shopper has been charged and their order is stuck** — no confirmation email, no loyalty
`EARN`, stock still held.

Three facts about the current code decided this slice's shape.

**1. A refusal leaves no durable trace anywhere.** `app/api/webhooks/stripe/route.ts`'s
`reportRefusal` is a `console.error`, and the route returns **200** deliberately, so Stripe stops
retrying a situation that will never resolve itself. Because nothing throws,
`instrumentation.ts`'s `onRequestError` never fires and **no `ErrorEvent` row is written** — the
`/staff/errors` page added by `#508` will never show one. The only trace is a Cloudflare Workers
Logs line, and whether those are queryable from this team's environment at all is still `#246`.

**2. Reconstructing the population from order state alone does not work.** The shape `#454`
originally suggested — `PENDING_PAYMENT` plus a non-null `Payment.providerReference` past a
threshold — is queryable today with no schema change, but that bucket holds three different causes
with three different remediations:

- a shopper who abandoned Stripe Checkout, before `checkout.session.expired` arrives to cancel it;
- a webhook that never arrived at all, which is `#101`, and whose remediation is to re-drive;
- a binding that was **refused**, which is this issue, and whose remediation must **not** re-drive.

Nothing in the order or payment row distinguishes them, and the case this slice exists for is the
rare one hiding inside the common one. That is why the slice carries a schema change rather than
being a pure read: **the refusal is an event, and only recording it when it happens makes the set
exact.**

**3. There is no Stripe read primitive.** `lib/payments.ts`'s `PaymentService` port exposes only
`createPayment`. Reconciling against Stripe needs a new port method, which is the same primitive
`#101` will need — building it once, here, is what the issue asked for.

## A premise in the issue that did not survive the check

`#454` says to sequence after `#437` (production alerting), *"which is what makes the log line reach
a human at all."* That rationale assumes the log line is the detection channel. A staff-visible view
**is** an independent detection channel, so this slice reduces the `#437` dependency rather than
depending on it. `#246` likewise is not a blocker: a persisted row is precisely what removes the
reliance on log retention. Neither is treated as blocking, and neither is closed by this slice.

**Scope (this slice):**

- **A new `PaymentBindingRefusal` model** plus its migration. Records, at refusal time: the reason
  (`unbindable`, `not-found`, `binding-mismatch`), the order number the event claimed, the resolved
  `orderId`/`vendorId` when an order was found, the **claimed** provider/session/amount/currency
  from the event, and the **stored** session/amount/currency snapshotted off the order's `Payment`
  row. Nullable `orderId`/`vendorId`, because `not-found` has no order to attach to and `unbindable`
  refuses before the lookup happens.
- **`lib/repositories/payment-binding-refusals.ts`** — pure functions taking an explicit Prisma
  client, with a sibling `lib/payment-binding-refusals-service.ts` for the request-scoped facade,
  exactly as `CLAUDE.md`'s repository-layer rule requires. Carries a low-probability retention
  sweep matching `lib/repositories/order-lookup-rate-limit.ts`'s existing `SWEEP_PROBABILITY`
  pattern, so the table cannot grow without bound.
- **Persisting the refusal from the webhook path.** `lib/orders-service.ts`'s
  `getWebhookOrderService()` already holds the `getPrismaWs()` client the webhook uses; the refusal
  is written there, leaving `confirmPayment` and `failPayment` — the security-critical functions —
  **completely unchanged**. `already-processed` stays silent and unrecorded, exactly as
  `reportRefusal` already treats it: Stripe retries aggressively and a duplicate delivery is the
  system working.
- **`retrieveSession` on the `PaymentService` port**, implemented with raw `fetch` against Stripe's
  checkout-session retrieve endpoint — no `stripe` SDK, matching the existing adapter's stated
  Worker-bundle-size reason — plus a matching stub implementation so local dev and CI keep working
  with no Stripe setup.
- **`/staff/payments`**, a vendor-scoped staff page listing this vendor's recorded refusals with
  their stranded orders, gated by `requireVendorRole("STAFF", "ADMIN")` with a real
  `<PanelRefusal>` branch. Reached from a tile on `/staff/page.tsx`, because a page nothing links
  to is not meaningfully more discoverable than a log line.
- **A reconciliation action** that asks Stripe about the order's **own stored**
  `Payment.providerReference` — not the session id the refused event claimed — and records what
  Stripe said on the refusal row.
- **Recovery through the existing binding.** When Stripe reports the stored session genuinely paid
  at the expected amount and currency, staff get a second, separate action that calls the
  **unchanged** `confirmPayment` with a binding built from Stripe's authoritative response. This is
  the design's most important property: recovery introduces **no new trust path**, because it must
  satisfy the same compare-and-set predicate `#429` installed. A refusal that was correct cannot be
  confirmed away by a staff click.

**Deliberately excluded:**

- **Refunds, and any change to the payment capture method.** `ADR-005` records refunds as its own
  undecided territory, entangled with `#399` and with the 2026-09-02 discovery-log finding on
  reducing a paid order. Not decided here.
- **Re-driving a refused Stripe event.** The entire point is that the refusal may have been
  correct. Resolution asks Stripe; it never replays.
- **`#101`'s scheduled reconciliation sweep.** This slice builds the shared `retrieveSession`
  primitive it needs; the scheduled sweep and the never-arrived-webhook population stay `#101`.
- **`#437`'s alerting.** Detection here is a staff page, not an alert. Nothing is emailed or paged.
- **Automatic background recovery.** Every transition remains a deliberate staff action against
  displayed evidence. An automatic confirmer acting on Stripe reads is a second path to `CONFIRMED`
  and would need its own security argument.
- **Changing `confirmPayment` / `failPayment` / `classifyNoMatch`.** `#429`'s logic is not touched.
  Refusal persistence sits in the service facade above them.
- **Surfacing refusals that resolved to no vendor.** A `not-found` refusal names an order that does
  not exist, so no vendor's page can scope it and, by construction, no order is stranded by it. It
  is recorded for forensics and read from the database directly; `/staff/payments` is a recovery
  worklist, not a full audit console.
- **`#456`** (test coverage for `cancelUnpaidOrder`) — adjacent, separately filed, not folded in.

**Open items carried forward:**

- **`#246`** — whether Workers Logs are queryable at all is still unconfirmed. This slice makes that
  question non-blocking for *this* failure mode; it does not answer it.
- **`#437`** — a staff page is a pull channel. Nobody is alerted; someone has to look.
- **`#513`** — `#454`'s Project #2 Phase field reads `P8` while its milestone is `P09.2`, because
  the board's Phase field has no P9 option. Left as-is rather than set to a wrong value.
- **The roadmap change-log row for PR #555**, flagged pending carry-forward by `npm run sdd:audit`
  at this slice's `/orient`, rides this branch.
