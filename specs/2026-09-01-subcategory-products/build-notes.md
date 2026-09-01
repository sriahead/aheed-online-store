# Products in every subcategory, for both vendors (build notes)

Written at the end of Build, before the Clear. Branch `feature/subcategory-products`, cut from a
freshly-fetched `origin/staging` at `358cd32` (the merge of #520/#518).

Most of this slice's validation ran live during Build, because the deliverable is partly an
operation against production. `/validate` should re-run the seed-behaviour rows (R1–R9) against
**dev**, and re-query production for R10–R14 rather than re-seeding it.

## What changed and why

**`prisma/seed.ts` is the only file changed.**

- `AHEED_SUBCATEGORY_PRODUCTS` (27 keys) and `SRIMART_SUBCATEGORY_PRODUCTS` (4 keys) — two curated
  products per subcategory, keyed on the subcategory's slug. Real names, pence prices, unit labels,
  descriptions, and halal/fresh flags where they apply. SriMart's are electronics and homeware.
- `seedSubcategoryProducts(vendorId, map)` — its own pass, idempotent per **product** slug, skipping
  any key with no matching category so one vendor's fixture is inert in the other's run. Uploads
  each placeholder object before writing its row, per #502.
- `seedGeneratedCatalogue` reverted to Aheed-only; `SEED_SCALE_PRODUCTS_SRIMART` removed.
- `SEED_REMOVE_GENERATED` now removes both vendors' generated rows — kept from the first attempt,
  and it is what made the production cleanup a single command.

## The first implementation was wrong, and the reason generalises

This slice originally filled the second tier with `generateProducts` output. It shipped to
production and the defect was found by **looking at the site**, not by any check:

- The generator assigns a noun from **one global pool** to a **random** subcategory. Production
  showed "Everyday Rice" under `cleaning`, "Premium Chickpeas" under `paper-toiletries`.
- That pool is **groceries-only**, so SriMart — an electronics vendor — got "Value Lentils" under
  `sri-chargers-cables`.

Both faults are inherent to `generate-catalogue.ts`, whose own docstring says the pools are
"deliberately generic grocery vocabulary rather than anything resembling a real Aheed or SriMart
product". It exists to make queries work harder for #489's latency measurement.

**The transferable lesson: a fixture built to exercise query cost is not a fixture for looking at,
and nothing mechanical distinguishes them.** Every row it produced was schema-valid, correctly
related, correctly imaged and counted correctly. `lint`, `typecheck`, `test`, `format:check` and
every requirement in the original spec passed. The only signal available was reading the rendered
page — which is why `validation.md`'s R2 is deliberately a judgement check with no assertion behind
it.

**A second, quieter defect came from the fix itself.** `orange-juice-1l` in the new fixture collided
with an existing top-level Beverages product. Slugs are unique per vendor and
`seedSubcategoryProducts` filters pending products by existing slug — so the collision **silently
seeded one fewer row** rather than failing, and `juices-soft-drinks` went live with a single
product. Found by counting per subcategory, not by any error. Now `apple-juice-1l`, with a comment
in the fixture saying why. R6 exists to catch the next one.

## Decisions taken during the build

**A flat record keyed on subcategory slug, not products nested in `CATALOGUE`'s `children`.** The
subcategory tree already lives there; nesting would create two structures that must agree about it.
Keying on the child slug means the map is resolved against the database.

**`generate-catalogue.ts` untouched.** `GENERATOR_SEED` is load-bearing for #489's reproducible
measurement, and nothing here needed it to change.

## Environment obstacles — neither a defect in this diff

**IPv6 egress to R2 collapsed mid-session.** Two consecutive production seed runs died with
`UND_ERR_CONNECT_TIMEOUT` against `2606:4700:113::1:443`, both at `refreshProductImages`'s first
`putObject`, after earlier runs in the same session had succeeded.
`NODE_OPTIONS=--dns-result-order=ipv4first` fixed it and was used for every subsequent
storage-touching run. The symptom (`fetch failed`) does not name IPv6 unless you read the `cause`.

**The destructive production step was correctly refused and then explicitly authorised.** Running
the seed with `SEED_REMOVE_GENERATED=1` against production was blocked by the sandbox as a
destructive operation. It was not worked around; the additive half was run first, the user was
asked, and the removal ran after explicit approval.

## Known exception, tracked

**`Halal Chicken Thighs 1kg` has no real image and is expected to stay that way until #523.**
Workers AI returns `AiError: Input prompt contains NSFW content` (code 8007) for it on **every**
attempt — four across three runs. Two other names (`Gulab Jamun 1kg`, `Extra Noodles 1L`) failed
intermittently and succeeded on retry, so the filter is partly non-deterministic; this one has never
passed. It renders as the grey "no image" box (#502), not as anything broken.

**This is why #523 matters beyond one product.** `getProductsWithoutImages` is newest-first and
bounded, so a permanently-refused product is re-selected on every scheduled run, consumes a slot,
fails, and leaves the fillable backlog untouched — while the job still reports success. The store is
a halal butcher, and the names most likely to trip a raw-meat filter are exactly its defining
department.

## Deviations from the spec

None against the **revised** spec. `plan.md`, `requirements.md` and `validation.md` were all
rewritten mid-slice when the generated approach was rejected; the originals described work that was
built, shipped, and then deliberately undone.

## What ran live during Build

| Row | Result |
|---|---|
| R7 | `grep SEED_SCALE_PRODUCTS_SRIMART prisma/seed.ts` returns nothing |
| R9 | `git diff origin/staging -- prisma/generate-catalogue.ts` empty |
| R10 | production: all 27 Aheed and all 4 SriMart subcategories at **2 curated products** each |
| R11 | production: **0** `gen-` products, both vendors (54 + 8 removed) |
| R12 | 61 of 62 curated products filled; **1** placeholder remains (`Halal Chicken Thighs 1kg`, #523) |
| R16 | lint, typecheck, format:check green; full suite run before commit |

R1–R6 and R8 (fixture shape, idempotency, absent-category skip, slug-collision absence, both-vendor
undo) were **not** exercised against a live database during Build beyond the production runs above —
they are dev-database rows left for `/validate`.

## Known-shaky areas

- **R1–R6, R8 unverified** against a dev database. See above.
- **Image quality is unreviewed.** 61 products have images the pipeline chose (Open Food Facts
  first, AI fallback); nobody has looked at whether each one actually depicts its product. #502's
  `needsReview` flag is set on both paths, so the staff review surface is where that belongs.
- **Still outstanding from #518:** the six S3/CDN secrets for the `production` GitHub environment,
  and the fact that a GitHub Actions `schedule:` only fires from the default branch — so
  `fill-product-images.yml` will not run on a timer until it reaches `main`.
