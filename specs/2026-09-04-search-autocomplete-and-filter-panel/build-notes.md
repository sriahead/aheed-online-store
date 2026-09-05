# P2.6 slice 5 — search autocomplete and filter panel with chips and drill-down (build notes)

Written at the end of Build, before the Clear. Spec commit `5ea8bcf`, implementation commit
`9be1a2c`.

Local gate state at the end of Build: `lint`, `typecheck`, `format:check` and `npx vitest run` all
green, the suite at **94 files / 1126 tests** (up from 89/1076; five new files, fifty new tests).
`prisma/schema.prisma` is unchanged and no migration was generated — verified, not assumed.

## What changed and why

**The framing worth carrying into validation:** slices 1–4 all changed what search *returns* for a
given query. This slice changes how a shopper **steers** it. Nothing in `searchProducts`'s matching,
ranking or zero-result ladder was touched, and a reviewer who finds those behaving differently has
found a regression, not a feature.

**`components/product/FilterPanel.tsx` (new).** Renders `ProductFilterForm` twice — a native
`details` disclosure carrying `md:hidden`, and the pre-existing sidebar carrying `hidden md:block`.
Two instances because CSS cannot move one DOM node between two containers; exactly one is ever
visible. This is safe specifically because `ProductFilterForm` uses no `id` attributes and labels by
wrapping its inputs, so nothing duplicated can confuse the accessibility tree or a `form=`
reference. It is a Server Component with no client JavaScript at all.

**`components/product/filter-chips.ts` + `FilterChips.tsx` (new).** The URL already *is* the filter
state, so a chip is an anchor to the same URL minus one parameter and nothing needs to know what is
currently rendered. Pure logic separated from rendering for the reason `search-href.ts` beside it
already is: what actually goes wrong here is a *dropped* parameter, and a chip looks identical
whether its href preserves the other filters or silently discards them — the failure only appears
one click later.

**`lib/repositories/products.ts`.** `ProductFilters` gains `categoryIds`; `buildFilterWhere` emits
`categoryId: { in: [...] }` for a non-empty array and *nothing* for an absent or empty one. That
asymmetry is load-bearing: an unknown slug resolves to no ids, and treating empty as a predicate
would match zero rows — silently emptying the catalogue instead of showing unfiltered results.

`listProductsByCategory`'s explicit `categoryId` moved to **after** the `buildFilterWhere` spread.
Before this slice the order was irrelevant because the helper could not emit that key; now whichever
spreads last wins, and if the filter won, a `?category=` URL parameter would override the category
the route is displaying — a URL parameter replacing a page's own subject. Nothing about the composed
object makes this visible on read, which is why there is a test rather than a comment alone.

`getAvailableSpecialities` takes a `SpecialityContext`. **Each probe excludes all three speciality
flags, not merely its own** — the facet-counting trap: probing against the full filter state would
make ticking "Halal" hide "Organic" when nothing is both, and worse, an active facet could hide the
checkbox needed to untick it, stranding a shopper inside a filter they can neither see nor remove.
`SpecialityContext` deliberately has no speciality fields, so this is enforced by the *type* rather
than by a runtime `delete` a future caller could bypass.

`directSearchPredicate` was renamed `buildDirectSearchWhere` and exported, so the facet probe and the
search itself compose the identical term predicate. A second hand-written copy would drift the moment
either changed, and the failure would be silent — the toggle offered simply stops corresponding to
the result set it describes.

**`app/api/search/suggest/route.ts` (new).** Deliberately not the search pipeline: no ladder, no
200-candidate window, no tier pricing, and no `SearchQueryLog` write. The log omission is not a
performance choice — a row per keystroke would flood the exact table `#566`'s synonym proposals read
to decide which queries recur, so autocomplete would silently corrupt a neighbouring feature's input.

**`components/layout/SearchSuggest.tsx` (new).** A client island inside the header's *unchanged*
`form method="GET" action="/search"`. With JavaScript off it renders as a plain input and Enter
still navigates to `/search?q=…`.

**`#512`.** The Apply button's `bg-[#2E7D32]`/`hover:bg-[#1b5e20]` becomes `bg-action`/
`hover:bg-action-hover`. Two defects, only one cosmetic: the literal bypassed `brandStyle()`'s
per-vendor override, so **SriMart rendered Aheed's green on that button**, and the hover literal was
not even the token's own shade (`--color-action-hover` is `#276a2b`, the value P7 closeout darkened
for WCAG AA) — so hovering reverted an audited contrast fix.

