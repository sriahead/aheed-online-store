# Shop-list lines the cart notice never names, and header controls with doubled names (build notes)

Spec commit `be93c5e`; build commit `f31ed43`; this file, the CHANGELOG entry and
`docs/developer-portal/app-conventions.md` 1.14.0 land in the build-notes commit after it. Branch
`feature/p1090-1091-list-notice-and-control-names`, cut from `origin/staging` at `88f9231`.

## What changed and why

**#1090 — out-of-stock and unmatched shop-list lines reach the `/cart` notice.**

- `components/cart/ListReview.tsx`: every line now emits four positional fields — `productId`,
  `quantity`, `lineLabel`, `lineStatus`. The in-stock and ambiguous branches gained only a
  `lineStatus` hidden input (`ready`, `choose`). The out-of-stock branch gained all four (empty
  `productId`, `lineLabel` = the matched product's `name`, `lineStatus` = `unavailable`); to hold
  them beside the existing `<p>`, that `<p>` is now wrapped in a fragment and re-indented — its
  text and `className` are unchanged. The unmatched row gained a **separate** sibling block
  (`line.resolution.kind === "unmatched" && <>…</>`) holding its four inputs, so the existing `<p>`
  there is untouched.
- `features/cart/add-list-to-cart.ts`: reads `lineStatus` positionally. A new module-private
  function `missingLineKind(status)` maps `unavailable` → `unavailable`, `unmatched` → `unmatched`,
  anything else → `skipped`; it is applied **only** when `productId` is empty (the `kind` field is
  `undefined` for a line carrying a product). Header comment rewritten from "ALL THREE inputs or
  none" to "ALL FOUR inputs". Still exports only `addListToCart` (async).
- `lib/restore-lines.ts`: `restoredLines` items accept an optional `kind`; an id-less item reports
  `item.kind ?? missingKind`. Reorder and cancel pass Prisma order items with no `kind` and are
  untouched.
- `lib/restore-notice.ts`: `RestoredLineKind` gains `"unmatched"`, `RestoreEntryKind` gains `"m"`,
  `KIND_CODE` maps one to the other, and `parseEntry` accepts `m` under the same `added === 0 &&
  requested >= 1` invariant as `s`. `BulkAddKind` in `lib/cart-rules.ts` is untouched.
- `components/cart/RestoreNotice.tsx`: one added `case "m"` →
  `` `${entry.name}: not added, no match in this shop` ``.

**#1091 — one accessible name per `LocationControl` button.**

- `components/layout/LocationControl.tsx`, four buttons:
  - Collect toggle: `aria-label="Click & Collect"`, both spans `aria-hidden`.
  - Delivery toggle (deliverable postcode): `aria-label={deliveryLabel}`, both spans `aria-hidden`.
  - Delivery affordance (no deliverable postcode): the identical `Delivery`/`Delivery` span pair is
    collapsed to one `<span>Delivery</span>`; no `aria-label`.
  - No-collection single button: `aria-label={hasDeliverablePostcode ? deliveryLabel : "Check
    delivery availability"}`, both spans `aria-hidden`.
- `tests/location-control.test.tsx`: the `deliveryAffordance()` structural helper and its comment
  are gone, replaced by `button(name) = screen.getByRole("button", { name })`. A new `describe`
  ("one accessible name per button (#1091)") runs two `it.each` tables over the five R12 cases:
  exact name, and name-contains-narrow-text.

**Tests.** `tests/shop-list-review-copy.test.tsx` (the `#1088 R9` "exactly 2" case replaced by
four-of-each and a `FormData` alignment case; R2 values; R3 selection-invariance),
`tests/add-list-to-cart.test.ts` (new `#1090` describe: R5 mixed statuses incl. `pigeon`, R5 no
field at all, R6 product wins over status — the `form()` helper gained an optional `lineStatus`
but no pre-existing case was edited), `tests/restore-notice.test.tsx` (new `#1090` describe:
R7 encode/round-trip/reject, R8 per-item kind, R9 copy).

**Measured at build:** `typecheck`, `lint`, `format:check` exit 0; `npx vitest run` alone →
259 files, 3316 tests, all passed. The new `location-control` tests were run against the
**pre-fix** component (`git stash` of `LocationControl.tsx` only) and 12 failed, so they test the
fix rather than passing vacuously.

**Persistent docs.** `docs/developer-portal/app-conventions.md` 1.14.0 gains two sections:
"Responsive labels that switch text by viewport (`#1091`)" and "Shop-list review fields
(`#1088`, `#1090`)".

## Decisions taken during the build

- **The unmatched row's inputs are a separate sibling block, not inside the existing `{… && <p>}`.**
  Putting them inside would have required wrapping and re-indenting the `<p>`. The out-of-stock
  branch could not avoid that (it is the `: (` arm of a ternary), so it was re-indented there only.
- **`missingLineKind` is a plain module-private function in the `"use server"` file**, not exported
  and not a constant table — the file may export only async functions, and a non-exported function
  is safe. `SKIPPED_LINE_FALLBACK_NAME` was already a module-private const there.
- **The `"skipped"` third argument to `restoredLines` in `add-list-to-cart.ts` is kept.** It is now
  unreachable as a fallback (every id-less list line carries its own `kind`), but removing it would
  make the list path silently depend on the `unavailable` default if a future edit dropped the
  per-item kind. Kept as the safe fallback.
- **The blank-label fallback name (`An item from your list`) now applies to all three id-less kinds**,
  not only skipped. It is still vendor-neutral and only a crafted post reaches it.
- **Test titles** for the `it.each` tables use `$label is named exactly $name` (vitest quotes string
  interpolations itself).
- **Deferred items.** Of `plan.md`'s "Deliberately excluded" list, only `aria-pressed` is a real
  defect, so only it was filed: **`#1129`** (Backlog, P10). The header's single-span icon links do
  not double (recorded as out-of-scope in `app-conventions.md` 1.14.0); the screen-reader pass is
  replaced by R16's accessibility-tree read; the nothing-addable list and the notice heading are
  intentionally unchanged behaviour, not defects.

## Deviations from the spec

- **R4 and R14 — read the diffs whitespace-insensitively.** Both rows say the diff adds only
  attributes/inputs/comments. Two formatting effects make a plain `git diff` show more:
  1. `ListReview.tsx`: the out-of-stock `<p>` is re-indented inside a new fragment (see above).
     `git diff -w <base> -- components/cart/ListReview.tsx` shows it unchanged.
  2. `LocationControl.tsx`: adding `aria-hidden` pushed the Collect toggle's and the Delivery
     toggle's spans past the print width, so Prettier moved each span's text onto its own line
     (`<span aria-hidden className="hidden sm:inline">` / `Click &amp; Collect` / `</span>`). JSX
     trims that surrounding whitespace, so the rendered text is identical; R12's exact-name tests
     and R16 prove it. Text and `className` of every span are unchanged.
  Neither changes behaviour; both are what `npm run format:check` requires.

## Known-shaky areas

- **R10 (live end-to-end) has not been run.** Everything above is jsdom plus a stubbed cart
  repository. The real path — a review page rendered by `/shop-your-list` under `npm run preview`,
  submitted through the bound server action, landing on `/cart` with `u` and `m` entries — is
  unproven. Precondition P4 needs an out-of-stock product set by hand; do not skip restoring its
  stock.
- **R16 (real browser accessible name) has not been run.** The `aria-label` makes the name
  authoritative by construction, but Chrome's computed name at 375px vs 1280px is only asserted,
  not measured. If Aheed's local collection is off (P5), the toggle does not render at all.
- **The out-of-stock line is named by product name, the other kinds by typed text** — a deliberate
  `plan.md` choice. If R10 shows the typed text for the out-of-stock line, the wrong input was read;
  check `lineLabel` in that branch of `ListReview.tsx`.
- **Version skew is proved only by unit test** (R5's no-field case). A real pre-deploy page is not
  reproducible locally.
