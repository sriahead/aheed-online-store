# P9.2 — Admin panel operability, category hierarchy and report drill-down (build notes)

Written at the end of Build, **before** the Clear. The validating context is fresh and has only the
spec, the artifact, and this file.

Spec commit `91bfb7c`; Discover-pass recovery `1547efc`; implementation `e3c9642`.

## What changed and why

**`#632` — the stranded Discover pass.** Branch `docs/discover-admin-staff-portal-ux` held one
commit (`d21eaaa`) that went `CONFLICTING` when `#633` merged. Recovered by cherry-picking onto a
fresh branch off `origin/staging`. `docs/research/discovery-log.md` — the only file with real
content — merged **cleanly**; the three conflicts were `CHANGELOG.md` (both sides purely additive,
so both kept) and the two **generated** artefacts, which were resolved by taking `staging`'s copy
and re-running `npm run kms:build-index` rather than hand-merging. All seven findings then gained an
`**Update 2026-09-06 (post-#633):**` line following the file's own existing reconciliation
convention, because three of them (`#625`, `#626`, `#629`) were already closed by `#633` and four
are closed by this slice — a log presenting closed defects as open is precisely the stale record
this repo's `/orient` keeps paying for. Front-matter `1.3.0` → `1.4.0`.

**`#627` — grouping in the repository.** `groupCategoryRowsByParent` is a new **pure, exported**
function in `lib/repositories/categories.ts`, applied to the mapped rows before return. It lives in
the repository rather than the page because `ProductForm`'s picker reads the same function, and
fixing the page alone would have left the picker interleaved — the issue says this explicitly and
it is the whole reason `#630` depends on it. The docstring on `listCategoriesForAdmin` claimed
"parents before children" while returning them globally interleaved; that sentence is now true.

**`#630` — `optgroup` picker.** `toCategoryOptionGroups` in `lib/catalogue-form.ts` reshapes the
already-ordered rows into groups. It is in `catalogue-form.ts`, not the repository module, because
`ProductForm` is a client component and importing a value from `lib/repositories/categories.ts`
would pull that module into the client bundle; `catalogue-form.ts` is already client-bundled via
`initialCatalogueState`. It defines its own minimal `CategoryOption` structural type for the same
reason.

**`#628` — revenue sentinel and breakdown tier.** `STATUS_REVENUE` in `lib/staff-orders-query.ts`
sits alongside `STATUS_ALL`; `getRevenueStatusBreakdown` in `lib/repositories/orders.ts` is one
`groupBy` over the identical `where` clause `getFinancialsForStaff` uses, exposed through
`getOrderRepository()` like its neighbour. `/staff/reports` gained an "Orders by status" table and
a linked Total Orders tile. `/staff/orders` gained a matching `Counted as revenue` option in its
status filter — without it, arriving from the tile would render "Awaiting action" as the selected
option over a revenue-filtered list, which is a worse lie than no link at all.

