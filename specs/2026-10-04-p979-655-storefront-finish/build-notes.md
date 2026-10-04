# #979, #655 — Storefront finish: remaining tap targets and image fallbacks (build notes)

Written at the end of Build (2026-10-04), before the Clear. Branch
`feature/979-655-storefront-finish`, cut from `docs/964-966-968-document-carry` (itself
`origin/staging` at `83da2ce` plus two docs commits from slice 4's Document pass, `f78651c` and
`bb9bbcf`, which ride this branch to `staging`). Nothing is pushed yet.

Commits:

- `8654401`: spec;
- `2411886`: hooks and script additions, no class change (first baseline commit);
- `fa6454f`: instrument fix, a closed `<details>` is not displayed (see Deviations);
- `20ea79c`: script adds `cardsWithoutImage`. **This is `<baseline commit>`**;
- `aa9caae`: the baseline measurements;
- `adff01e`: sizes, `ImageWithFallback`, every image surface, tests;
- `f0852af`: the logo fallback's footprint, docs, spec amendments, regenerated KMS index;
- the build-notes commit after this.

## Baseline

`baseline/<run>.jsonl`, one file per run in `requirements.md`, measured under `npm run preview` with
no class or component change. `a-cat` and `s-cat` were measured at `20ea79c`; every other run at
`fa6454f`, which differs only by `cardsWithoutImage`.

**Product page slug: `baby-spinach-200g`** (`<P>`). It has one image (`main.svg`).

Baseline numbers the requirements use:

| Run | Width | `firstCardTop` | `cardsWithoutImage` | product `brokenImages` |
|---|---|---|---|---|
| A-cat | 360 / 390 / 768 | 926 / 874 / 536 | 0 / 0 / 0 | 2 / 2 / 4 |
| S-cat | 360 / 390 / 768 | 848 / 772 / 434 | 0 / 0 / 0 | 0 / 0 / 0 |

Before this slice, below `lg`:

- the search input was 38px tall;
- filter checkbox labels were 20px, selects 43px, Apply 42px; the number inputs were already 44px;
- both close buttons were 32×32;
- Quick View's minus and plus were 40×42 (42 because the 1px border sits inside the fixed `h-11`).

The scroller arrows were already 44px, and the department arrow's circle centre was 48px down its
row at every width.

**Image surfaces each baseline reached at 390 (R19).** The header logo is broken on every page (see
Known-shaky):

| Run | Broken in the baseline | Surfaces |
|---|---|---|
| i-home | 1 | header logo only. Dev has no department or campaign images, so the hero is not reached |
| i-cat | 13 | logo, 12 product cards |
| i-shop | 18 | logo, the bundle row's card, 16 product-row cards |
| i-bundles | 2 | logo, bundle card |
| i-product | 2 | logo, product page gallery (stacked) |
| i-qv | 14 | logo, 12 cards, Quick View gallery (carousel) |
| i-cart | 2 | logo, `/cart` line image |
| i-drawer | 14 | logo, the drawer's cart line, 12 cards |

**Not reached by any baseline:** `DepartmentHero`'s campaign photo and its corner thumbnail. They
rest on R15 (unit test) and R17 (source guard), as `plan.md` section 5 allows.

## What changed and why

- **`scripts/verify-mobile-layout.ts`**: `--open-filters`, `--open-cart`, `--open-quick-view`,
  `--block-urls`, `brokenImages`, `cardsWithoutImage`, `scrollerArrows`, `select` in `tapTargets`,
  and a checkbox or radio measured by its wrapping `label` (`hitArea: "label"`). The header comment
  documents each. `--block-urls` sends `Network.enable` and `Network.setBlockedURLs` once before the
  first navigation. Before each measurement it sets `loading="eager"` on every `img` and waits 2 s.
