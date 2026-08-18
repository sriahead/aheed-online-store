# P7d — Workers observability & NFR baseline (validation)

## Pre-flight — do these three things first, in this order

**1. Confirm which database and which environment you are pointed at.** `npm run preview` reads
`.dev.vars`; `prisma migrate status` and any local script read `.env`. Diff **both** against
`secrets/staging.vars` and `secrets/production.vars` before trusting any live result — two files
drift into agreement on the wrong target as easily as they drift apart (`CLAUDE.md`, P5a's
incident). Confirm the Neon host is **staging**, not production, before running anything below.

**2. Apply this slice's migration to staging.** This slice ships a migration (R15). CI applies
migrations only at merge, so staging's schema is one migration behind this branch and every
index-related row below will otherwise report a false result:

```
npx prisma migrate status      # expect: 1 pending migration
npm run db:migrate             # applies it against DIRECT_URL — additive, safe on staging
npx prisma migrate status      # expect: no pending migrations, no drift
```

**3. Deploy this branch to staging before the live rows.** R2, R11, R19 and R22 all measure the
**deployed** Worker, not a local preview — GAP-022 (#235) means the image CDN 403s anything refered
from `localhost:8787`, so a local LCP measurement is invalid by construction. Use the merged
staging deploy, and record the commit SHA you measured against.

## Rows

| Req | How to verify |
|-----|---------------|
| R1  | `grep -A3 '^\[observability\]' wrangler.toml` shows `enabled = true` and a numeric `head_sampling_rate`. |
| R2  | Run `npx wrangler tail --env staging --format json` in one shell; in another, `curl -s -o /dev/null https://staging.aheedfoodcentre.nocaped.com/`. At least one captured event carries a duration and an outcome field. `wrangler tail` streams live and does **not** depend on `[observability]`, so this is checkable on the current staging deploy before this branch merges. If tail cannot authenticate here, use the Cloudflare dashboard (Workers & Pages → `aheed-store-staging` → Logs) and copy a real event. Either way: the raw event JSON, the capture method and the UTC timestamp appear verbatim in `docs/nfr-baseline.md`. Report unverified with the reason if neither route is available — do not mark it passing on the strength of the config alone. |
| R2a | `grep -n "persisted" docs/nfr-baseline.md` — the document distinguishes persisted Workers Logs from the live tail stream and names the post-`deploy-staging` confirmation as a Ship-stage step. This row checks the *disclosure*, not the confirmation. |
| R3  | `grep -n 'Observability' specs/tech-stack.md` — the bullet names `[observability]` in `wrangler.toml` and states the head sampling rate. |
| R4  | `npx tsx scripts/measure-nfr.ts --base https://staging.aheedfoodcentre.nocaped.com` exits 0 (`echo $?` / `$LASTEXITCODE` is 0). |
| R5  | Pipe that command's stdout through `node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(j.routes.every(r=>['route','samples','errors','p50Ms','p95Ms','p99Ms'].every(k=>k in r)))"` — prints `true`. |
| R6  | `grep -nE "lib/db|lib/repositories|@prisma/client" scripts/measure-nfr.ts` returns no matches (exit 1). Then confirm the run needs no credentials: in a shell where `DATABASE_URL` and `DIRECT_URL` are both unset, re-run the R4 command and confirm it still exits 0. |
| R7  | `node -e "console.log(require('./package.json').scripts['nfr:measure'])"` prints a command referencing `scripts/measure-nfr.ts`. |
| R8  | `npm run kms:validate` exits 0 and reports `invalid front-matter (failing): 0`; `docs/nfr-baseline.md` appears in its checked set. |
| R9  | Read `docs/nfr-baseline.md`: for every route in the R5 output there is a row carrying the same six figures, and the document states the base URL, the environment, the UTC run date and the per-route request count. Cross-check two routes' numbers against the R4 output rather than trusting the prose. |
| R10 | `grep -nEi "client-observed|server-side" docs/nfr-baseline.md` — then read every table or line in the document containing a millisecond figure and confirm each sits under one of those two labels. A figure with no label is a fail. |
| R11 | The document names the tool and throttling profile and gives raw millisecond LCP values for the home route and at least one product route. Reproduce one of them: `npx lighthouse https://staging.aheedfoodcentre.nocaped.com/ --only-categories=performance --output=json --output-path=./lh.json --chrome-flags="--headless"` — Lighthouse's **default** configuration is already mobile emulation with simulated slow-4G throttling, so pass no extra form-factor/throttling flags unless the document says a different profile was used. Then `node -e "console.log(require('./lh.json').audits['largest-contentful-paint'].numericValue)"`. Expect the same order of magnitude as recorded, not an identical number — simulated LCP varies run to run. Delete `lh.json` afterwards. If Chrome is unavailable, report unverified with the reason. |
| R12 | The document states, for each of `LCP < 2.5s` and `API p95 < 400ms`, the measured value and the word "meets" or "breaches". Both targets are addressed; neither is silently absent. |
| R13 | For each target R12 marks as a breach, the document says either "remediated in this slice" with a second, post-fix number, or cites an issue number. Open that issue with `gh issue view <N> --json number,state,body` and confirm it exists, is `OPEN`, and its body contains the measured value. If R12 records no breach, this row passes vacuously — say so explicitly. |
| R14 | The review table in `docs/nfr-baseline.md` has a row for each of: product listing by category, product search, `listForUser`, the staff order list + search, and `getFinancialsForStaff`. Each row names an index (or states none) and carries a verdict of `indexed`, `partial` or `scan`. Spot-check `listForUser` against `prisma/schema.prisma`'s `Order` block — the verdict must reflect the schema as it stands *after* R15's migration. |
| R15 | `ls prisma/migrations/` shows a new directory from this slice; `grep -ril "vendorId" prisma/migrations/<new-dir>/migration.sql` shows a `CREATE INDEX` naming `vendorId`, `userId` and `createdAt`. |
| R16 | `grep -A30 '^model Order' prisma/schema.prisma` shows `@@index([vendorId, userId, createdAt])`. After the pre-flight migrate, `npx prisma migrate status` reports the schema up to date with no pending migrations and no drift detected. (Use `migrate status` for the drift check, not `migrate diff` — the diff form needs an explicit datasource/shadow-DB setup here and reports confusingly when given the pooled URL.) |
| R17 | Read `specs/architecture.md` §3.4's indexing paragraph and list every index it names. For each, confirm a matching `@@index`/`@@unique` exists in `prisma/schema.prisma`. The `Order(userId, createdAt)` claim specifically must either match a real index or be corrected — this was wrong before this slice, so verify it rather than assuming the edit landed. |
| R18 | `grep -n "ISR" specs/tech-stack.md` — the "Caching & performance" section no longer asserts ISR as the current catalogue/product strategy and points at `specs/architecture.md` §3.4. |
| R19 | `docs/nfr-baseline.md` carries a measured wall-clock figure for the staff order-search scan, stating the `Order` row count it was measured at and the with-search / without-search comparison. `gh issue view 163 --json comments --jq '.comments[].body'` contains that same figure. Re-measuring is optional; if you do, write the script to a **file** and run `npx tsx <file>` — `npx tsx -e "<script>"` fails silently on this Windows setup the moment it imports an installed package (`CLAUDE.md`). |
| R20 | `grep -n "raw SQL" CLAUDE.md` — the schema-rules section states, in so many words, whether migration-level DDL is covered by the rule. An unchanged file is a fail. |
| R21 | `grep -n "GAP-011" docs/gap-register.md` — the row's Root Cause or Status reflects the R20 ruling. |
| R22 | `docs/nfr-baseline.md` records the re-run: mutations attempted, interval, the count at which failure occurred (or "none"), and the observability evidence. Reproduce it if you can — drive `Add to cart` on a staging product page ~20 times at ~1.1s intervals (the original observation's method), or issue the equivalent server-action POSTs headlessly per `specs/sdd-workflow.md`'s Validate section. A different outcome from the recorded one is a finding to report, not a fail — record what you saw. |
| R23 | `gh issue view 236 --json state,comments` — either `CLOSED` with a referenced fix, or `OPEN` with a comment quoting R22's numbers and naming causes attributed or ruled out. |
| R24 | `docs/nfr-baseline.md` states whether Cloudflare Image Transformations are available for the zone **and** how that was determined (dashboard path, API call, or plan documentation). "Not available" is a valid answer; "not investigated" is not. |
| R25 | The document records the decision as either "adopt `next/image`" or "keep `<img>`", and its stated inputs include the R11 LCP number and the R24 availability fact. |
| R26 | Match the implementation to the R25 decision. *Adopt*: a loader module exists and `components/product/ProductCard.tsx` and `components/product/ProductImageGallery.tsx` import from `next/image`. *Keep*: `grep -n "width=\|height=" components/product/ProductCard.tsx components/product/ProductImageGallery.tsx` shows explicit intrinsic dimensions on the `<img>` elements, and the repo carries a written position on `@next/next/no-img-element`. Either way: `git diff origin/staging --stat -- 'components/staff' 'app/(admin)'` shows no changes. |
| R27 | `gh issue view 46 --json state,comments` — `CLOSED` with the decision referenced, or `OPEN` with a comment recording it. |
| R28 | `npm run kms:build-index` then `grep -c "nfr-baseline\|p7d-observability-nfr" ARTIFACT_INDEX.md` returns at least 2. Run the rebuild **last**, after every front-matter edit — the index embeds each artifact's version/updated, so a later bump re-stales it. Do not use a bare `git diff --exit-code ARTIFACT_INDEX.md` as the check: the footer records the commit it was built from, so a committed index always shows a one-commit footer diff by construction. CI's `gates` job strips that footer before comparing; mirror that or trust CI. |
| R29 | `git diff origin/staging -- CHANGELOG.md` is non-empty and the new entry describes this slice under `[Unreleased]`. |
| R30 | `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check` each exit 0. On Windows, do **not** trust `format:check` failures on files this slice did not touch — `core.autocrlf` rewrites line endings on checkout. Confirm the documented way: write the committed blob out with LF (`git show HEAD:<file>`) and run `prettier --config .prettierrc.json --check` on it from a directory prettier can resolve the config from. CI on Linux is the authority. |
