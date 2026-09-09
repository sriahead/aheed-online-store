# Storefront browse discovery completion (build notes)

Written at the end of Build, **before** the Clear. The validating context is fresh and has only the
spec, the artifact, and this file.

Three issues in one slice: `#694` (CollectionNav absent from category pages), the pack-size
remainder of `#397`, and `#608` (facet display). **No schema change, no migration.** Two commits:
`e887d86` (spec) and `8f26ce8` (implementation).

## What changed and why

**`components/product/unit-price.ts`** gained four pure exports rather than a new module. That file
already owns the `NetContent` shape and the `REFERENCE_UNITS` conversion table, and pack size is the
same dimension viewed as a facet instead of as a price — a separate `pack-size.ts` would have had to
import the table anyway and would have split one concept across two files.

- `formatPackSize` — `500` + `GRAM` becomes `500g`. Deliberately distinct from
  `deriveUnitPriceLabel`, which answers "what does this cost per kg". One answers size, the other
  price.
- `packSizeParamValue` / `parsePackSizeParam` — the wire form is `500-GRAM`, one key, because both
  halves must travel together to mean anything and a single key cannot be half-supplied.
- `comparePackSizes` — the non-obvious one. Sorting on the raw amount puts `1kg` before `500g`,
  because 1 is the smaller *number* and the larger *pack*. Reusing `REFERENCE_UNITS` is what makes
  them comparable, and means a unit added to the enum later is ordered correctly for free rather
  than silently landing at the end.

**`lib/repositories/products.ts`** — `ProductFilters.packSize` carries amount and unit as one value
so `buildFilterWhere` cannot half-apply it; `AvailableFacets.packSizes` is populated by a
`distinct: ["netContentAmount", "netContentUnit"]` probe added to the existing `Promise.all`,
matching the `distinct`-not-`groupBy` reasoning already documented there for origins and brands.
Ordering is done in TypeScript over the fetched rows, not in SQL — comparing 500g against 1kg is a
unit conversion Postgres has no reason to know about.

For `#608`, the repository had exactly one shared `productSummarySelect` and one `toProductSummary`
mapper (`#564` R18 made sure of that), so widening the summary was two edits plus the interface
rather than a hunt through call sites. `getProductBySlug` keeps its own separate select and got the
same fields plus `hmcReference`.

**`components/product/ProductCard.tsx`** gains three text badges and the brand line;
**`app/(storefront)/products/[slug]/page.tsx`** gains a facet block it never had — that page
rendered *no* facet at all before this, not even Halal or Fresh, which the card has shown since
P2.5b1. That made the detail page the larger half of `#608`, which the issue title does not convey.

**`app/(storefront)/categories/[slug]/page.tsx`** gains `CollectionNav` inside a new
`md:w-60 md:shrink-0` wrapper. The wrapper is the part worth knowing: `/search` already had one and
the category page rendered `FilterPanel` as a bare flex child, so dropping the nav in without it
would have given the two pages different column behaviour at the `md` breakpoint.

## Decisions taken during the build

**Pack size is one select, not a multi-select.** Matches `origin` and `brand`. Multi-select is a
question about every distinct-value facet at once, not about pack size, and answering it here would
have forked the three controls' behaviour.

**The parser accepts `string | string[]` and rejects the array.** `#689` records five existing keys
that throw a real HTTP 500 on a repeated query parameter because each calls a string method on what
is actually an array. Fixing those is `#689`'s scope and is untouched here — but the new key is
array-safe by construction, so it cannot become the sixth. Rejected the alternative of taking the
first element of an array: it invents an intent the shopper did not express.

**A malformed `packSize` renders no chip.** Follows `category`/`brand` rather than `origin`. The
rule that decides it is already written down in `filter-chips.ts`: a value applying no predicate must
not render a chip claiming a filter that is not running. `origin` is the exception because it is an
exact column match, so even a nonsense value genuinely filters — to nothing — and without a chip the
shopper would be stranded with no visible way out. A rejected pack size applies no predicate at all,
so it gets no chip.

**Badge colours are decoration, never the signal.** All three new card badges use `bg-surface-muted`
with `text-primary` and carry their meaning as text, so removing every colour from the card leaves
them readable. No raw hex anywhere — `#512` and `#631` are both in this area.

**The HMC reference renders on the detail page, not the card.** `#239` was a real incident of this
codebase asserting an HMC claim with no basis. The badge is legitimate now because
`lib/catalogue-form.ts` requires `hmcReference` whenever the flag is ticked, so there is
per-product data behind it — but a card has no room for provenance, and the detail page is one click
away.

