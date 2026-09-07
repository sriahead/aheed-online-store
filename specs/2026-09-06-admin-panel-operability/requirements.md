# P9.2 — Admin panel operability, category hierarchy and report drill-down (requirements)

Closes six findings from the 2026-09-06 Admin/Staff portal Discover pass: `#632` (the pass itself,
stranded on a conflicted branch), `#627` (category list interleaves subcategories under unrelated
parents), `#630` (product form's flat category picker), `#628` (report tiles count a status set the
order list cannot express), `#631` (Aheed brand hexes hardcoded in shared panel pages) and `#634`
(delivery fee, free-delivery threshold and minimum order editable nowhere). Builds on `#633`'s
operator documentation and `#612`'s delivery-areas repository/service/action shape. Written for a
validator with no memory of the session that built it.

## `#632` — land the Discover pass

R1. `docs/research/discovery-log.md` on this branch contains a section heading matching
    `2026-09-06` for the Admin/Staff portal Discover pass, and the file is at least 300 lines longer
    than the copy at `origin/staging` as of merge-base.

R2. `docs/research/discovery-log.md`'s findings for `#625`, `#626` and `#629` each carry a
    resolution line naming `#633` as what closed them; its findings for `#627`, `#628`, `#630` and
    `#631` each carry a resolution line naming this slice's issue set as what closes them. No
    finding in the 2026-09-06 pass is left presenting an already-closed defect as open.

R3. `npm run kms:check-generated` exits 0, and `npm run kms:validate` exits 0.

## `#627` — grouped category ordering

R4. `listCategoriesForAdmin` (`lib/repositories/categories.ts`) returns rows in an order where every
    row with `parentId === null` is immediately followed by all rows whose `parentId` equals that
    row's `id`, contiguously and with no unrelated row between them.

R5. Within that order, top-level rows are sorted by `sortOrder` ascending then `name` ascending, and
    each parent's children are sorted by `sortOrder` ascending then `name` ascending.

R6. A category whose `parentId` names a row absent from the result set still appears exactly once in
    the returned array (no row is dropped by the regrouping).

R7. A unit test in `tests/` asserts R4, R5 and R6 against a fixture in which every top-level row has
    `sortOrder` 0, at least one department has no children, and at least one child has `sortOrder` 0
    — the exact shape `prisma/seed.ts` produces.

## `#630` — hierarchy-expressing product category picker

R8. `components/staff/ProductForm.tsx` renders its `categoryId` control with one `optgroup` element
    per top-level category, labelled with that category's name.

R9. Each `optgroup` contains, as its first option, an option whose `value` is that top-level
    category's own `id`, followed by one option per child of that category.

R10. Every category id present in the `AdminCategoryRow[]` passed to the form appears as exactly one
     selectable `option value` in the rendered markup — no category becomes unselectable.

R11. An existing product assigned directly to a top-level category renders with that department's
     own option selected.

## `#628` — report drill-down that reconciles

R12. `lib/staff-orders-query.ts` exports a sentinel constant for the revenue selection whose value is
     the string `revenue`, alongside the existing `STATUS_ALL`.

R13. `parseStaffOrdersQuery({ status: "revenue" })` returns `statuses` containing exactly the members
     of `REVENUE_STATUSES` from `lib/order-status.ts`, and `status === "revenue"`.

R14. `parseStaffOrdersQuery` continues to resolve an absent, blank or unrecognised status to
     `STAFF_QUEUE_STATUSES` with a normalised `status` of `""`, and `status: "all"` to
     `ORDER_STATUSES` — unchanged from before this slice.

R15. `/staff/reports` renders a per-status breakdown listing one row for each member of
     `REVENUE_STATUSES`, each showing that status's order count.

R16. The counts in R15's breakdown sum exactly to the value rendered in the Total Orders tile on the
     same page render.

R17. The Total Orders tile on `/staff/reports` is a link whose href is `/staff/orders?status=revenue`.

R18. Each R15 breakdown row links to `/staff/orders?status=` followed by that row's single status
     value.