## Decisions taken during the build

**The route calls the service facades, not the repositories directly.** `eslint.config.mjs` restricts
`@/lib/db` in the app layer (ADR-004 slice 2) and my first version violated it by resolving
`getPrisma()` in the route. The lint error was correct and the fix is the right layering:
`getProductRepository()` / `getCategoryRepository()`. `getCurrentVendorIdOrNull()` stays in the route
because the facades' own `getCurrentVendorId()` throws, and R23 requires an unmapped host to produce
an empty 200 rather than a 5xx. **Cost of this shape, worth knowing at validation:** the vendor is
resolved twice per suggest request (once by the guard, once inside each facade), and `lib/tenant.ts`
deliberately omits React `cache()`. On a per-keystroke path that is the most likely place to find
surplus query load.

**`suggestCategories` ORs across terms while `suggestProducts` ANDs.** A category name is one or two
words, so requiring every term of "basmati rice" to appear in it would offer no category at all where
"Rice" is exactly the useful answer. Products stay `AND` because there the extra terms are how a
shopper narrows to one item.

**`SUGGEST_CANDIDATE_LIMIT` lives in the route and is passed down**, rather than being a repository
constant. The bound belongs where the exposure is, so anyone reading the public endpoint can see
what a request costs without following it into the data layer. R27 requires exactly this.

**Suggestions are derived, not stored.** My first version cleared the suggestion state from inside
the effect when the query got too short; `react-hooks/set-state-in-effect` rejected it, correctly. I
removed the state rather than adjusting the dependency array — which is the fix CLAUDE.md's cart-
drawer lesson actually points at. Whether suggestions apply is a function of what is in the box.

**Chips are ordered `category` first, then flags, then price**, and the effect ordering was chosen so
the most structural filter reads first. Nothing depends on it.

**A price parameter that applies no filter renders no chip.** `?minPrice=abc` reaches the page and
narrows nothing (`parsePriceInput` returns undefined for blank, non-numeric or negative input); a
chip there would claim a filter whose effect the shopper cannot see and whose removal changes
nothing.

**`q` is not a chip and clear-all preserves it** — settled at `/spec`, restated because it is the
decision most likely to be second-guessed on sight.

## Deviations from the spec

**One addition the requirements do not name: a hidden `category` passthrough in
`ProductFilterForm`.** The form is a plain GET form, so submitting it replaces the entire query
string with only the fields it contains. Category is chosen from a link beside the results, not from
a control inside the form, so without this field pressing Apply would silently drop the category and
widen the shopper back to the whole catalogue — precisely the failure `#501` fixed for `featured`.
R13 and R14 cannot hold without it. Recorded here rather than shipped silently, and it is a
correctness prerequisite for existing requirements rather than new scope.

**`directSearchPredicate` renamed to `buildDirectSearchWhere`.** R20 names the exported function, and
the pre-existing private function had a different name. Renaming (three call sites) rather than
exporting under the old name keeps it paired with `buildFilterWhere`, which is what a reader will
expect once both are exported.

**Two tests were rewritten after failing against my own docstrings.** `tests/filter-panel.test.tsx`
originally asserted `not.toContain('"use client"')`, which the file's own comment explaining why it
has no such directive fails. They now match the *mechanism* — a directive only as the file's first
statement, `usePathname` only as a real import, `aria-modal` only as a JSX attribute, hooks only as
call expressions. This is a better test, but note the class of mistake: a source-text assertion can
be defeated by prose about the thing it forbids.

Everything else follows `requirements.md` as written.

**Filed rather than absorbed**, both found during this Build and both on the delivery board at
Phase `P2.5`:

- **`#595`** — the suggest route resolves the vendor twice per request (see the first decision
  above). A measurement question on a new hot path, not a correctness one.
- **`#596`** — `kms/site-internal/next-env.d.ts` churns between `next dev` and `next build`, so
  running the documented MDX-trap check dirties the tree and makes the documented `sdd:preclear`
  check fail. Two documented steps that disagree with each other; unrelated to this slice's scope.

## Known-shaky areas

