# The Quick Shop hub, and a Regulars placeholder (build notes)

Written at the end of Build, before the Clear. Validation runs from a fresh context with only
`plan.md`, `requirements.md`, `validation.md`, the artifact and this file.

**Branch:** `feature/p1186-1187-quick-shop-hub`, three commits over `origin/staging`:
`4962919` (carried-forward docs from `#232`/`#1185`), `037fae5` (spec), `3822d76` (implementation).
Read the carry-forward note under "Known-shaky areas" before opening the PR.

## What changed and why

**Three new files, five edited.** The header's Quick Shop button stops opening a textarea and opens
a hub; the last missing destination of the four now exists.

`app/(storefront)/quick-shop/page.tsx` — the hub. Two properties are load-bearing and neither is
obvious from reading it:

- **It reads no session and queries no database.** That is not an oversight to be "fixed" later: all
  four tiles render for every visitor, and the two authenticated-only destinations redirect to
  `/login` on tap exactly as `/account/favourites` already does. Adding a session read here would
  only let the page pre-empt a redirect the destination already performs correctly.
- **It declares no `export const dynamic`**, unlike every other page in this area. The
  `(storefront)` layout already sets `force-dynamic` for the whole group
  (`app/(storefront)/layout.tsx:9`, because the Header reads the session), so the directive would be
  redundant — the same position `app/(storefront)/help/page.tsx` is in. This was **verified, not
  assumed**: `npm run build` lists both new routes as `ƒ (Dynamic) server-rendered on demand`.

`app/(storefront)/account/regulars/page.tsx` — authenticated-only, modelled directly on
`/account/favourites`. It carries `force-dynamic` *because* it reads the session through `getAuth`,
which reaches `@prisma/client/wasm` — the thing `next build`'s Node-based static prerendering cannot
load. Width is `standard`, not favourites' `wide`; see the next section.

`lib/regulars.ts` — one exported constant plus a header recording the five decisions the derivation
still needs (threshold, window, vendor scoping per ADR-004, which order states count, and cost).
The module exists now so that derivation has a home, and so one string lives in one place — the
reason `lib/favourites.ts` exports `FAVOURITES_EMPTY_MESSAGE`.

**The naming fix is one string, and the reason matters more than the change.** `#1187` described
`/shop-your-list`'s "Your saved lists" block and `/account/lists` as two different list concepts.
They are the same data from the same `getShoppingListService().list()` call — the block is a
truncated preview linking into that page. So retitling the page "Smart Lists" would have left **one
concept wearing three labels**, which is exactly the failure `#1145` was opened to fix, re-created a
fortnight later on a neighbouring surface. Renaming that `<h2>` to "Your lists" is the whole fix.

**Tile labels equal their destination's own `<h1>`** — "Your favourites", "Your regulars", "Smart
Lists", "Value Bundles". `#1187`'s body names them informally as single words; two of those would
not match the page they open, which is the same disease.

**The `/cart` and `/account/lists` links stay pointed at the paste page** and are only relabelled.
Both exist to get a shopper with a list straight to the textarea, and `/cart`'s is documented as
"the other cart-entry path (P3d, `#114`)". Keeping them also preserves a one-tap paste route, which
is the mitigation for the header button now costing two taps — a cost the owner accepted explicitly.

## Decisions taken during the build

- **`TILE_CLASS` as one const rather than four inline copies.** `/account/page.tsx` repeats its tile
  class string six times; this page applies one const to four tiles. Cleaner, and it made R5's
  original verification method wrong — see Deviations.
- **Both new pages are `standard` width.** The hub matches `/account`, whose tile grid it borrows.
  Regulars matches its account siblings rather than `/account/favourites`'s `wide` — favourites is
  wide *because* it renders a `ProductGrid`, and this page renders one sentence. **When the
  derivation lands and a grid appears, the page width and its row in
  `tests/page-container.test.ts` move to `wide` together**; that registry is what makes it an
  explicit decision rather than a drift. Recorded in both the page and the registry comment.
