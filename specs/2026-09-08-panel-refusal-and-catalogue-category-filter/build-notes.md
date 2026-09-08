# P9.3 — Panel refusal enforcement & admin catalogue category filter (build notes)

Written at the end of Build, before the Clear. Two independent halves sharing no code:
**Half A** = `#350` (refusal-branch enforcement), **Half B** = `#503` part 1 (admin catalogue
category filter). Commits: `6b84c93` (spec), `43b5057` (build).

**Nothing here has been exercised under `npm run preview`.** Every live row in `validation.md`
— R2 and R16–R20 — is untouched by Build, by design. That is the largest single block of
unverified surface, and R17 in particular is the one claim a unit test cannot settle.

## What changed and why

### Half A — `#350`

**The issue's premise was already stale when the slice started, and the fourth instance is the
real finding.** `/staff/storefront`'s bare `return null` had been fixed on 2026-09-06 in
`e3c9642` — the `#627`/`#628`/`#630`/`#631`/`#634` slice was editing that page for per-vendor
panel colours and fixed the refusal branch in passing without closing the issue. So the fix half
of `#350` was already shipped and `specs/roadmap.md` had said "Still open" for two days.

Walking all 25 `page.tsx` files under `app/(admin)/` at `/propose` found
`app/(admin)/staff/discounts/page.tsx` hand-rolling refusal markup **byte-identical** to what
`PanelRefusal` renders. Consistency defect, not a live one — it showed a real refusal — and the
same class `loyalty/page.tsx` was before `#136`. It was a deliberate P6a deferral recorded in
`components/staff/PanelRefusal.tsx`'s own docstring, which by 2026-09-08 was wrong about
`loyalty` (converted three phases earlier) and right about `discounts`, while `CLAUDE.md`'s
compliant-page list mentioned **neither** `storefront` nor `discounts`.

Four instances across five phases, two of them invisible to the prose list that existed to
prevent them. That is why the deliverable became **the test**, with the page conversion and the
three doc corrections as bookkeeping around it.

`tests/panel-refusal-coverage.test.ts` walks `app/(admin)/` on the filesystem — same shape as
`tests/staff-nav-parity.test.ts` and `tests/operator-doc-coverage.test.ts` — with **no allowlist**,
matching `tests/repository-purity.test.ts` (`#252`), the precedent `#350` itself named. It makes
two assertions: every page calling `requireVendorRole(` renders a `PanelRefusal` JSX element, and
no page returns `null` from an `auth`-conditioned branch.

**Why AST and not a grep** is the part worth keeping. Several of these pages carry a comment
saying, near-verbatim, that the refusal branch renders `PanelRefusal` and never returns `null` —
written by the slices that fixed the earlier instances. Any substring check is satisfied by that
comment alone, so a page whose comment is right and whose code is wrong passes. Same
comment-unaware-parser defect the previous slice hit and fixed in `82dbb1d`
(`tests/radius-scale.test.ts`, `#662`), one week earlier.

### Half B — `#503` part 1

`lib/staff-products-query.ts` gains `CATEGORY_ALL`, a `CategoryChoice` type, and two new fields
on `StaffProductsQuery` (`category`, `categoryIds`). `parseStaffProductsQuery` now takes the
vendor's categories as a **required** second argument and stays pure — no I/O — so the entire
rule surface is provable with no database, which is why the module exists separately at all.

`lib/repositories/products.ts`'s `listProductsForAdmin` gains one optional `categoryIds`
argument threaded into the existing `where` as `categoryId: { in: … }`; `lib/products-service.ts`
widens its options type to match. First two parameters stay the explicitly-passed Prisma client
and `vendorId`, so neither repository test is affected.

`app/(admin)/staff/products/page.tsx` renders the select from the existing
`toCategoryOptionGroups()` (`#630`) over `listCategoriesForAdmin()` (`#627` ordering) — the same
control the product form already renders, reused rather than rebuilt.

**Vendor scoping for this filter is the supplied list itself.** The page passes its own vendor's
categories, so another vendor's id is simply absent from it and resolves to `CATEGORY_ALL`. There
is no separate scoping check to forget, which is the point.

## Decisions taken during the build

- **`CategoryChoice` is a new minimal type, not a reuse of `CategoryOption`.** `lib/catalogue-form.ts`
  already exports `CategoryOption` (`id`, `name`, `parentId`, `isActive`) and reuse-before-create
  points at it. Rejected: the parse rule reads only `id` and `parentId`, and demanding `name`/
  `isActive` would over-constrain callers for fields it never touches. The narrower structural
  type is satisfied by `CategoryOption` **and** by the repository's `AdminCategoryRow`, so neither
  module has to import the other.