- **`components/ui/ImageWithFallback.tsx`** (new, client): renders one `<img>`, and the required
  `fallback` after `onError`, **or** on mount when `complete && naturalWidth === 0`. The mount check
  is the hydration-race fix (see Decisions). `ProductImage` is now a thin non-client wrapper over it,
  with the same props and output, and `tests/product-card-image.test.tsx` is unchanged.
- **Image surfaces**:
  - `ProductImageGallery`: stacked falls back to a grey square; carousel to `null`, so the
    region's own grey shows.
  - `CartContents`: the same `h-16 w-16` grey box as a line with no image.
  - `BundleCard`: a local `NoBundleImage` used by both branches.
  - `DepartmentHero`: campaign photo falls back to `null` (the scrim and panel tone stay);
    thumbnail falls back to the department icon.
  - `Header`: see Deviations.
- **Tap sizes**, all `… lg:<reset>` so desktop is unchanged:
  - search input: `min-h-tap lg:min-h-0`. The phone search row went from `pb-3` to `pb-1.5`, which
    gives the 6px back (R11);
  - filter form: every field, checkbox `<label>` and Apply get `min-h-tap lg:min-h-0`;
  - both close buttons: `flex size-tap items-center justify-center … lg:size-auto`, keeping `p-1.5`;
  - gallery arrows: a transparent `size-tap lg:size-8` button around the old 32px circle, now a
    `<span>` styled through a named group (`group/arrow`, so a hovered ancestor `.group` cannot
    scale it). Below `lg` the button sits at `left-1`/`right-1`, so the circle's centre stays 26px
    from the edge, as `left-2.5` placed the 32px button;
  - Quick View add (`drawer` variant): minus and plus get `min-h-tap min-w-tap lg:min-h-0
    lg:min-w-0`, the stepper loses its fixed `h-11` below `lg` (46px with its border), and Add uses
    `self-stretch lg:self-auto lg:h-11` to match.
- **Tests**: `tests/tap-targets.test.ts` has six new rows. New `tests/image-with-fallback.test.tsx`
  (jsdom) and `tests/storefront-image-fallback.test.ts` (source guard).
- **Docs**:
  - `specs/design-system.md` 1.16.0, "Touch targets": the six surfaces; "still outside" now names
    `#981` and the gallery dots.
  - `docs/developer-portal/runtime-pitfalls.md` 1.3.0: the `#502` bullet names `ImageWithFallback`
    and the guard, and a new bullet covers the hydration race.
  - `docs/developer-portal/local-dev-playbook.md` 1.20.0: measurement traps from this build.

## Decisions taken during the build

- **The hydration race is real, so the mount check went in.** With the CDN blocked, the baseline
  showed every product card on `/categories/fruit-veg` keeping a broken-image icon. `ProductImage`
  had had `onError` since `#502`; the event fires before React attaches it. After the change, every
  I- run shows 0 broken images.
- **The mount check was proven not to hide loading images** (R18a, added). Per the HTML spec a lazy
  image that has not started reports `complete === false`. Measured: `cardsWithoutImage` equals the
  baseline's broken-product-image count at every width (2, 2, 4 on A-cat; 0 on S-cat).
- **`ProductImage` dropped `"use client"`.** It is now a plain wrapper, and the client boundary is
  `ImageWithFallback`. Server components (`ProductCard`) can still render it.
- **The gallery arrows reuse `#964`'s scroller pattern** (hit area plus inner circle) rather than
  growing the circle, so Quick View looks the same.
- **Measurement driver.** `npm run preview` died repeatedly under the image runs (`Network
  connection lost`, then an empty `[ERROR]`). The runs were driven by a scratch script that checks
  `/api/health` before each run, restarts with `npx opennextjs-cloudflare preview` (no rebuild)
  when it is down, and retries a run whose output has a line with `headerBottomAtTop: null` (a page
  that never rendered). It is in the playbook as a trap, not committed as a tool.

## Deviations from the spec

All are recorded in place in `plan.md`, `requirements.md` and `validation.md` as "_Amended at
Build_".

