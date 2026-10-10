# #981, #982 — Mobile finish: Quick View review tap targets and the logo-less header wordmark (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

This slice changes only CSS classes and one measuring script, so it carries no unit tests of
behaviour. Its proof is a **source guard** (`tests/tap-targets.test.ts`, which reads the files,
because nothing breaks when a class is dropped — the control still works, just smaller) plus
**live geometry** measured in headless Chrome at real phone widths. Accessibility is the point of
the slice, not a side-check.

1. **Unit / source:** `tests/tap-targets.test.ts` asserts the hook and the tap class per surface.
2. **System:** `scripts/verify-mobile-layout.ts` under `npm run preview`, at 360 and 390, signed in
   and signed out.
3. **Regression:** a vendor with a logo renders an unchanged header; `lg`+ is untouched.
4. **Accessibility:** every tappable control in the review surfaces reaches 44×44 (WCAG SC 2.5.5).

## Before you start

- Read `plan.md`, then `build-notes.md`, in the spec folder.
- **Everything here needs `npm run preview`, never `npm run dev`** — `next dev` cannot load the WASM
  Prisma engine and silently renders an error state (`CLAUDE.md`, Database).
- **Run `npx vitest run` on its own,** never beside or straight after a build.
- Local hosts: Aheed is `http://localhost:8787`; SriMart is `http://srimart.localhost:8787`
  (**the port is part of the seeded host** — see `docs/developer-portal/local-dev-playbook.md`).
- The dev demo shopper is `demo-customer@example.com`. Its password is `DEMO_ACCOUNT_PASSWORD` in
  `.dev.vars` / `.env`. Run `npx tsx scripts/demo-accounts.ts add` first if the account is missing.
- **The script measures; it does not judge.** It prints JSON and exits 0 when pages loaded. Every
  threshold below is yours to compare. A row is a PASS only when the numbers satisfy it.
- **Never accept `documentScrollWidth === viewportWidth` as the overflow check.** An overflowing
  page widens the emulated viewport, so both read e.g. 366 at a requested 360 and a naive equality
  passes. Compare **each** against the width you requested.
