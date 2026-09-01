# Production catalogue seed, cross-environment image copy, scheduled fills (build notes)

Written at the end of Build, before the Clear. Branch
`feature/production-catalogue-and-image-fills`, cut from a freshly-fetched `origin/staging` at
`f29d559`. Spec commit `08a8c81`.

Unusually for this repo, **most of this slice's validation already ran live during Build**, because
the deliverable is partly an operation against production rather than only code. What ran, and what
did not, is set out explicitly below — `/validate` should re-run the code rows from a fresh context
and should not assume the production rows need repeating (they are not idempotent in the sense that
matters: the catalogue is already seeded).

## What changed and why

**`lib/storage.ts`** — `StorageService` gained `getObject(key)` returning `Promise<ArrayBuffer | null>`.
The port genuinely had no read primitive: the app composes a public CDN URL for display and never
needed bytes server-side. Copying an image between environments does, and it cannot go via the CDN
because both zones enforce hotlink/referer protection (`CLAUDE.md`). The 200/404/error decision is
extracted to a pure `readGetObjectResponse(res)` so a test can reach it with no credentials and no
network — the same reason `composePublicUrl` is pure. `null` on 404 matches `headObject`'s existing
posture.

**`scripts/copy-product-images.ts`** (new) — the substance. See `plan.md` for why it is row-aware
and slug-keyed rather than a bucket copy; that is the finding the whole script exists around.
Per-product work is wrapped in its own try/catch reporting the slug, added during Build after a
bare `fetch failed` from undici aborted the first run with no indication of which of 8 products it
came from. A failure sets `process.exitCode = 1` but does not abandon the remaining products.

**`scripts/fill-product-images.ts`** (new) — the scheduled fill. Constructs its own `PrismaClient`
from the bare `@prisma/client` specifier and passes it explicitly to the repository functions.
Caps the run across all vendors, not per vendor, so a second vendor cannot multiply the spend a
single scheduled run was authorised for.

**`.github/workflows/fill-product-images.yml`** (new) — daily at 03:00 UTC plus
`workflow_dispatch`. Materialises an env file from GitHub environment secrets under `$RUNNER_TEMP`
and removes it in an `if: always()` step, so the script keeps its explicit-target contract while
CI's config still comes from secrets rather than a committed file.

**`prisma/seed.ts`** — unchanged, as the spec required (R14).

## Decisions taken during the build

**`--limit 0` deliberately does its work late, not early.** The obvious implementation returns
immediately. That would have made R12 — the row that proves this script loads in real Node —
almost worthless: it would exercise neither the Prisma client, nor the database, nor the
`@/lib/product-image-pipeline` import, and would pass just as happily if `lib/db`'s WASM query
compiler had been pulled in by accident. The early return was moved below the client, the vendor
query and the pipeline import, and the code carries a comment saying why so it is not "tidied"
back. This was caught by noticing the first R12 run proved less than it appeared to, not by the
spec.

**The production seed was run twice, deliberately.** The first pass omitted `SEED_AHEED_HOST` and
`SEED_SRIMART_HOST` to avoid touching `VendorDomain` on a live site before knowing how
`upsertVendorDomain` keyed its upsert. That pass seeded Aheed fully (4 categories, 8 products, 27
subcategories, 6 featured, bundles, tiers) but skipped the SriMart branch entirely, leaving
subcategories at 27 against R15's 31. Reading `upsertVendorDomain` showed it is keyed on `host`
(unique), so passing the correct production hosts could only add or refresh those exact rows and
could not disturb the stale ones. The second pass then completed SriMart (4 subcategories, 2
featured, 1 bundle, 1 tier) and brought subcategories to 31.

**Content type comes from `headObject`, not from the key's extension.** Guessing from `.webp` would
be wrong for exactly the images `#364` describes — the copied objects really are `image/png` bytes
under a `.webp` key, visible in the R16 output. This slice carries that through faithfully rather
than fixing or hiding it.

## Deviations from the spec

**None in the code.** R1–R14 are implemented as written.

**R13 cannot be fully satisfied and is the one row a validator must not tick.** The workflow file
exists and declares both triggers, but the `production` GitHub environment holds only
`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` and `DIRECT_URL` — verified via
`gh api repos/sriahead/aheed-online-store/environments/production/secrets`. The workflow needs six
more (listed under "What a human must create"). Until they exist, `gh workflow run` would fail on
the first real fill. **The scheduled job is therefore written and merged but not yet operational,
and nothing in `lint`/`typecheck`/`test`/`build` will say so.**

## What a human must create

Add to the **`production`** GitHub environment (Settings → Environments → production → secrets).
Values are the ones already in `secrets/production.vars`:

- `S3_ENDPOINT`
- `S3_BUCKET`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `S3_REGION`
- `CDN_BASE_URL`

`DIRECT_URL`, `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` already exist and are reused.

## What ran live during Build

Against real environments, not stubs:

| Row | Result |
|---|---|
| R2 | `npx vitest run tests/storage.test.ts` — 5 passed, including the new 200 / 404 / 403 cases |
| R3 | No flags, and `--from` only: both exit 1 with the usage line |
| R5 | staging→staging: exits 1, "refusing to run: source and destination resolve to the same bucket" |
| R6 | copy run reports `p5b-validation-fixture` nowhere; production holds 0 such rows |
| R7 | keys minted from production ids, all 8 different from staging's |
| R9 | fourth run: "destination products needing an image: 0", copied 0, exit 0 |
| R12 | `--limit 0` against staging: exit 0, "loaded pipeline and reached 2 vendor(s)" |
| R14 | `git diff origin/staging -- prisma/seed.ts` empty |
| R15 | production: 29 products, **0** `gen-*`, 46 categories, **31** subcategories, 8 featured |
| R16 | production: 0 products needing an image; **8/8 keys return HTTP 200 from production's CDN** |
| R18 | lint, typecheck, 844 tests across 71 files, format:check all green |

The copy needed four invocations to move all 8 images: transient `fetch failed` (undici, once
`ECONNRESET`) affected 2 products on the first run and 1 on the second. Same credentials and
endpoint succeeded for the others in the same run, so this is sandbox egress flakiness, not a
defect — and it is precisely why the per-product try/catch and the idempotent driving query matter:
each re-run picked up exactly the remainder.

## Known-shaky areas

- **R13 is unverified end to end** — see Deviations. The workflow's YAML parses and its triggers
  are declared, but it has never executed, and it cannot until the six secrets exist.
- **The daily 03:00 UTC cadence is a guess**, not a measured choice. With production now holding
  zero products needing an image, the job will do nothing on most runs, which is the intended
  steady state.
- **`#519` was filed, not fixed** — production's `VendorDomain` holds two stale *staging* hosts.
  Pre-existing and inert (staging's Worker uses staging's database), and untouched by this slice's
  host-keyed upserts, but it is a silent mis-tenanting risk if production's database is ever
  resolved against by something other than the production Worker.
- **`#364` is propagated, not fixed.** The copied objects are `image/png` under `.webp` keys.
