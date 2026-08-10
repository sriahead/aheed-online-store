# P3d — Shop your list (build notes)

Written at the end of Build, before the Clear. Nothing here has been exercised at runtime — see
**Known-shaky areas**.

## What changed and why

**`lib/shopping-list.ts` (new) — all the thinking, none of the I/O.**
Parsing, term normalisation, candidate resolution and ranking live here as pure functions, so the
whole matching brain is unit-testable with no database and no `@prisma/client/wasm` mocking (the
same split as `lib/cart-rules.ts`, `lib/auth-origin.ts`, `lib/delivery.ts`). The repository's job is
reduced to fetching rows.

The quantity rules are three regexes tried in a fixed order — leading `Nx`, then trailing `xN`, then
a leading bare integer. The order matters: `LEADING_COUNT` requires trailing whitespace
(`/^(\d+)\s+/`), which is *how* "glued to a unit" is detected. `5kg` has no space after the digit,
so it is never read as a count; `2 apples` does, so it is. That single `\s+` is the whole of R4 —
worth knowing before someone "simplifies" the regex.

**`ProductRepository.matchListTerms()` — one query for the whole list.**
Takes the distinct terms across every line and issues a single `findMany` with an `OR` of
`name contains`, capped at `CANDIDATE_QUERY_LIMIT` (200). Every per-line decision happens afterwards
in pure code. This is why the method takes *all* the terms rather than one line's: a 100-line paste
must not become 100 queries. It returns a deliberately small `ListCandidate` (id, slug, name,
unitLabel, basePrice, stock) rather than `ProductSummary` — the review screen needs no images,
ratings or speciality flags, and fetching them would add a join per candidate.

**`CartRepository.addItems()` — one cart resolution, one transaction.**
Reduces to one entry per product first (`sumLinesByProduct`), then resolves stock for all of them in
one `stockMap` call, then writes inside a single `$transaction`. Stock is resolved **before**
`ensureCart`, so a list where nothing is addable creates no cart row at all.

The security property is inherited rather than re-implemented: `stockMap`'s `where` is
`{ vendorId: vid, id: { in: ... } }`, so a `productId` from another vendor returns no row → stock 0 →
filtered out. That is the entire defence for R22, and it is why the review form's ids can be
untrusted input. Nothing in `addItems` re-checks vendor ownership, because doing so would imply the
existing scoping is insufficient — it isn't.

**Two server actions, split by whether they write.**
`features/cart/match-list.ts` reads only. `features/cart/add-list-to-cart.ts` is the only path that
issues a guest token, mirroring `add-to-cart.ts`. This split is what preserves P3a's rule that
browsing creates no state: a shopper who pastes a list, reads the review and leaves has no cookie
and no `Cart` row.

**`components/cart/ShopYourList.tsx` — two sibling forms, not one.**
Forms cannot nest, so the match step and the add step are separate `<form>`s, both bound to server
actions so both still submit without client JS. The only client state is which product an ambiguous
line resolved to, needed to keep the "Add N items" count honest as the shopper chooses.

## Decisions taken during the build

- **Positional form fields over indexed names.** The review form emits repeated `productId` and
  `quantity` inputs and the action pairs them by index, rather than `line-3-productId` style names
  needing a parser. Every rendered line emits *both* inputs or *neither*, so the arrays stay
  aligned; an unresolved ambiguous line emits an empty `productId` and is dropped. Rejected indexed
  names as more code for no additional safety.
- **`sumLinesByProduct` went into `lib/cart-rules.ts`, not `lib/shopping-list.ts`.** It is cart
  arithmetic, and the cart repository importing the shopping-list module would invert the
  dependency — list matching should depend on cart rules, not the reverse.
- **`MatchListState` and `EMPTY_MATCH_STATE` live in `lib/shopping-list.ts`.** They started beside
  the action; a `"use server"` module may only export async functions, so a plain `const` export
  there fails `next build`. Caught locally, not in CI.
- **An out-of-stock candidate on an ambiguous line renders as a disabled option** with
  `value=""` rather than being filtered out of the list. The shopper sees that the product exists
  and is unavailable, instead of wondering why the obvious answer isn't offered.
- **The add action redirects to `/cart`.** The spec didn't say where to land; showing the result is
  more useful than re-rendering a now-stale review.
- **`export const dynamic = "force-dynamic"` on the page**, matching `/search` and `/categories`.
  The page itself queries nothing, but the storefront layout resolves the vendor through Prisma, and
  this repo has now been bitten twice by `next build` static-optimizing a Prisma-backed render.

## Deviations from the spec

**One, and it is a spec defect rather than an implementation shortcut.**

R10 specifies ranking as "all-terms matches first, then shorter product name, then name
alphabetically". But R9 defines a candidate *as* a product containing every term — so nothing that
is not an all-terms match ever reaches the ranker, and the first tier can never fire.
`rankCandidates()` therefore implements shorter-name → alphabetical only, with a comment recording
why the third tier is absent.

Every observable behaviour R10 asserts is unchanged and tested: exact-name equality resolves a line
outright, ordering is deterministic under candidate shuffling, and an ambiguous line caps at 5. The
alternative — writing a comparison branch that provably cannot execute — would be dead code
satisfying the letter of a sentence.

## Known-shaky areas

- **Nothing has run against a database.** No `npm run preview`, no browser. `matchListTerms()`,
  `addItems()`, both server actions and the whole UI are unexercised. Prisma's `OR` of `contains`
  with `mode: "insensitive"` is the specific thing to confirm first — if that shape is wrong,
  *every* line reports unmatched and the feature looks broken rather than erroring.
- **R13 (matching writes nothing) is the highest-value check.** It is a negative property, so a
  regression is invisible in the UI: the feature would work perfectly while quietly creating carts
  and cookies for shoppers who never added anything. Verify from a browser profile with site data
  cleared, and check the database, not just `document.cookie`.
- **R22 (tampered `productId`) has never been exercised.** The reasoning is sound and the scoping
  is pre-existing, but "a foreign id yields no row" is an inference from reading `stockMap`, not an
  observation. Test with a real SriMart product id submitted on the Aheed host.
- **Ambiguous-line quantity pairing.** The positional array assumption is the most brittle thing
  here. If a future edit makes a line emit `quantity` without `productId` (or vice versa), every
  subsequent line silently pairs with the wrong quantity. A list mixing all three resolution kinds —
  matched, ambiguous-chosen, ambiguous-skipped, unmatched — in one submission is the test that
  catches it.
- **Term matching is substring, not word-boundary.** `terms: ["oil"]` matches *Sunflower Oil 2L*
  correctly, but a short term is a substring of unrelated names in a larger catalogue. Harmless at
  16 seeded products; worth remembering as the catalogue grows.
- **The 100-line and 200-candidate caps are untested against a real paste** of that size. They are
  simple `slice`/`take` bounds, but nobody has pasted 100 lines.
