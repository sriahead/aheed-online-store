# Storefront browsing affordances (build notes)

Written at the end of Build, before the Clear. Branch `feature/storefront-browsing-affordances`,
cut from a freshly-fetched `origin/staging` at `0dbb8e4` (the merge commit for #510). Spec commit
`c905d8b`, build commit `27b91fd`.

Nothing in this slice has been run against a real database or a browser. Every live row in
`validation.md` is unverified by construction — see "Known-shaky areas".

## What changed and why

**`app/(storefront)/search/page.tsx`** — the substance of the slice. The query used to run inside
`if (query)` and the grid was gated on `query &&`, so a bare `/search` returned 200 with a filter
sidebar, a department strip and an empty content column. It now computes one `options` object and
picks the call: `products.search(query, options)` when there is a trimmed `q`, `products.list(options)`
when there isn't. Both paths take the same `take`, `cursor`, price, stock and speciality values, so
filters and keyset pagination behave identically in either mode. The heading is derived
(`All products` vs `Results for “<query>”`), and an empty result renders a message instead of
nothing.

**The `#211` decision this had to touch.** The `list()` docstring on the `ProductRepository`
interface justified keeping `list()` and `search()` separate by asserting that on the `/search`
page "an empty box means 'nothing searched yet', not 'browse everything'". The *structural* half of
that is untouched and still right: `searchProducts` and its empty-query guard are byte-for-byte
unchanged, and the two functions stay separate. Only the page's reading of an empty box changed, so
the sentence was rewritten rather than left contradicting the file it sits in. **No persistent doc
needed updating** — `specs/architecture.md` and the ADRs say nothing about `/search`'s empty-query
semantics; that decision lived only in the docstring, which is why it was so easy to contradict.

**`components/product/search-href.ts`** (new) — `nextPageHref` moved out of the page and renamed
`searchPageHref`. Not cosmetic: the param list grew to eight, a dropped param is invisible from the
outside (the shopper clicks "Next page" and lands on a plausible-looking unfiltered listing), and a
page file cannot export a helper for a test to import because Next only permits its own known
exports. `components/product/parse-price-input.ts` is the existing precedent for a pure helper
beside the components that use it.

**`components/product/ProductFilterForm.tsx`** — a hidden `featured` input, rendered only when the
param is exactly `1`. This is a correctness requirement of the `featured` param, not an extra: the
form is a plain `method="GET"` form, so submitting it replaces the entire query string with only
the fields it contains. Without the hidden field, pressing "Apply" from a featured listing silently
drops the filter. `cursor` is deliberately *not* carried the same way — a filter change should
restart pagination at page 1, which is the existing behaviour and still correct.

**`components/bundle/BundleRow.tsx`** — an optional `viewAllLink`, rendered with the same `Link`
element and class list `ProductRow` uses, so the three rows' links are indistinguishable. The
header `<div>` became a flex row to seat the link opposite the title; the title and subtitle moved
into a nested `<div>` and are otherwise unchanged.

**`app/(storefront)/bundles/page.tsx`** (new) — the destination for that link. Shares
`hasAvailableItems` with `BundleRow`, which is the point: one predicate means the page and the row
cannot disagree about which bundles are renderable. Carries its own empty state.

**`app/(storefront)/categories/page.tsx`** — the three `viewAllLink` values.

**`prisma/seed.ts`** — `seedFeaturedProducts`, plus its two slug lists and two call sites. See
"Decisions" for why it is a separate pass rather than a fixture field.

**`/search`'s title** — was a hardcoded `metadata = { title: "Search — Aheed Food Centre" }`, which
rendered that name under SriMart. Now a `generateMetadata` reading `getCurrentVendorProfile()`,
copied from `categories/page.tsx`. The `#239` defect class.

## Decisions taken during the build

**The featured flag is set by its own idempotent pass, not by a field on the product fixtures.**
This is the decision most worth understanding. `seedCatalogue` returns early per category once that
category exists, so an `isFeatured: true` added to a `CatalogueProduct` fixture would only ever
reach a database seeded *after* this slice — every existing dev, staging and production database
would silently never gain it. That is the same row-only-guard divergence `#502` spent a slice
fixing. `seedSubcategories`, one function above, already exists for exactly this reason and says so
in its own docstring, so `seedFeaturedProducts` follows it: an `updateMany` keyed on slug, run every
seed, idempotent, reaching databases that predate it.

**`updateMany` is safe here specifically because this is the seed.** `prisma/seed.ts` runs in real
Node on `PrismaNeon` (the WebSocket adapter) and already calls `createMany` elsewhere. Under
`getPrisma()`'s HTTP adapter the same call would crash unconditionally (`#382`). Noted in the code
comment so nobody lifts this function into application code without reading that.

**Six Aheed slugs and two SriMart, chosen to stay under the 12-item page size.** If the featured
count met or exceeded the page size, `/search?featured=1` and bare `/search` would both return a
full page of 12 and the filter's effect would be unobservable from the outside — the validation row
would pass while proving nothing. SriMart has only three products in total, so two keeps it a
strict subset there too. Slugs picked to look like a plausible merchandising selection across
different departments rather than the first six in the file.

**`searchPageHref` iterates a `CARRIED` array rather than repeating eight `if` statements.** The
original was eight near-identical lines; the failure mode being designed against is someone adding
a ninth param and forgetting one of the places it has to be listed.

**The empty-state wording is `No products match. Try a different search or clear your filters.`**
Recorded verbatim because `validation.md`'s R11 asks the validator to find "the empty-state message
text the page renders" and a fresh context has no other way to know what it is.

**`/bundles` gets no navigation link anywhere.** Reachable from the shop page's "View all" and by
URL. Adding it to the header is a nav-information-architecture decision this slice was not asked to
make, and the header is already carrying a "Shop" link added by `#496`.

## Deviations from the spec

**R18 named the wrong file, and the requirement was corrected in place.** It said the docstring
lived in `lib/products-service.ts`; the `ProductRepository` interface and that docstring are in
`lib/repositories/products.ts` (`grep -rn "nothing searched yet" lib/` has exactly one hit, there).
A clerical error made while writing the spec, not a scope change. The requirement text now names
the right file and carries a visible correction note, and `validation.md`'s R18 row points at the
real path — left uncorrected it would have failed validation for a reason that had nothing to do
with the code.

**R2 was tightened for the same reason.** It asserted `lib/repositories/products.ts`'s
`searchProducts` is byte-for-byte unchanged, which is true — but the file itself now has a diff
(the R18 docstring), and a validator reading R2 as "this file is unchanged" would flag it. R2 now
says the `searchProducts` **function** is unchanged and that the file's only change is the
interface docstring.

**R7's validation row says the `isFeatured: true` hit should be "in the curated-product fixtures".**
It is not — it is in `seedFeaturedProducts`'s `data: { isFeatured: true }`, per the decision above.
The `grep` the row specifies still returns a hit, so the check passes as written, but the phrase
describing where the hit lives is now wrong. Recorded rather than edited, because the requirement
(R7: the seed marks a non-empty set of curated products featured for each vendor) is satisfied as
written and the implementation choice is the one documented above.

**Nothing else.** R1, R3–R6, R8–R17, R19–R23 are implemented as written.

## Known-shaky areas

**Nothing has been run live. This is the whole risk surface.** No `npm run preview`, no database,
no browser, no `/bundles` ever rendered. The four gate commands all pass locally (`lint` 0,
`typecheck` 0, `format:check` 0, 841 tests across 71 files) and none of them load
`@prisma/client/wasm` or touch Postgres, so they say nothing about whether any of these pages
render. Every route row in `validation.md` is genuinely unverified.

**The featured rows cannot pass without re-seeding first, and the seed must hit the right
database.** `validation.md`'s setup section says this, but it is the single most likely way
validation goes wrong: a validator who runs `npm run preview` against a database seeded before this
slice will find no featured products, `/categories` with no Featured Products row, and
`/search?featured=1` showing the empty state — all looking like this slice is broken when it is
just unseeded. Note also that `seedFeaturedProducts` logs and continues when it matches zero rows
rather than failing; **check the log line says a non-zero count**, not merely that the seed
finished. And confirm the resolved host before seeding — `.env` wins for plain Node scripts while
`.dev.vars` wins under preview, and the two have pointed at different Neon projects before (`#119`).

**The `featured` subset check is the weakest live assertion in the spec.** It compares product
links on `/search?featured=1` against bare `/search` and expects a strict subset. That only holds
because the seeded featured count is deliberately below the page size — if someone later features
more than 12 products, the row starts passing or failing for reasons unrelated to the code.

**`BundleRow`'s header markup changed shape.** The title and subtitle moved inside a nested `<div>`
so a flex row could seat the link opposite them. No visual regression is expected, but this is
markup on the shop page's merchandising slot and nothing in the test suite renders it — worth an
eye on `/categories` rather than only on `/bundles`.

**`/bundles` on an unresolved host renders "No bundles are available right now." rather than
redirecting.** `getBundlesForStorefront()` returns `[]` when the vendor cannot be resolved. The
storefront layout redirects unresolved hosts to `/coming-soon` before this page runs, so it should
be unreachable — but it has not been exercised, and it is the one path that fails soft rather than
loud.

**Both vendors need walking, not just Aheed.** SriMart's branding primitives are real,
live-differentiated values and nothing in `lint`/`typecheck`/`test` checks a second vendor's
rendered output. R12's SriMart title check is what proves the metadata is genuinely vendor-derived
rather than merely relocated; skipping it reduces R12 to "the string moved".

**`prisma/seed.ts` was edited with a Python script**, which `CLAUDE.md` flags as an encoding hazard
on Windows. `git diff --numstat` reported `50 0` — exactly the added lines, no line-ending rewrite —
and `format:check` passes, so this looks clean. Recorded because the cheap signal was checked, not
because anything looked wrong.