- **Icons.** `Heart` (matching `/account`'s favourites tile), `Repeat` for Regulars, `ListChecks`
  for Smart Lists (what `/cart` and the saved-list rows already use for lists), `Boxes` for Bundles.
  All four verified to exist in the installed `lucide-react` before use. Alternating
  `text-action`/`text-accent` follows `/account`'s existing pattern rather than inventing one.
- **An intro sentence on the hub** — "Four ways to fill your basket without browsing from scratch."
  Not specified in `requirements.md`, which pins only the four tile sentences. Added because
  `/account`, the page this borrows its shape from, has an `<h1>` plus an intro paragraph, and a
  bare heading above a grid looked unfinished. Vendor-neutral. **This is the one piece of
  user-facing copy the owner has not reviewed; it is a one-line deletion if unwanted.**
- **`REGULARS_PLACEHOLDER_MESSAGE` lives in a new `lib/regulars.ts`** rather than as a const in the
  page file. Mirrors `lib/favourites.ts` exactly, keeps the string testable from a unit test
  without rendering a server component, and gives the derivation a module.
- **The test asserts the placeholder two ways on purpose.** The page and the test import the same
  constant, so a containment check alone passes however the sentence is reworded; a literal check
  alone cannot tell whether the page renders the constant or its own second copy. Both are present,
  and both were mutated to prove it (below).

## Deviations from the spec

Three, all recorded in the implementation commit and all corrections to the spec's *verification
method* rather than to what was built. `requirements.md` is unchanged; `validation.md` carries the
corrected rows.

1. **R5's verification method changed from a source grep to a rendered assertion.** The row required
   `grep -cF '<tile class>' quick-shop/page.tsx` to print `4`. With one `TILE_CLASS` const it prints
   `1`, so the row as written would have **failed a correct implementation**. The row now asserts
   all four rendered anchors' `className` is byte-equal to the string — which is the stronger check,
   because it asserts what ships rather than how it is spelled. R5's requirement text ("each of
   those four links carries the class string") was always satisfied.
2. **R14's row now strips comments before matching, as R17's and R18's already did.** The
   replacement comment on the Lists tile quotes the removed copy as the record of why it went —
   this repo's documented convention, stated in `tests/vendor-neutral-copy.test.ts`'s own header
   ("Comments are excluded on purpose: several quote the old copy as the record of why it was
   removed"). A bare `grep` prints one hit inside that comment and is **not** a failure.

3. **`tests/header-shopping-list.test.tsx` was edited, and the spec did not enumerate it.** It
   pinned `href === "/shop-your-list"` (`#1131 R25`). R15 requires the new destination, so the
   expectation changed. Worth naming as a miss rather than a footnote: `#1187` specifically asked
   the spec to "name every call site rather than relying on grep alone", and the enumeration covered
   `app/` and `components/` but not `tests/`. **It was found by running the suite, not by reading
   it** — the only two failures in 3620 tests. The rest of that file is a useful Header-level guard
   for R15 and R16 and is otherwise untouched.

### Issues filed from this slice

- **`#1191`** — Favourites *and* Regulars are both missing from `components/account/AccountNav.tsx`,
  and `tests/account-nav.test.tsx` has no parity check against the pages on disk, so nothing would
  have caught either. R28 fences that file off; the issue carries the evidence and the comparison
  to `tests/staff-nav-parity.test.ts` and `tests/page-container.test.ts`, which both do have that
  check.
- **`#1192`** — the Regulars derivation itself, with the five decisions restated so the issue stands
  alone. **Filed because `#1186` closes with the placeholder**: without this issue the real feature
  would have become untracked work the moment the PR merged. It also records the thing most likely
  to be missed later — the page's width and its `EXPECTED` registry row move from `standard` to
  `wide` **together**, once a product grid appears.

Both are on the board, `P10`/`Backlog`, verified by a GraphQL `node` query rather than
`gh project item-list`, which lags its own writes.

## Fix pass — 2026-10-21, after validation pass 1 FAILED

Validation found **one real regression** and confirmed 28 of 30 rows. What changed:

**1. `scripts/verify-mobile-layout.ts` — the regression, fixed at the root.** Its `shoppingList`
measurement selected the header link with `header a[href="/shop-your-list"]`. R15 repointed that
link, so the selector could never match again — `/cart`'s only `/shop-your-list` link is in the page
body, outside `<header>`. Confirmed by running it: the output carried `"shoppingList": null`. It
fails **silently**, and `null` reads as "this page has no such link" rather than "this selector is
stale", which is the exact green-but-meaningless failure mode this project keeps meeting.

**The fix is not to chase the new URL.** It now matches on the **accessible name**,
`header a[aria-label="Quick Shop"]`. The destination has moved twice (`#1142`, `#1187`) while the
name has been "Quick Shop" since `#1145` and is pinned by *two* tests —
`tests/header-shopping-list.test.tsx` and `tests/quick-shop-hub.test.tsx`, the latter also asserting
it equals the visible text (WCAG 2.5.3). So the name is the stable handle and the URL is not. The
output key keeps its original spelling so `#1142`'s and `#1180`'s recorded comparisons still read
against the same field; the docstring at the top of the file says so.

This is the **second** call site in the same family: `tests/header-shopping-list.test.tsx` was the
first, caught during Build by the suite. Both were missed because the spec enumerated `app/` and
`components/` but not `tests/` and `scripts/` — see the third deviation above. A repo-wide sweep for
`a[href=` and the two route literals across both directories now confirms there is no third.

**2. `scripts/verify-crawlability.ts` — new coverage, not a regression.** `/quick-shop` was absent
from `EXCLUDED_PREFIXES`, the list asserting which routes stay out of the sitemap. The app was
already correct (the live sitemap contains zero `quick-shop` occurrences, and R22 passed), but
nothing asserted it would stay that way. Added for the same reason `/shop-your-list` is on that
list.

**3. Three `validation.md` rows were wrong, and the rows were corrected — not the artifact.**
Stating which, because loosening a row to make it pass is only legitimate when the row itself was
defective:

- **R16** required `grep -n 'pasting'` to print nothing. It prints one hit — the docstring quoting
  the old `title` as the record of why it changed, this repo's documented convention. The
  requirement was always satisfied: the attribute is `title="Favourites, regulars, lists and
  bundles"`. The row now reads the attribute instead of grepping the file.
- **R23** told the validator to read `SEED_SRIMART_HOST` from `.env`/`.dev.vars`. **That key is in
  neither file** — it is a seed-time variable, so the row was unrunnable as written. SriMart is
  `srimart.localhost:8787` under `npm run preview`, via `lib/tenant.ts`'s host-with-port
  `VendorDomain` fallback (`#514`); `scripts/verify-crawlability.ts:37` already hardcodes that
  origin. The row now names it.
- **Setup step 4 (was 3)** said to sign in with `$DEMO_ACCOUNT_PASSWORD` without naming a file.
  `.env` and `.dev.vars` hold **different values**, and only `.dev.vars` works under preview
  (per-key precedence, Cloudflare context first). `.env`'s value returns a clean `401` that looks
  like a broken auth path. The row now names the file and records that
  `scripts/demo-accounts.ts add` never resets an existing account's password — it calls `signUp`
  only when the user is absent, so a `[reconciled]` line says nothing about which password is
  stored.

**4. Two setup steps added from what the live run actually needed.** A new step 1 requires checking
the process environment for an exported `DIRECT_URL` **by host only, never the whole value** —
because one was live during this run, pointing at **production**. Every script in the pass had to be
prefixed with `env -u DIRECT_URL -u DATABASE_URL`. The Worker was unaffected (runtime reads
`DATABASE_URL` from `.dev.vars` and never `DIRECT_URL`, confirmed against dev by a distinct
`db.checkedAt` and the dev CDN), so it is a scripts-only hazard — but it is the `#1134` condition
sitting in the shell.

No shipped behaviour changed in this pass: both edited files are dev instruments, so `CHANGELOG.md`
is untouched by the fix.

### What the live run proved that Build could not

`demo-srimart-admin@example.com` now exists in dev, closing a gap open for three slices. With it,
R23's second-vendor half is **measured**: the SriMart host renders the hub with all five new
sentences byte-identical to Aheed's and zero vendor or grocery literals. R18's live half was made
non-vacuous by creating a saved list, confirming `<h2>Your lists</h2>` renders once with the list
name and `"Your saved lists"` is gone; the row was deleted afterwards.

## Known-shaky areas

- **RESOLVED at validation pass 1 (2026-10-21): the live rows have now been run under
  `npm run preview`.** R2, R9, R10, R13, R14, R15, R16, R17, R18, R19, R20, R22 and R23 were all
  exercised against a real Worker on the dev database. The guest redirect is a real `307` to
  `/login` and the signed-in page a real `200` carrying the heading and the exact sentence — not
  just the mocked control flow in `tests/quick-shop-hub.test.tsx`. **Still open:** R27 (the PR's
  `closingIssuesReferences`, no PR yet) and R30's CI half (nothing pushed; local green is not CI).
- **RESOLVED: R18's live half is no longer vacuous, but the precondition is still real.** The "Your
  lists" `<h2>` renders only when `savedLists.length > 0` (`shop-your-list/page.tsx:45`), so with no
  saved list a `curl | grep` returns nothing and looks like a defect. A list was created in dev,
  the heading confirmed rendering once with the list name, and the row then deleted. Anyone
  re-running R18 must redo that setup (step 5) or the check is vacuous rather than passing.
- **RESOLVED: the two-vendor check is now measured, and the three-slice fixture gap is closed.**
  `demo-srimart-admin@example.com` was added to the dev database on 2026-10-21, so all five demo
  accounts exist. The SriMart hub renders with all five new sentences byte-identical to Aheed's and
  zero vendor or grocery literals. **The host is a fixed literal after all:**
  `srimart.localhost:8787`, resolved by `lib/tenant.ts`'s host-with-port `VendorDomain` fallback
  (`#514`) — an earlier draft of this file and of R23 wrongly sent the reader to a non-existent
  `SEED_SRIMART_HOST`.
- **Copy is the thin spot, and `tests/vendor-neutral-copy.test.ts` cannot help.** It is a
  **denylist**: a green run says the known-bad strings are absent, not that five new sentences are
  neutral. The four tile descriptions, the hub's intro sentence and the placeholder need reading by
  eye against the two-vendor rule (Aheed groceries, SriMart electronics).
- **The hub's `title` attribute is new copy on a shared surface.** `ShoppingListLink`'s `title` went
  from "Shop by pasting your list" to "Favourites, regulars, lists and bundles". The `aria-label`
  and visible text are unchanged and byte-identical to each other (WCAG 2.5.3, asserted and
  mutation-proven), but the `title` is the one string on that component no test pins.
- **Validation will not be independent if it runs in this session.** This context built the slice.
  Record which it was.

### The mutation proof, for the record (R24)

Five cases, each seen to fail in the named test and pass on restore — not inferred:

| Mutation | Case that failed |
|---|---|
| `/bundles` → `/bundles-MUTANT` | "renders exactly four tiles, in the fixed order (R3)" |
| tile label "Your regulars" → "Regulars" | "labels each tile with its destination page's own name (R4)" |
| page renders a literal instead of the constant | "renders the one placeholder string … (R10, R11)" |
| `REGULARS_PLACEHOLDER_MESSAGE` reworded | "holds the exact sentence #1186 specifies (R11)" |
| visible span text → "Quick Shopping" | "keeps its accessible name identical to its visible text (R16)" |

After restoring all five: 9 tests pass in that file, and `git diff --stat` showed no residue.

### Gate results at the end of Build

`npm run lint`, `npm run typecheck`, `npm run format:check` all exit 0. `npx vitest run
--maxWorkers=4`, **run alone**, passes **290 files / 3620 tests**. `npm run build` compiles and
lists both new routes as dynamic. These are Build-stage observations on this machine, not a
substitute for CI — `gates` green on the PR is what closes R30.