1. **The header logo's fallback keeps the logo's footprint.** `plan.md` said the logo-less wordmark
   (initial tile, name, locality). Aheed's dev logo genuinely returns 404, so the fallback showed on
   every run. The wordmark is far wider than the 72×40 logo box. It overflowed the 360px page to
   382px (R9), squeezed the search input from 349px to 215px wide at 1024 (R12) and moved the grid
   2px at 768 (R11). The stored-logo fallback is now the vendor's initial in an
   `h-10 aspect-9/5` box with `role="img"` and the logo's own alt text. A vendor with **no** logo
   still gets the wordmark, unchanged. That wordmark overflows a 360px header the same way for a
   long name, which is pre-existing and tracked as `#982`.
2. **The script's `displayed` rule also requires `checkVisibility()`** (R1 amendment). Chrome lays
   out a closed `<details>`' content with real boxes, so the first baseline showed the closed
   panel's filter form as displayed. This applies to `#964`'s surfaces too. Their sizes are
   unaffected; none of them sits inside a closed disclosure.
3. **R8's A-shop arrow names.** The spec said `Scroll products right` and `Scroll bundles right`.
   Each row's arrow is named after its heading (`Scroll value bundles right`, `Scroll new arrivals
   right`, `Scroll featured products right` on Aheed dev).
4. **R18a added**, see Decisions.
5. **R20's `updated` wording.** `specs/design-system.md` was already dated 2026-10-04 by slice 4, so
   "`updated` is changed" could not be met. It now says `updated` is `2026-10-04`.

## Known-shaky areas

- **The dev bucket is missing real objects.** `vendors/a4ed0000-…0001/logo.png` returns 404 on
  `images.dev.aheedfoodcentre.nocaped.com` (checked with PowerShell `Invoke-WebRequest`; Git Bash
  `curl` resets TLS to these hosts). So do several product `.webp` keys (2 at 360, up to 6 at 1024).
  Consequences for validation:
  - **every unblocked run shows the header logo as the initial box**, not the logo;
  - an unblocked baseline already lists broken images, which is why R18a compares against the
    baseline rather than zero;
  - production's logo was not checked.
- **`npm run preview` dies under these runs**, sometimes mid-run. A run can then exit 0 with a JSON
  line for a page that never rendered (`headerBottomAtTop: null`, no `tapTargets`); this happened to
  `i-product` at 390 once. Check each line, not only the exit code.
- **Gallery arrows (`gallery-arrow`) were never measured live.** The Quick View product
  (`baby-spinach-200g`) has one image, so no arrows render. R13's source test and the classes are
  the only evidence. Their placement (`left-1`/`right-1` below `lg`) was set by arithmetic.
- **`DepartmentHero` images were never reached live** (no dev data), as above.
- **The Quick View add row is 46px tall below `lg`, not 44px.** The minus and plus are 44px inside a
  1px border. Add stretches to 46px. At `lg` it is the old 44px row.
- **`tests/add-to-cart-feedback.test.tsx` failed once under the full suite**: "a rejected call is
  caught", `disabled` still `true` at line 93. It passed 3 of 3 alone, and the next full run was
  green (206 files, 2,708 tests). It tests the `full` variant, which this slice did not change. It
  looks like a timing flake (the message renders a tick before `pending` clears). Tracked as
  `#983`.
- **R12 at 1024/1280 depends on the logo fallback footprint.** If the logo loads in some environment
  and not in another, the header layout is now the same either way. That is the point of
  Deviation 1, but it is also why a validator in an environment with a working logo will see a
  different picture from this build.
- **Not run in Build:** `npm run kms:assemble:internal` plus the `kms/site-internal` Next build (R24).
  `lint`, `typecheck`, `format:check`, `kms:validate`, `kms:check-generated` and the full
  `npx vitest run` (alone) passed. `npm run build` ran inside `npm run preview`'s rebuild.
