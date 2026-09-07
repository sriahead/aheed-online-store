# Storefront & panel accessibility remediation (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Every feature should have appropriate **Unit** and **Integration** testing, followed by relevant validation testing. Broader testing mainly happens before release. However, testing is risk-based: features involving auth, payments, UI changes, performance-sensitive APIs, databases, or external dependencies require additional relevant testing earlier.

1. **Unit Testing**
   - *When needed:* Every feature.
   - *Purpose:* Test isolated business logic, utilities, and components.
2. **Integration Testing**
   - *When needed:* Every feature. (Includes Contract testing).
   - *Purpose:* Verify the component works with its immediate dependencies (e.g., database, external services).
3. **System / End-to-End Testing**
   - *When needed:* For critical user journeys and validation testing.
   - *Purpose:* Validate that the feature works correctly in the real system.
4. **Regression & Acceptance Testing**
   - *When needed:* Mainly before release, or when changing core flows. (Includes Smoke and Sanity testing).
   - *Purpose:* Ensure existing functionality remains unbroken and acceptance criteria are met.
5. **Performance & Resilience Testing**
   - *When needed:* Mainly before release, or for performance-sensitive APIs. (Includes Load, Stress, and Spike testing).
   - *Purpose:* Ensure the system meets throughput/latency targets and degrades gracefully.
6. **Security & Accessibility Testing**
   - *When needed:* Mainly before release, or earlier for features involving auth, payments, or UI changes.
   - *Purpose:* Ensure the system is safe and accessible to all users.

---

## Before you start

Two setup facts this slice's rows depend on. Both are recorded in `CLAUDE.md` and are easy to get
wrong from a fresh context:

- **Use `npm run preview`, never `npm run dev`.** Every page under test is `force-dynamic` and reads
  the vendor through Prisma; plain `next dev` cannot load `@prisma/client/wasm` and renders an error
  state with no crash and no obvious signal.
- **`--include=*.tsx` is load-bearing in every grep below.** The generated bundle
  `app/(admin)/staff/runbook/docs.ts` embeds every KMS document's full body, so it legitimately
  contains the very strings these rows assert are absent. It is a `.ts` file, so restricting to
  `*.tsx` excludes it without an explicit ignore.

Start the local Worker once and leave it running for the live rows:

```bash
npm run preview          # serves http://127.0.0.1:8787
```

