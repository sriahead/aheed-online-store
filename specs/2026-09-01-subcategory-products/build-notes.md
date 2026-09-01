# Products in every subcategory, for both vendors (build notes)

Written at the end of Build, before the Clear. Branch `feature/subcategory-products`, cut from a
freshly-fetched `origin/staging` at `358cd32` (the merge of #520/#518).

As with #518, most of this slice's validation ran live during Build, because the deliverable is
partly an operation against production. What ran is tabulated below; `/validate` should re-run the
seed-behaviour rows (R1–R5) against **dev**, and re-query production for R6–R10 rather than
re-seeding it.

## What changed and why

**`prisma/seed.ts`** — the only file changed. A new `maybeSeedGeneratedCatalogue(envVar, vendorId,
catalogue)` replaces the inline `SEED_SCALE_PRODUCTS` parsing and is called twice: Aheed with
`SEED_SCALE_PRODUCTS`, SriMart with a new `SEED_SCALE_PRODUCTS_SRIMART`. The
`SEED_REMOVE_GENERATED` branch now removes both vendors' generated sets.

**The underlying defect was a call site, not a function.** `seedGeneratedCatalogue` was already
fully vendor-generic — it takes `vendorId` and `catalogue` as parameters and derives its
subcategory list from the catalogue passed in. Only its single call site was Aheed-only. So
SriMart's subcategories were empty in *every* environment, dev and staging included, and no value
of `SEED_SCALE_PRODUCTS` could ever have filled them. That is worth stating plainly because it
means this was never a production data problem; production is just where it was noticed.

**Two env vars rather than one shared count.** The catalogues are different sizes (27 subcategories
against 4), so a single number cannot mean "about two each" for both. More importantly, #489's
recorded NFR baseline is defined by the *Aheed* row count specifically — letting one value drive
both vendors would have silently changed what that measurement refers to.

**The undo had to be extended in the same commit.** `SEED_REMOVE_GENERATED` called
`removeGeneratedCatalogue(AHEED_VENDOR_ID)` only. Adding SriMart generation without it would have
left the documented one-command undo silently stranding half the generated set — worse than not
having the feature, and exactly the class of half-applied change #502's row/object divergence rule
warns about.

## Decisions taken during the build

**`prisma/generate-catalogue.ts` was not touched.** Its `GENERATOR_SEED` and `GENERATED_SLUG_PREFIX`
are load-bearing for #489's reproducible measurement. Nothing here needed them to change.

**Production counts chosen as 54 and 8** — 2 per subcategory, not the 2,000 used for scale testing.
Enough to see the tier populated, small enough that filling every one with a real image costs ~62
Flux calls.

## Environment obstacles hit — neither a defect in this diff

**IPv6 egress to R2 failed repeatedly.** Two consecutive production seed runs died with
`UND_ERR_CONNECT_TIMEOUT` against `2606:4700:113::1:443`, both at `refreshProductImages`'s first
`putObject`. Earlier runs in the same session had succeeded, so this was a degradation, not a
config error. `NODE_OPTIONS=--dns-result-order=ipv4first` fixed it immediately and was used for
every subsequent storage-touching run. Recorded here because the next person will hit it and the
symptom (`fetch failed` wrapping a connect timeout) does not name IPv6 unless you read the `cause`.

**Workers AI rejected one product name as NSFW.** `Extra Noodles 1L` failed the first fill with
`AiError: Input prompt contains NSFW content` (code 8007, HTTP 400) from
`@cf/black-forest-labs/flux-1-schnell`. A false positive on a generated grocery name. The fill
script handled it exactly as designed — logged it, counted it failed, continued with the remaining
products — and a plain re-run succeeded. **This matters for the scheduled job (#518):** a single
product name can be permanently rejected by the content filter, and because
`getProductsWithoutImages` returns newest-first with a bounded batch, one such product could
consume a slot on every scheduled run without ever succeeding. Not hit here (the retry passed), and
not fixed here, but it is the first real evidence that the scheduled job needs a give-up path.

## Deviations from the spec

None. R1–R12 implemented and verified as written.

## What ran live during Build

| Row | Result |
|---|---|
| R5 | `git diff origin/staging -- prisma/generate-catalogue.ts` empty |
| R6 | production: aheed 40 categories / **0 empty**; srimart 6 / **0 empty** (was 31 empty) |
| R7 | aheed 54 `gen-` across 27 categories, min 2; srimart 8 across 4, min 2 |
| R8 | production products with only placeholder images: **0** |
| R9 | 62 non-placeholder image rows, **62 distinct keys** — no sharing |
| R10 | 5/5 sampled keys return HTTP 200 from production's CDN |
| R12 | lint, typecheck, format:check green; full suite run before commit |

R1–R4 (default-off, invalid input, both-vendor undo) were **not** exercised against a live database
during Build — they are dev-database rows and are left for `/validate`.

## Known-shaky areas

- **R1–R4 are unverified.** See above. The code paths are short and read correctly, but nothing has
  run them.
- **The generated rows are in a live production storefront** with names like "Everyday Rice". This
  is the accepted trade-off recorded in `plan.md`, not an oversight. `SEED_REMOVE_GENERATED=1`
  (now covering both vendors) is the undo.
- **Still outstanding from #518:** the six S3/CDN secrets for the `production` GitHub environment.
  Additionally — **a GitHub Actions `schedule:` only fires on the default branch**, so
  `fill-product-images.yml` will not run on a timer until it is promoted to `main`.
