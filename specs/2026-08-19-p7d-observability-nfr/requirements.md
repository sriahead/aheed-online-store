# P7d — Workers observability & NFR baseline (requirements / acceptance criteria)

Closes out the observability and performance-measurement half of P7 (#218), and resolves or
evidences three items that were waiting on it: GAP-011's `pg_trgm` ruling, #236's cart-mutation
ceiling and #46's image-loader decision. Builds on `specs/mission.md`'s non-functional targets
(`LCP < 2.5s` on 4G, API `p95 < 400ms`) and `specs/architecture.md` §3.4. In one line: the app
gains the ability to be measured, gets measured, and the numbers are written down — including the
ones that fail. See `plan.md` for why these requirements assert *that a measurement was recorded*
rather than *that it passed*.

**Naming convention used below:** "the baseline document" means `docs/nfr-baseline.md`.

## Observability

R1. `wrangler.toml` contains a top-level `[observability]` block setting `enabled = true` and an
    explicit numeric `head_sampling_rate`.

R2. A live request event from the **deployed staging Worker** is captured — including a wall-clock
    duration field and an outcome field — and quoted verbatim in the baseline document, with the
    capture method and UTC timestamp stated. This proves the event pipeline carries the fields the
    NFR work depends on, and is checkable before this branch merges.

R2a. The baseline document states that **persisted** Workers Logs (what R1's `[observability]`
     block enables, as distinct from the always-available live `wrangler tail` stream) can only be
     confirmed once `deploy-staging` has run for this branch, and names that confirmation as a
     Ship-stage step. R2a is satisfied by the disclosure; the confirmation itself is recorded at
     Ship. Validation runs before the staging merge, so a row demanding post-deploy evidence at
     Gate 3 would be unverifiable by construction — this splits the checkable half from the half
     that cannot exist yet, rather than letting the whole row fail.

R3. `specs/tech-stack.md`'s Observability bullet names the concrete mechanism now configured in
    `wrangler.toml` and states the head sampling rate, replacing the current generic "Cloudflare
    analytics/logs" wording.

## Measurement harness

R4. `scripts/measure-nfr.ts` exists and `npx tsx scripts/measure-nfr.ts --base <url>` exits 0
    against a reachable base URL.

R5. That command writes a single JSON object to stdout containing a `routes` array whose every
    element has the keys `route`, `samples`, `errors`, `p50Ms`, `p95Ms` and `p99Ms`, with numeric
    values.

R6. The harness issues plain HTTP requests only: it imports nothing from `lib/db`,
    `lib/repositories/*`, `@prisma/client` or `@prisma/client/wasm`, and requires no session cookie
    and no database credential to run.

R7. `package.json` contains an `nfr:measure` script that invokes `scripts/measure-nfr.ts`.

## Recorded baseline

R8. `docs/nfr-baseline.md` exists and carries valid KMS front-matter — `npm run kms:validate`
    exits 0 and reports zero failing artifacts.

R9. The baseline document records, for every route the harness measured: the R5 figures, the base
    URL and environment measured against, the UTC date of the run, and the request count per route.

R10. Every latency figure in the baseline document is explicitly labelled either **client-observed**
     (wall-clock TTFB from the machine that ran the harness) or **server-side** (from Workers
     observability). No latency figure appears without one of those two labels.

R11. The baseline document records an LCP measurement for at least the storefront home route and at
     least one product detail route, stating the tool used, the throttling profile used, and the
     raw millisecond values — not a pass/fail verdict alone.

R12. For each of `specs/mission.md`'s two measured targets (`LCP < 2.5s` on 4G, API `p95 < 400ms`),
     the baseline document states the measured value and whether it meets or breaches that target.

R13. Every target R12 records as a breach is either remediated within this slice — with the
     post-remediation number recorded alongside the original — or has a GitHub issue citing the
     measured value; the baseline document names which of the two applies, per breached target.

## Index & query review

R14. The baseline document contains an index/query review table covering at minimum these read
     paths, each with the index that serves it and a verdict of `indexed`, `partial` or `scan`:
     product listing by category, product search, `listForUser` (order history), the staff order
     list with its search filter, and `getFinancialsForStaff`.

R15. A new Prisma migration under `prisma/migrations/` adds a composite index on `Order` covering
     `vendorId`, `userId` and `createdAt`.

R16. `prisma/schema.prisma`'s `Order` model declares the matching `@@index`, and
     `npx prisma migrate status` against `DIRECT_URL` reports no schema drift and no pending
     migration after that migration is applied.

R17. Every index named in `specs/architecture.md` §3.4's indexing paragraph exists in
     `prisma/schema.prisma`. In particular the `Order(userId, createdAt)` claim at
     `specs/architecture.md:308` either names an index that now exists or is corrected.

R18. `specs/tech-stack.md`'s "Caching & performance" section no longer presents Next.js Data
     Cache / ISR for catalogue and product pages as the current strategy, and refers the reader to
     `specs/architecture.md` §3.4 for what actually applies.

R19. The baseline document records a measured wall-clock cost for the staff order-search `contains`
     scan (`lib/repositories/orders.ts:580-590`) — obtained by timing the repository call from a
     `tsx` script, with and without a search term, and stating the `Order` row count it was measured
     at — and issue **#163** carries a comment quoting that measurement.

## Raw-SQL ruling (unblocks GAP-011 and #220)

R20. `CLAUDE.md` states explicitly whether migration-level DDL falls within its "No raw SQL in
     application code" rule, in the schema-rules section where that rule is stated.

R21. `docs/gap-register.md`'s GAP-011 row reflects the R20 ruling in its Root Cause or Status cell.

## #236 — cart-mutation ceiling

R22. The baseline document records a re-run of #236's scenario against staging with observability
     enabled, stating: the number of sequential add-to-cart mutations attempted, the interval
     between them, the mutation count at which a failure occurred (or that none did), and the
     observability evidence gathered during the run.

R23. Issue **#236** is either closed with a reference to the fix that closed it, or carries a
     comment quoting R22's numbers and naming the causes attributed or ruled out.

## #46 — image rendering decision

R24. The baseline document states whether Cloudflare Image Transformations are available for this
     project's zone and how that was determined.

R25. The baseline document records the #46 decision — adopt a `next/image` custom loader, or keep
     plain `<img>` — naming both the R11 LCP measurement and the R24 availability fact as inputs.

R26. The branch R25 records is implemented, and only on the storefront surfaces: for *adopt*, a
     loader module exists and `components/product/ProductCard.tsx` and
     `components/product/ProductImageGallery.tsx` render through `next/image`; for *keep*, those
     two components render `<img>` with explicit intrinsic `width` and `height` attributes and the
     repo carries a documented deliberate position on `@next/next/no-img-element`. Under either
     branch, `git diff` shows no change to `components/staff/**` or `app/(admin)/**`.

R27. Issue **#46** is either closed with the decision referenced, or carries a comment recording the
     R25 decision.

## Gates

R28. `ARTIFACT_INDEX.md` is rebuilt and contains entries for both `docs/nfr-baseline.md` and
     `specs/2026-08-19-p7d-observability-nfr/plan.md`.

R29. `CHANGELOG.md` updated (Gate 4).

R30. `lint`, `typecheck`, `test` and `format:check` all remain green after this slice.