When finished, kill the whole chain, not just the npm process — `opennextjs-cloudflare preview`
spawns `wrangler dev`, which spawns `workerd.exe` children that survive their parent on Windows and
lock `.open-next/assets` against the next build (`CLAUDE.md`, Windows shell section).

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `npx vitest run tests/color-contrast.test.ts` exits 0, and the file contains assertions that `mutedForeground("#1b5e20", [...five Aheed surfaces], 0.7, 4.5) === "#49784e"` and `mutedForeground("#1b5e20", [...], 0.4, 3) === "#77917a"`. |
| R2  | Unit | `grep -nE "color-primary-(muted\|subtle)" design-system/tokens/tokens.css` prints exactly two declarations, with values `#49784e` and `#77917a`, each preceded by a comment naming its ratio (`4.5:1`, `3:1`) and the words "overridden per vendor". |
| R3  | Unit | `grep -n "primary-muted\|primary-subtle" lib/vendor-theme.ts` shows both keys in the returned object, each assigned a `mutedForeground(p["green-dark"], primarySurfaces, ...)` call with alphas `0.7`/`0.4` and ratios `4.5`/`3`. |
| R4  | Unit | `npx vitest run tests/vendor-theme.test.ts` exits 0 and its output names a test asserting the muted/subtle ratios for **both** `AHEED_PRIMITIVES` and `SRIMART_PRIMITIVES`. Confirm the test computes ratios from `brandStyle()`'s **returned values**, not from `tokens.css`. |
| R5  | Unit | `npx vitest run tests/design-tokens-contrast.test.ts` exits 0. Confirm its "declares at least N pairs" guard was raised, so the suite cannot pass vacuously with the new pairs omitted. |
| R6  | Unit | `grep -rnE "(text\|fill\|stroke\|decoration)-(primary\|action\|accent\|danger)[a-z-]*/[0-9]+" app components features --include=*.tsx` prints **nothing** and exits 1. |
| R7  | Unit | `grep -rnE "text-black/[1-5]0" app components features --include=*.tsx` prints **nothing** and exits 1. Then run `for a in 40 50 60 70 80 90; do echo "$a $(grep -rho "text-black/$a" app components features --include=*.tsx \| wc -l)"; done` on this branch **and** on `origin/staging`. **Corrected at `/document`**: the original row (and R7 itself) said `/60` rises by the `/50` count alone (10, to 31) — live validation found the real rise is 15 (21 to 36), because `/40` (5 sites) is also in scope and was also converted, which the row's own `text-black/[1-5]0` pattern already implies. Expected: `/40` and `/50` both go to 0; `/60` rises by their combined pre-slice count (10 + 5 = 15, i.e. 21 to 36); `/70`, `/80` and `/90` are identical on both sides. A `/60` count that rose by less than 15 means some sites were dropped rather than bumped. |
| R8  | Integration | `grep -rn "text-primary-subtle" app components features --include=*.tsx` — read **every** line of output (there should be roughly 26) and confirm each is on an element carrying `aria-hidden`, and that none wraps text content. Any line on a text-bearing element is a **fail**: it belongs on `text-primary-muted`. |
| R8a | Unit | `npx vitest run tests/vendor-theme.test.ts` exits 0 and names a hierarchy test. Then read the numbers yourself: for both vendors print `relativeLuminance` of primary/muted/subtle and confirm they strictly increase, and print `contrastRatio(primary, muted)` and `contrastRatio(muted, subtle)` and confirm each is at least 1.4. Expected at spec time — Aheed 1.53 and 1.50, SriMart 1.57 and 1.51. A pair under 1.4:1 means the consolidation flattened the hierarchy and is a **fail** even though every AA floor still passes. |
| R8b | Unit | Same test run. For each vendor assert muted at least 4.5:1 and subtle at least 3:1 against **all five** surfaces (white, cream, and the three tints), not white alone. Checking white alone would have passed `text-primary/80`, the defect that motivated this slice. |
| R9  | Unit | `npx vitest run tests/token-alpha-purity.test.ts` exits 0. Then prove it bites: append `text-primary/70` to a `className` in any `.tsx` under `components/`, re-run, confirm it **fails** naming that file, then revert. |
| R10 | Unit | `test -f lib/form-classes.ts` succeeds; `grep -nE "from \"(next/headers\|@/lib/(db\|auth\|auth-rbac))\"" lib/form-classes.ts` prints nothing. **Corrected at `/document`**: the original row's `grep -c "use server" lib/form-classes.ts` returns 1, not 0, and that is not a failure — the file's own doc comment explains it is *not* a `"use server"` file, and the phrase inside that explanation is what matches. Confirm the actual R10 property (no `"use server"` **directive**, i.e. no bare `"use server";` pragma line) with `grep -n '^"use server"' lib/form-classes.ts`, which correctly prints nothing. |
| R11 | Unit | `grep -rnE "^\s*const (input\|label\|errorInput\|button)Class" app components features --include=*.tsx` prints **nothing**. `grep -rl "@/lib/form-classes" app components features --include=*.tsx \| wc -l` returns at least 11 (the number of files that declared one of these constants before the slice). |
| R12 | Unit | `grep -n "inputClass" lib/form-classes.ts` shows a value containing `focus-visible:` and **not** containing `focus:outline-none`. |
| R13 | Unit | `grep -rn "focus:outline-none" app components features lib --include=*.tsx --include=*.ts | grep -v "runbook/docs.ts"` prints **nothing** and exits 1. **Corrected at `/document`**: the original row's command (without the exclusion) prints one match, in the generated `app/(admin)/staff/runbook/docs.ts` bundle — which legitimately embeds this very spec's prose discussing the phrase being searched for. `--include=*.ts` was added to reach `lib/form-classes.ts` (not a `.tsx` file), but it collaterally re-includes the generated bundle the "Before you start" section above already said to exclude. |
| R14 | E2E | Under `npm run preview`, sign in as a store admin and open `/staff/products/new`. Submit the form with the name field empty. In the rendered HTML confirm the name input carries `aria-invalid="true"` and an `aria-describedby` whose value is the `id` of the element showing the error text. Repeat for `/staff/categories`, `/staff/bundles` and one campaign form at `/staff/promotions/<categoryId>`. A field styled red with no `aria-invalid` is a **fail**. |
| R15 | E2E | Open `http://127.0.0.1:8787/search` in Chrome. DevTools → Rendering → **Emulate CSS media feature prefers-reduced-motion: reduce**. Hover a product card: the card must not skew, lift, **or zoom its image**. Then select the image element and confirm its computed `transform` stays `none` through the hover. Repeat on `/bundles` for `BundleCard`. Turn the emulation off and confirm all three motions return — the existing card motion must be **unchanged** when the preference is not set. |
| R15a | Regression | `git diff origin/staging -- app/globals.css` shows **no** change inside the `.skew-card`, `.skew-card-inner`, `.skew-card-badge` or `.skew-card-price` rules — same transforms, same `380ms`/`350ms`/`300ms`, same easings, same hover `translateY(-6px)` and `color-mix` shadow. `git diff origin/staging -- components/product/ProductCard.tsx` touches the image `className` and nothing else; `git diff --numstat origin/staging -- components/product/ProductCard.tsx` reports **1 changed line**. More than that is a **fail** — investigate before accepting. |
| R15b | Regression | `git diff origin/staging -- components/bundle/BundleCard.tsx` shows exactly three changed lines: the image `motion-reduce:` variant, `text-primary/30` to `text-primary-subtle` on the `aria-hidden` `Package` icon, and `text-black/50` to `text-black/60` on the item-count label. No `.skew-card`, `aspect-4/3` or layout class changes. |
| R16 | Unit | `npx vitest run tests/motion-reduce-coverage.test.ts` exits 0. Cross-check by hand: `grep -rnE "(active\|hover\|group-hover\|focus):scale-" app components --include=*.tsx` — every line also contains `motion-reduce:`. |
| R17 | Unit | `grep -rc "animate-spin" app components --include=*.tsx \| grep -v ":0"` totals 3, matching pre-slice. `git diff app/globals.css` shows **no** change inside either `@media (prefers-reduced-motion: reduce)` block and no new rule whose selector is `*` or a bare element name. |
| R18 | Unit | Covered by R16's first command. Additionally prove it bites: remove one `motion-reduce:` variant, re-run, confirm it **fails** naming that file, then revert. |
| R19 | Unit | `grep -rn "PromoCarousel" app/globals.css specs/design-system.md` prints **nothing**. `grep -n "DepartmentHero" specs/design-system.md` prints at least one line in the Motion section. |
| R20 | E2E | For each of the six pages, `grep -n "<main" app/\(storefront\)/<page>/page.tsx` shows both a horizontal (`px-`) and a vertical (`py-`) padding utility. Then, under `npm run preview`, open `/login` in Chrome at a 375px-wide viewport (DevTools device toolbar, iPhone SE) and confirm a visible gutter on both sides and clear space below the header. Repeat for `/register` and `/account`. |
| R21 | Unit | `git diff components/layout/StorefrontChrome.tsx` shows no change to the `<div className="flex-1">` wrapper. Under `npm run preview` at 375px, `/search` and `/cart` show a single gutter, not a doubled one. |
| R22 | Unit | `git diff specs/design-system.md` shows the two tokens in its colour table with ratios and roles; a stated ban on alpha modifiers over themed foreground tokens naming `tests/token-alpha-purity.test.ts`; the `focus-visible` ring as the standard focus treatment; and a Motion rule 4 naming `tests/motion-reduce-coverage.test.ts`. Front-matter `version` bumped and `updated` set to the slice date. `npm run kms:validate` reports `invalid front-matter (failing): 0`. |
| R23 | Unit | `grep -n "primary-muted" specs/decisions/ADR-004-multi-tenancy.md` shows a dated implementation note under decision 5 stating the clamped-foreground list grew and the decision is unchanged. |
| R24 | Unit | Run `npx vitest run` **alone**, with no build running concurrently and no orphaned `node.exe`/`workerd.exe` (check with `Get-CimInstance Win32_Process -Filter "Name='node.exe' or Name='workerd.exe'"`). Its reported file/test totals match the figure now written in `CLAUDE.md`. A run reporting `Failed to start forks worker` is a **non-result** — re-run it, do not record it. |
| R25 | Unit | `git diff origin/staging -- CHANGELOG.md` is non-empty and names this slice and issues #649, #650, #651, #652. |
| R26 | Regression | `npm run lint`, `npm run typecheck`, `npx vitest run` and `npm run format:check` each exit 0. **CI on the PR is the authority, not local output** — Windows and Linux have disagreed here before. |