- Baselines captured at Build live in the spec folder's `baseline/`. R18 needs them.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | System       | `npx tsx scripts/verify-mobile-layout.ts --base http://localhost:8787 --path products/<slug> --widths 360 --sign-in demo-customer@example.com:<password>` exits 0, and its JSON for 360 lists, under the `product-reviews` surface, a review submit button and five star labels. Re-run the identical command **without** `--sign-in`: the same surface instead shows the "Log in" link and no submit button, proving the flag is what changed the branch. |
| R2  | Static       | Read the header comment of `scripts/verify-mobile-layout.ts`: it documents `--sign-in <email>:<password>`, that the password is passed on the command line, and that it is for local `npm run preview` use. |
| R3  | Static       | Each of these prints `1`: `grep -c 'data-tap-surface="quick-view-body"' components/product/QuickViewDrawer.tsx`; `grep -c 'data-tap-surface="product-reviews"' "app/(storefront)/products/[slug]/page.tsx"`; `grep -c 'data-tap-surface="feedback-form"' components/storefront/FeedbackForm.tsx`. Read each file to confirm the hooked element actually wraps the controls named in R3 — a hook on the wrong node reports an empty surface, which R9/R11/R12 would then fail. |
| R4  | Static       | In `components/product/QuickViewDrawer.tsx`, read each of the four controls (Submit/Update review, Delete, Try again, the "Log in" link). Each carries a tap utility (`min-h-tap`/`min-w-tap`/`size-tap`) **and** an `lg:` reset on the same element. A control with a tap class but no `lg:` reset fails this row — it would change desktop. |
| R5  | Static       | In `components/product/StarRatingInput.tsx`, the per-star `<label>` carries a tap utility with an `lg:` reset. `git diff origin/staging -- components/product/StarRatingInput.tsx` shows **no change** to the `STAR_SIZES` map (`h-5 w-5` / `h-6 w-6` / `h-7 w-7`) — the icon keeps its size; only the label's hit area grew. |
| R6  | Static       | In `features/reviews/components/ReviewForm.tsx`, the submit button carries a tap utility with an `lg:` reset. |
| R7  | Unit         | `npx vitest run tests/tap-targets.test.ts` passes, and the file's `surfaces` map contains `components/product/QuickViewDrawer.tsx` → `quick-view-body`, `app/(storefront)/products/[slug]/page.tsx` → `product-reviews`, `components/storefront/FeedbackForm.tsx` → `feedback-form`, plus entries for `components/product/StarRatingInput.tsx` and `features/reviews/components/ReviewForm.tsx`. |
| R8  | Static       | `git diff origin/staging -- app components features design-system` — every added class is either behind a sub-`lg` breakpoint or paired with an `lg:` reset on the same element. No bare size change that applies at all widths. |
| R9  | System       | Under `npm run preview`, against a **category page that renders at least one product card** (`--open-quick-view` clicks the first card's "Quick view" button and fails loudly if there is none — a product detail page has no cards and will not work here): `npx tsx scripts/verify-mobile-layout.ts --base http://localhost:8787 --path categories/<slug> --widths 360,390 --open-quick-view --sign-in demo-customer@example.com:<password>`. In both printed objects, **every** entry under `quick-view-body` has `width >= 44` and `height >= 44`. List the entries; an empty list fails this row (the surface never rendered — see the known trap of a line printed for a page that never loaded). |
| R10 | System       | Same two objects as R9: at 360, `viewportWidth === 360` **and** `documentScrollWidth === 360`; at 390, both `=== 390`. |
| R11 | System       | Under `npm run preview`: `npx tsx scripts/verify-mobile-layout.ts --base http://localhost:8787 --path products/<slug> --widths 360,390 --sign-in demo-customer@example.com:<password>` (no `--open-quick-view`, so the page's own review form is measured). Under `product-reviews`, the entry set is non-empty and **every** entry reports `width >= 44` and `height >= 44`, including the submit button and five star labels (each star is a radio inside a `<label>`, so the script reports the label's box with `hitArea: "label"` — that is the box to compare). `viewportWidth` and `documentScrollWidth` each equal the requested width at both widths. |
| R12 | System       | Under `npm run preview` — `/feedback` redirects a signed-out visitor, so `--sign-in` is required: `npx tsx scripts/verify-mobile-layout.ts --base http://localhost:8787 --path feedback --widths 360,390 --sign-in demo-customer@example.com:<password>`. Under `feedback-form`, every entry reports `width >= 44` and `height >= 44`, including five star labels; `viewportWidth` and `documentScrollWidth` each equal the requested width at both widths. |
| R13 | System       | Under `npm run preview`, the R9 command **without** `--sign-in`: the `quick-view-body` entries include the "Log in" link at `width >= 44` and `height >= 44`, and `viewportWidth`/`documentScrollWidth` each equal the requested width at both widths. |
| R14 | Static       | Read `components/layout/Header.tsx`: the logo/wordmark container (today `flex items-center gap-3 shrink-0 h-10 overflow-clip`) and the inner name/locality block both permit shrinking, and the two name spans and the locality `<p>` truncate. |
| R15 | Static       | In the same file, neither name span nor the locality carries a class that hides it at any breakpoint (no `hidden sm:block` or equivalent on them). The name renders at 360 as well as at 1280 — confirm in R16's run that the name text is present in the DOM at 360. |
| R16 | System       | Under `npm run preview`, against a vendor whose `logoStorageKey` is null — dev SriMart: `npx tsx scripts/verify-mobile-layout.ts --base http://srimart.localhost:8787 --path / --widths 360,390` (use `MSYS_NO_PATHCONV=1` for the bare `/` path in Git Bash). At 360 both `viewportWidth` and `documentScrollWidth` are `360`; at 390 both are `390`. |
| R17 | System       | On the **dev** database only, temporarily clear Aheed's logo so a long name renders as a wordmark: set `Vendor.logoStorageKey` to `null` for vendor `a4ed0000-0000-4000-a000-000000000001` (name "Aheed Food Centre"), restart preview, re-run R16's command against `http://localhost:8787`. Both values still equal the requested width at 360. Inspect the rendered name: it is clipped with an ellipsis, and the header's height at 360 matches the `baseline/` height (the name did not wrap onto a new row). **Then restore the original `logoStorageKey` value and confirm the header renders the logo again.** Record the restore in `build-notes.md`. |
| R18 | System / Regression | With Aheed's logo restored, under `npm run preview`: `npx tsx scripts/verify-mobile-layout.ts --base http://localhost:8787 --path / --widths 360`. The logo image is present and no wordmark initial tile is rendered, and the header height equals the value in the spec folder's `baseline/` capture taken before this slice's changes. |
| R19 | Docs         | Read `specs/design-system.md`'s "Touch targets" section: Quick View's review form, Delete, Try again and Log in controls no longer appear under "Still outside the rule"; `quick-view-body` is listed with the other surfaces; it records that `StarRatingInput`'s `<label>` is the tap target while the icon keeps its size; and it records that a logo-less vendor's wordmark truncates rather than widening the page. `git diff origin/staging -- specs/design-system.md` shows `version` and `updated` bumped. |
| R20 | Docs build   | `npm run kms:validate` exits 0. `npm run kms:build-index && npm run kms:check-generated` exits 0. `npm run kms:assemble:internal`, then `cd kms/site-internal && npx next build --webpack`, exits 0. Read the real exit status, not a piped one. |
| R21 | Gate 4       | `git diff origin/staging -- CHANGELOG.md` shows an entry naming `#981` and `#982`. |
| R22 | Gate 3       | `npm run lint`, `npm run typecheck`, `npm run format:check` and `npm run build` each exit 0. Then run `npx vitest run` alone: it exits 0, its summary shows no failed files, and every test file in the repo is listed as run. **Known pre-existing flake:** `tests/add-to-cart-feedback.test.tsx` (`#983`) and the file-scanning source tests can time out under load; re-run any failure alone before treating it as a regression, and record which ones flaked. CI's `quality` job is green on the PR. |
