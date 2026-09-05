# P2.6 slice 6 — catalogue filter facets (build notes)

Written at the end of Build, **before** the Clear. This is the one artifact the Clear bets on:
the validating context is fresh and has only the spec, the artifact, and this file.

Branch `feature/catalogue-filter-facets`. Two commits: `fbcf996` (spec) and `e0f29e7`
(implementation), plus this documentation commit.

**Gate status at the end of Build:** `lint`, `typecheck`, `format:check` green;
`npx vitest run` reports **94 files / 1144 tests**, all passing (pre-slice baseline was 94 files /
1126 tests — the file count is unchanged because this slice added tests to existing files rather
than new files, and a matching file count is what rules out the forks-pool trap that silently skips
whole files while still exiting 0). `npm run kms:validate` and `npm run kms:check-generated` both
exit 0, and the internal docs site builds clean (`kms:assemble:internal` then
`next build --webpack`, real exit status read rather than piped).

## What changed and why

**Schema — one additive migration** (`20260905130349_p2_6_catalogue_filter_facets`).
`Product` gains `isVegetarian`, `isGlutenFree`, `isHmcCertified` (booleans, matching the existing
`isHalal`/`isFresh`/`isOrganic` shape), `hmcReference`/`hmcVerifiedAt`, and a nullable `brandId`.
New vendor-scoped `Brand` model carries `name`, `slug` and `imageKey`. Everything is nullable or
defaults to `false`, so the roughly 2,000 existing products need no backfill.

Two indexes were added, for `brandId` and `origin` — the two high-cardinality facets. The dietary
booleans deliberately get none, matching how `isHalal`/`isFresh`/`isOrganic` are already treated: a
boolean splits the table roughly in half, so an index earns little against its cost on every write.

**GAP-011 fired for the SIXTH time.** `prisma migrate dev --create-only` generated `DROP INDEX`
against all three hand-authored `pg_trgm` indexes from
`20260820143949_p7_5de_order_search_trigram`. The drops were removed before the migration was ever
applied, the migration file carries a comment saying so, and all three indexes were confirmed still
present in the dev database afterwards by direct query. This now happens on every single migration
this project generates, regardless of how unrelated the new model is.

**`lib/repositories/products.ts`** — `ProductFilters` gains the six new fields; `buildFilterWhere`
emits them. The offers clause is the interesting one and is discussed under Decisions below.
`getAvailableSpecialities` became **`getAvailableFacets`** (with `AvailableSpecialities` →
`AvailableFacets`, `SpecialityContext` → `FacetContext`,
`ProductRepository.availableSpecialities` → `availableFacets`), because it no longer returns only
specialities. Its probe set went from three to nine — six dietary/speciality booleans, an offers
probe, and two `distinct` queries for origins and brands — all inside one `Promise.all`.

**`lib/repositories/brands.ts` + `lib/brands-service.ts`** — new repository and its request-scoped
sibling, following the `categories` pair exactly. Every repository export takes `prisma` and
`vendorId` explicitly. **`rename` and `setImageKey` take the WebSocket client, not the HTTP one**,
because both use `updateMany`, which crashes unconditionally through `getPrisma()`'s HTTP adapter
(`Transactions are not supported in HTTP mode`, `#382`) regardless of the `where` clause or match
count. `create` and every read use the ordinary client.

**Storefront** — `ProductFilterForm` gains four checkboxes and two `select` controls, each rendered
only when the facet has values in the current context. `filter-chips.ts` and `search-href.ts` gain
the six keys, as does `app/(storefront)/categories/[slug]/page.tsx`'s own `buildHref`. Both browse
pages resolve `?brand=` to an id before querying, mirroring `#568`'s category handling, so an
unknown slug applies no predicate and renders no chip.

**Admin** — `ProductForm` gains the dietary checkboxes, a brand `select`, and a separate HMC
certification section; `lib/catalogue-form.ts` parses and validates them, including registering
every new field in `PRODUCT_FIELDS` (a field absent from that list is never read out of the
`FormData` at all, however correctly the form renders it). New `/staff/brands` page with create,
rename and set-image-key actions, `ADMIN`-only with `<PanelRefusal>`, linked from the staff hub.

**Seed** — `seedBrands` plus a new `applyFacetFields` pass, both positioned **before**
`seedCatalogue`'s per-category early return. See Decisions.