---

## The live two-vendor check (mandatory — this slice cannot pass without it)

`brandStyle()` returns an **inline style on the root element**, which outranks `tokens.css` on
specificity. In P7 closeout (#251) `tokens.css` was corrected for AA, its contrast test passed, and
**every real page kept serving the old failing hex** because `brandStyle()` was re-declaring those
tokens. A green unit suite is therefore not evidence that any of R2–R5 reached a browser.

Run this after every other row passes:

```bash
curl -s http://127.0.0.1:8787/search -H 'Host: aheedfoodcentre.nocaped.com'   > /tmp/aheed.html
curl -s http://127.0.0.1:8787/search -H 'Host: srimart-staging.nocaped.com'   > /tmp/srimart.html
grep -o '\-\-color-primary-muted:[^;]*'  /tmp/aheed.html /tmp/srimart.html
grep -o '\-\-color-primary-subtle:[^;]*' /tmp/aheed.html /tmp/srimart.html
```

**Pass criteria:**

1. Both files contain both custom properties in the root element's inline `style` attribute.
2. Aheed's values are `#49784e` and `#77917a`. SriMart's are **different** (expected `#4369a7` and
   `#7287aa`) — identical values across the two vendors means `brandStyle()` is not deriving them
   per vendor and R3 has silently failed even if its grep passed.
3. Feed each returned value plus that vendor's five surfaces through
   `lib/color-contrast.ts`'s `contrastRatio` and confirm at least 4.5:1 for muted and 3:1 for subtle.

### The muted-tone consolidation, seen rather than computed (both vendors)

R8a and R8b prove the ladder arithmetically. This step is the visual half, and it is the one the
263-site collapse actually risks: three lightnesses becoming one can pass every ratio and still read
as flat. Do it for **both** vendors — nothing in `lint`, `typecheck` or the unit suite renders a
second vendor's output.

For each `Host` value in turn (`aheedfoodcentre.nocaped.com`, then `srimart-staging.nocaped.com`),
open these three pages in a browser pointed at `http://127.0.0.1:8787` and look at the muted text on
each of the three surface types it lands on:

| Page | Surface under the muted text | What to check |
|---|---|---|
| `/staff` (signed in as store admin) | white cards | The card description lines read as clearly subordinate to the card titles above them, and are comfortably readable at `text-sm`. |
| `/cart` or `/account/orders` | `bg-surface-muted` cream | Muted text on cream has not visually merged with the surface — this is the tightest AA margin at 4.71:1 (Aheed). |
| `/` landing, trust strip | `bg-action-tint` | Muted text on a tint stays distinct from `text-primary` headings on the same panel. |

**Pass criteria:** on both vendors, at all three surfaces, the muted tone is visibly lighter than
`text-primary` and visibly darker than any `text-primary-subtle` icon beside it, and no block of
body copy reads as low-contrast. **Fail signals:** muted text indistinguishable from a heading (the
consolidation went too dark), or muted text that disappears into cream (too light for that surface).

Capture one screenshot per vendor for the build notes — a reviewer who was not present cannot
re-derive "it looked fine" from a ratio table.

**One trap to avoid when reading the HTML.** Do **not** try to prove the sweep worked by grepping
live HTML for the *absence* of an old hex. `brandStyle()` legitimately embeds each vendor's own
primitives as custom-property values, so a literal that a component no longer uses can still appear
in the page — this false-positived at `#631`'s validation. The absence claim is R6's and R7's
source-level grep; live HTML proves only the positive claim above.

---

## What this validation deliberately does not cover

- **`text-white/{50,70,80,85,90}` (12 occurrences).** Out of scope per `plan.md` — they sit over
  vendor-uploaded campaign imagery, so no static value settles them. Tracked separately.
- **Background, border and ring alpha modifiers.** Out of scope; `#641` tracks one instance.
- **The eight inconsistent page content widths.** Only the *missing padding* is in scope (`#656`).
- **A full screen-reader journey.** That is `#442`'s job on the deployed candidate. This slice
  removes the defects #442 would otherwise spend its time discovering.
