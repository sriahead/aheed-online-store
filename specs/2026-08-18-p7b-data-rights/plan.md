---
id: p7b-data-rights-plan
title: "P7b — UK GDPR data-subject rights (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-18
visibility: internal
summary: Self-service export, erasure and rectification for customers, scoped per vendor, with an order tombstone that keeps the financial record intact and deletes the shared identity only when no other vendor still holds data.
tags: [p7, gdpr, compliance, data-rights, privacy]
related: [adr-004-multi-tenancy, p7a-compliance-hardening-plan, roadmap]
---

# P7b — UK GDPR data-subject rights (plan)

**Goal:** make `/privacy` §5 true. That section already tells customers they "have the right to
access, rectify, or request deletion of your personal data" and to "contact our privacy compliance
team to exercise your rights" — and none of the three has a mechanism, nor does that team exist
anywhere in the app or the repo. This slice replaces a published promise with working self-service
routes, and rewrites the promise to describe what the app actually does.

## What is actually missing

Confirmed in the tree at P7's Orient (2026-08-18), not read off the roadmap:

- No export surface anywhere — a search across `app/`, `lib/`, `features/` and `components/` for
  any export or erasure path returns nothing.
- No account deletion. `app/(storefront)/account/` holds only `page`, `orders`,
  `orders/[orderNumber]` and `loyalty`.
- No rectification. `app/(storefront)/account/page.tsx` renders name, email and role as static text
  with no edit control.
- No stated retention periods anywhere in `app/(storefront)/privacy/page.tsx` (79 lines, §§1–5).

P7a delivered the **PECR** half of compliance — the cookie banner and the policy pages themselves.
The UK GDPR data-subject rights on `specs/roadmap.md`'s P7 line were never built. Tracked by
**#216**.

## The decision that shapes everything else: vendor scope

ADR-004 resolved decision 3 is **global identity** — one `User` row with a globally-unique email —
while every *domain* row carries a mandatory `vendorId`. `VendorMembership` is explicitly not part
of this: `prisma/schema.prisma:42-47` states "a membership IS a staff/admin grant… there is no
CUSTOMER here". So a customer shopping at both Aheed and SriMart is **one identity with two
disjoint sets of orders, addresses, carts, reviews and loyalty rows**. Sessions are host-isolated
(ADR-004 slice 3c), but the credential underneath is shared.

