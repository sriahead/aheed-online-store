# Products in every subcategory, for both vendors (validation)

Run from a fresh context. R10–R14 read **production**; they are verification steps, not repeatable
mutations — the catalogue is already seeded, so re-running the seed is a no-op by design.

> **Testing strategy.** The seed's control flow (idempotency, skipping absent categories, the
> both-vendor undo) is exercised against a **dev** database where rows are free. Production is then
> queried, not re-seeded. The defects this slice actually hit — a generator filing groceries under
> an electronics subcategory, and a slug collision silently seeding one fewer row — were both
> invisible to `lint`/`typecheck`/`test` and to any unit test, because both produced *valid* rows
> that were simply wrong. R2 and R6 exist specifically for them.

## Preconditions

- `secrets/production.vars` present. **Confirm the resolved host before trusting any production
  result** — only the host proves the target, never the filename (`CLAUDE.md`, P5a).
- If storage or AI calls fail with `UND_ERR_CONNECT_TIMEOUT` against an IPv6 address, re-run with
  `NODE_OPTIONS=--dns-result-order=ipv4first`. Needed throughout this slice; a sandbox egress
  condition, not a defect.

| Req | How to verify |
|---|---|
| R1 | Read `prisma/seed.ts`. For each vendor, collect every `children[].slug` in its catalogue and assert each is a key in that vendor's subcategory fixture with `length >= 2`. Aheed: 27 keys. SriMart: 4. |
| R2 | Read both fixtures. Each product must be plausible for its key — spot-check `cleaning`, `chicken-poultry`, `sri-chargers-cables`, `sri-storage`. **SriMart's fixture must contain no food**; a grocery product there is the exact defect this slice was rewritten to fix. |
| R3 | Read `seedSubcategoryProducts`: `putTracked` for every pending product runs **before** the `prisma.product.create` loop, and each create includes a nested primary `images` row and an `inventory` row. |
| R4 | Against dev, run the seed twice. The second run prints "all subcategory products already exist" and creates zero. Then delete one product row, re-run, and confirm only that one is recreated. |
| R5 | Against a dev database seeded **without** `SEED_SRIMART_HOST`, run the seed: it completes with no error and creates no SriMart rows, proving the SriMart fixture is skipped when its categories are absent. |
| R6 | `node -e` (or a short script) over the parsed fixtures: assert the intersection of subcategory-fixture slugs and top-level `CATALOGUE`/`SRIMART_CATALOGUE` product slugs is **empty**, per vendor. |
| R7 | `grep -n "SEED_SCALE_PRODUCTS_SRIMART" prisma/seed.ts` returns nothing. `maybeSeedGeneratedCatalogue` is called exactly once, with `AHEED_VENDOR_ID`. |
| R8 | Read the `SEED_REMOVE_GENERATED` branch: `removeGeneratedCatalogue` called for both vendor ids. Then against dev, generate a small set, remove it, and confirm `gen-` counts reach 0 for **both**. |
| R9 | `git diff origin/staging -- prisma/generate-catalogue.ts` produces no output. |
| R10 | Against production, group every category by id with its product count. Assert none is 0, and that every category with a non-null `parentId` has count `>= 2`. |
| R11 | Against production: `SELECT count(*) FROM "Product" WHERE slug LIKE 'gen-%'` returns 0 for both vendors. |
| R12 | Against production, count products whose image rows are all placeholders (`every`, so a product with no images counts). Expect **1** — `Halal Chicken Thighs 1kg`. Any other product appearing here is a real gap, not the known one. |
| R13 | Against production, for the curated subcategory products, compare the count of non-placeholder image rows with `count(DISTINCT "storageKey")` over the same set. They must be equal. |
| R14 | Take five of those primary `storageKey`s and `curl -I "${CDN_BASE_URL}/${key}"` against **production's** CDN, asserting 200. A key returning 200 elsewhere proves nothing here (`CLAUDE.md`). |
| R15 | `git diff origin/staging -- CHANGELOG.md` shows an entry referencing #521. |
| R16 | `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run format:check` all exit 0. CI on the PR is the authority. |

## Notes for the validator

- **R2 is the row that would have caught the original defect**, and it is deliberately a judgement
  check rather than a mechanical one. There is no assertion that distinguishes "Everyday Rice under
  `cleaning`" from a correct row except reading it. Read it.
- **R6 exists because the failure mode is silent.** `seedSubcategoryProducts` filters pending
  products by existing slug, so a collision with a top-level product does not error — it just
  seeds one fewer row. `juices-soft-drinks` shipped with one product for exactly this reason before
  `orange-juice-1l` was changed to `apple-juice-1l`.
- **R12 expects 1, not 0.** That is not a relaxed requirement — it is the recorded, tracked
  exception in **#523**: Workers AI returns `NSFW content` (code 8007) for
  `Halal Chicken Thighs 1kg` on every attempt. It renders as the grey "no image" box (#502), not
  as anything broken. If a *different* product turns up in this count, that is a new failure.