- **`CATEGORY_ALL` is a second constant spelling `"all"`, not a shared sentinel with
  `PRODUCT_STATUS_ALL`.** They are independent filters that happen to spell "unfiltered" the same
  way; collapsing them would let a future change to one silently change the other. Category ids
  are uuids, so no real category can collide with the literal.

- **The department option reads "All of {name}", not the product form's "— directly in this
  department".** Same control, different meaning: on the form the department option assigns
  directly to it, whereas as a filter it means the department *and everything beneath it*.
  Copying the form's wording would have described the rejected exact-match behaviour.

- **An empty array is treated as "no filter" at the repository too**, not only prevented at the
  parser. Defence in depth: `in: []` matches nothing, and a silently-empty product list is
  indistinguishable on screen from a working filter over an empty category.

- **The orphan-child case resolves to exact match.** `toCategoryOptionGroups` promotes a child
  whose parent is absent to its own group, so it *renders* like a department while the parser
  treats it as a child. Harmless because the hierarchy is capped at two tiers — an orphan child
  can have no descendants to miss — but it is a deliberate asymmetry rather than an oversight,
  and there is a test for it.

- **The refusal test's gate is `requireVendorRole(`, making the check conditional.** A page that
  never gates has no refusal branch to get wrong, so requiring it to import a component it would
  never render would be noise. All 25 pages present today are gated, so nothing is skipped now.

- **The roadmap front-matter was bumped to `1.82.0` at Build**, not left for Document (final),
  because the P9.3 `#350` bullet was rewritten here. The change-log row is still Document's work.

## Deviations from the spec

**One, and it was corrected in the spec itself before Build rather than deviating from it
silently.** `/propose` described fetching categories and products via `Promise.all`. That was
wrong: validating and expanding the selected id requires the vendor's real category ids, and the
product query's `where` depends on the result, so the two calls are inherently ordered. `plan.md`
records the corrected reasoning and the rejected alternative (pushing expansion into a Prisma
relation filter, which would move the one rule worth testing out of a pure function and still
would not supply the forged-id guard). The code is serial and carries that reasoning as a comment
at the call site.

Otherwise: **none.** R1–R22 were built as written.

## Known-shaky areas

- **Every live row is unverified.** R2 (`/staff/discounts` refusal as a signed-in STAFF user) and
  R16–R20 (the select, department roll-up, subcategory exactness, pagination carry, forged id,
  empty state) have never been run against a rendered page. Build touched none of them.

- **R17 is the one claim unit tests cannot settle, and its fixture may not exist.** The
  department-includes-subcategories rule is proven against a synthetic fixture in
  `tests/staff-products-query.test.ts`, not against the real catalogue. `validation.md`'s fixture
  block requires a department with a child that actually holds products, plus a **second** child
  for the exactness half, plus a category with **zero** products for R20. If the dev database
  cannot supply these, the honest outcome is "not verified" — do not substitute a weaker fixture,
  and do not pass R17 on the exact-match case alone.

- **The refusal test proves a page renders `PanelRefusal` *somewhere*, not that the `!auth.ok`
  branch specifically returns it.** The second assertion (no `auth`-conditioned `return null`)
  closes the combination that matters, but a page could in principle render `PanelRefusal` in an
  unrelated branch and do something else wrong in the refusal branch. Tightening this to
  "`PanelRefusal` is returned from the auth-conditioned branch" was considered and left alone —
  it would couple the test to one control-flow shape, and four of these pages `redirect()` on
  401 before returning on 403.

- **A page gating only on `auth.via` and never calling `requireVendorRole(` would be skipped
  entirely.** None exists today — all 25 call it, `/staff/errors` included — but the conditional
  gate is a real hole if that convention ever changes. Noted rather than pre-solved.

- **`#538` did NOT reproduce on this Build's full-suite run**, despite `CLAUDE.md` saying to
  expect it after the previous slice pushed `tests/repository-transaction-safety.test.ts` closer
  to its 5000ms limit. It is a load-dependent timeout, so a green run is not evidence it is
  fixed. CI's Linux runners are the authority; if it fails there, it is `#538`, not this slice.

- **`/staff/inventory` has the identical gap and was deliberately left alone.** The same
  category-filter argument applies to it, but `#503` does not describe it and no issue covers it.
  Recorded here and in `plan.md` as excluded scope rather than filed, because nothing indicates
  anyone needs it — it is a `/propose` candidate if it ever comes up, not silent scope.

- **The new page fetch is serial, so `/staff/products` now issues one more sequential round-trip
  than before** (`#503` measured Neon at roughly 69 ms each). Deliberate and reasoned above;
  round-trip economics are `#670`'s subject. If the page feels slower at validation, that is the
  expected cost, not a defect.
