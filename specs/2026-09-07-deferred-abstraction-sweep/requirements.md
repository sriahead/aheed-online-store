# Deferred-abstraction sweep (requirements / acceptance criteria)

Closes **#662**, covering **#656**, **#398** (derivation half only), **#351**, **#75**, and the two
prerequisites each required: **#653** and **#639**. Builds the four abstractions this repo deferred
as speculative — a usable radius scale, a UI primitive layer, a named theme catalogue and a derived
unit price — now that each deferral's own stated precondition has been met, and fixes the product
card's invalid content model in the same edit that migrates it. `plan.md` carries the reasoning and
the deliberately-excluded list; this file is the checkable contract.

**Baseline, measured 2026-09-07 immediately before this slice, from two consecutive clean runs:**

- `npx vitest run` reports **109 test files, 1456 tests**, all passing.
- `brandStyle()` in `lib/vendor-theme.ts` returns exactly **20** CSS custom properties.
- `design-system/tokens/tokens.css` declares exactly three radius tokens (`--radius-sm: 0.5rem`,
  `--radius-md: 1rem`, `--radius-full: 9999px`) while **seven** distinct Tailwind radius steps are
  in active use across `app/`, `components/` and `features/`.
- `components/ui/` and `components/forms/` contain only `.gitkeep`.
- `lib/form-classes.ts` is imported by **11** files.

## A. Radius scale (#653)

**The ambiguity is removed by retiring the redundant utility, never by changing a value.** Today
`rounded-sm` and `rounded-lg` both compute to `0.5rem` (14 and 33 uses) and `rounded-md` and
`rounded-2xl` both to `1rem` (23 and 141 uses), because `tokens.css` overrides `sm` and `md` while
Tailwind's defaults for `lg` and `2xl` remain. Changing either token's value to break the tie would
restyle real screens; rewriting the 37 `rounded-sm`/`rounded-md` call sites to their already
identical-rendering twins removes the collision with a byte-identical result. R1–R3 are written to
force that direction, because the obvious reading of "fix the scale" is the one that restyles the
app a week before UAT.

R1. **This slice changes no rendered corner radius.** Every `rounded-*` utility still in use after
    it resolves to the same computed value it resolved to before it, and no `--radius-*` token
    changes value.

R2. No two **distinct** `rounded-*` utilities remaining in use across `app/`, `components/` and
    `features/` resolve to the same computed value. Specifically, `rounded-sm` and `rounded-md` no
    longer appear in any `.tsx` file under those directories, their uses having been rewritten to
    the identical-rendering `rounded-lg` and `rounded-2xl`.

R3. `design-system/tokens/tokens.css` declares a `--radius-*` token for every Tailwind
    border-radius step still in use, so no radius utility in use depends on an un-overridden
    Tailwind default, and it declares no token for a step that is no longer used.

R4. A new test file `tests/radius-scale.test.ts` exists and fails if any two `rounded-*` utilities
    used under `app/`, `components/` or `features/` resolve to the same value, resolving each
    against `design-system/tokens/tokens.css` first and Tailwind's default scale otherwise.

R5. `specs/design-system.md`'s Shape table names exactly the set of `--radius-*` tokens declared in
    `design-system/tokens/tokens.css` — no token appears in one and is absent from the other.

## B. UI primitive layer (#656) and the product card's content model (#351)

R6. `components/ui/` contains `Card.tsx`, `Button.tsx` and `FormField.tsx`. None of the three
    contains a `"use client"` directive as its first statement.

R7. `components/ui/Button.tsx` and `components/ui/FormField.tsx` import their class strings from
    `lib/form-classes.ts` rather than re-declaring them: neither file contains a string literal
    duplicating the value of `inputClass`, `labelClass`, `errorInputClass` or `buttonClass`.

R8. `components/ui/FormField.tsx`, when given an error for its field, emits `aria-invalid` **and**
    `aria-describedby` on the control in the same render — the error styling cannot be obtained
    without both attributes.

R9. Each of `Card`, `Button` and `FormField` has **at least three call sites** outside
    `components/ui/`, and `Card` is one of the components `components/product/ProductCard.tsx`
    renders. (A primitive with no adopters proves nothing; a repo-wide migration is out of scope
    per `plan.md`.)

R10. No `.tsx` file under `components/ui/` contains a Tailwind arbitrary hex class (`[#` followed by
     3 to 8 hex digits and `]`), and none contains a Tailwind alpha modifier on a themed foreground
     utility (`text-`, `fill-`, `stroke-` or `decoration-` prefixed with `primary`, `action`,
     `accent` or `danger`, followed by `/` and digits).

R11. In `components/product/ProductCard.tsx`'s rendered output, no `button` element is a DOM
     descendant of any `a` element.

R12. A test renders `ProductCard` and fails if any `button` is a descendant of an `a`, so the defect
     cannot return silently.

R13. `components/cart/AddToCartButton.tsx` and `components/cart/CartQuantityStepper.tsx` contain no
     call to `stopPropagation`.

R14. `components/product/ProductCard.tsx` still contains the literal strings
     `group-hover:scale-105` and `motion-reduce:group-hover:scale-100`
     (`tests/motion-reduce-coverage.test.ts` hard-pins both to this exact file path).

R15. `components/bundle/BundleCard.tsx` is not modified by this slice.

R16. The `.skew-card`, `.skew-card-inner`, `.skew-card-badge`, `.skew-card-price` and
     `.skew-card:hover` rules in `app/globals.css`, and the `prefers-reduced-motion` block naming
     them, are not modified by this slice.

## C. Branding form (#639) and theme catalogue (#75)

