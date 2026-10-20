# Favourites, and a bare + on the product card (build notes)

Slice 1 of the Quick Shop programme. `#232` (Favourites, authenticated-only) and `#1185` (the
product card's add control). Built 2026-10-20 on `feature/p232-1185-favourites-card-controls`.

**Read "Known-shaky areas" first.** One requirement (R7) could not be exercised at all, because the
migration this slice adds has not been applied to any database yet.

## What changed and why

**The data layer is four files, split by what each one is allowed to know.**

- `prisma/schema.prisma` — the `Favourite` model, shaped on `Review` (`:1024`), which was already
  the precedent for a vendor-scoped row keyed by user *and* product and already carried the
  composite unique this needs. Cascade on all three relations, unlike `Review`, whose product and
  vendor relations restrict: deleting a product that carries published reviews should not silently
  discard them, whereas a favourite without its product is meaningless. Products are not
  hard-deleted by the app today, so that is a correctness guarantee rather than a hot path.
- `lib/repositories/favourites.ts` — pure functions taking client, `vendorId` and `userId`
  explicitly. **The unique constraint is the concurrency control, not just an integrity rule:** two
  taps racing both reach the `create`, and the loser's duplicate-key error is swallowed as success
  because the product ends up favourited either way. That is what makes the toggle idempotent, and
  `removeFavourite` uses `deleteMany` for the same idempotence from the other side.
- `lib/favourites-service.ts` — the per-call facade, constructed fresh, never cached.
- `lib/favourites-summary.ts` — the per-request `cache()` memo, kept separate from the facade for
  the reason `cart-summary` is separate from `cart-service`: the facade must stay constructible
  fresh per call, and `cache()` in it would defeat that.

**Nothing uses `getPrismaWs()`, and that is a decision rather than an omission.** CLAUDE.md's rule
is "does this open an implicit transaction", not "which method is named". A singular `create` with
no nested writes, a `deleteMany` and the reads are all safe on the HTTP client; nothing here is
interactive. All three modules say so in prose, so a later reader does not "fix" it and spend an
isolate's socket budget for nothing.

**`listProductsByIds` was added to `lib/repositories/products.ts` rather than a `select` written
inside the favourites repository.** That file owns what a product summary *is* — the
`productSummarySelect` shape, the `toProductSummary` mapping, and the one-query-per-page
`listActiveTiersForProducts` follow-up that puts the multi-buy tier on a card. A hand-rolled join in
favourites would have dropped that tier lookup, so a favourited product would have rendered
differently from the same product on `/categories`, with the "3 for GBP 10" badge the first thing to
go missing. Order is the caller's, because Postgres promises nothing about an `IN` result's order
and "favourited newest first" is not something `products.ts` knows about.

**The card's favourite state is one prop, not two.** `favouriteState: "on" | "off" | "signed-out"`.
An `isFavourite`/`canFavourite` pair would admit a fourth, meaningless combination — favourited but
signed out — that every reader of the component would then have to interpret. The memo hands out a
*resolver function* rather than a `Set` for the same reason: a caller given a set has to re-derive
"no user means signed-out, not simply empty", and getting that wrong would look fine while offering
guests a toggle that cannot work.

**`FavouriteButton` owns its own absolute placement**, which is why its class list looks odd. The
card's top-right 44px box is already the below-`sm` quick-view button
(`ProductCard.tsx:191`), and the top-left holds the Halal/Fresh/Offer badges (`:103`). So the heart
is `right-tap sm:right-0` — one 44px box inboard below `sm`, the corner itself from `sm` up where
that button is `sm:hidden`. **Changing one half without the other overlaps two 44px hit areas on a
phone and is invisible in a desktop browser**, which is why `tests/favourite-heart.test.tsx` asserts
both halves and the absence of an unprefixed `right-0`.

**A guest gets a link, not a disabled button.** "Sign in to do this" is a navigation, so it is an
`<a href="/login">` a shopper can middle-click and a screen reader announces as a link. Same split
`/shop-your-list` already makes with its `canSave` prop.

**`AddToCartButton`'s `card` variant is now a single `+`** — the `sm:`-and-up pre-add picker and the
"Add" text both gone. The three other variants are untouched. `label` remains the accessible name
and is now the *only* name the control has, so dropping it would recreate `#956`'s "every card's
button is named Add" defect in a worse form: an unnamed icon button.

## Decisions taken during the build

- **The migration is hand-authored.** `prisma migrate dev --create-only` **cannot run** here: it
  refuses with "`20260820200500_p8_image_needs_review` was modified after it was applied" and offers
  only `migrate reset`, which drops every row in the dev database. That is the open `#895`,
  reproduced rather than worked around. The SQL matches what Prisma emits for this model — same
  statement order, comment markers, quoting and constraint names as
  `20260918053538_p116_saved_shopping_lists`, whose `ShoppingList` has the same vendor/user shape.
  The header comment records all of this.
- **Reused `isUniqueViolation` instead of writing a predicate.** The spec's drafted R6 called for a
  new pure predicate in `lib/favourites.ts`. `lib/repositories/prisma-errors.ts` already had one,
  already accepting both `"23505"` and `P2002`, already covered by `tests/prisma-errors.test.ts`.
  Its own docstring records that a second copy of those literals is how two call sites drift, so
  adding one would have been the defect the spec was trying to prevent. R6 was rewritten to require
  reuse and forbid a second copy.
- **`revalidatePath("/account/favourites")`, not `revalidatePath("/", "layout")`.** The cart
  revalidates the layout because the header's badge must follow a write. No chrome shows a favourite
  count, so the only server-rendered surface that can go stale is the listing page, and the card
  updates itself optimistically. Revalidating the layout on every heart tap would re-render every
  storefront page for no visible gain.
- **A signed-out toggle returns an outcome; it does not throw.** A throw would reach the route error
  boundary and replace the page the shopper was reading. Since the UI renders a `/login` link for a
  guest, this branch is defence in depth — what a hand-made POST meets — which is exactly why it has
  a test, as nothing in the UI exercises it.
- **`/account/favourites` is `wide`, not `standard` like its sibling account pages.** It renders a
  product grid through `ProductGrid`, so it belongs with `/categories`, `/search` and `/bundles`. A
  `standard` 1024px column would drop the grid a column against every other place the same cards
  appear. Recorded with that reasoning in `tests/page-container.test.ts`'s registry.
- **Two stale tests in `tests/add-to-cart-feedback.test.tsx` were rewritten, not deleted.** Both
  asserted the removed pre-add picker. Each was rewritten to assert what it was actually protecting:
  that a non-added outcome still reaches the shared `CartFeedback` region (the card's only channel,
  because the revalidation unmounts the button), and that the single control is still named for the
  product. Their comments say what changed and why, so a later reader does not "restore" the picker.
- **The optimistic heart reverts to the server's last state on failure**, and treats a `signed-out`
  result as a failure — a session can expire between render and tap, and leaving a filled heart
  would assert a row that does not exist.

## Deviations from the spec

Four requirements were corrected *during* Build and committed with the implementation. Each is
recorded inline in `requirements.md` with its reason, so validation checks the corrected text.

- **R2, R5, R6, R16b all originally used an absence-grep over an artifact that names the excluded
  thing in prose.** This is the trap `specs/sdd-workflow.md` records from P4a and `#539`: good code
  and good docs name what they deliberately exclude, so the only way to "pass" is to delete the
  rationale. The migration header names all three `pg_trgm` indexes to say what must not happen to
  them; all three favourites modules name `getPrismaWs` to record why it is absent; the repository
  docstring names both error codes to explain why the shared predicate is used; and the corrected
  `design-system.md` bullet names the pre-add picker in the past tense because the history is the
  useful part. **Fixed by scoping each check to code lines** (`grep -vE '^[[:space:]]*[*/]'`, a
  character class rather than alternation so no pipe is needed in a markdown table cell) **or by
  making it an explicit read-and-judge step** (R16b). All four now pass.
- **R2 also originally asserted the wrong thing entirely** — that the three `pg_trgm` indexes still
  exist in the database. `#765` records them already absent from dev, staging *and* production, so
  it would have failed for a cause this slice did not create. It is now a property of the generated
  SQL.
- **R6 reversed direction**, from "write a predicate" to "reuse the existing one and write no
  second copy", for the reason under Decisions.
- **R16a named the wrong file** for the `data-tap-surface` hook (`ProductCard.tsx`). The control is
  its own component and owns its placement, so the hook belongs in `FavouriteButton.tsx`, which is
  also the file `tests/tap-targets.test.ts` reads.

Four validation *commands* were also fixed, which is not a scope change but would have produced
false passes: three greps used `\|` alternation under `grep -E` (which matches a literal pipe, so
they would have found nothing and read as green), and R8 used a `(?!...)` lookahead that POSIX ERE
does not support. R8 is now two comparable counts.

One citation was corrected: **`#232`'s body attributes its obligation to P6.6's R1. It is R6**
(`specs/2026-08-13-p6.6-p0-ui-overhaul/requirements.md`); R1 is the header logo. The wrong number
had not reached any other artifact, and this slice does not propagate it.

## Known-shaky areas

- **R7 IS COMPLETELY UNVERIFIED, and it is the only real evidence behind the duplicate-key guard.**
  `scripts/verify-favourites.ts` cannot run until the migration applies — it currently fails with
  `relation "public.Favourite" does not exist` (Prisma `P2021`). `prisma migrate deploy` is blocked
  in this environment even against dev, so it was handed to the owner and **had not been run when
  these notes were written** (`prisma migrate status` still lists `20261020150000_p232_favourite` as
  pending). Validation must apply the migration and then run that script, and **a run reporting the
  duplicate case as skipped is a FAIL, not a pass**. CLAUDE.md is explicit that a hand-built double
  only reproduces its author's guess about which `.code` the adapter reports, so no unit test
  substitutes for this. Start here.
- **The whole feature has never touched a database.** Every passing check is a type check, a unit
  test over rendered DOM, a build, or a grep. Nothing has written a `Favourite` row. The toggle, the
  listing query, the ordering, the `cache()` memo and the `listProductsByIds` drop-inactive
  behaviour are all unexercised against real data.
- **The second-vendor check (R24) has not been done**, and this is the third consecutive slice where
  local fixtures were the obstacle. `npx tsx scripts/demo-accounts.ts add` in a clean shell, then
  drive SriMart with `--map-host`; a CDP `Host` header is ignored by Chrome and yields a false pass.
  The heart uses `text-action` when filled, which is a per-vendor brand colour — Aheed's and
  SriMart's differ, and `brandStyle()` injects competing inline custom properties, so this is
  exactly the class of thing that false-positives against Aheed alone.
- **The `right-tap` placement is asserted by class name, not by geometry.** The built CSS does
  contain `.right-tap{right:var(--spacing-tap)}`, so the utility exists, but no measurement has
  confirmed the heart and the quick-view eye actually clear each other at 360px. R11's browser half
  and R16's `--measure` half both remain to be run.
- **`listProductsByIds` silently drops ids that match nothing** (inactive, or in a hidden
  department). That is deliberate — a delisted favourite stops appearing rather than rendering as a
  gap — but it means **the empty state is reachable with rows still in the table**, which will read
  as data loss to anyone who does not know. Worth a look during validation, and the related
  reconciliation gap is the open `#1139`.
- **The optimistic revert path has no test.** `tests/favourite-toggle-guard.test.ts` covers the
  action's guard, and the heart's three render states are covered, but the branch where
  `toggleFavourite` rejects or returns `signed-out` and the control reverts is only reasoned about.
- **`#983` is a known pre-existing flake** in the add-to-cart feedback area, which this slice edits.
  If it appears, it is not new. Separately, if 2 to 10 tests fail across unrelated files at 5 to 9
  seconds each and the failing set moves between runs, that is the loaded-machine artefact in
  CLAUDE.md — use `--maxWorkers=4` and do not bisect against it.

## Validation pass 1 — FAILED (2026-10-20)

**Not independent, and on the wrong model.** The same Opus 5 context that built the slice also
validated it; the owner invoked `/validate` without the pre-validation Clear or the switch to
Sonnet 5, and this was flagged before the walk began. Treat the judgment calls below as
self-reviewed. The measurements are instrument output and stand on their own.

The migration was applied to dev by the owner during this pass
(`20261020150000_p232_favourite`), which unblocked every row the build notes listed as unverified.

**27 of 29 rows pass.** Pre-flight green: `lint`, `format:check`, `tsc --noEmit`,
289 files / 3611 tests, `build`.

### Finding 1 — R7 verifies the wrong database adapter (CONFIRMED)

`scripts/verify-favourites.ts` exits 0 with all checks passing, and reports the duplicate-key code
as `P2002`. **But it constructs `PrismaNeon` — the WebSocket adapter — while
`lib/repositories/favourites.ts` runs on `getPrisma()`, which is `PrismaNeonHttp` (`lib/db.ts:12`).**
Measured on dev, same duplicate insert, both adapters:

- `PrismaNeon` (WebSocket, what the script uses): `.code = "P2002"`
- `PrismaNeonHttp` (HTTP, what the shipped path uses): `.code = "23505"`

So the code the shipped path actually raises was never observed by the script. R7 exists precisely
to satisfy CLAUDE.md's rule that an `error.code` guard must be "verified against a real failing
request — a hand-built double only reproduces its author's guess"; substituting a different adapter
is a subtler form of the same error, and it reported `ALL CHECKS PASSED` while doing it.

**The feature is not broken:** `isUniqueViolation` accepts both codes, so a racing double-tap is
handled correctly on the real path. What failed is the evidence. Fix: have the script exercise
`PrismaNeonHttp`, and preferably both adapters, since the predicate must accept both and only the
HTTP one ships.

### Finding 2 — R11's non-overlap property is false by 2px (CONFIRMED)

Measured by `scripts/verify-mobile-layout.ts` at a real 360px viewport (`gridColumns: 2`):

| control | left | width | right edge |
|---|---|---|---|
| `[data-tap-surface="product-card-favourite"]` | 87 | 46 | 133 |
| `[aria-label^="Quick view"]` | 131 | 46 | 177 |

They overlap on x 131-133. **Cause:** both controls are direct children of the image block and are
NOT inside `.skew-card-inner`, so the card's skew widens each bounding box to **46px**, while the
inboard offset is `right-tap` = **44px**. The quick-view button was already 46px before this slice;
what is new is placing a second 46px box exactly 44px inboard of it.

**Impact is small but the requirement's stated property is false.** The heart is later in DOM order
at equal `z-index`, so it wins the 2px strip; the eye keeps 44 of its 46px, so no tap-target rule is
broken and neither control becomes unreachable. A tap on the eye's leftmost 2px favourites instead.
Fix: offset below `sm` by at least the rendered width (`right-12` = 48px leaves 2px of gap), or
counter-skew the control.

### Rows confirmed, with how

- **R1-R6, R8** — `prisma validate`; comment-stripped migration SQL (6 statements, no `DROP`, no
  trgm index named); purity and client-injection tests; no `getPrismaWs` or duplicated error-code
  literal in code; `"use server"` with 1 export, 1 async.
- **R9 (both halves)** — the guard test, plus a **live cookieless replay** of the real captured
  server-action POST: HTTP 200 with `{"kind":"signed-out"}`, no 500, and the favourite count stayed
  at 1 (the signed-in click's row) rather than 2, so nothing was written.
- **R10, R13-R15, R21** — unit tests, and then confirmed in **rendered HTML**: a signed-out listing
  page carried 12 `<a href="/login">` hearts; the same page signed in carried 12
  `<button aria-pressed="false">` hearts and zero login links; 11 add controls (one product out of
  stock); and **zero** `Decrease/Increase quantity` controls anywhere.
- **R11 (class half), R16** — `right-tap sm:right-0` present with no unprefixed `right-0`; computed
  `right: 0px` at 1280. At 360px the add control measures 44x44 and every one of the 12 hearts
  46x44, both at or above 44 in each dimension.
- **R12** — the resolver is awaited once per page in all three callers and called per card.
- **R17, R18** — signed out, `/account/favourites` returns **307 to `/login`**. Signed in with no
  favourites it renders the exact empty sentence inside
  `<main class="mx-auto w-full px-4 max-w-7xl py-8">`, confirming `PageContainer width="wide"`.
- **R19** — exactly one `/account` tile linking to `/account/favourites`.
- **R20** — full round trip in a browser: heart off, clicked, `aria-pressed` false to true and the
  icon filled; `/account/favourites` then showed that product and no empty state; clicked again and
  the page returned to 0 cards and the empty state.
- **R22, R23, R25, R26, R27** — P6.6 R6 read and correct; the only vendor-name hit in a new file is
  the comment explaining the vendor-neutral rule, which that row says to read rather than fail;
  `kms:validate` 0 invalid and `kms:check-generated` current; CHANGELOG cites both issues.
- **R24** — SriMart via `srimart.localhost:8787`: 6 hearts, 6 add controls, 0 pre-add pickers, and
  the label named an electronics product ("65W GaN Wall Charger"), so no grocery example leaked.
  The brand colours genuinely differ — `--color-action` is `#108020` on Aheed and `#006fc4` on
  SriMart, both injected by `brandStyle()` — so the filled heart's `text-action` was exercised
  against two real values rather than false-positiving against Aheed alone.

### Two risks checked that were NOT defects

- **The hover overlay does not steal the heart's clicks.** At `sm` and up the overlay is
  `absolute inset-0 z-20` and becomes `pointer-events-auto` on hover, and the heart is also `z-20`.
  Forcing the overlay to `opacity: 1; pointer-events: auto` and hit-testing the heart's centre
  returned an element inside the heart, not the overlay — the heart is later in DOM order, so it
  wins. (CSS `:hover` cannot be driven by synthetic events, so the state was reproduced directly.)
- **Deploy ordering is safe.** `deploy-staging.yml` runs `prisma migrate deploy` (line 63) before
  `wrangler deploy` (line 73), so no deployed Worker serves against a table its migration has not
  created. All three listing pages are `force-dynamic`, so revalidating only
  `/account/favourites` cannot leave a card's favourite state stale.

### Environment notes for the next pass

- Browser screenshots timed out repeatedly and `resize_window` did not change the renderer's
  viewport (`innerWidth` stuck at 1280 while `outerWidth` became 262). Geometry was therefore taken
  with `scripts/verify-mobile-layout.ts`, which drives its own Chrome with real device metrics —
  the better instrument for this anyway. Pass `MSYS_NO_PATHCONV=1` or Git Bash rewrites `--path`
  into a Windows path (the script detects this and says so).
- **The dev demo accounts' passwords are not `DEMO_ACCOUNT_PASSWORD`**, and
  `scripts/demo-accounts.ts add` reconciles roles without resetting them, so it does not fix a
  sign-in. The playbook records this for `demo-srimart-admin`; it is true of `demo-customer` too.
  This pass created a throwaway verified shopper, used it, and deleted it; the cascade delete
  removed its favourite row, leaving the dev table at 0 and incidentally proving
  `onDelete: Cascade` on the user relation.

## Fix pass 1 (2026-10-20) — both pass-1 findings addressed, NOT yet re-validated

**Finding 1 (R7).** `scripts/verify-favourites.ts` now runs its functional suite on
`PrismaNeonHttp` — the adapter `getPrisma()` builds and the repository actually uses — and probes
the duplicate key on **both** adapters, printing each code and asserting `isUniqueViolation`
accepts each. A third check asserts the two codes genuinely differ, which is the premise of the
shared predicate: if a future release makes them agree, that check says so rather than leaving the
set-based predicate unexplained. Root-cause fix to the evidence artifact; no check was loosened.

**Finding 2 (R11).** The inboard offset below `sm` is now `right-12` (48px), not `right-tap`
(44px). Code fix plus a corrected number in the requirement: R11's *property* (the spans must not
intersect) was right and is unchanged; its arithmetic assumed both controls were 44px wide, and
measurement showed 46px because neither sits inside `.skew-card-inner` and the card's skew widens
their bounding boxes. R11's validation row now **measures** the two boxes with
`scripts/verify-mobile-layout.ts` instead of reading the class, since reading the class is exactly
what hid this. `specs/design-system.md` 1.24.0's bullet and
`tests/favourite-heart.test.tsx` carry the 48px figure and why it is not the tap token.

**Green after the fix:** `typecheck`, `lint`, `format:check`, and
`tests/favourite-heart.test.tsx` + `tests/tap-targets.test.ts` (47 tests).

**NOT re-run, and required before Ship:** `/validate` from the top. In particular the two rows
these fixes touch are unproven as fixed — the 360px measurement showing
`heart.left + heart.width <= eye.left`, and a real run of `scripts/verify-favourites.ts` observing
`"23505"` on the shipped adapter. Neither has been executed since the change; the preview server
was stopped before the fix was written. No CHANGELOG change: neither fix alters observable
behaviour that the entry describes (the heart's offset moves 4px and the entry does not state it).

## Validation pass 2 — PASSED, all 29 rows (2026-10-20)

**Same caveat as pass 1: not independent, and on Opus 5 rather than Sonnet 5.** The owner re-ran
`/validate` in the context that built and fixed the slice. Flagged before the walk. The
measurements below are instrument output; the judgment is self-reviewed.

Pre-flight: `lint`, `format:check`, `tsc --noEmit`, **289 files / 3611 tests**, `build`. The fix's
new utility compiles — `.right-12{right:calc(var(--spacing) * 12)}` is in the built CSS, which is
48px at the default `--spacing: 0.25rem`.

### Both pass-1 findings are closed, by the evidence that failed before

- **R7.** `scripts/verify-favourites.ts` now prints
  `Functional suite adapter: PrismaNeonHttp (what getPrisma() builds)` and observes
  **`"23505"` on the shipped path** plus `P2002` on the WebSocket adapter, with a third check
  asserting the two genuinely differ (`codes=["23505","P2002"]`). The whole functional suite —
  including `addFavourite` swallowing a real duplicate — now runs on the adapter the application
  uses. Exit 0, duplicate case executed rather than skipped.
- **R11.** Measured at a real 360px viewport (`gridColumns: 2`): heart `left=83 width=46` so its
  right edge is **129**, quick-view eye `left=131`. `129 <= 131` holds with a **2px gap**. Pass 1
  failed here at 133 against 131.

### Every other row

- **R1-R6, R8, R12, R16a, R17, R19, R26** — schema valid; migration SQL still 6 additive statements
  with no `DROP` and no trgm index named; no request-context import, module-scope client, or
  `getPrismaWs` in the favourites modules; `isUniqueViolation` imported and called with no second
  copy of either code literal; `"use server"` with 1 export, 1 async; the prop threaded through all
  four call sites; the tap hook in both the component and the test map; `force-dynamic`, the
  `/login` redirect and `PageContainer width` all present; one `/account` tile; CHANGELOG citing
  both issues.
- **R10, R13-R16, R21** — 80 tests across 8 files, plus the live DOM: the signed-in heart is a
  `BUTTON` with `aria-pressed` and class
  `absolute top-0 right-12 sm:right-0 z-20 flex size-tap …`. R16 measured at 360px: heart 46x44,
  add control 44x44.
- **R9 (both halves)** — guard test, plus a cookieless replay of the real captured action POST:
  HTTP 200, `{"kind":"signed-out"}`, no 500, and the favourite table held **0** rows afterwards.
- **R18, R20** — signed out, `/account/favourites` is 307 to `/login`; signed in with nothing saved
  it renders the exact sentence inside `<main class="mx-auto w-full px-4 max-w-7xl py-8">`. Full
  round trip: heart off, clicked, `aria-pressed` true and filled, `/account/favourites` showed 1
  card and no empty state; clicked again, back to 0 cards and the empty state.
- **R22, R23, R16b** — P6.6 R6 reads correctly; the only vendor-name hits in this slice's own files
  are the two in `lib/favourites.ts`'s comment explaining the vendor-neutral rule, which that row
  says to read rather than fail; `design-system.md`'s control list names the single `+`, the
  favourite control with the 48px figure and why, and the pre-add picker only in the past tense.
- **R24** — SriMart via `srimart.localhost:8787`: 6 hearts all carrying `right-12 sm:right-0`, 6 add
  controls, 0 pre-add pickers, a label naming "65W GaN Wall Charger", and
  `--color-action: #006fc4` against Aheed's `#108020`.
- **R25** — `kms:validate` 0 invalid; `kms:check-generated` **initially failed** (see below) and is
  now current.
- **R27** — the Gate 3 catch-all, as in pre-flight.

### One finding of pass 2, mechanical, fixed in place

`app/(admin)/staff/runbook/docs.ts` was **stale** while `ARTIFACT_INDEX.md` was current — the fix
pass edited `specs/design-system.md`'s touch-target bullet, and that file's body is embedded in the
generated runbook module. This is exactly the `#537` defect class: one generator, two outputs, and
only one of them obviously drifts. Regenerated with `npm run kms:build-index` and committed
separately (`chore(kms): regenerate docs.ts for the #232 design-system edit`); the only diff is the
embedded doc content. Fixed in place rather than cycled through `/fix` because a generated file is
derived output — regenerating it cannot change any validation outcome, and the instruction the check
itself prints is "run build-index and commit the result".

**Carry this forward:** any slice that edits a file under `docs/` or `specs/` must run
`kms:build-index` *after* its last doc edit, not before. This slice ran it at Build, then edited
`design-system.md` again at Fix, and the staleness survived until validation caught it.

### Fixture note

Both passes created a throwaway verified shopper (`p232-validate@`, `p232-val2@`), used it and
deleted it. The dev `Favourite` table is back to **0 rows** and both users are gone, so nothing is
left for `#797` to complain about. The dev demo accounts' passwords are still not
`DEMO_ACCOUNT_PASSWORD` and `scripts/demo-accounts.ts add` does not reset them.
