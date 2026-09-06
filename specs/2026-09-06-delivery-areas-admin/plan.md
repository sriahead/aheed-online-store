---
id: p9-2-delivery-areas-admin-plan
title: "P9.2 — Delivery areas admin & staff navigation reconciliation (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-06
visibility: internal
summary: A vendor's delivery postcode prefixes are seed-only yet hard-gate checkout. Adds a validated staff admin page for them, and reconciles the two staff navigation surfaces that disagree about what the panel contains. No schema change.
tags: [p9, delivery, staff-panel, operability]
---

# P9.2 — Delivery areas admin & staff navigation reconciliation (plan)

**Goal:** make a vendor's delivery footprint editable by the people who run the shop, instead of
only by a developer with production database access — and close the input-validation hole that
becomes reachable the moment it is editable.

## Why this slice exists

`VendorDeliveryArea` (`prisma/schema.prisma:307`) holds one row per postcode **district prefix**
per vendor. Those rows are seeded as `["MK"]` for Aheed (`prisma/seed.ts:313`) and `["RG"]` for
SriMart (`prisma/seed.ts:1275`).

`lib/delivery.ts`'s `isDeliverable()` matches them against a shopper's outward code, and
`features/checkout/place-order.ts:104` uses the result to **refuse the order outright** — the
shopper sees `Sorry — we don't deliver to <their postcode> yet.` and cannot proceed.

The only writer of those rows anywhere in the repository is `prisma/seed.ts:238`.
`lib/repositories/vendor.ts:108` reads them. Nothing else touches them: no repository write
function, no service function, no admin view. So the set of postcodes Aheed can sell to is, today,
a developer-only setting on the critical revenue path.

**The second reason is sharper than the first.** `lib/delivery.ts` builds its matcher by
interpolating the stored prefix directly into a regular-expression constructor:

```ts
return p.length > 0 && new RegExp(`^${p}[0-9]`).test(normalized);
```

