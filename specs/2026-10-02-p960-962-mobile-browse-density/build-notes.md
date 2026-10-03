# #960, #961, #962 — Mobile browse density (build notes)

Build commit `32d50f3` on `feature/960-962-mobile-browse-density`, cut from `staging` at `6f9c96a`.
Spec commit `02b2ffb`. The spec was amended in two places during the build (see Deviations). The
amended `requirements.md`/`validation.md` are what validation checks against.

## What changed and why

**#960: header split** (`components/layout/Header.tsx`)

- The component now returns a fragment of three siblings:
  1. `<div data-header-banner>` (the trust bar);
  2. `<header className="sticky top-0 z-40 …">`, holding the logo/nav row and, below `sm`, the
     search form;
  3. `<div data-header-location className="… sm:hidden">`, holding `LocationControl`.
- They must be siblings: a sticky element sticks only within its parent's box. Their parent is the
  layout's full-height flex column (`StorefrontChrome`, and the admin layout for the portal).
- On phones, search now sits above the location control.
- From `sm`, `LocationControl` and search are still inline in the sticky row, unchanged.
- The portal header renders the same way, minus search and location (both `!isPortal`).
- #329's logo `aspect-9/5` and `h-10 overflow-clip` container are untouched.
- **Measured on preview, both vendors:** sticky header 119px at 360/390 (production baseline 234),
  69px at 768, 65px at 1100/1280. The banner scrolls fully off (`bannerBottomAfterScroll` −529 or
  lower).

**#961: touch targets**

- `--spacing-tap: 2.75rem` goes in `tokens.css`'s `@theme`. The built CSS contains it, and `h-tap`,
  `size-tap` etc. compile.
- Below `lg`:
  - `AddToCartButton` card variant: Add `h-tap`, pre-add minus/plus `size-tap`, and the
    out-of-stock button `min-h-tap` for row consistency.
  - `CartQuantityStepper`: buttons `size-tap`, and the gap reduced to `gap-1` (`lg:gap-1.5`) so it
    fits a 360px card.
  - The `ProductCard` mobile Quick View.
  - Header `/categories`, `/shop-your-list`, `/login` and `/account` links:
    `min-h-tap min-w-tap justify-center`.
- From `lg`, every one of those reverts to its previous size.
- **The pre-add quantity picker is `hidden sm:flex`.** Below `sm` the card shows Add alone.
- **Measured:**

  | Width | Card Add | Quick View | Header links | Pre-add picker | In-cart stepper |
  |---|---|---|---|---|---|
  | 360 | 126×44 | 46×44 | 44×44 | hidden | 44×44 |
  | 390 | 141×44 | 46×44 | 44×44 | hidden | 44×44 |
  | 768 | 84×44 | not shown (desktop overlay) | ≥79×44 | 44×44 | — |
  | 1280 | 122×32 | — | 34px tall | 28×30 | 24×24 |

  At 1280 the pre-add picker is 28×30, unchanged from before the slice. At 360 the in-cart stepper
  is 126px wide and ends at x=155, inside the card's right edge at x=172.

**#962: grid and presets**

