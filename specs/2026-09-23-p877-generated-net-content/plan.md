---
id: p877-generated-net-content
title: "P877 — Net Content for the Generated Demo Catalogue (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-23
visibility: internal
summary: Gives the seed's generated demo catalogue real net content for its weight and volume packs, including rows already in a database, so the pack-size facet and derived unit prices are visible in dev. Real products are untouched.
tags: [catalogue, seed, unit-pricing, facets, demo-data]
related: [architecture]
---

# P877 — Net Content for the Generated Demo Catalogue (plan)

The narrative: why this slice exists, what it proves, and where its edges are. `requirements.md`
holds the checkable acceptance criteria. This file holds the reasoning behind them.

**Goal:** make `#397`'s pack-size facet and `#398`'s derived unit price visibly work on the
generated demo catalogue in dev, so the code that already shipped for them can finally be seen
doing something. It does this without touching a single real product.

## Where this came from

`#697` measured that no product in the dev database carries `netContentAmount`/`netContentUnit`
(2,080 Aheed products, 3 SriMart, all null). The columns exist and the code that reads them is
correct, but there is no data. So the pack-size facet never renders, and every card falls back to
the free-text `unitLabel` that `#398` existed to replace. `#697` listed four options. At `/propose`
(2026-09-23) the owner chose the safe one: this slice. `#697` stays open for real data.

## Scope (this slice)

**1. The generator emits net content.** `prisma/generate-catalogue.ts` picks each row's pack from a
fixed ten-entry pool, `PACKS`. Eight entries are weights or volumes and map directly to the
`NetContentUnit` enum. The other two are counts:

| Pack | `netContentAmount` | `netContentUnit` |
|---|---|---|
| `250g` | 250 | `GRAM` |
| `500g` | 500 | `GRAM` |
| `1kg` | 1 | `KILOGRAM` |
| `2kg` | 2 | `KILOGRAM` |
| `5kg` | 5 | `KILOGRAM` |
| `10kg` | 10 | `KILOGRAM` |
| `1L` | 1 | `LITRE` |
| `2L` | 2 | `LITRE` |
| `Pack of 4` | null | null |
| `Pack of 6` | null | null |

This is a **fixed lookup table keyed by the pack string**, not a parser. That is exactly why it
carries none of `#697`'s risk: parsing free text a vendor typed can guess wrong and put a wrong price
per kg in front of a shopper, which is a Price Marking Order exposure. Looking up eight strings the
generator itself defines cannot. A test asserts every `PACKS` entry has a table entry, so a pack
added later without a mapping fails CI instead of quietly producing nulls.

Amounts use the pack label's own unit (`1 KILOGRAM`, not `1000 GRAM`). The facet groups on the
distinct `(amount, unit)` pair, so this makes its options read the way the product names do.

`Pack of N` stays null, as the approved issue text says. `NetContentUnit` does have `EACH`, so
`4 EACH` is expressible, but a generated "Pack of 4 Rice" is a nonsense combination of word pools,
and pricing it per item would demonstrate nothing. Left as a note, not scope.

**2. Determinism is preserved exactly.** The generator exists so a latency measurement
(`docs/developer-portal/nfr-baseline.md`) can be reproduced byte for byte, and its header says
changing `GENERATOR_SEED` invalidates recorded measurements. The new fields are derived from the
**already-picked** `pack`, and consume no additional `rng()` call. So every existing field of every
row stays identical. A test pins this with a fingerprint literal captured from the pre-change
generator, not one recomputed from the new code, which would prove nothing.

**3. Seed writes it on creation.** `prisma/seed.ts`'s generated-catalogue `product.createMany`
writes `netContentAmount`, `netContentUnit`, and `unitPricePencePerBaseUnit`. The last is the
`#664` sort key. `#398`'s R31 says it is always computed from the row's own price and net content,
never supplied independently. So the seed computes it with the same
`deriveUnitPricePenceForSort` the repository write path uses (`components/product/unit-price.ts`,
which is DB-free and already importable). A net content without its sort key would make
unit-price sorting silently skip the row.

**4. Seed backfills rows that already exist. This is the part that actually changes dev.** The seed
skips row creation when the database already holds at least the requested count of generated rows
(`prisma/seed.ts`, the `existing >= count` guard). Dev already holds them. Scope 3 alone would
therefore change nothing in any database that matters. So the seed gains a backfill that always
runs, before that early return. It regenerates the catalogue deterministically, matches existing
rows **by slug** (a generated slug embeds its row index, so the same index yields the same slug
and pack), and updates only matched `gen-`-prefixed rows of that vendor whose `netContentAmount` is
still null. It writes all three columns together. A second run updates zero rows. It logs how many
rows it updated and how many generated rows it could not match (expected: zero).

**5. Proof it works.** A committed verification script
(`specs/2026-09-23-p877-generated-net-content/verify-generated-net-content.ts`, the convention other
slices use) reads the dev database and reports the checks validation needs: coverage, pairing,
sort-key consistency, and curated rows untouched. The facet and card label are then checked in the
browser under `npm run preview`.

## Deliberately excluded

- **Real products (the rest of `#697`).** Production carries no generated catalogue, so this slice
  changes nothing there. The ~2,080 real Aheed products and 3 real SriMart products stay without
  net content. `#697` stays open for that decision.
- **Curated seed fixtures.** The hand-written demo products in `prisma/seed.ts` (`CATALOGUE` and
  the bundle fixtures) are not given net content. Their `unitLabel`s are free text, so giving them
  net content is the same parse-or-hand-enter question `#697` owns.
- **Any `unitLabel` parsing.** Not in any form.
- **Running the seed against staging or production.** No workflow runs the seed, and this slice
  doesn't run it there either. Its live checks run against dev only.
- **`EACH` for `Pack of N`.** See Scope 1.
- **The unit-price sort UI (`#664`).** The sort key is written, so `#664` has data when it is built.
  Building it is not this slice.

## Open items carried forward

- `#697`: net content for real products, still undecided (parsed backfill vs. hand entry vs.
  nothing).
