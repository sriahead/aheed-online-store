# Product image integrity (build notes)

Branch `feature/product-image-integrity`, cut from `origin/staging` at `a35da71`. Built in the
**main checkout** (`E:/GitRepositories/aheed-online-store`), not a sub-agent worktree.

Two commits: `ae899ff` (spec) then `a39ee7b` (implementation).

## What changed and why

**`prisma/seed.ts` — the uploads moved above the guard, and that ordering is the whole fix.**
`seedGeneratedCatalogue` opened with `if (existing >= count) return;` and did its `putTracked`
placeholder uploads *after* it. Both the `ProductImage` rows and the objects they point at are
written by this one function, but the guard consulted only the rows — so the moment a database held
the generated products, no later seed run ever uploaded the objects into that environment's bucket.
Dev had every object; staging had none, while its pages went on referencing them. The category
resolution had to move above the guard too, because the upload loop needs `usableSlugs`. The skip
message now says "skipping row creation" rather than "skipping", because the function no longer
skips wholesale — a reader of the log needs to know the uploads still ran.

**`scripts/restore-placeholder-images.ts` (new) — repairs what the seed fix cannot.** A seed fix
only helps a database seeded *after* it. Staging's rows already exist, so something has to walk the
existing rows and upload their objects. It reads `ProductImage` and writes only storage; there is
no row-mutating path in it, which is what makes it safe to point at staging — unlike
`scripts/verify-repository-injection.ts`, which creates rows and therefore refuses any host but
dev. It takes an explicit `--env-file` and prints the resolved database host, bucket and CDN before
doing anything, per `CLAUDE.md`'s #119 rule.

**`components/product/ProductImage.tsx` (new) — the failure mode, not just the instance.** Fixing
staging's bucket fixes today's symptom. A `ProductImage` row and its stored object are written by
different systems, so a row can always outlive its object; before this, that rendered as the
browser's broken-image icon with alt text sitting where the photo should be. This is the smallest
possible client boundary — `ProductCard` stays a Server Component and delegates only the `<img>`
— and its fallback markup is deliberately byte-identical to `ProductCard`'s own no-image branch, so
a shopper cannot tell a missing object from a product that never had a photo.

**`lib/repositories/products.ts` — two independent defects in the backfill path.**
`getProductsWithoutImages` asked for `images: { none: {} }`, which matched **zero** products for
either vendor, because both seed paths give every product a placeholder row. It now selects
products whose images are *all* placeholders. `saveGeneratedProductImage` wrote `isPrimary: false`
while every storefront read selects `where: { isPrimary: true }` — so a filled image would have
uploaded, cost an AI call, and never appeared. It now claims primary and deletes the shared
placeholder row it replaces (a real vendor-uploaded image is demoted, not deleted).

**`lib/product-metadata.ts` — a relevance floor.** The text search asks for `page_size=1` and
returned `products[0]` unconditionally. Open Food Facts ranks on keyword overlap, so every product
whose name contains "Paneer" resolved to the same top hit and received one identical image. That is
the "keeps repeating" the issue was opened for.

**`lib/product-image-pipeline.ts` — `needsReview` on both paths, plus the operator switch.**
`needsReview` was set only for AI-generated images, which had the rule backwards: the third-party
photo matched on a keyword search is the result *most* likely to be the wrong product, and it was
the one written unflagged.

## Decisions taken during the build

**The placeholder rule is a key-shape test, single-sourced.** `PLACEHOLDER_IMAGE_SUFFIX` and
`isPlaceholderImageKey` both live in `lib/product-image.ts`. The repository needs the rule inside a
Prisma `where` (as `endsWith`) and the pure predicate is needed for tests and for reasoning about
already-fetched rows; both spellings read the same constant so they cannot drift. Rejected: an
`isPlaceholder` column on `ProductImage`, which is more explicit but costs a migration to express
something derivable from the key, and would need backfilling for existing rows anyway.

**`every` rather than an over-fetch-and-filter.** The first draft fetched `limit * OVERFETCH`
products and filtered in memory, on the assumption Prisma couldn't express "ends with" in a
relation filter. It can. `images: { every: { storageKey: { endsWith: … } } }` is one query, and
because Prisma's `every` is vacuously true for an empty relation it covers the no-images case in
the same clause. The over-fetch version also had a real bug: if the first N products all had real
images it returned nothing, even with candidates further down.

**`getProductsWithoutImages` gained a deterministic `orderBy` the spec didn't ask for.** Newest
first. Two reasons, both wanted: a bounded batch becomes assertable (the harness case below depends
on it), and a vendor's real catalogue — newer than the seeded demo set — gets filled before the
2,000 generated products. Without an `orderBy` the batch is whatever the planner returns.

