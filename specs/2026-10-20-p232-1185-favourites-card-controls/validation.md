# Favourites, and a bare + on the product card (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

This slice touches a **database schema**, **auth** and **UI**, so it carries integration and
accessibility checks earlier than a pure-UI slice would. The duplicate-key behaviour is proved
against a real database rather than a double, because `CLAUDE.md` records that a hand-built double
only reproduces its author's guess about which `.code` the adapter reports.

1. **Unit Testing** — the duplicate-key predicate, the card's control rendering, the heart's three
   states.
2. **Integration Testing** — the repository against the dev database via `scripts/verify-favourites.ts`.
3. **System / End-to-End Testing** — the toggle and the listing page under `npm run preview`.
4. **Regression & Acceptance Testing** — the other three `AddToCartButton` variants, and the
   existing card tests.
5. **Performance & Resilience Testing** — not applicable: one indexed read per page render, no new
   external call.
6. **Security & Accessibility Testing** — the signed-out path writes nothing; every new control has
   an accessible name and a 44px hit area.

### Before running anything that touches a database

`printenv DIRECT_URL DATABASE_URL` first. If either is set, prefix every Prisma CLI and script
command below with `env -u DIRECT_URL -u DATABASE_URL`, and read `npx prisma migrate status`'s
datasource host before applying anything. A session-inherited production `DIRECT_URL` migrated
production at `#1134` while both env files correctly named dev.