R19. `/staff/orders?status=revenue` returns HTTP 200 for an authorised staff session and lists only
     orders whose status is a member of `REVENUE_STATUSES`.

R20. The per-status counts backing R15 are produced by a single Prisma `groupBy` call filtered by the
     same `vendorId` and `REVENUE_STATUSES` predicate `getFinancialsForStaff` uses — not by N
     separate count queries and not by a widened status set.

## `#631` — vendor-aware panel colours

R21. None of the following contain a Tailwind arbitrary-value colour literal (a `#` hex colour
     inside square brackets): `app/(admin)/staff/inventory/InventoryTable.tsx`,
     `app/(admin)/staff/errors/page.tsx`, `app/(admin)/staff/team/page.tsx`,
     `components/staff/team/AssignRoleForm.tsx`. The last two are not named in `#631`; they were
     found by this spec's adversarial pass and are in scope because R23's guard test covers them.

R22. The replacements resolve through `--color-action`, `--color-action-tint`,
     `--color-surface-muted` and `--color-danger`, all four of which `lib/vendor-theme.ts`'s
     `brandStyle()` re-declares per vendor.

R22b. `/staff/inventory`'s rendered HTML contains no `#2e7d32`, `#e8f5e9`, `#c8e6c9` or `#f5f5f0`
     anywhere in its own markup, and the `app/(admin)/layout.tsx` wrapper enclosing it carries
     `brandStyle()`'s inline custom properties (`--color-action`, `--color-surface-muted`) for the
     vendor the request resolved to. The colours therefore come from the layout's per-vendor style
     rather than from the page.

R22c. The second-vendor render is attempted against SriMart and its outcome recorded either way. If
     Better Auth's origin validation refuses a SriMart-scoped staff session locally — the documented
     outcome at `#454`, where replaying a session under a spoofed `Host` was correctly rejected and
     a fresh sign-in under a made-up local alias was refused by `trustedOrigins` — then R22c is
     recorded as **not exercised, with that reason stated**, and R22b alone carries the requirement.
     It is not marked passed on the strength of R22b.

R23. A test in `tests/` fails if any `.tsx` file under `app/(admin)/` or `components/staff/`
     contains a Tailwind arbitrary-value hex colour, and that test passes on this branch. Its scope
     deliberately excludes `components/product/`, where `#512` tracks the same class on the
     storefront side.

## `#634` — admin-editable delivery rules

R24. `/staff/storefront` renders three form inputs, for delivery fee, free-delivery threshold and
     minimum order value, each pre-filled from the current `VendorConfig` row in pounds.

R25. Submitting the form with valid values persists `deliveryFeePence`, `freeDeliveryThresholdPence`
     and `minimumOrderPence` to that vendor's `VendorConfig` row as integer pence.

R26. Submitting a negative, non-numeric, or more-than-two-decimal-place value for any of the three
     fields returns a visible error message on the page, and writes no change to any of the three
     columns.

R27. Submitting a blank free-delivery threshold persists `freeDeliveryThresholdPence` as SQL NULL
     (free delivery never offered), and this is distinguishable from a submitted value of `0`.

R28. The write is vendor-scoped: the action resolves the vendor from the session, and a store admin
     of one vendor cannot write another vendor's `VendorConfig` row.

R29. `docs/store-admin-guide/admin-tabs-guide.md`'s Storefront section documents the delivery-rules
     capability, and `tests/operator-doc-coverage.test.ts` passes with that section's seven labelled
     parts and `Who can access` line intact.

## Incidental fix

R30. `app/(admin)/staff/storefront/page.tsx`'s `requireVendorRole` refusal branch renders
     `PanelRefusal` rather than returning `null`, matching every other `/staff/*` page, and
     redirects to `/login` on a 401.

## Gates

R31. `CHANGELOG.md` updated on this branch (Gate 4).

R32. `npm run lint`, `npm run typecheck`, `npx vitest run` and `npm run format:check` all exit 0
     after this slice, with the vitest summary reporting no fewer than 102 test files (the
     `CLAUDE.md` baseline at `#633`, plus this slice's additions).