Export and erasure are therefore **vendor-scoped**, and the shared identity is deleted only when
the requesting vendor is the user's last one. Decided at `/propose` (2026-08-18). The alternative —
platform-wide export and deletion, which is arguably what "delete my account" plainly means — was
rejected because it requires new **deliberately un-scoped** repository methods that bypass the
`vendorId` filtering ADR-004 slice 2 centralises in `lib/repositories/*`. This repo already has
exactly one un-scoped read, `findOrderForWebhook`, documented in `lib/repositories/orders.ts` as
meant only for Stripe's server-to-server calls; P7a wired it into a public page and turned it into
an order-disclosure defect that survived to production (PR #204). Adding two more un-scoped paths
to serve a *deletion* feature is not a trade worth making. It would also let one vendor's storefront
hand over — or destroy — another vendor's transaction records.

## Scope (this slice)

**Read path — Art. 15 access.** `exportPersonalData()` in a new
`lib/repositories/data-rights.ts`, returning a JSON document served by a route handler at
`app/(storefront)/account/data/export/route.ts` with `Content-Disposition: attachment`. A route
handler rather than a Server Action because an action cannot cleanly hand the browser a file.

**Write path — Art. 17 erasure.** `eraseVendorData()` in the same repository, driven by a Server
Action under `features/account/`, running in a single `$transaction` via `getPrismaWs()` — the
WebSocket client, because `PrismaNeonHttp` does not support interactive transactions (CLAUDE.md).
Every function takes `prisma` and `vendorId` as **explicit arguments** and reads no request
context, matching `placeOrder(prisma, vendorId, input)` and the loyalty repository. That is a
testability requirement: the atomicity and the cross-vendor isolation are this slice's two most
important properties and cannot be proven at all from a plain script otherwise.

One consequence, which the loyalty repository does not have to deal with: this module must import
`@/lib/db` **as `import type` only**, taking its client type without pulling the factory in at
runtime. `lib/db.ts` imports `PrismaClient` from `@prisma/client/wasm`, and `scripts/demo-accounts.ts`
records why that matters — a script running in real Node under `tsx` uses the bare `@prisma/client`
"like seed.ts, never `lib/db.ts`'s `@prisma/client/wasm`". Since every function here already takes
its client as a parameter, the runtime import buys nothing and would make the validation harness
unable to load the module it is meant to exercise.

**The one deliberate cross-vendor query.** Deciding whether this is the user's *last* vendor cannot
be answered from inside vendor A, so `countOtherVendorData(prisma, userId, excludingVendorId)`
necessarily spans tenants. Its contract is deliberately narrow: it returns an **integer count and
nothing else** — never rows, never fields, never a vendor name. That distinction is the whole
argument. An un-scoped *read* is what `findOrderForWebhook` was, and wiring it to a public surface
disclosed order contents (PR #204); a function that can only ever answer "how many" discloses
nothing about vendor B beyond the fact that the user shops there, which the user already knows
about themselves. It is documented in the module as the single permitted exception so it does not
read as precedent for un-scoped reads generally.

**The erasure shape, table by table.** Derived from the actual schema, because the referential
actions already in place decide most of it:

| Table | Treatment | Why |
|---|---|---|
| `Order` | `userId` → null, `guestEmail` → null; everything else untouched | The financial record must survive. `Order.userId` is optional with Prisma's default `SetNull`, so a `User` delete already does half of this; `guestEmail` must be cleared explicitly. |
| `Address` | fields redacted in place, `userId` → null, row retained | `Order.addressId` is **not** nullable, so the row cannot go. Redacting it is a deliberate exception to the model's "written once and never updated" snapshot rule (`schema.prisma:435`) and is called out as such. |
| `Review` | deleted | `userId` is non-nullable with `onDelete: Cascade`. Deleting the user's own content is a correct Art. 17 outcome; it does move product rating aggregates, which is expected, not a defect. |
| `Cart`, `CartItem` | deleted | No retention interest whatsoever. |
| `LoyaltyAccount` | deleted | A balance holder, not an audit record — the ledger below is the audit record. |
| `LoyaltyLedgerEntry` | `userId` → null, rows retained | **Needs an additive migration.** Today `userId` is non-nullable with `onDelete: Cascade`, and the model's own comment says "Nothing here is ever updated or deleted." A `User` delete would therefore destroy the only explanation of a surviving order's `discountPence`. Making the column nullable with `SetNull` keeps the financial audit trail and severs the personal link. |
| `DiscountRedemption` | `userId` → null, rows retained | Already nullable with `SetNull`. This does forfeit the one-use-per-customer guard for that person — unavoidable under erasure, and worth stating rather than discovering. |
| `Session`, `Account` | deleted (last-vendor case only) | Cascade from the `User` delete. |
| `OrderStatusEvent` | `createdByUserId` → null | Already `SetNull` by explicit design, so the staff audit trail survives a departing account. |
| `OrderLookupAttempt` | **nothing** | Stores a SHA-256 of the caller's IP, never the IP (`schema.prisma:714`). Not linkable to a user, so there is nothing here to erase. Listed so a reader can see it was considered, not overlooked. |

**Rectification — Art. 16.** An edit control for `User.name` only. Deliberately minimal, and
honest about it: there is no saved-address book to correct (`Address` is a per-order snapshot by
design), and changing an email requires a verification mail, which **#104** — Resend has no verified
sending domain — makes undeliverable in production today. Email change is deferred to its own issue
rather than shipped as a control that silently cannot complete.

**Re-authentication.** Erasure requires the current password for a credential account, and exact
re-entry of the account email for an OAuth-only account (`Account.password` is null for the Google
provider, so a password prompt cannot be the only gate). No emailed confirmation link, for the same
#104 reason — a destructive flow gated on mail that does not currently deliver would be neither
usable nor validatable.

**Staff refusal.** Erasure is refused for any user holding a `VendorMembership`. A vendor ADMIN
erasing themselves would walk straight through P6.7's self-lockout guards from an angle they do not
cover and could leave a vendor with zero admins. Have the role removed first.

**Docs on this branch.** `/privacy` gains real retention periods and describes the self-service
routes; `specs/roadmap.md:64` drops "backups + monitoring" (resolved at `/propose`: P8 owns them);
`docs/gap-register.md`'s GAP-007 moves to `Fixed`, carrying forward #180's out-of-band closure.

## Deliberately excluded

- **Platform-wide account deletion across vendors** — see the scope decision above. The
  last-vendor rule means the common single-vendor case still results in a full identity delete.
- **Email address change** — blocked by #104; filed separately.
- **An admin-facing view of erasure requests.** Self-service only. There is no case-handling
  workflow, no queue, and no staff surface, because there is no human step in the flow to manage.
- **Erasure of data held by Stripe.** `Payment.providerReference` points at a PaymentIntent that
  Stripe retains under its own controller relationship and retention rules. Out of reach of a DB
  transaction; noted in `/privacy` rather than silently ignored.
- **A retention *sweep*.** This slice states retention periods and honours erasure on request; it
  does not add a scheduled job that expires old data automatically. No scheduler exists in this
  project, and inventing one here would be building P8's infrastructure early.
- **Guest orders placed with the same email address.** Erasure operates on rows linked to the
  `User` by `userId`. A guest order carries `guestEmail` and no `userId`, so a past guest purchase
  made with the same address is **not** swept up. Matching on email string instead would mean
  mutating rows this user has not been proven to own — two people share a household mailbox often
  enough for that to be a real risk, and the guest-lookup credential pair (order number **and**
  email) exists precisely because email alone was judged insufficient proof in P7a. A guest with no
  account has no authenticated route to request erasure today; that gap is real and is called out
  here rather than papered over.
- **Data portability (Art. 20) as a distinct obligation.** The Art. 15 JSON export is
  machine-readable and structured, which satisfies portability in practice for this data; no second
  format is added.

## Open items carried forward

- **#104** — Resend's unverified sending domain is why email confirmation and email change are both
  out. Neither can be built honestly until it is resolved.
- **Retention periods need Aheed's confirmation.** The spec proceeds on **six years** for
  transaction records, the standard UK VAT/HMRC retention window, and states it in `/privacy`.
  `specs/mission.md` already instructs confirming such figures with Aheed before the phase that
  enforces them — this is that flag, not a settled fact.
- **#220 (P7e — row-level security)** is the other half of ADR-004's tenancy story and is what
  would make the cross-vendor isolation this slice relies on fail closed at the database rather
  than at the repository layer. Not a prerequisite; worth reading together.
