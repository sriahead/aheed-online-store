# #964, #966, #968 — Mobile tap targets, postcode autofill, discount-code copy (build notes)

Written at the end of Build (2026-10-04), before the Clear. Branch
`feature/964-966-968-mobile-tap-targets`, cut from `origin/staging` at `a96ecdd`. Commits:

- `7531b34`: spec;
- `bde6457`: hooks and script only, the **baseline commit**;
- `ea67f8b`: sizes, autofill, copy, docs and tests;
- the build-notes commit after this.

Nothing is pushed yet.

## Baseline

The baseline is the raw output of the five runs defined in `requirements.md` ("Runs"), measured
under `npm run preview` at `bde6457`, with every hook present and no class changed. It is in this
folder, one file per run: `baseline/a-cat.jsonl`, `baseline/s-cat.jsonl`, `baseline/a-search.jsonl`,
`baseline/a-cart.jsonl`, `baseline/a-loc.jsonl`. Each line is one width, in the order requested:

- A-cat, A-search, A-cart: `360,390,1024,1280`;
- S-cat, A-loc: `360,390`.

The baseline numbers R11 uses:

| Run | Width | `firstCardTop` baseline | After `ea67f8b` | Move |
|---|---|---|---|---|
| A-cat | 390 | 818 | 874 | +56 |
| S-cat | 390 | 726 | 772 | +46 |
| A-cat | 360 | 862 | 926 | +64 (not capped by R11) |
| S-cat | 360 | 794 | 848 | +54 (not capped by R11) |

Also from the baseline:

- Before this slice, every displayed control in the nine areas was under 44px, except the
  `filter-panel` summary (326×50 at 360, 356×50 at 390).
- The cart line controls were 20×20 and 22×22, and the arrows 32×32.
- The location toggles were 30px tall, and SriMart's single "Check delivery" button 34px.

## What changed and why

- **`scripts/verify-mobile-layout.ts`**: three additions, as R1–R3 specify.
  - `tapTargets`: one selector, `a|button|summary|input:not([type=hidden])`, either carrying
    `data-tap-surface` or inside an element that does. `surface` comes from
    `closest("[data-tap-surface]")`.
  - `firstCardTop`: read at scroll 0, plus `scrollY`.
  - `--open-location`: `OPEN_LOCATION` picks the first `dialog[data-location-dialog]` whose
    `parentElement` is displayed, then waits 300 ms. The parent is `LocationControl`'s root `div`,
    and the header mounts two of them: the phone row below `sm`, inline from `sm`.
- **Hooks (R4)**:
  - `location` sits on `LocationControl`'s root `div`, which also contains the `<dialog>`.
    `location-dialog` sits on the dialog's inner `div.bg-white`, so the nearest-surface rule gives
    dialog controls `location-dialog`.
  - Search pagination has no wrapper, so `data-tap-surface="pagination"` is on the Next page
    `Link` itself. R4 allows an element that "contains (or is)" the control.
  - `cart-line-controls` wraps only the stepper and remove forms, not the product link.
- **Sizes**:
  - Pills, chips, links and location buttons: `min-h-tap … lg:min-h-0`, with `inline-flex
    items-center` added where the element was `inline-block` or had no display. The pencil also
    gets `min-w-tap … lg:min-w-0`.
  - Cart line buttons: `flex size-tap items-center justify-center p-1 … lg:size-auto`, so from `lg`
    they are `p-1` around the icon again, 20×20 and 22×22.
  - Location dialog input, Check postcode and Cancel: `min-h-tap … lg:min-h-0`.
- **Arrows (`HorizontalScroller`)**: the `<button>` is now a transparent hit area,
  `size-tap lg:size-8`. The visible 32px circle moved to an inner `<span>` styled with
  `group-hover:`.
  - Positioning is `-translate-x-4 lg:-translate-x-1/2` on the left arrow, mirrored on the right.
  - `DepartmentScroller` passes `arrowPositionClassName="top-6.5 lg:top-8"`, so the 44px button's
    circle sits where the 32px circle sat.
  - `ProductRow` and `BundleRow` use the default `top-1/2 -translate-y-1/2`, which centres either
    size.
- **#966**: `autoComplete="postal-code"` on `LocationControl`'s postcode input, plus a
  `describe("header postcode checker")` block in `tests/autocomplete-tokens.test.ts`.
- **#968**: `docs/shopper-help/shopping-guide.md` 1.3.0 says to enter a code in the **Discount code**
  section of the checkout page. That is the section heading in `lib/checkout-sections.ts`; the
  field's own label is "Have a code? (optional)". `kms:build-index` regenerated the runbook copy.