That is safe today only because the single writer is a hand-authored seed file containing two
known-good values. The moment prefixes become admin-editable, a stored value containing a regex
metacharacter (`[`, `(`, `\`) throws a `SyntaxError` **on the checkout path, for every shopper of
that vendor** — a settings screen able to break checkout for everyone. Validation on write is
therefore load-bearing here, not cosmetic, and it is why this slice puts the parsing rules in
their own pure, unit-tested module rather than inline in an action.

## Scope (this slice)

**1. A pure field-rules module.** `lib/delivery-area-form.ts` — `parsePrefixInput()`, taking a raw
submitted string and returning either a normalised uppercase prefix or a named field error. UK
postcode areas are one or two letters, so the accepted shape is `^[A-Z]{1,2}$` after trimming and
upper-casing. Everything else, including every regex metacharacter, is rejected. Pure, DB-free and
request-free, following the posture `lib/catalogue-form.ts` and `lib/shopping-list.ts` already set:
every decision about what a submitted field *means* lives where a test can reach it without a
database, a session or a request.

**2. The repository trio**, following `brands` (`#569`) as the closest existing analogue, because
it is the same shape — a small vendor-scoped list with add and remove:

- `lib/repositories/delivery-areas.ts` — pure. Every export takes the Prisma client and `vendorId`
  as explicit parameters and reads no request context, so a plain `tsx` script can exercise it in
  real Node. Enforced by `tests/repository-purity.test.ts` (location) and
  `tests/repository-client-injection.test.ts` (injection).
- `lib/delivery-areas-service.ts` — the request-scoped facade, sibling to the repository rather
  than inside it, mirroring `lib/brands-service.ts`. Clients constructed fresh per call, never
  cached across requests.
- `features/admin/delivery-areas.ts` — `"use server"`, exporting only async functions. Each action
  runs `requireVendorRole("ADMIN")` itself rather than trusting the page that rendered the form: a
  server action is a public endpoint at a stable id, so the page's check protects the page, not the
  action.

**3. `/staff/delivery-areas`** — `app/(admin)/staff/delivery-areas/page.tsx`, gated on
`requireVendorRole("ADMIN")` to match every comparable settings page (`storefront`, `team`,
`loyalty`, `discounts`, `brands`), with a `<PanelRefusal>` refusal branch. Lists the vendor's
current prefixes, with an add form and a per-row remove control.

**4. Staff navigation reconciliation.** Two surfaces exist and neither is a superset of the other,
so what the panel appears to contain depends on which one the user is looking at:

| Page | `components/staff/PanelNav.tsx` | `app/(admin)/staff/page.tsx` hub |
|---|---|---|
| `brands`, `customers`, `payments` | absent | present |
| `bundles`, `promotions`, `storefront` | present | absent |
| `errors` | absent | absent |
| `search-synonyms` | absent | absent |

`brands`, `customers` and `payments` vanish from the chrome the moment a user navigates off the
hub. This slice makes both surfaces list the same vendor-scoped set, adds the new page to both,
and pins the parity with a test so the two cannot drift apart again silently.

**5. `/staff/errors` reachability.** Added to the hub only, behind its own platform-admin check —
not to `PanelNav`. The page already refuses anyone whose `auth.via !== "platform-admin"`, whereas
`PanelNav` is vendor-scoped chrome whose `currentTier` prop cannot express that distinction. Note
the hub's existing `isAdmin` conflates `platform-admin` with vendor `ADMIN`, so this needs a
distinct check rather than reusing that flag.

## Design decisions, with the alternatives named

**Removing the last remaining prefix is refused.** Deleting it would disable checkout for the
entire vendor, from a settings screen, with no warning. The alternative — allow it, since a vendor
pausing all delivery is a legitimate intent — loses because that intent deserves an explicit
control, not an emergent side effect of emptying a list.

**That guard runs inside a `Serializable` transaction on `getPrismaWs()`.** A count-then-delete on
the ordinary client is not atomic: two admins each removing a different prefix, both reading "2
remaining", would leave the vendor with zero. This mirrors `lib/repositories/roles.ts`'s
last-admin self-demotion guard exactly, including its isolation level, and that file's own comment
explains why an aggregate-over-other-rows guard cannot use the atomic compare-and-set `updateMany`
that the stock, points and discount-usage guards use.

**Nothing else in this slice needs `getPrismaWs()`.** This is a deliberate divergence from the
`brands` template it otherwise follows. Brands needs the WebSocket client because `rename` and
`setImageKey` use `updateMany`, which crashes unconditionally through the HTTP adapter (`#382`).
Delivery areas have no update operation at all — a prefix is added or removed, never edited — so
`list` and `create` use the ordinary client, and only `remove` reaches for `getPrismaWs()`, for the
transaction rather than for the write.

**A duplicate prefix is a friendly field error, not a 500.** `@@unique([vendorId, prefix])` already
exists, so a re-added prefix raises a unique violation. `isUniqueViolation()` from
`lib/repositories/prisma-errors.ts` is used because it covers **both** driver error codes — the
HTTP adapter surfaces a duplicate as raw SQLSTATE `23505` while the WebSocket adapter normalises it
to Prisma's `P2002`, and checking only one is exactly how `upsertBundle` 500ed on a real duplicate
submission.

**No schema change and no migration.** `VendorDeliveryArea` already carries the
`@@unique([vendorId, prefix])` this needs. This is deliberate: GAP-011 has caused a generated
migration to propose dropping all three hand-authored `pg_trgm` indexes on six consecutive
occasions, so a slice that can achieve its goal without generating a migration should.

## Deliberately excluded

- **Finer-than-whole-area granularity — `#613`.** `isDeliverable` matches `^PREFIX[0-9]`, where the
  stored prefix is a whole postcode *area*, so "MK9 but not MK17" is inexpressible and so is a
  single district. Real delivery rounds are usually finer than an area. Changing that needs a
  schema change, a migration, a decision on representation, and real operational input from Aheed
  on how they plan rounds. **This is the concrete trigger ADR-004 and ADR-006 describe in the
  abstract**: ADR-004 anticipated `Region`/`Location` reference tables "when geography grows beyond
  delivery areas", and ADR-006 records that this is "still not built; `VendorDeliveryArea` continues
  to carry postcode prefixes directly". This slice keeps that state exactly as ADR-006 describes it,
  so **no ADR needs amending here** — resolving `#613` later probably amends ADR-006.
- **`#602`** (`/staff/search-synonyms` unlinked from the staff hub) — the same class of defect, and
  it would be natural to close here, but it belongs to P2.6 and carries its own approval-queue
  context. The parity test this slice adds deliberately scopes itself to the vendor-scoped
  navigation set so it does not fail on that page's continued absence.
- **`#350`** (`/staff/storefront` returns `null` on refusal instead of `<PanelRefusal>`) —
  adjacent, sits in P9.3, and this slice does not otherwise modify that page.
- **Delivery capacity, slots and calendars** — `#401`, `#402`, and the unfiled 2026-09-02 Discover
  finding on per-day capacity, which is marked `RESEARCH MORE` pending real operational data from
  Aheed.
- **Any change to `lib/delivery.ts`'s matching behaviour.** This slice validates what may be
  *written*; it does not alter how a stored prefix is *matched*, so existing shopper-facing
  behaviour for `MK` and `RG` is unchanged.

## Open items carried forward

- **`#613`** — the granularity limitation above, filed to P10 and blocked on operational input from
  Aheed's own rounds. Probably wants deciding alongside the unfiled 2026-09-02 Discover finding on
  per-day delivery **capacity**: that one is about volume, `#613` is about geography, and both need
  the same conversation about van count and round size.
- **`#513`** — Project #2's Phase field offers only `M0`–`P8`, so `#612` cannot record an accurate
  Phase and is on the board with Phase unset rather than a knowingly wrong value.
- **The P2.6 closure documentation is unpromoted.** PRs `#605`, `#609` and `#611` sit on `staging`
  with no promotion PR, so `main` does not yet record P2.6 as closed. This slice's own promotion
  will carry them forward, which is the repository's normal pattern.
- **The vitest baseline count in `CLAUDE.md` will move.** It currently reads 94 files / 1144 tests,
  measured at `#569`'s Build. This slice adds test files, so the count must be re-measured and the
  line updated at Build — not left for `/document`, because a Clear sits between the two and a
  measured number does not survive it.
