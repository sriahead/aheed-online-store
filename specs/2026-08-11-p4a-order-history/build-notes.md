# P4a — Order history & status timeline (build notes)

Branch `feature/p4a-order-history`. Spec commit `87c176d`, implementation `f2ed7ca`. Issue #122,
epic #87.

Local state at the end of Build: `lint` 0 errors (2 pre-existing `<img>` warnings, tracked as #46),
`typecheck` clean, `test` 189/189 (12 new), `build` succeeds with `/account/orders` and
`/account/orders/[orderNumber]` both emitted as `ƒ` (dynamic) — not static-optimized, which is the
failure mode this repo has already hit twice on Prisma-backed pages.

## What changed and why

**`lib/order-status.ts` (new, pure, no I/O).** `orderStatusLabel()` and `buildTimeline()`, plus
`formatOrderDate()` / `formatOrderDateTime()`. It exists as its own module rather than living in the
page because P4b needs the same vocabulary for transition legality — creating it now avoids the
label set being invented twice and then diverging.

Two things in it are deliberate and would otherwise look arbitrary:

- **Date formatting pins `en-GB` explicitly** rather than relying on the runtime's locale. A Workers
  isolate has no user locale, so an unpinned `toLocaleDateString()` would silently render US order
  (`8/11/2026`) — the wrong month to every customer this store has.
- **`buildTimeline` collapses only *consecutive* identical statuses**, keeping the earliest. A retry
  that writes `CONFIRMED` twice is noise; `CONFIRMED → CANCELLED → CONFIRMED` is a real sequence of
  events and survives intact. Collapsing globally would have erased the second confirmation.

**`lib/repositories/orders.ts` (extended).** `listForUser()` copies `ProductRepository.findPage`'s
keyset shape exactly — `orderBy [{createdAt: desc}, {id: desc}]`, `take + 1` over-fetch, `cursor` +
`skip: 1` — so the two paginated reads in this codebase behave identically rather than each having
its own dialect. It is unfiltered by status on purpose: an abandoned `PENDING_PAYMENT` order is
history the shopper should be able to see, and hiding it just produces "where did my order go?".

`getForUser()` is a **second** read rather than a parameter on the existing one. `getByOrderNumber()`
implements P3b's capability-URL rule — a guest order has no owner, so the unguessable number is the
credential — which is correct for `/checkout/{n}` and wrong for `/account/orders/{n}`. Putting
`userId` in the `WHERE` (not a post-hoc check) means a guest order and another member's order both
simply fail to match. The existing method's body is untouched, so P3's validated behaviour is
preserved rather than widened by a shared code path.

**`components/orders/` (new).** `OrderItemsCard` and `OrderAddressCard` were lifted out of the P3b
confirmation page **with their markup preserved verbatim**, then consumed by both order pages. This
is the reuse-before-create rule applied to markup: the alternative was a second copy of the money
breakdown, which is exactly the kind of duplication that drifts silently. `OrderStatusBadge` and
`OrderTimeline` are new presentation with no prior equivalent.

**`specs/sdd-workflow.md` (carry-forward).** Its delivery-board blockquote claimed `Backlog` and
`In Review` "do not exist yet" and told the reader to substitute `Todo`. Both are false — the live
board has all four options and `CLAUDE.md` records the rename as done — so a reader following the
workflow doc would have filed status wrongly. Corrected in place, version 2.2.0 → 2.2.1. Rides this
branch per the carry-forward rule.

## Decisions taken during the build

- **`OrderTimeline` and `OrderStatusBadge` became components rather than page-local markup.** The
  spec only required the two shared cards (R23). Extracting these two as well kept the detail page
  readable and gives P4b something to reuse when a staff view needs the same badge. No requirement
  depends on them being separate files, so this is presentation structure, not scope.
- **Status → tone mapping lives in `OrderStatusBadge`, not in the pure module.** `orderStatusLabel`
  is copy; a Tailwind class string is presentation. Keeping tokens out of `lib/` preserves the
  purity that makes the module DB-free testable, and keeps semantic design tokens in the component
  layer where `design-system.md` expects them.
- **`previewItems` ordering is done in SQL** (`orderBy: { productName: "asc" }` on the nested
  select) rather than sorted in JS after the fact. Same result, but it makes the total ordering R8
  demands a property of the query rather than something a later refactor can quietly drop.
- **The "…" overflow hint on the list compares `itemCount` against the summed preview quantities**
  rather than `previewItems.length < 3`. An order of 5 × one product has one preview item and no
  hidden items; length alone would have wrongly suppressed the ellipsis in one case and wrongly
  shown it in another.
- **Rejected: filtering `PENDING_PAYMENT` out of the list.** It would make the history look tidier
  and is what a shopper "expects" to see — but it hides the exact order someone is most likely to be
  hunting for after a failed payment. R10 pins the decision so it cannot be quietly reversed.

## Deviations from the spec

**None in the implementation.** Every requirement is built as written.

Two **requirements themselves were corrected during Build**, before any live run, and both
corrections are recorded inline in `requirements.md` in the same style as P3d's R10:

1. **R9 originally demanded "exactly one Prisma query".** Unachievable for a correct design: for a
   nested relation `select`, Prisma's default read strategy issues a **second, batched** query
   (`... WHERE "orderId" IN (...)`) rather than a join, unless the `relationJoins` preview feature is
   enabled — which `CLAUDE.md` does not enable and this slice is not the place to turn on. Rewritten
   to the property that actually matters and that the code does satisfy: query count **constant in
   the number of orders**, i.e. no N+1. Had this been left, validation would have failed a design
   that is right.
2. **R5 verified "no note field" with a bare `grep -n "note"`.** That grep matches the module's own
   comment explaining why the field is deliberately absent, so satisfying it literally would have
   meant deleting the best explanation in the file to please a check. Rewritten to target field
   syntax (`\bnote\s*[:?]`, which returns nothing) and backed by a runtime assertion in the unit
   tests.

Both are spec defects found by building against the spec — the intended outcome of writing
`requirements.md` before code, not a shortcut around it.

## Known-shaky areas

**Nothing in this slice has been exercised against a real database yet.** Everything above is local
`lint`/`typecheck`/`test`/`build` plus pure unit tests. The DB-touching paths — `listForUser`'s
keyset behaviour across a page boundary, `getForUser`'s three-way `WHERE`, and the vendor scoping —
have not run a single real query. Validation should treat them as unverified, not as likely-fine.

Point validation at these first:

- **The `.env` / `.dev.vars` split (#119) before anything else.** `npm run preview` reads
  `.dev.vars`; fixture and inspection scripts read `.env`. If they still point at different Neon
  projects, every live row validates against a database the app is not using and the results will
  look plausible and be meaningless. This is the pre-flight in `validation.md`, and it is first for
  a reason.
- **R19 is the row most worth being strict about.** It has two halves — the guest order must 404 in
  the account area *and* still return 200 at `/checkout/{n}`. Only checking the 404 proves nothing
  except that something failed; a broken route would pass a half-checked row.
- **R24 (the confirmation page unchanged by the card extraction)** is the slice's real regression
  risk, because it is the one place P3-validated code was modified. The before/after capture must be
  taken from the **pre-refactor** commit (`87c176d`) — once the working tree is on `f2ed7ca` the
  "before" is no longer available without checking out.
- **Keyset pagination has only ever been exercised here with 12+ products, never orders.** The
  cursor is the order `id` while the sort is `(createdAt, id)`; with several orders created in the
  same second by a fixture script, ties are resolved by `id` — which is a `uuid`, so "descending id"
  is arbitrary rather than chronological. It is stable and total (which is what R15 requires: no
  repeats, no omissions), but a fixture script creating 15 orders in a tight loop is exactly the
  input that would expose an off-by-one at the page boundary. Build the fixtures with distinct
  `createdAt` values if you want the ordering to also *look* right.
- **`itemCount` and `previewItems` are derived in JS from the selected items.** If a future change
  ever limits that nested select with a `take`, `itemCount` silently becomes wrong rather than
  failing. There is no test guarding that today — R8's live check is the only thing standing between
  that refactor and a wrong number on the page.