**R7 is verified by the existing live harness, not a mock.** `scripts/verify-repository-injection.ts`
already creates a `__verify-`-prefixed product and image against a real database, cleans up after
itself, and refuses to run against staging or production. Extending it was cheaper and far more
honest than a Prisma mock: the whole defect being fixed is one where the *query* was wrong while
the code around it read perfectly, and a hand-built mock proves whatever its author assumed. Run
against dev: **15/15 PASS**, `selected the no-image and placeholder-only rows, skipped the
real-image row`, and 0 rows left behind.

**The Open Food Facts matcher is deliberately weak.** One shared token of 3+ characters, excluding
a stop-word list of marketing adjectives ("premium", "fresh", "golden", …) and anything starting
with a digit (sizes: "500g", "2kg"). It is a floor that rejects an unrelated product, not an
attempt to rank two plausible hits — Open Food Facts' own ranking is better placed for that, and a
stricter rule would reject good matches to avoid bad ones. Everything that survives it is written
with `needsReview` set anyway.

**The toggle sends `{"useOpenFoodFacts": …}` in the POST body, defaulting to true on an absent or
unparseable body.** So the endpoint behaves exactly as before for any caller that doesn't send one;
only an explicit `false` disables the source.

**`BACKFILL_BATCH` was extracted to a named constant with the cost reasoning attached** rather than
left as a bare `10` at the call site. It is the only thing standing between one button click and an
unbounded Workers AI spend across 2,026 products.

## Deviations from the spec

**Two `validation.md` rows were corrected during Build**, both recorded in the implementation
commit message:

- **R6** named `tests/product-card.test.tsx`; the file built is
  `tests/product-card-image.test.tsx`, and it exercises `ProductImage` (the extracted client
  boundary) rather than `ProductCard` itself, since that is where the `onError` behaviour lives.
  The row now also asks the validator to confirm `ProductCard` delegates to it.
- **R12** originally said to confirm via the local Worker observability log that no Open Food Facts
  request was made. That is not checkable there — the log captures `console.*` output, not the
  Worker's *outbound* `fetch` calls, so the row could never have passed as written. The suppression
  claim is asserted in R11's unit case against a spy; R12 now checks the request payload in
  devtools instead.

No requirement's substance changed. `plan.md` said `saveGeneratedProductImage` would write
`isPrimary: true` "when the product has no existing primary"; the implementation always claims
primary and demotes any existing one, which is what R8's "exactly one row marked `isPrimary: true`,
and its `storageKey` is the newly generated key" actually requires — the narrower `plan.md`
phrasing would have left a vendor-uploaded primary in place and failed R8.

## Known-shaky areas

**R5 has not been run.** Nothing in this branch has touched the staging bucket. That row writes to
a live environment and Build is the wrong stage to self-certify it from the context that wrote the
script. Confirm the printed host is `ep-empty-scene-zafjzeye` and bucket `aheed-images-staging`
before letting it proceed. The script has been exercised against dev only.

**`parseEnvFile` is hand-rolled and only tested by use.** It exists because this repo's `.env` has
spaces around `=` and trailing `# comment`s on the same line as values — which `CLAUDE.md`'s own
env-format rule warns has silently broken connection strings here. It handles quoted values by
taking everything up to the closing quote (so a `#` inside a URL survives) and unquoted values by
splitting on the first `#`. It has no unit test. If the staging run resolves a surprising host or
bucket, look here first — and the script prints both before acting precisely so that is visible.

**The Open Food Facts stop-word list is a judgement call, not a measurement.** It was written
against the generated catalogue's naming pattern (adjective + noun + size). A real vendor product
legitimately named around one of those adjectives could fail to match and fall through to AI
generation — which is a degraded outcome, not a wrong one, but it is untested against real vendor
data.

**`saveGeneratedProductImage` issues several sequential writes without a transaction.** Create the
new row, then per existing row either delete (placeholder) or demote (real). Singular `update`/
`delete`, never `updateMany` — that is deliberate and required (#382: the HTTP adapter cannot run
the transaction Prisma's query compiler wraps `updateMany` in). The consequence is that a failure
mid-loop could leave two rows claiming primary. `findPage` takes `take: 1`, so the storefront
renders one image either way rather than breaking; it would just be non-deterministic which.
Worth a look if validation sees an unexpected image on a card.

**Nothing has exercised the full click-through under `npm run preview`.** R8 and R12 are the live
rows and both need an ADMIN session; R8 additionally spends real Workers AI calls when Open Food
Facts declines or is switched off.

**A block-comment trap cost three files during Build, and would recur.** Writing
`products/gen-*/main.svg` inside a `/** … */` comment terminates the comment at the `*/` in the
glob, turning the following prose into code. It broke the parse in `prisma/seed.ts`,
`components/product/ProductImage.tsx` and `scripts/restore-placeholder-images.ts`; `typecheck`
catches it, but the error text ("Module declaration names may only use ' or \" quoted strings")
points nowhere near the cause. Written as `products/gen-<subcategory>/main.svg` throughout.