- `lib/product-grid-density.ts` is plain, DB-free and tested. It holds the presets, the literal
  class strings (exactly `plan.md`'s table), labels and descriptions, `parseProductGridDensity`,
  and the form state.
- `components/product/ProductGrid.tsx` renders a `div` or `ul` with `data-product-grid`.
- Category, search and bundles render through it, each reading `getCurrentVendorProfile()`
  (request-memoised).
- Bundles wraps the grid in a `div className="mt-6"`, because `ProductGrid` takes no extra classes.
- **Data:**
  - `enum ProductGridDensity`, plus `VendorConfig.productGridDensity @default(STANDARD)`.
  - Migration `20261002120000_p962_product_grid_density` is additive only. It is **applied to the
    dev Neon project** (`ep-dry-morning`) via `prisma migrate deploy`.
  - `VendorProfile.productGridDensity` falls back to `STANDARD`.
  - `VendorStorefrontConfigInput.productGridDensity` is optional and written by direct assignment
    (undefined means no change).
- **Write path:** `updateProductGridDensity` in `features/admin/storefront.ts` requires ADMIN, takes
  the session vendor, parses, and writes only that field. It revalidates `/staff/storefront` and
  `/` (layout).
- **Staff UI:** a fifth sibling `<form>` in `StorefrontConfigForm` ("Product grid layout"), a radio
  group with `htmlFor`/`id` labels and `aria-describedby` descriptions.
- **Measured on preview, SriMart `sri-electronics`,** with the preset set directly in the dev DB:

  | Preset | 390 | 768 | 1100 | 1280 |
  |---|---|---|---|---|
  | SPACIOUS | 1 | 2 | 2 | 4 |
  | COMPACT | 2 | 2 | 4 | 6 |
  | STANDARD | 2 | 2 | 4 | 4 |

  Aheed stayed 2,2,4,4 throughout. SriMart was left on STANDARD. **The staff form itself was NOT
  driven in a browser during the build.** R17/R18/R20 must do that through the real control.

**Measuring instrument:** `scripts/verify-mobile-layout.ts`

- Headless Chrome over CDP, with the JSON output keys exactly as R1 lists, plus
  `scrollYAfterScroll`.
- It has no thresholds.
- A 30s timeout per DevTools call and an overall watchdog (60s + 60s per width).
- It refuses a Git-Bash-mangled drive path (exit 2) and fails on Chrome's error page (exit 1).

**Docs:**

- `specs/design-system.md` 1.14.0: "Touch targets" and "Product grids" sections.
- `docs/store-admin-guide/admin-tabs-guide.md` 2.7.0: the Product grid layout paragraph plus a
  "What you can do" sentence.
- `docs/developer-portal/local-dev-playbook.md` 1.14.0: measuring at phone widths, and its traps.
- `ARTIFACT_INDEX.md` and the runbook `docs.ts` regenerated.

**Tests added:**

- `tests/product-grid-density.test.ts`
- `tests/product-grid-usage.test.ts`
- `tests/product-grid-density-action.test.ts` (success and parse-error paths)
- the refusal case in `tests/admin-only-authorization.test.ts`
- two cases in `tests/vendor-profile.test.ts`

**Gates run locally:**

- lint, typecheck and format:check: clean.
- `npx vitest run`, alone: 197 files, 2592 tests passed.
- `npm run build`: exit 0. The CSS holds all six R13 selectors and `spacing-tap`.
- `kms:validate`: 0 failing.
- `kms:assemble:internal`, then the `kms/site-internal` build: OK.
- `kms:check-generated`: current.

## Decisions taken during the build

- **Migration generated with `prisma migrate diff`, not `migrate dev --create-only`.** It ran
  schema → schema against the base branch's `schema.prisma`. `migrate dev --create-only` demanded a
  reset of the dev database (checksum drift on `20260820200500_p8_image_needs_review`), and that was
  refused. This is the procedure `specs/architecture.md` §3.1 already prescribes. The SQL was read
  before applying: `CREATE TYPE` and `ADD COLUMN … NOT NULL DEFAULT 'STANDARD'`, with no `DROP`.
- **`prisma format` realigned every column in `VendorConfig`**, because the new type name is
  longer. That accounts for most of `schema.prisma`'s diff lines. Only one field and one enum are
  new.
- **Quick View:** the *button* is `size-tap`, anchored `top-0 right-0`. The visible 28px circle is
  an inner `span`, so the circle lands exactly where `top-2 right-2` put it. Press feedback moved to
  `group-active/qv:scale-95` with a `motion-reduce:` opt-out, per design-system Motion rule 4.
- **Pre-add picker height:** the 44px goes on the buttons (`size-tap`), not on the bordered
  wrapper. A first attempt with `h-tap` on the wrapper gave 44×42 buttons, because the 1px border
  ate 2px. The wrapper keeps `lg:h-8` and the buttons `lg:h-full`.
- **Header links** use `min-h-tap min-w-tap` rather than `size-tap`, so text labels from `sm` can
  still widen them. `lg:min-h-0 lg:min-w-0` restores the old size.
- **`ProductGridDensity` is a plain string union in `lib/`**, not imported from `@prisma/client`.
  This keeps the module DB-free; ESLint restricts `@prisma/client` imports to `lib/repositories/*`.
  It is structurally identical to the Prisma enum.
- **Preset copy** names devices, not trades ("phones", "tablets", "laptops", "widest screens").
- **The radio group uses `htmlFor`/`id`, not wrapping labels.** `jsx-a11y/label-has-associated-control`
  could not see text three levels deep.

## Deviations from the spec

Two amendments to `requirements.md` and `validation.md`, made during the build and marked inline
with _Amended at Build_:

1. **The category-page definition went from "at least 3" to "at least 6 product cards".** The
   definition now also names `sri-electronics` (6 cards) for SriMart. R18 asserts 6 columns at
   1280, which needs 6 cards. SriMart's other top-level category, `sri-home`, has 5, so the old
   wording let a validator fail R18 for want of products.
2. **R8 now names the stepper's decrease button correctly.** At quantity 1 it is
   `Remove <product> from cart`, not `Decrease quantity of …`. The spec named only the latter, so R8
   as written could never match.

Validation-step additions: Git Bash `--path` without a leading slash, and the
`srimart.localhost` / `Host` header note. Neither changes a requirement.

No requirement was dropped or loosened in threshold.

## Known-shaky areas

- **The staff form was never submitted during the build** (R17, R18, R20). The action is
  unit-tested (refusal, parse errors, success writes only the field), and the render path was
  proven by setting the column directly in the dev DB. Submitting through `/staff/storefront`
  signed in as `demo-srimart-admin@example.com` is the real proof, including the
  "re-saving another form leaves it alone" check.
- **Revalidation:** pages are dynamic (`force-dynamic` / per-request profile), and the direct-DB
  flip showed new columns on the next load. Whether `revalidatePath` matters at all here is
  untested. If R17 shows a stale layout right after a save, look there.
- **The 360px in-cart stepper has 6px to spare.** A product name doesn't affect it, but a 3-digit
  quantity readout widens it. Not measured.
- **Phone header height with a signed-in staff/admin user** (the `ViewSwitcher` adds to the nav
  row) was not measured. The script runs signed out. A signed-in shopper adds only the `/account`
  avatar link.
- **The `banner` landmark now excludes the trust bar and the phone location row.** Intentional, as
  they are outside the sticky `<header>`, but no a11y test asserts the landmark's contents.
- **`scripts/verify-mobile-layout.ts` is Windows-tested only.** Its Chrome discovery includes
  macOS/Linux paths, but only `C:/Program Files/Google/Chrome` was exercised.
- **The dev database already has the migration applied.** A validator who runs
  `prisma migrate deploy` (validation setup step 2) will see "No pending migrations", which is
  expected, not a failure. Staging and production get it through CI on deploy, build before
  migrate.
