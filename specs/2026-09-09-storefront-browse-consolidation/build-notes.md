# Storefront browse consolidation (build notes)

Written at the end of Build, before the Clear. The validating context is fresh and has only the
spec, the artifact and this file.

## What changed and why

**The defect was a split, not a duplicate.** It looks like "delete the redundant chip row", but the
chip row (`CategoryDrillDown`) was the *only* category control on `/search`; the panel beside it
carried `category` as a hidden passthrough field precisely because nothing visible owned it, which
`#568`'s own comment says in as many words. So the two had to move together: delete the chip row
without first giving the panel a real control and every category filter is stranded on the next
`Apply`.

- `lib/repositories/categories.ts` — new `listCategoryTreeForStorefront`, returning both tiers in
  one read, plus the `StorefrontCategoryNode` type. It carries `isActive` even though every row it
  returns is active, because that is what makes the type structurally satisfy `CategoryOption` and
  therefore reusable by `toCategoryOptionGroups` without a second grouping function.
- `lib/categories-service.ts` — exposed as `listTree()` on the request-scoped factory.
- `lib/catalogue-form.ts` — `toCategoryOptionGroups` is now generic (`<T extends CategoryOption>`),
  with `CategoryOptionGroupOf<T>` added and `CategoryOptionGroup` kept as an alias so the four
  admin call sites are untouched. Without the type parameter the storefront loses `slug` on the way
  through, and `slug` is the select's value.
- `components/product/ProductFilterForm.tsx` — the grouped `select`, and the hidden `category`
  input deleted. `featured`'s hidden input is deliberately untouched.
- `components/product/CollectionNav.tsx` — new, shared by `/search` and `/bundles`.
- `components/product/CategoryDrillDown.tsx` — deleted. One call site, no test file.
- `app/(storefront)/search/page.tsx` — `listTree()` **replaces** `listTopLevel()`; the department
  strip takes the `parentId === null` rows of that same result, so the page's category query count
  is 3 before and 3 after. Browse mode gained a "Newest first" sub-heading.
- `app/(storefront)/bundles/page.tsx` — department strip and collection nav, no filter form.
- `specs/design-system.md` (1.12.0 → 1.13.0) — the standing rule this slice established: a
  disclosure's two branches may duplicate a form with no `id`s, but never a landmark.
- `CLAUDE.md` — vitest baseline 115/1516 → **115/1520**.

## Decisions taken during the build

**The tree read replaces the top-level read rather than joining it.** The spec required the query
count not to increase; the simplest way to satisfy that was to make the wider read the only read
and derive departments in JavaScript. `getBySlug` is still called separately — it resolves the
selected category's `parent`/`children` for the chip label, and collapsing it into the tree read
was possible but out of scope and would have touched `#568`'s resolution logic.

**Ordering is `(sortOrder, name)`, not `(sortOrder)` alone.** `listTopLevelCategories` orders by
`sortOrder` only. Extending that to the full tree without a tiebreak would let two categories
sharing a `sortOrder` render in whatever order the planner returned, which is a flaky rendered
output. The tiebreak is new here and does not change the existing function.

**Grouping stays in `toCategoryOptionGroups`, not in SQL.** Doing it in the query would have moved
the one rule worth unit-testing (orphan promotion) into a shape that needs a database to assert.

**`CollectionNav`'s active state is computed from `featured`, not from the path.** There is no
`proxy.ts` available on this stack to annotate the request with a pathname (`CLAUDE.md`), and the
page already knows its own params, so the page passes `activeHref` explicitly — the same
prop-down-from-the-route pattern `isPortal` uses.

**New Arrivals and All products both link to `/search` and that is intentional**, not a
copy-paste slip. They are the same query; see `plan.md`. A validator seeing two identical hrefs
should not "fix" one.

## Deviations from the spec

**None in the artifact.** Every requirement R1-R20 is built as written.

**Four `validation.md` rows were corrected during Build**, because their literal checks did not
hold against real rendered output. The requirements themselves are unchanged; only the way they
are verified moved. Each correction is recorded inline in `validation.md` with its reason:

- **R7** and **R8** grepped a bare substring (`CategoryDrillDown`, `listTopLevel()`) and matched
  **this slice's own explanatory comments** rather than code. Both are now anchored to an import,
  a JSX element or a call expression. The comments were kept: they explain why the thing is gone,
  which is worth more than the convenience of a substring check.
- **R10a** counted the four collection labels expecting exactly `1` each. That can never hold —
  Next embeds an RSC hydration payload carrying the same strings, so on a correct page they appear
  3-5 times (`All products` is also the `h1`). It now counts the `aria-label="Collections"`
  landmark, which is what the requirement is actually about, and which measured exactly `1`.
- **R15** expected the bogus slug to be absent from the body. It is legitimately present on a
  correctly-working page: in the "Next page" href (`CARRIED` passes it through, applying nothing),
  in the RSC payload, and as the `select`'s `defaultValue`. It now asserts that no **chip**
  renders, with a real-category page as the control proving the check can tell the two apart.

## Known-shaky areas

**The `select`'s behaviour when `category` names a real but INACTIVE category.** The tree read
filters `isActive: true`, so an inactive category is not an option, while `getBySlug` may still
resolve it. The rendered result is a select falling back to "All categories" while the page may
still apply a predicate. Every seeded category is active, so this was not reachable live. Look
here first if a filter appears applied but the control shows "All categories".

**Two-level assumption.** The grouping promotes an orphan child to its own group, which is right
for a two-tier tree. If `Category` ever grows a third tier, the select silently flattens it. The
schema caps it at two today and `parseStaffProductsQuery` relies on the same cap.

**`/categories/[slug]` was deliberately not given the control**, so the two browse pages now have
visibly different sidebars. That is intended (there the category is the route, and a `GET` form
cannot navigate to a different path), but it is the thing most likely to read as an oversight in
review. It is also why `buildHref`'s hand-written chain in that page was not touched, and why
`#601` stayed out of scope.

**Nothing exercised a vendor with zero categories.** `categoryGroups.length > 0` guards the
control, so the expected result is no category control at all rather than an empty select — but
both seeded vendors have categories, so the guard is untested against real data.

**The pagination href still carries an unresolvable `category` value forward.** Pre-existing
`#568` behaviour via `CARRIED`, unchanged here, and harmless (it applies no predicate). Noted
because R15's live output shows it and it can read as a leak.