**Persistent docs** — `specs/architecture.md` 1.26.0 records the `where`-composition rule;
`docs/developer-portal/nfr-baseline.md` 1.4.0 records the re-measurement; `CLAUDE.md` 1.16.0
updates the vitest baseline and the GAP-011 occurrence count.

## Decisions taken during the build

**`combineWhere`, and why nesting under `AND` alone was not enough.** The spec (R11) required the
offers clause to nest under `AND` rather than emit a top-level `OR`, because the `#565` ladder's
`identitySearchPredicate`/`broadSearchPredicate` both emit their own top-level `OR` and are spread
second. That was correct but incomplete: **`buildDirectSearchWhere` also returns `{ AND: [...] }`**,
so nesting under `AND` merely moved the same silent overwrite onto the *direct* search path. The
spec's fix would have shipped the bug it was written to prevent, on a different path.

The actual fix is a `combineWhere` helper that wraps fragments in `AND` **only when two of them
genuinely share a key**, and otherwise spreads exactly as before. The "otherwise" matters: an
unconditional wrap changed the shape of every query in the application, and twelve existing tests
correctly assert those shapes verbatim. Those failures were the signal that the first version was
wrong, not noise to be edited away.

**Brand resolves by slug to an id in the page, not by relation filter in the predicate.** A
`{ brand: { slug } }` relation filter would have avoided one query. It was rejected because an
unknown slug would then match zero rows and empty the catalogue — the opposite of `#568`'s ruling
for an unknown category slug. Consistency between two adjacent facets is worth one indexed lookup.

**Origin renders a chip even when it matches nothing; brand does not.** These look inconsistent and
are deliberately different. An unresolved *brand* slug applies no predicate, so a chip would claim a
filter that is not running. An *origin* value is an exact column match, so `?origin=Atlantis`
genuinely filters — to nothing — and without a chip the shopper is stranded in an empty result set
with no visible way out.

**A rename does not regenerate a brand's slug.** The slug is what a shopper's bookmarked or shared
`/search?brand=<slug>` URL carries; regenerating it on every rename would silently break links that
worked moments earlier. A typo fix should not cost a shopper their saved filter.

**HMC provenance is required, not optional.** `/propose` left this to `/spec`, which ruled required;
Build implemented it as: ticked demands both fields, unticked **nulls both regardless of what was
typed**. The second half matters as much as the first — stale evidence left behind by an untick
would read to a later reader as still-current.

**`hmcVerifiedAt` uses `type="date"` and is parsed as UTC midnight.** Deliberately not
`datetime-local`, and deliberately not routed through `lib/local-datetime.ts`. That helper exists
because a `datetime-local` input submits a naked wall-clock string ECMAScript interprets in the
runtime's own zone; a **date-only** ISO string has no such ambiguity. Reaching for the helper here
would add machinery for a problem this input shape does not have.

**The seed applies new fields to products that already exist.** Not specified, and the slice would
have been unvalidatable without it. `seedCatalogue` early-returns once a vendor's categories exist,
so anything after that check only ever runs against a from-scratch database — meaning the new
columns would reach a fresh dev database and **never** reach dev, staging or production as they
actually are. A facet with no qualifying row simply does not render, so the gap would have looked
like "this vendor has no vegetarian stock" rather than like a bug. This is `#502` exactly: a
row-only idempotency guard positioned above the work it guards. `applyFacetFields` runs before the
early return and writes only this slice's columns, only for fixture products that declare them, and
only where the product already exists.

**Origin and brand are `select` controls, single-select.** Checkbox lists do not scale past a
handful of brands without dominating the panel, and single-select is what makes one removable chip
per facet the correct model. Both keep the no-JS path intact.

## Deviations from the spec

**R14 was reworded during Build.** As written it required that the four old facet identifiers appear
nowhere in `lib/`, `app/`, `components/`, `scripts/` or `tests/`. That forbade explaining the rename
in the very file performing it, and a raw `grep` cannot distinguish a comment from a call — the
identical comment-versus-code confusion `#568` hit five times. Reworded to "in code — no import,
declaration, call site, type annotation or object key", with comments documenting the rename
explicitly permitted. `validation.md`'s R14 row now leads on `npm run typecheck` (which *is* the
proof, since the old names no longer exist) and treats the grep as a locator. Three such comments
remain, all in `lib/repositories/products.ts`.