**R30 (per-host cache isolation) is the highest-risk row in the slice and cannot be checked
locally.** The suggest response is `Cache-Control: public, max-age=60` and vendor-scoped. Nothing
keeps one vendor's suggestions out of another's response except Cloudflare's cache key including the
hostname — which is true *by default* and is exactly the class of assumption this repo has been
burned by. Local preview has no edge in front of it, so this must be checked on a **deployed**
environment against both `staging.aheedfoodcentre.nocaped.com` and `srimart-staging.nocaped.com`,
including a second request that returns `cf-cache-status: HIT`. If it were wrong, it would be a
cross-tenant data leak, not a cosmetic bug.

**The whole slice has never run against a real database.** Every repository test uses a spy client,
deliberately (the requirements are about what a composed `where` contains, and for R24 about a query
that must *not* happen — a live result set that looks plausible is consistent with a filter having
been dropped). But that means R13, R14, R15 and R21 have only ever been proven as predicate shapes.
The category relation and the facet probes have not been exercised against real Postgres, and this
repo has a documented history of that gap mattering (`#566`'s identity rung had the same exposure).

**The double vendor resolution per suggest request** described above. Worth measuring rather than
assuming, given the endpoint's request rate.

**Facet cost on `/search`.** The page now issues an extra `synonymAliasMap()` read to build the term
groups the facet probe needs, plus three context-narrowed `findFirst` probes whose `where` is heavier
than the previous vendor-wide one. Against `docs/developer-portal/nfr-baseline.md`'s target this
should be comfortable, but it is a change to a hot path that no test measures.

**`FilterPanel` renders two forms.** I reasoned this is safe because the form uses no `id`
attributes — that reasoning is only as good as it stays. Anything that later adds an `id`, an
`aria-describedby`, or a `form=` reference to `ProductFilterForm` breaks it in both instances at
once, and jsdom tests will not notice duplicate ids.

**The `details` disclosure has been validated in jsdom, not a browser.** jsdom implements `details`
open/close semantics only partially, so the no-JS mobile path (R5) genuinely needs a real browser at
a 375px viewport — or, failing that, the curl fallback the validation row names, with a record of
which one was actually run.

**Suggestion staleness between keystrokes.** Going from a longer query to a shorter-but-still-valid
one leaves the previous results rendered for up to one debounce interval. This is a normal debounce
artifact and I judged it acceptable rather than clearing on fetch start (which would reintroduce the
setState-in-effect problem), but it is visible behaviour a validator may reasonably question.

## Fix (post-Validate)

**R15 failed at `/validate` against a real `npm run preview`, and it is exactly the gap the
"never run against a real database" note above predicted.** `/search?category=<unknown-slug>`
correctly applied no predicate (product count matched unfiltered `/search`), but still rendered a
removable chip labelled with the raw, unresolved slug — `aria-label="Remove filter:
definitely-not-a-real-slug"`. `app/(storefront)/search/page.tsx`'s own comment above
`selectedCategory` said "An unknown or inactive slug resolves to `null` and is then IGNORED
entirely: no predicate, no chip" — the predicate half was true (`categoryIds` is correctly
`undefined` when `selectedCategory` is `null`), the chip half was not: `<FilterChips>` was handed
the raw `params` object, whose `category` key is the unvalidated query string, not the resolution
result. `activeFilterChips` (`components/product/filter-chips.ts`) has no way to know a value
didn't resolve — it only checks truthiness — so it isn't the pure function that needed fixing.

**Root cause, and why it's a one-line correction rather than a redesign:** the page had two
category-shaped values in scope — `params.category` (raw, always present when the query string has
one) and `selectedCategory` (resolved, `null` when the slug doesn't exist) — and used the resolved
one everywhere except the one call site that renders the chip row. The fix conditions the `category`
key handed to `<FilterChips>` on `selectedCategory` the same way `categoryIds` already is:

```
params={{ ...params, category: selectedCategory ? params.category : undefined }}
```

No change to `filter-chips.ts`, `FilterChips.tsx`, or any other requirement's behaviour — confirmed
live post-fix: the chip for an unknown slug is gone (`grep -c "Remove filter"` → `0`), a *valid*
category (`fruit-veg`) still renders its chip correctly (R17), and R2/R9/R10/R13/R14/R16/R21 were
all re-checked live against the same `npm run preview` session with no change in behaviour.

**Left alone, deliberately:** the hidden `category` passthrough in `ProductFilterForm` and the
pagination "Next page" href both still carry the raw, unresolved slug forward verbatim. Both are
correct as-is — neither renders a user-facing filter claim, they only preserve current URL state
across a same-page action (Apply, Next), and the slug they carry continues to resolve to no
predicate on the next request regardless of whether it's real.