**The pack-size predicate ships unindexed — reopened and measured, not assumed.** `plan.md`
committed to measuring rather than reasoning, and the measurement found the predicted sequential
scan is real: `Seq Scan on "Product"`, 1883 rows removed by filter, top-N heapsort. It also found it
does not matter yet — **Execution 0.487 ms, `Buffers: shared hit=93`, no reads**. The whole table is
in cache; Postgres picks a scan because at this size a scan genuinely is cheapest. `#670` part 3
added its index against a 12.063 ms scan, so this is already 25x faster than the case that justified
one. Adding a migration, and a GAP-011 round, to save under half a millisecond is the worse trade.
The revisit threshold (~20,000 products for ~5 ms) is recorded in `plan.md`.

## Deviations from the spec

**R15 was wrong and has been corrected in `requirements.md` and `validation.md`.** As written it
required forwarding `packSize` to `availableFacets` as well as to the product query. That is not
possible without widening `FacetContext`, and widening it would be a defect: that type deliberately
carries only `groups`, `categoryIds`, price and in-stock, because **each facet probe must exclude
every other facet's own selection**. A selected pack size narrowing the probe would hide every
*other* pack size from the control that offers them. `origin` and `brandId` are already excluded for
exactly this reason. The corrected R15 states the exclusion and says how to verify it. Recorded here
rather than silently built around, because validation checks the artifact against the spec.

**`tests/products-repository.test.ts` was edited, and that is the tripwire working, not a
workaround.** Three of its assertions pin the facet probe *set* — the count of probes, and the
`where` shape of each `findMany`. Adding a probe fired all three, which is precisely what their own
comment says they exist to do ("a facet added without extending the set shows up here as a count
change rather than passing silently"). They were **extended** with the pack-size probe — a new mock
returning rows deliberately out of size order and with a half-null row, plus assertions that the new
probe narrows to both columns non-null and to neither value — rather than having their numbers
bumped. Per `CLAUDE.md`'s lesson about tests asserting arithmetic they did not mean to assert: here
the arithmetic *is* the intent, so the fix is to extend the set, not to change the shape.

**Two spec-time additions absorbed during Build, both already in `requirements.md` as R12 and R14**
(added at `/spec` after the adversarial pass, so not deviations — noted so validation knows why they
exist): `packSize` had to reach `search-href.ts`'s `CARRIED` as well as `filter-chips.ts`'s
`REMOVABLE`, and the new select had to use a wrapping `label` with no `id` because `FilterPanel`
renders the whole form twice per page.

## Known-shaky areas

**The one that will look like a bug and is not: there is no net-content data anywhere.** Measured
directly against the dev branch — **2,080 active Aheed products, 3 SriMart products, and ZERO
carrying `netContentAmount`/`netContentUnit`.** `prisma/seed.ts` never writes those columns; only
`components/staff/ProductForm.tsx` does, per product, by hand. So on an unmodified database the
pack-size control correctly renders **nowhere**, `packSizes` is empty on every page, and
`/search?packSize=500-GRAM` correctly returns an empty listing. **Validation must create a fixture
first** — `validation.md`'s "Before you start" says exactly what to set and to revert it afterwards.
Without that, R9, R11's non-empty case, R16, R17 and R18 are all unprovable and every one of them
will read as broken.

Filed as **`#697`**, and the consequence is larger than this slice: `#398`'s unit-price derivation is
inert everywhere too, since `deriveUnitPriceLabel` returns null without net content and every
surface falls back to the free-text `unitLabel` whose unreliability was the whole reason `#398`
existed. **Dev was measured; staging and production were not.** Do not treat the inference as a
measurement — `#502` is the standing lesson about checking the environment that actually serves the
thing.

**Nothing in this slice has been exercised in a browser or under `npm run preview`.** Build ran
`lint`, `typecheck`, `vitest` and `format:check` (all exit 0, 117 files / 1557 tests) and a real
`EXPLAIN` against the dev database, but rendered no page. Every E2E row in `validation.md` is
genuinely unverified.

**The second vendor is untested.** SriMart has three products in dev, none with net content and
possibly none with the new dietary flags or a brand, so R27's "confirm at least one facet differs
from Aheed's" may legitimately have nothing to show. If so, say that plainly rather than forcing a
difference.

**The R21/R22 card rows need real products picked from the database, not guessed.** Whether any
seeded product actually has `isVegetarian`/`isGlutenFree`/`isHmcCertified` true, or a null `brandId`,
was not checked at Build — only that the code renders them when true. If no product has a flag set,
that is `#608`-adjacent data thinness worth reporting, not a rendering failure.

**`comparePackSizes` orders unit families by the reference unit's label string** (`each` < `kg` <
`litre`, alphabetical). That is deterministic and unit-tested, but it is an arbitrary grouping order
rather than a designed one — nobody has said mass should precede volume. Fine to change if a
reviewer prefers a different order; the test pins current behaviour, not a requirement.