- **Docs**: `specs/design-system.md` 1.15.0, "Touch targets", lists the nine surfaces, the
  `min-h-tap … lg:min-h-0` pattern, the arrow's hit-area/circle split, and what is still outside
  the rule (#979).
- **Tests**: `tests/tap-targets.test.ts` asserts, per file, the hook and a `tap` utility. It asserts
  only the hook for `FilterPanel.tsx`, through `ALREADY_TAP_SIZED`, as R13 allows.

## Decisions taken during the build

- **The baseline JSON lives beside the notes, not inside them.** It is about 50 KB of controls.
  `requirements.md`'s "Baseline" definition is amended to say so.
- **The arrow overhang is a fixed 16px below `lg`.** Half of a 44px button (22px) overhung the
  track 6px past the page gutter (see Deviations). 16px is exactly what the old 32px arrow overhung,
  so no row can be wider than before. The cost: below `lg` the visible circle's centre sits 6px
  inside the track edge instead of on it.
- **The location dialog's controls also reset at `lg`.** R12 does not measure the dialog at desktop
  widths, but the same `lg:min-h-0` pattern keeps one rule everywhere.
- **No `gap-*` tightening.** It recovers only about 8px (collection and subcategory rows), not
  enough to change R11's outcome, and it makes adjacent pills easier to mis-tap. The owner chose
  the cap change instead (Deviations).

## Deviations from the spec

All three are recorded in place in `requirements.md`/`validation.md` as "_Amended at Build_".

1. **R10 was strengthened.** The first arrow version overhung 22px. At a requested 360 and 390 the
   page then reported `viewportWidth` and `documentScrollWidth` both 366 and 396. Under
   `mobile: true` emulation an overflowing page widens the layout viewport, so R10's original
   `documentScrollWidth === viewportWidth` passed while the page was in fact overflowing. R10 now
   also requires `viewportWidth` to equal the requested width. After the inset fix every 360 and 390
   run reports exactly 360 and 390.
2. **R11's cap went from 40 to 60, by owner decision on 2026-10-04.** Measured: +56 (Aheed) and +46
   (SriMart). Three options were offered: raise the cap to 60, make the collection links a
   swipeable row below `md`, or tighten gaps and set the cap to 50. The owner chose the cap of 60.
   The estimated split for Aheed at 390, from the classes:
   - location row +14;
   - filter chips +14;
   - subcategory pills, two rows, +12;
   - collection links, two rows, +16.
3. **The "Baseline" definition now points to `baseline/<run>.jsonl`**, not to text inside this file.

## Known-shaky areas

- **R11 at 360 is uncapped and larger:** +64 on Aheed, +54 on SriMart, because pills wrap to more
  rows. The spec caps 390 only. A validator should not read a 360 number against the cap.
- **Wrangler died mid-run once.** `npm run preview` exited (empty `[ERROR]`, the playbook's known
  trap) while the A-search run was loading. Later runs then failed with a Chrome error page. Every
  number above comes from the clean rerun after a rebuild.
  - The rerun went through a scratchpad wrapper that curls `/api/health` before each run and stops
    when the server is down.
  - If a run's file is empty or short, restart the server rather than trusting partial output.
- **The `name` of a location toggle is its whole `textContent`, hidden spans included**, for example
  `Click & CollectCollect` and `DeliveryDelivery`. That is harmless for R12's same-name matching,
  which compares like with like. It is not an accessibility finding: the hidden span is
  `display: none` and is not announced.
- **Arrow vertical placement on the department row** (`top-6.5`) was set by arithmetic and not
  checked visually. It does not affect any R. A screenshot at 390 is the quick check.
- **Homepage rows (`ProductRow`, `BundleRow`) were not measured.** They share the arrow change, and
  no R covers the homepage. Their overhang is 16px, as before, so overflow there is unlikely but
  unproven. `M --path "" --widths 390` would show `viewportWidth`.
  _Corrected at Validate: the script rejects an empty `--path`. Use
  `MSYS_NO_PATHCONV=1 … --path / --widths 360,390`. That run showed no overflow, and no displayed
  `scroller-arrow` entry on `/` at all, so the homepage arrows are still unmeasured (tracked in
  `#979`)._
- **R15 (live `postal-code` in `formInputs`) and R20's `npm run build` / `kms/site-internal` build
  were not run in Build.** `lint`, `typecheck`, `format:check`, `kms:validate`,
  `kms:check-generated` and the full `npx vitest run` (204 files, 2,686 tests, run alone) all passed.
- **Desktop check:** a script compared all 58 displayed entries at 1024 and 1280 (A-cat, A-search,
  A-cart) with the baseline. There were 0 mismatches.
