---
id: adr-006-store-locations
title: "ADR-006 — Store locations (multi-branch shape)"
audience: [dev, architect]
type: adr
status: approved
version: "1.0.0"
updated: 2026-08-28
visibility: internal
summary: If a vendor ever trades from more than one physical site, a location is a child of Vendor and never a second tenancy axis — vendorId stays the sole mandatory repository filter. Rules the shape so #400 and #402 can be sized; leaves the business question open.
tags: [adr, multi-tenancy, locations, fulfilment, architecture]
related: [adr-004-multi-tenancy, roadmap, mission, storefront-brief-sequencing-plan]
---

# ADR-006 — Store locations (multi-branch shape)

## Context

Two issues from the #408 storefront and fulfilment brief imply that a vendor trades from more than
one physical site:

- **#400** — smart stock badges showing **per-store** counts.
- **#402** — Click & Collect, including 60-minute express pickup, which needs somewhere to collect
  *from*.

Both were filed with no phase, and neither could be sized, because the repository has never ruled on
whether multiple physical sites are a thing that exists. Two documents point in opposite directions:

- **`specs/mission.md`** lists "SMS/WhatsApp notifications, **multi-branch management**, marketing
  automation" under "Out of scope (future phases)".
- **ADR-004's** own summary says vendors, regions, **locations**, delivery areas and branding all
  come from the database, and its decision 1 anticipates `Region`/`Location` "as their own reference
  tables when geography grows beyond delivery areas".

That is not quite a contradiction, but it is close enough that a slice touching #400 or #402 would
have had to invent the answer while implementing it — which is how an architectural decision gets
made by accident. This ADR settles the shape ahead of either slice, as ruled at #420's `/propose`.

### The `Location` naming collision, resolved

ADR-004 decision 1 and this ADR use the same word for two different things, and the difference is
the whole point:

| Concept | What it is | Status |
|---|---|---|
| ADR-004's `Region`/`Location` | **Geography reference data** — a normalised place a delivery area can point at, replacing repeated postcode-prefix strings. It has no stock, no staff, no opening hours, and nothing is collected from it. | Anticipated by ADR-004, still not built; `VendorDeliveryArea` continues to carry postcode prefixes directly. |
| This ADR's **store location** | A **trading site** — somewhere with its own stock on hand, its own opening hours, and potentially a collection counter. | Ruled on here; not built. |

A future `Location` reference table and a future store location are different tables solving
different problems. Whichever is built first should take the more specific name (`VendorLocation`
for a trading site) and leave `Location` to geography, so this paragraph does not have to be
re-litigated.

## Decision

**1. `vendorId` remains the sole tenancy isolation axis.** A store location is **not** a tenancy
root. Every existing guarantee in ADR-004 decision 2 — the mandatory `vendorId` filter injected in
`lib/repositories/*`, the per-vendor composite uniques, the `vendorId`-leading composite indexes —
is unchanged and stays sufficient on its own.

**2. A location never becomes a second mandatory filter on queries in `lib/repositories/*`.** This
is the load-bearing half of the ruling. Making isolation a *pair* rather than a single value would
rewrite every repository query, invalidate the vendor-scoping test's central premise, and turn a
one-value request context into a two-value one across the whole application. A location is a
**dimension of data**, not a dimension of isolation: rows may carry a `locationId`, and queries may
filter on it when a feature asks them to, but nothing in the repository layer requires it the way
`vendorId` is required.

**3. If locations are adopted, they are an additive child of `Vendor`.** The expected shape is a
`VendorLocation` table with a mandatory `vendorId` FK, and an optional `locationId` on whichever
rows genuinely vary by site — `Inventory` first. Adding a nullable `locationId` to an existing
vendor-scoped table is an ordinary additive migration; a null means "vendor-wide", which is exactly
today's behaviour, so no backfill invents data.

**4. The business question is deliberately left open.** Whether Aheed Food Centre trades from more
than one site is not a question this repository can answer, and an ADR that guessed it would be
recording a commercial decision as an architectural one. This ADR does not commit the platform to
multi-branch and does not schedule it.

## What this does not decide

- **It does not amend `specs/mission.md`.** That file's out-of-scope line on multi-branch management
  stands as written. This ADR rules on the *shape* a location would take if the line is ever
  revisited; it does not revisit it. Amending `mission.md` remains a deliberate, separate act.
- **It does not adopt `Region`/`Location` geography reference tables.** ADR-004's conditional
  ("when geography grows beyond delivery areas") is still unmet and still conditional.
- **It does not decide per-location pricing, per-location staff permissions, or per-location
  delivery areas.** Only stock (`Inventory`) is named above, because only stock is what #400 and
  #402 actually need. Anything further is its own decision.

## Consequences

**#400 and #402 become sizeable, which is the point of writing this now.**

- **#400** splits cleanly. Its **async-loading** half — deferring the stock badge so it does not
  block the product card render — needs no location model at all and is scheduled in **P8.6**. Its
  **per-store counts** half needs `VendorLocation` plus a `locationId` on `Inventory`, and is
  scheduled in **P8.7** behind this ADR.
- **#402** (Click & Collect) needs the full model — a location with opening hours and a collection
  capacity — and is scheduled in **P8.7**. It is additionally blocked on **#363** (the store
  timezone is a hardcoded constant, `lib/local-datetime.ts:43`), because a 60-minute express pickup
  window is a promise about local time and cannot be made by a platform that hardcodes one zone. See
  ADR-004's "store timezone is a constant, not yet vendor data" note, which reaches the same
  conclusion from the campaign-scheduling direction.

**What stays cheap.** Because isolation is unchanged, adopting locations later touches migrations
and the specific features that care. It does not touch the tenant resolver, the auth cookie scoping,
the repository layer's central filter, or the `tests/repository-vendor-scoping.test.ts` invariant.

**What would be expensive, and is therefore forbidden by decision 2.** Any design in which a request
must resolve *both* a vendor and a location before the repository layer can answer a query. If a
future feature appears to need that, it is a new ADR superseding this one, not an implementation
detail — say so rather than adding a second required parameter.

## Sequencing

Nothing is built by this ADR. It is written by the #420 sequencing slice
(`specs/2026-08-28-storefront-brief-sequencing/`) precisely so that #400's per-store half and #402
can be placed in P8.7 with a known shape rather than left unscheduled with an unknown one.
