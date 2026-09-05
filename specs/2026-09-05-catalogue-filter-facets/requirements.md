# P2.6 slice 6 — catalogue filter facets (requirements / acceptance criteria)

Closes `#569`, the sixth and final slice of P2.6, per the `/propose` decision record at
[issue comment 5551204677](https://github.com/sriahead/aheed-online-store/issues/569#issuecomment-5551204677).
Builds on `#568`'s filter panel, chips and facet-probe pattern. Adds four catalogue facets — country
of origin, dietary suitability, brand and offers — together with the schema, admin write surface and
seed data each needs, because a filter over a column nobody can populate is dead UI. HMC
certification ships with provenance rather than as a bare boolean. Narrative and rationale:
`plan.md`.

## Schema and migration

R1. `prisma/schema.prisma`'s `Product` model declares `isVegetarian`, `isGlutenFree` and
    `isHmcCertified`, each `Boolean @default(false)`.

R2. `prisma/schema.prisma`'s `Product` model declares `hmcReference String?` and
    `hmcVerifiedAt DateTime?`.

R3. `prisma/schema.prisma` declares a `Brand` model that is vendor-scoped (a `vendorId` field and a
    `Vendor` relation), carries `name`, `slug` and `imageKey String?`, and declares
    `@@unique([vendorId, slug])`. `imageKey` holds a **relative storage key**, never a URL, matching
    every other image column in this schema; the field's own schema comment says so.

R4. `prisma/schema.prisma`'s `Product` model declares `brandId String?` and an optional `brand`
    relation to `Brand`, so no existing product row requires a backfill.

R5. This slice adds exactly one new directory under `prisma/migrations/`, and its `migration.sql`
    contains no `DROP INDEX` statement.

R6. After that migration is applied to the dev database, all three trigram indexes created by
    `prisma/migrations/20260820143949_p7_5de_order_search_trigram` still exist.

## Predicates

R7. `ProductFilters` in `lib/repositories/products.ts` gains optional `isVegetarian`,
    `isGlutenFree`, `isHmcCertified`, `onOffer`, `origin` and `brandId` fields.

R8. `buildFilterWhere` emits `isVegetarian: true`, `isGlutenFree: true` and `isHmcCertified: true`
    only when the corresponding filter field is `true`, and emits no key for that field otherwise.

R9. `buildFilterWhere` emits an exact-match `origin` predicate only when `filters.origin` is a
    non-empty string, and emits no `origin` key otherwise.

R10. `buildFilterWhere` emits a `brandId` predicate only when `filters.brandId` is a non-empty
     string, and emits no `brandId` key otherwise.

R11. When `filters.onOffer` is `true`, `buildFilterWhere`'s returned object has **no top-level `OR`
     key**; the offers clause is nested inside an `AND` array, expressing "`originalPrice` is not
     null, OR a `priceTier` row exists".

R12. A unit test in `tests/search-repository.test.ts` asserts that with `onOffer` active, the
     `where` object reaching `findMany` on **each** of the three search paths — direct, the `#565`
     identity rung and the `#565` broad rung — still contains both the offers clause and that
     rung's own `OR` predicate, neither having overwritten the other.

R13. A unit test asserts `buildFilterWhere({})` produces an object carrying no `origin`, `brandId`,
     `OR`, `AND`, `isVegetarian`, `isGlutenFree` or `isHmcCertified` key, so an unfiltered catalogue
     query is unchanged by this slice.

## Facets

R14. `getAvailableSpecialities`, `AvailableSpecialities`, `SpecialityContext` and
     `ProductRepository.availableSpecialities` are renamed to `getAvailableFacets`,
     `AvailableFacets`, `FacetContext` and `availableFacets`; none of the four former identifiers
     appears anywhere in `lib/`, `app/`, `components/`, `scripts/` or `tests/` afterwards. The
     function no longer returns only specialities, and `#568` set the precedent of renaming when a
     helper's role widens (`directSearchPredicate` became `buildDirectSearchWhere`).

R15. `FacetContext` excludes, by TypeScript type rather than a runtime delete, every field a facet
     control can set: `isHalal`, `isFresh`, `isOrganic`, `isVegetarian`, `isGlutenFree`,
     `isHmcCertified`, `onOffer`, `origin` and `brandId`.

R16. `getAvailableFacets` reports, for the current result context: availability of each of the six
     dietary and speciality booleans, availability of at least one product on offer, the distinct
     list of non-null `origin` values, and the distinct list of brands (id, name and slug).

R17. A unit test asserts that each boolean facet probe's `where` excludes all nine facet fields
     listed in R15, so an active facet is always reported as available and can always be unticked.

R18. A unit test asserts the origin facet probe's `where` contains no `origin` key and the brand
     facet probe's `where` contains no `brandId` key.

R19. `getAvailableFacets` issues its probes inside a single `Promise.all`, so added facets cost one
     round trip of latency rather than one each.

## Storefront controls, chips, pagination and no-JS

R20. `components/product/ProductFilterForm.tsx` renders a checkbox named `isVegetarian`,
     `isGlutenFree` and `isHmcCertified` respectively, each only when the facet data reports that
     flag available in the current context.

R21. `components/product/ProductFilterForm.tsx` renders a `select` named `origin` whose first
     option applies no origin filter, populated from the available-origins facet, and renders no
     such control when that list is empty.

R22. `components/product/ProductFilterForm.tsx` renders a `select` named `brand` whose first option
     applies no brand filter, populated from the available-brands facet with the brand's name as
     the option label and its slug as the value, and renders no such control when that list is
     empty.

R23. `components/product/ProductFilterForm.tsx` renders a checkbox named `onOffer`, only when the
     facet data reports at least one product on offer in the current context.

R24. `components/product/filter-chips.ts`'s `FilterChipParams` type and its `REMOVABLE` key list
     both gain `origin`, `brand`, `onOffer`, `isVegetarian`, `isGlutenFree` and `isHmcCertified`.

R25. The brand chip's label is the brand's **name**, not its slug; when the `brand` query parameter
     does not resolve to a brand of the current vendor, the page applies no brand predicate and
     renders no brand chip — matching `#568`'s fix for the equivalent category case.

R26. The origin chip renders whenever the `origin` query parameter is a non-empty string, including
     a value matching no product, because unlike an unresolved category slug the origin predicate
     **is** applied and a shopper must be able to remove it.

R27. The dietary chips are labelled `Vegetarian`, `Gluten free` and `HMC certified`, and the offers
     chip is labelled `On offer`.

R28. `components/product/search-href.ts`'s `SearchHrefParams` type and its `CARRIED` key list both
     gain the six new keys, so `searchPageHref` carries every new facet across a page boundary and
     `categoryFilterHref` preserves them when a department is chosen from within results.

R29. `app/(storefront)/categories/[slug]/page.tsx`'s `buildHref` carries all six new keys, so
     paginating a category listing with a facet active does not silently drop it.

R30. A unit test asserts that the removable-filter key list in `components/product/filter-chips.ts`
     and the carried key list in `components/product/search-href.ts` describe the same set of
     filter keys, so a facet added to one but not the other fails a test rather than stranding a
     shopper one click into pagination.

R31. Neither `components/product/ProductFilterForm.tsx` nor `components/product/FilterPanel.tsx`
     contains a `"use client"` directive, so the no-JS filter path is preserved.

## Admin write surface

R32. `components/staff/ProductForm.tsx` renders checkboxes named `isVegetarian`, `isGlutenFree` and
     `isHmcCertified`.

R33. `components/staff/ProductForm.tsx` renders a text input named `hmcReference` and an input named
     `hmcVerifiedAt` whose `type` is `date`.

R34. `lib/catalogue-form.ts` returns a field-level error, rather than a successful parse, when
     `isHmcCertified` is ticked and either `hmcReference` is blank or `hmcVerifiedAt` is blank.

R35. `lib/catalogue-form.ts` yields `hmcReference: null` and `hmcVerifiedAt: null` whenever
     `isHmcCertified` is not ticked, regardless of what those two fields contained on submission.

R36. `components/staff/ProductForm.tsx` renders a `select` named `brandId` listing the current
     vendor's brands, whose first option assigns no brand.

R37. A page exists at `app/(admin)/staff/brands/page.tsx` that calls `requireVendorRole("ADMIN")`
     and renders `<PanelRefusal>` on refusal, never `return null`.

R38. `/staff/brands` supports creating a brand, renaming an existing brand, and setting a brand's
     image key, each through a server action. Setting the key stores the string only — this slice
     adds **no image upload pipeline** for brands, because nothing renders a brand image until
     `#394`, and an upload path whose result is never displayed cannot be verified against the CDN
     of the environment that serves it.

R39. Every export of `lib/repositories/brands.ts` takes its Prisma client and `vendorId` as explicit
     parameters; `tests/repository-purity.test.ts` and `tests/repository-client-injection.test.ts`
     both pass with no allowlist entry added for the new file.

R40. `lib/brands-service.ts` exists as the request-scoped facade over `lib/repositories/brands.ts`,
     constructing its Prisma client fresh per call rather than caching one.

R41. `app/(admin)/staff/page.tsx` links to `/staff/brands`.

## Seed and measurement

R42. After a seed run against an empty database, at least one `Brand` row exists and at least one
     product carries each of `isVegetarian`, `isGlutenFree`, `isHmcCertified`, a non-null `brandId`
     and a non-null `origin`, so every facet in this slice is reachable in a freshly seeded
     database.

R43. Any product seeded with `isHmcCertified` true also carries a non-null `hmcReference` and
     `hmcVerifiedAt`, honouring R34's invariant in fixture data.

R44. `scripts/measure-catalogue-queries.ts` measures the widened facet probe set, and
     `docs/developer-portal/nfr-baseline.md` records the resulting p95 for `searchProducts` and for
     the facet probes at roughly 2,000 products, alongside its existing 95.4 ms figure.

R45. The measured p95 recorded for R44 is under the 400 ms API target from `specs/mission.md`.

## Documentation and gates

R46. `specs/architecture.md` records, as a standing constraint rather than only a note in this
     slice's `plan.md`, that a filter predicate must not emit a top-level `OR` because the search
     ladder's rung predicates already do and the later spread silently wins. Its `version` and
     `updated` front-matter fields are both bumped.

R47. `CHANGELOG.md` is updated on the branch (Gate 4).

R48. `npm run kms:validate` and `npm run kms:check-generated` both exit 0.

R49. `lint`, `typecheck`, `test` and `format:check` all remain green after this slice.
