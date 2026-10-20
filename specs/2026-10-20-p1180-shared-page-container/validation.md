# Shared page container and a three-step width scale (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

This slice is a UI geometry change across every page, so the weight sits in **Unit** (the guard
test proving the mapping, statically, for all 60 pages at once) and **System/E2E** (rendered
geometry, which is the only thing that can prove alignment). There is no new business logic, no
database access and no new dependency, so integration, performance and security testing add nothing
here beyond the existing suite's regression cover.

**`npm run preview`, never `npm run dev`** — the staff pages read the session and the vendor
profile through Prisma, and `next dev` cannot load `@prisma/client/wasm` (see `CLAUDE.md`).

**Check SriMart, not just Aheed.** `brandStyle()` injects inline custom properties and several
layout checks false-positive against Aheed alone (`specs/design-system.md`). R13 is explicitly
two-vendor.

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `test -f components/layout/PageContainer.tsx`, then `grep -E "export (type )?(PageContainer\|PageWidth)" components/layout/PageContainer.tsx` shows both named exports and `grep -c "export default" components/layout/PageContainer.tsx` returns `0`. The `PageWidth` union is exactly `"wide" \| "standard" \| "narrow"`. |
| R2  | Unit | `npx vitest run tests/page-container.test.ts` — a rendering case per variant asserts the emitted `className` is `mx-auto w-full px-4` + one of `max-w-7xl`/`max-w-5xl`/`max-w-2xl` + one of `py-8`/`py-6`, and that the element is `<main>`. |
| R3  | Unit | Append `<PageContainer>x</PageContainer>` (no `width`) to a scratch `.tsx` under `app/`, run `npx tsc --noEmit`, and confirm it reports `Property 'width' is missing`. Delete the scratch file; re-run `npx tsc --noEmit` and confirm exit 0. |
| R4  | Unit | In the same vitest file, a case passing `className="text-primary"` asserts the output ends with `text-primary` and still contains `px-4`. `npx tsc --noEmit` rejects any prop other than `width`, `padY`, `className`, `children`. |
| R5  | Unit | `grep -c '"use server"' components/layout/PageContainer.tsx` returns `0`; `grep -cE "use(State\|Effect\|Ref\|Callback\|Memo)" components/layout/PageContainer.tsx` returns `0`. The build (R18) proves it renders from a server component; `/staff` rendering proves it renders under a client boundary. |
| R6  | Unit | `npx vitest run tests/page-container.test.ts` — the test reads every `page.tsx` under `app/(admin)`, parses the `PageContainer` `width` literal, and compares it to the R6 table checked into the test as its expected map. A page missing from the map, or carrying a different width, fails. |
| R7  | Unit | Same test, same mechanism, for `app/(storefront)` and `app/(landing)` against the R7 table, asserting both `width` and `padY`. |
| R8  | Unit | `grep -l "max-w-sm" "app/(storefront)/login/page.tsx" "app/(storefront)/register/page.tsx" "app/(storefront)/forgot-password/page.tsx" "app/(storefront)/reset-password/page.tsx"` lists all four. |
| R9  | E2E | With `npm run preview` up: `curl -s http://localhost:8787/help \| grep -c "<main"` returns `1`. |
| R10 | E2E | `curl -s http://localhost:8787/products/<a-real-slug>` — the outermost `<main>` carries `px-4` and does **not** carry `grid`; a descendant carries `grid gap-6 sm:grid-cols-2`. Take the slug from `/api/products` or the seeded catalogue, not a guess. |
| R11 | Unit | `npx vitest run tests/page-container.test.ts` exits 0. Then prove the guard bites, both ways: (a) temporarily add `<div className="mx-auto max-w-3xl">` as the top-level element of one page and confirm the test **fails**; (b) temporarily set a `PageContainer className="max-w-3xl"` and confirm it **fails**. Revert both and confirm it passes again. A guard test never checked against a deliberate break is not evidence. |
| R12 | Unit | `npx tsx scripts/verify-mobile-layout.ts --base http://localhost:8787 --path / --widths 1280 --desktop --measure header` prints a `measured.header` box and exits 0. Run it once **without** either flag and diff the JSON against the same command on `origin/staging` to confirm default output is byte-identical — this script is used by other slices' validation and must not change underneath them. |
| R13 | E2E | With `npm run preview` up: `npx tsx scripts/verify-mobile-layout.ts --base http://localhost:8787 --path /staff --widths 1280 --desktop --sign-in <staff-email>:<password> --measure 'nav[aria-label="Store admin"] > div' --measure main`. Confirm `Math.abs(measured['nav[aria-label="Store admin"] > div'].left - measured.main.left) <= 1`. Print both `left` values, not the boolean. |
| R14 | E2E | Same script, `--widths 1280 --desktop`, once per path (`/staff`, `/staff/orders`, `/`, `/categories/fruit-veg`, `/products/<slug>`) against **both** `--base` hosts. Confirm `documentScrollWidth <= viewportWidth` in all ten objects, and **report both numbers** for each — a passing comparison says nothing about how close it ran. Take the product slug from the seeded catalogue (`prisma/seed.ts`), not a guess. |
| R15 | E2E | On `origin/staging` first, record `getComputedStyle(document.querySelector('[data-product-grid]')).gridTemplateColumns.split(' ').length` on `/categories/fruit-veg` at 1280px, expanded and with the sidebar collapsed (`#1173` sets `data-filters-collapsed` on `<html>`). Repeat on the slice branch; both numbers must be unchanged. Capture the "before" by actually checking out `origin/staging`, not from memory or from this document. |
| R16 | Unit | `grep -n "PageContainer" specs/design-system.md` shows the scale, the three widths and the shared gutter; `npm run kms:validate` exits 0. |
| R17 | Unit | `grep -n "PageContainer" docs/developer-portal/app-conventions.md CLAUDE.md` returns a hit in each. `npm run kms:validate` and `npm run kms:check-generated` exit 0 (`check-generated` compares against `git show HEAD:<path>`, so commit before trusting it — `#1177`). |
| R18 | Regression | `git diff origin/staging -- CHANGELOG.md` is non-empty and the entry sits under `[Unreleased]`. |
| R19 | Regression | `npm run lint`, `npx tsc --noEmit`, `npm run format:check`, `npm run build` each exit 0, and `npx vitest run` is green — **run alone**, not beside the build (`CLAUDE.md`, Windows shell). On a Windows checkout verify any `format:check` complaint against `git show HEAD:<file>` before reformatting; `core.autocrlf` produces false positives. |

## Known false-pass traps

- **`scrollWidth <= clientWidth` does not prove a bar fits on one line** — `flex-wrap` removes
  overflow by wrapping. That check cost a full validation pass in `#1177`. R12 measures a left
  edge, not an overflow, for exactly this reason.
- **A hand-rolled CDP driver.** `#1177` wrote one and it produced a **false pass** — it reported a
  nav link as working when no mouse click had ever navigated. Use
  `scripts/verify-mobile-layout.ts`, which prints numbers and renders no verdict, and extend it if
  it cannot measure something. Do not write a one-off driver for this slice.
- **`mobile: true` at a desktop width.** The script hardcodes it today; a 1280px measurement taken
  without `--desktop` is a tablet-emulated layout, not the layout a desktop shopper sees.
- **Aheed-only checks.** Several layout assertions pass against Aheed and fail against SriMart.
- **A guard test that was never seen to fail.** R11 requires a deliberate break in both directions.