**Two probes in `getAvailableFacets` use `findMany`, not `findFirst`.** `requirements.md` R17/R18
speak of "probes" generically; origin and brand are distinct-**value** facets, so they need the
values rather than existence. Test stubs were extended accordingly. Not a behavioural deviation,
but it changes what a validator reading R17 should expect to find: **seven** `findFirst` calls and
**two** `findMany` calls, nine total.

**`ProductFilterForm`'s `specialities` prop was renamed to `facets`,** following the function
rename. `requirements.md` did not name the prop. Two existing test files
(`tests/filter-panel.test.tsx`, `tests/product-filter-form.test.tsx`) were updated for it.

Nothing else deviates.

## Known-shaky areas

**Nothing in this slice has been exercised in a browser or under `npm run preview`.** Every live
check in `validation.md` is genuinely outstanding. The repository, predicate and form logic are
covered by unit tests and the data was verified by direct database query, but no page has been
rendered. Start there.

**The third key list is not pinned by any test.** R30's test pins `filter-chips.ts`'s `REMOVABLE`
against `search-href.ts`'s `CARRIED`, but `app/(storefront)/categories/[slug]/page.tsx`'s
`buildHref` is a hand-written `if (params.X) qs.set(...)` chain that a unit test cannot reach
without importing a page module. **R29's live pagination check is the only thing covering it** — if
one row in this document deserves extra care, it is that one. Two of three lists pinned is not
three, and this exact omission is what `#501` and `#568` each shipped once. Filed as `#601`.

**The offers predicate's correctness rests on an invariant enforced in one place.**
`originalPrice: { not: null }` means "has a markdown" only because `lib/catalogue-form.ts` rejects a
was-price at or below the current price. Seeded data honours it and the admin path enforces it, but
**any row written by a future script or import bypassing that parser would break the facet
silently** — the product would appear under "On offer" with no visible discount. Prisma cannot
compare two columns in a `where`, so there is no defence-in-depth here.

**Facet availability depends on seeded data, so a facet control missing is ambiguous.** A facet with
no qualifying row correctly renders nothing. Confirmed present in the dev database at Build time:
brands 3, vegetarian 2, gluten-free 1, HMC 1, branded 3, with-origin 1,633, on-offer 3, and **zero**
HMC provenance violations. If a control is missing during validation, check those counts before
concluding the code is wrong.

**`/staff/brands` write actions have unit coverage of the repository only, not of the actions.** The
create/rename/set-image path has not been driven end-to-end. R38 covers it, and the duplicate-name
branch (`isUniqueViolation`, which must catch the HTTP adapter's raw `23505` as well as Prisma's
`P2002`) is worth exercising with a real duplicate submission rather than assumed — that exact
predicate is what `upsertBundle` 500ed on in `#347`.

**`renameBrand` and `setBrandImage` run `updateMany` through the WebSocket client.** Typed correctly
and reasoned from `#382`, but **not executed against a real database**. If either 500s with
`Transactions are not supported in HTTP mode`, the wrong client reached it.

**The dev database's migration checksum needed manual repair before this slice's migration could be
created** — `#378`, hit again here. `20260904164054_p2_6_list_normalisation_attempt` had been edited
after being applied (removing its own GAP-011 drops), so `prisma migrate dev` demanded a full reset.
Recovered without data loss by deleting that `_prisma_migrations` row and running
`prisma migrate resolve --applied`. Recorded on `#378`. A validator seeing the same demand should
**not** run `migrate reset`.

**The seed run at Build failed partway** with `ConnectTimeoutError` reaching Cloudflare's storage
endpoint during placeholder-image upload. All database work completed first and was verified; the
failure is the object-storage step and is unrelated to this slice. Do not read a clean seed run as a
prerequisite for the live checks.

## Issues filed from this slice

- **`#601`** — a filter key lives in three unsynchronised lists; R30's test pins only two of them.
  The unpinned one is the category page's own `buildHref`.
- **`#602`** — `/staff/search-synonyms` (from `#566`) is unlinked from the staff hub, so its
  approval queue is reachable only by typing the URL. Noticed while grounding this slice; belongs
  to that slice's surface, not this one.
- **`#378`** (existing) — commented with the exact non-destructive recovery for the migration
  checksum drift hit during this Build, since the error message recommends `migrate reset`.