**`#631` — six literals, four files.** `text-action`, `bg-action-tint`, `bg-surface-muted` and
`text-danger` replace the hexes; all four tokens are re-declared per vendor by `brandStyle()`
(verified by reading `lib/vendor-theme.ts`'s returned object, not assumed).
`tests/panel-token-purity.test.ts` walks `app/(admin)/` and `components/staff/` from the filesystem.

**`#634` — delivery rules.** `lib/delivery-rules-form.ts` (pure, DB-free) plus a new
`updateDeliveryRules` action, a second `<form>` on `/staff/storefront` with its own
`useActionState`, and three now-optional fields on `VendorStorefrontConfigInput`. The admin guide's
Storefront section regains the capability sentence `#633` correctly removed as false (2.0.0 →
2.1.0).

**Incidental (declared in `plan.md`, R30).** `/staff/storefront`'s `return null` refusal became
`PanelRefusal` + a 401 redirect.

`CLAUDE.md` 1.20.0 → 1.21.0: the vitest baseline moved to **105 files / 1411 tests**, updated at
Build rather than left for `/document` because a Clear sits between the two.

## Decisions taken during the build

- **A dedicated money parser instead of reusing `parsePriceInput`.** The obvious reuse is wrong
  twice over: it collapses blank, non-numeric and negative into a single `undefined` (so a blank
  free-delivery threshold — a real, meaningful choice — is indistinguishable from a typo), and it
  rounds via `Math.round(value * 100)`, so `1.234` silently becomes `123`. `parsePoundsToPence`
  accepts `^\d+(\.\d{1,2})?$` and converts by integer arithmetic on the digit strings, so no binary
  float touches a money value. Rejected: widening `parsePriceInput`, which would change behaviour
  for every price filter that currently depends on the lenient shape.
- **`freeDeliveryThresholdPence` written via a conditional spread.** `undefined` (field absent,
  leave alone) and `null` (free delivery never offered) must stay distinguishable, and Prisma reads
  `undefined` in an `update` as "no change". `bannerNote`/`heroSubtitle` became optional on the
  input type for the same reason, which let the delivery action drop an
  `undefined as unknown as string | null` cast that briefly existed and was ugly enough to be worth
  removing rather than commenting.
- **A separate action and form for delivery rules** rather than extending `updateStorefrontConfig`.
  The branding form is fire-and-forget `useTransition` with no error surface; these three need a
  field-level error rendered against the offending input, because they reach money arithmetic on
  the checkout path and a silently-rejected save would look identical to a successful one. Sibling
  `<form>` elements, never nested — HTML forbids nesting and the two save independently.
- **An orphaned child is kept, not dropped.** A row whose `parentId` names an absent category is
  treated as top-level in both the repository grouping and the form grouping. Unreachable through
  the schema, but silently losing a category from the admin list is far worse than showing one
  un-nested.
- **Only Total Orders is linked**, not Total Revenue or Avg Basket. A count reconciles against a
  list of orders; a revenue figure drilling into a list the reader must sum by hand is a worse
  claim than no link. Recorded in `plan.md` as excluded.
- **The guard test excludes generated files via `GENERATED_ARTIFACTS`**, imported from
  `kms/scripts/build-index.ts`, not by naming `runbook/docs.ts`. `CLAUDE.md` is explicit that
  hand-enumerating the generated artefacts is how one of them stopped being checked. This mattered
  immediately: the test's **first run failed** on `docs.ts`, which embeds spec prose containing hex
  strings.

## Deviations from the spec

- **`#631` covers six literals, not the three the issue names.** This is in `plan.md` and
  `requirements.md` (R21) as an approved widening, recorded here too because it is the largest gap
  between the issue text and what shipped. The spec's adversarial pass found `staff/team/page.tsx`
  and `AssignRoleForm.tsx` carrying the same defect; leaving them would have made R23's guard test
  fail on its own branch, and narrowing the test to the two named files was rejected.
- **R30 (the `PanelRefusal` fix) is not one of the five approved issue numbers.** Declared in
  `plan.md` before approval and approved with it. It is on a page `#634` already edits, and
  `CLAUDE.md` names the `return null` shape as a standing defect.
- **One test file beyond what the requirements demand.** `tests/delivery-rules-form.test.ts` is not
  required by any numbered requirement (R26/R27 are E2E rows), but every other pure form module in
  this repo has one and these values reach checkout arithmetic. Recorded rather than silently
  added.
- **`text-[#d32f2f]` became `text-danger`, which renders `#c82d2d`.** A deliberate ~2% value change,
  not a pure swap: `--color-danger` carries the AA-darkened figure from `#251`. Noted in `plan.md`.

Nothing else. No schema change, no migration, no new dependency.

## Known-shaky areas

- **R22c is expected to be unprovable locally, and must be reported as such rather than inferred.**
  Proving SriMart renders its own palette needs a staff session on SriMart's origin, which Better
  Auth refuses — a replayed session under a spoofed `Host` is rejected and a fresh sign-in under a
  local alias fails `trustedOrigins` (both confirmed at `#454`). R22b is the runnable substitute.
  Do not spoof around this; record it.
- **Nothing has run `npm run preview` yet.** `lint`, `typecheck`, `format:check` and the full suite
  (105/1411) all pass, but **no OpenNext build has run on this branch** — and this repo's own
  history (`proxy.ts`, `#362`) is that the adapter build is the step most likely to fail while every
  local check stays green. The `useActionState` addition to `StorefrontConfigForm` and the
  `optgroup` JSX are the two places to look if it does. This is the single largest unexercised risk
  in the slice.
- **Every `#634` live row is unexercised.** R24–R28 have only unit coverage of the parser; no value
  has actually been written to a real `VendorConfig` row. The `undefined`-vs-`null` conditional
  spread in `updateVendorStorefrontConfig` is the specific line to distrust — R27 (blank stores
  NULL, `0` stores `0`) is the check that would catch it being wrong, and it needs a real DB query,
  not a form that appears to succeed.
- **R16 is the load-bearing row for `#628` and cannot be satisfied by reading the source.** The
  breakdown and the tile share a `where` clause by construction, but "by construction" is exactly
  the kind of claim that is wrong when an `_count` counts a different column than expected. Add the
  three rendered counts and compare against the rendered tile.
- **The `hover:bg-action/20` replacement for `hover:bg-[#c8e6c9]` is the one colour that is not a
  1:1 token equivalent** — no `--color-action-tint-hover` exists, and inventing one would have
  required a per-vendor derivation in `brandStyle()`. It should read as a slightly stronger tint on
  hover; if it looks wrong against a real vendor's palette, that is the line.
- **`toCategoryOptionGroups` trusts the repository's ordering** rather than re-deriving it. Correct
  today because `listCategoriesForAdmin` is its only caller, and it degrades safely (a child before
  its parent becomes its own group rather than being lost), but a second caller passing unordered
  rows would get odd grouping rather than an error.
