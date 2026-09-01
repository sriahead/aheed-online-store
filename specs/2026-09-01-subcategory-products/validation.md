# Products in every subcategory, for both vendors (validation)

Run from a fresh context. R6–R10 read (and R6/R7/R8 were produced by) **production**; they are
verification steps, not repeatable mutations — the catalogue is already seeded, so re-running the
seed is a no-op by design and must not be treated as a fresh test.

> **Testing strategy.** The seed's control flow (opt-in per vendor, invalid input, the undo
> covering both vendors) is checked by running the seed against a **dev** database, where creating
> and removing rows is free. Production is then checked by querying it, not by re-seeding it. The
> defects this slice is exposed to — a helper wired to the wrong vendor, an undo that misses one,
> a shared image key across generated rows — are all invisible to a unit test.

## Preconditions

- `#518` merged (PR #520) — this slice reuses `scripts/fill-product-images.ts` unchanged.
- `secrets/production.vars` present. **Confirm the resolved host before trusting any production
  result**: only the host proves the target, never the filename (`CLAUDE.md`, P5a).
- If storage calls fail with `UND_ERR_CONNECT_TIMEOUT` against an IPv6 address, re-run with
  `NODE_OPTIONS=--dns-result-order=ipv4first`. This was needed throughout this slice; it is a
  sandbox egress condition, not a defect.

| Req | How to verify |
|---|---|
| R1 | Against a **dev** database with both vars unset, run the seed, then `SELECT count(*) FROM "Product" WHERE slug LIKE 'gen-%'` — expect 0 for both vendors. |
| R2 | Read `prisma/seed.ts`: exactly one helper reads a named env var and delegates to `seedGeneratedCatalogue`, called twice with the two variable names and the two vendor ids. Confirm no inline `SEED_SCALE_PRODUCTS` parsing remains (`grep -n "SEED_SCALE_PRODUCTS" prisma/seed.ts` shows it only as an argument). |
| R3 | Against dev: `SEED_SCALE_PRODUCTS=abc` then `SEED_SCALE_PRODUCTS_SRIMART=-1`. Each exits non-zero with a message naming that variable, and creates no products. |
| R4 | Read the `SEED_REMOVE_GENERATED` branch: it calls `removeGeneratedCatalogue` for both vendor ids. Then against dev, seed both vendors' generated sets, run with `SEED_REMOVE_GENERATED=1`, and confirm `gen-` counts return to 0 for **both**. |
| R5 | `git diff origin/staging -- prisma/generate-catalogue.ts` produces no output. |
| R6 | Against production, group categories by id with their product counts and assert none is 0, for both vendors. The pre-slice state was 31 categories at 0, so a non-zero result here is the whole point. |
| R7 | Against production: `gen-` product count is 54 for Aheed and 8 for SriMart; grouping those by `categoryId` yields 27 and 4 groups respectively, each with count >= 2. |
| R8 | Against production, count products whose image rows are all placeholders (`storageKey` ending `/main.svg`, using `every` so a product with no images is included) — expect 0. |
| R9 | Against production, for the 62 `gen-` products, compare `count(*)` of non-placeholder image rows against `count(DISTINCT "storageKey")` of the same set. They must be equal — an inequality means generated rows are sharing an object, which is the pre-fill placeholder state this slice exists to leave. |
| R10 | Take five of those products' primary `storageKey`s and `curl -I "${CDN_BASE_URL}/${key}"` against **production's** CDN, asserting 200. Per `CLAUDE.md`, a key returning 200 in another environment proves nothing here. |
| R11 | `git diff origin/staging -- CHANGELOG.md` shows an entry referencing #521. |
| R12 | `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run format:check` all exit 0. CI on the PR is the authority, not local output. |

## Notes for the validator

- **R9 is the row that distinguishes "filled" from "looks filled".** `seedGeneratedCatalogue`
  deliberately writes ONE shared placeholder object per subcategory, so before the fill, 54 Aheed
  products legitimately share 27 keys. If R9 passes, each product genuinely has its own image; if
  it fails, the fill did not complete and the storefront will show duplicate images down each
  subcategory.
- **R6 is checked over categories, not products.** Counting products would pass trivially; the
  pre-slice failure was specifically that categories existed with nothing behind them.
- The generated names ("Everyday Rice", "Value Chickpeas") are expected and are **not** a defect —
  see `plan.md`. They are also the reason `SEED_REMOVE_GENERATED` matters and why R4 is here.