**Applying a migration and any production command must be handed to the owner** as a `! <command>`
line rather than run here — auto mode blocks `prisma migrate deploy` even against dev.

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `npx prisma validate` exits 0, then read `prisma/schema.prisma`'s `Favourite` block and confirm by eye: five fields, three relations each with `onDelete: Cascade`, `@@unique([vendorId, userId, productId])`, `@@index([vendorId, userId, createdAt])`, no `Json`. `grep -n "Json" prisma/schema.prisma` shows no hit inside that block. |
| R2  | Unit | First strip SQL comments, because the file's header comment deliberately names the three `pg_trgm` indexes to explain what must not happen to them: `grep -vE '^[[:space:]]*--' prisma/migrations/20261020150000_p232_favourite/migration.sql > "$SCRATCH/statements.sql"`. Then both of these must print nothing against `"$SCRATCH/statements.sql"`: `grep -nE '^[[:space:]]*DROP' <file>`, and `grep -n -e Order_orderNumber_trgm_idx -e Order_guestEmail_trgm_idx -e User_email_trgm_idx <file>`. Repeated `-e` patterns rather than regex alternation on purpose — a `\|` under `grep -E` matches a literal pipe and would find nothing while reading as a pass. Then read the whole file: one `CREATE TABLE`, one unique index, one read index, three foreign keys, nothing else. |
| R3  | Unit | `npx vitest run --maxWorkers=4 tests/repository-purity.test.ts tests/repository-client-injection.test.ts` exits 0. Then `grep -n -e next/headers -e '@/lib/tenant' -e '@/lib/auth' lib/repositories/favourites.ts` prints nothing. |
| R4  | Unit | Read `lib/favourites-service.ts`: `getFavouritesRepository()` calls `getPrisma()` inside its own body and resolves the vendor through a per-call promise, with no module-scope `const prisma =`. `grep -nE '^const .*(getPrisma\|getCurrentVendorId)' lib/favourites-service.ts` prints nothing. |
| R5  | Unit | Strip comment lines first — all three files deliberately name `getPrismaWs` in prose to record why it is absent, so a check counting those could only be passed by deleting the warning. One command builds a comments-free copy: `for f in lib/repositories/favourites.ts lib/favourites-service.ts features/favourites/toggle-favourite.ts; do grep -vE '^[[:space:]]*[*/]' "$f"; done > "$SCRATCH/favourites-code.txt"`. The character class `[*/]` catches `//`, `/*` and continuation `*` lines without needing alternation. Then `grep -n getPrismaWs "$SCRATCH/favourites-code.txt"` prints nothing. |
| R6  | Unit | `npx vitest run --maxWorkers=4 tests/prisma-errors.test.ts` exits 0 — the pre-existing test already covers `P2002`, `"23505"`, an unrelated code, a numeric code and non-error values. Then `grep -n isUniqueViolation lib/repositories/favourites.ts` shows both the import and the call, and against R5's comments-free copy `grep -n -e 23505 -e P2002 "$SCRATCH/favourites-code.txt"` prints nothing — no second copy of either literal in code. (Comments excluded for R5's reason: the repository's docstring names both codes to explain why the shared predicate is used.) |
| R7  | Integration | `printenv DIRECT_URL DATABASE_URL` first (see above), then `npx tsx scripts/verify-favourites.ts` exits 0. Read its output: it must print the observed duplicate-key `code` value, and state one row after two toggle-ons and zero after a toggle-off. **A run that reports the duplicate case as skipped is a FAIL, not a pass** — that case is the only real evidence for R6. |
| R8  | Unit | `head -1 features/favourites/toggle-favourite.ts` is `"use server";`. Then compare two counts on that file: `grep -c '^export' <file>` and `grep -c '^export async function' <file>` must be equal (a `type`-only export is written `export type`, which counts in neither and must therefore be absent). Counts rather than a negated pattern on purpose: POSIX ERE has no `(?!...)` lookahead, so the obvious one-liner would error or match nothing and read as a pass. |
| R9  | Integration | Two parts, because a signed-out shopper cannot reach the action from the UI at all (the heart is a `/login` link, R10). **Guard:** `npx vitest run --maxWorkers=4 tests/favourite-toggle-guard.test.ts` exits 0 — it stubs the session reader to return no user and asserts the action returns the signed-out outcome and calls no repository function. A stub is appropriate here because this is a control-flow check, not the `.code` check that R6/R7 deliberately prove against a real database. **Live:** under `npm run preview`, with no session cookie, re-POST a captured server-action request for the toggle and confirm the response is not a 500; then `npx tsx scripts/verify-favourites.ts` reports the same row count as before. |
| R10 | Unit | `npx vitest run --maxWorkers=4 tests/favourite-heart.test.tsx` exits 0. It renders the card three times, once per `favouriteState`, and asserts the element type (`button`, `button`, and an `a` whose `href` is `/login`) and that each accessible name contains the product name. |
| R11 | E2E | **Measure it; do not infer it from the class.** With `npm run preview` running: `MSYS_NO_PATHCONV=1 npx tsx scripts/verify-mobile-layout.ts --base http://localhost:8787 --path /categories/<slug> --widths 360 --measure '[data-tap-surface="product-card-favourite"],[aria-label^="Quick view"]'` (the `MSYS_NO_PATHCONV` prefix stops Git Bash rewriting `--path`; the script detects that and says so). Read the two `measured` boxes and confirm `heart.left + heart.width <= eye.left`. Pass 1 failed here at 87+46=133 against eye.left=131. The class half is also asserted in `tests/favourite-heart.test.tsx` (`right-12`, `sm:right-0`, no unprefixed `right-0`), but **the class passing is not the requirement** — both controls render 46px wide rather than 44 because of the card's skew, which is exactly what reading the class alone hid. |
| R12 | Unit | `grep -n 'favouriteState' "app/(storefront)/categories/[slug]/page.tsx" "app/(storefront)/search/page.tsx" components/product/ProductRow.tsx` shows at least one hit each. Confirm by reading each file that the set of favourited ids is resolved **once before** the product map, not inside it. |
| R13 | Unit | `npx vitest run --maxWorkers=4 tests/product-card-controls.test.tsx` exits 0, including the case that renders `variant="card"` with `disabled` false and asserts `getAllByRole("button")` has length 1 and both `queryByLabelText(/Decrease quantity/)` and `queryByLabelText(/Increase quantity/)` are null. |
| R14 | Unit | Same test file: the single button's accessible name equals the `label` passed in; and a `ProductCard` render asserts the `label` it passes contains the product name. |
| R15 | Unit | Same test file: `variant="card"` with `disabled` true yields a disabled button whose text content is `Out of stock` and whose accessible name contains the product name; and a `ProductCard` with `inStock` false renders no element labelled `/in cart/`. |
| R16 | Security & Accessibility | Same test file: assert both controls' class lists carry a 44px tap token (`size-tap`, `h-tap`, or `min-h-tap` with `min-w-tap`) at the base breakpoint, not only behind an `lg:` prefix. Then measure for real: `npx tsx scripts/verify-mobile-layout.ts --base http://localhost:8787 --path /categories/<slug> --widths 360 --measure '<heart-selector>,<add-selector>'` and read each printed `measured` box — both must be at least 44 by 44. `--measure` takes a selector and only adds measurements to its output; it does not judge them, so the pass/fail is the number you read. |
| R16a | Regression | `npx vitest run --maxWorkers=4 tests/tap-targets.test.ts` exits 0, and `grep -n product-card-favourite tests/tap-targets.test.ts components/product/FavouriteButton.tsx` hits in both files. That test reads source text rather than rendering, so it is the cheap guard that the hook does not get dropped later; it also still requires `components/cart/AddToCartButton.tsx` to carry `quick-view-add` and a tap utility, which the `drawer` variant retains untouched. |
| R16b | Release | Locate the section with `grep -n 'Touch targets' specs/design-system.md`, then **read its bulleted control list** and confirm three things: the card's add control is described as a single `+`; the card's favourite control is listed with its placement; and no bullet presents a card-level pre-add minus and plus as currently existing. A grep for `pre-add` WILL match — the corrected bullet names it in the past tense to record what `#1185` replaced — so this row is a read, not a pattern count. Passing it by deleting that history would be validating around the check. |
| R17 | Integration | `grep -n 'dynamic = "force-dynamic"' "app/(storefront)/account/favourites/page.tsx"` hits; `npx vitest run --maxWorkers=4 tests/page-container.test.ts` exits 0 (it fails on a hand-rolled container and on a `className` smuggling `max-w-`/`mx-auto`/`px-` back in). Under `npm run preview`, `curl -i` the route with no session and confirm a redirect to `/login`. |
| R18 | E2E | Under `npm run preview`, sign in as a demo account with no favourites and load `/account/favourites`; the page body contains the exact sentence from R18. Compare with `grep -n "No favourites yet" "app/(storefront)/account/favourites/page.tsx"` to confirm the rendered copy is the authored copy. |
| R19 | Unit | `grep -n '/account/favourites' "app/(storefront)/account/page.tsx"` hits at least once inside a `Link`. |
| R20 | E2E | Under `npm run preview`, signed in: tap the heart on a product on `/categories/<slug>`, load `/account/favourites` and see that product; tap the heart again, reload, and see R18's empty state. Record the product used. |
| R21 | Regression | `npx vitest run --maxWorkers=4 tests/product-card-controls.test.tsx` includes a case per remaining variant: `drawer` and `full` each still expose controls labelled `/Decrease quantity/` and `/Increase quantity/`; `icon` renders one button. |
| R22 | Regression | `grep -n wishlist specs/2026-08-13-p6.6-p0-ui-overhaul/requirements.md` locates the obligation — it is **R6**, not R1 as `#232`'s body claims. Read R6 and confirm it now names the Favourites entry points rather than a header control, still cites `#232`, and no longer says "expected to fail". |
| R23 | Regression | `git diff --name-only origin/staging...HEAD -- app components features lib` lists the changed files; for each, `grep -ni -e aheed -e srimart -e grocer <file>`. A hit is **read, not auto-failed**: the rule targets user-facing copy and default parameter values, so a match inside an explanatory comment or a doc reference passes. Deleting a comment to quiet this grep would be validating around the check, not satisfying it. |
| R24 | E2E | Under `npm run preview`, repeat R20's first step against the **SriMart** host, signed in as a SriMart **shopper** account (not the staff admin — favourites is a shopper feature). If no SriMart shopper account exists in the dev database, run `npx tsx scripts/demo-accounts.ts add` in a clean shell first; a missing SriMart fixture blocked the two-vendor check on each of the two previous slices. Reach the second vendor with `scripts/verify-mobile-layout.ts`'s `--map-host 127.0.0.1` (or the equivalent host mapping) — a CDP `Host` header is ignored by Chrome and yields a false pass. A 429 here is very often an unresolved vendor rather than throttling, and a 403 on sign-in is the forwarded-proto origin. |
| R25 | Release | `npm run kms:validate` exits 0. Then `npm run kms:assemble:internal && (cd kms/site-internal && npx next build --webpack)` — read the real exit status, do not pipe through `tail`, which reports the pipe's success rather than the build's. |
| R26 | Release | `git diff origin/staging...HEAD -- CHANGELOG.md` is non-empty and names `#232` and `#1185`. |
| R27 | Release | `npm run lint`, `npm run typecheck`, `npm run format:check` each exit 0, and `npx vitest run --maxWorkers=4` is run **alone** (not beside or straight after a build) and exits 0. If 2 to 10 tests fail across unrelated files, each taking 5 to 9 seconds for a trivial assertion, and the failing set moves between runs, that is the loaded-machine artefact recorded in `CLAUDE.md` — do not bisect against it. |