R17. `components/staff/StorefrontConfigForm.tsx` renders a labelled input for **all eight**
     `VendorBranding` brand primitives: `brandGreenDark`, `brandGreen`, `brandOrange`, `brandRed`,
     `brandCream`, `brandGreenTint`, `brandOrangeTint`, `brandRedTint`.

R18. That form's submit path reads all eight of those names from `FormData` and includes each in the
     object passed to `updateStorefrontConfig`.

R19. Neither `initialConfig` nor `initialBranding` in that file is typed as `any`; both are typed
     against the corresponding Prisma model row type.

R20. `prisma/schema.prisma` declares a `Theme` model holding a display name and the eight brand
     primitives as explicit `String` columns, and no `Json` column.

R21. **`Theme` is a platform-level catalogue and is deliberately NOT vendor-scoped** — it carries no
     `vendorId` column and no `Vendor` relation. This is a stated exception to ADR-004 decision 2's
     row-level tenancy, because a theme is curated for reuse across vendors and holds no tenant
     data; R37 records it in the ADR.

R22. `prisma/schema.prisma`'s `VendorBranding` gains a nullable `themeId` foreign key referencing
     `Theme` with `onDelete: SetNull`.

R23. **Selecting a theme copies its eight values onto the vendor's `VendorBranding` row.**
     `lib/vendor-theme.ts`'s `brandStyle()` continues to read the vendor's own eight
     `VendorBranding` columns and performs no join to `Theme`, so a vendor may edit any colour
     afterwards and diverge from the theme freely.

R24. A migration directory implementing R20 and R22 exists under `prisma/migrations/`, and its
     `migration.sql` contains no `DROP INDEX` statement naming any index created by
     `20260820143949_p7_5de_order_search_trigram`.

R25. `prisma/seed.ts` creates at least two named `Theme` rows, and seeding is idempotent — running
     the seed twice leaves the same number of `Theme` rows.

R26. `/staff/storefront` renders a control listing the seeded themes by name, and submitting it
     writes that theme's eight primitive values onto the vendor's `VendorBranding` row.

R27. `brandStyle()` still returns exactly the same 20 CSS custom property keys as before this slice,
     and both seeded vendors still render distinct palettes: for Aheed and for SriMart the root
     element's inline `style` attribute contains that vendor's own `--color-primary`, and the two
     values differ.

## D. Unit pricing (#398, derivation half)

R28. `prisma/schema.prisma` declares an enum for the net-content unit of measure whose members are
     all uppercase, matching the existing enum convention in that file.

R29. `Product` gains a nullable net-content amount column and a nullable net-content
     unit-of-measure column typed as that enum.

R30. `Product` gains a nullable integer column holding the derived price per base unit in whole
     pence, and `prisma/schema.prisma` declares an `@@index` whose trailing field is that column.

R31. The derived price-per-base-unit column is written by the product create path and the product
     update path, so it cannot be supplied by a caller and left stale.

R32. A pure, unit-tested function derives the **displayed** unit price from `basePrice` and the net
     content directly, not from the stored column of R30 — so a rounding artefact in the stored sort
     key can never reach a customer-facing price.

R33. `components/staff/ProductForm.tsx` renders inputs for the two net-content fields, both field
     names appear in `lib/catalogue-form.ts`'s `PRODUCT_FIELDS` array, and submitting the form with
     a non-numeric net-content amount re-renders with a field-named error rather than throwing.

R34. `Product.unitLabel` remains a non-nullable column and remains editable in `ProductForm`. Where
     a product has net content set, the product card and product detail page display the derived
     unit price; where it does not, they display `unitLabel` unchanged.

R35. `OrderItem` in `prisma/schema.prisma` is not modified by this slice.

R36. A migration directory implementing R28, R29 and R30 exists under `prisma/migrations/`, and its
     `migration.sql` contains no `DROP INDEX` statement naming any index created by
     `20260820143949_p7_5de_order_search_trigram`.

R37. A repository read path returns products ordered by the derived price-per-base-unit column,
     demonstrated by a real query against a live database returning rows in that order.

## E. Persistent docs, operator docs and gates

R38. `specs/design-system.md`'s "What's deliberately not here yet" section no longer lists
     `components/` as unbuilt, its Shape table satisfies R5, and its front-matter `version` is
     greater than `1.11.0`.

R39. `specs/decisions/ADR-004-multi-tenancy.md` carries a dated implementation note recording both
     that a vendor's brand primitives may now be seeded from a `Theme` row and that `Theme` is
     deliberately not vendor-scoped (R21); its front-matter `version` is greater than its
     pre-slice value.

R40. The operator-guide section covering `/staff/storefront` documents that all eight brand colours
     are editable and that a theme may be selected, and the section covering `/staff/products`
     documents the net-content fields. **Every capability sentence added must correspond to a
     control that exists on that page** — the defect class of #629 and #634, which no test catches.

R41. `npx vitest run tests/operator-doc-coverage.test.ts` and
     `npx vitest run tests/staff-nav-parity.test.ts` both exit 0 (no route was added, so both must
     remain green).

R42. `CLAUDE.md`'s recorded vitest baseline is updated to this slice's measured file and test
     counts, in the Build commit rather than left for `/document`.

R43. `npm run kms:validate` exits 0 and `npm run kms:check-generated` reports every generated
     artefact current.

R44. `CHANGELOG.md` updated (Gate 4).

R45. `lint`, `typecheck`, `test` and `format:check` all remain green after this slice, and
     `npx vitest run` reports a test-file and test count no lower than the 109 / 1456 baseline.
