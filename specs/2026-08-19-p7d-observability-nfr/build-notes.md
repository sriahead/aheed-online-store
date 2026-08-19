# P7d — Workers observability & NFR baseline (build notes)

Written at the end of Build, before the Clear. The validating context has only `requirements.md`,
`validation.md`, the artifact, and this file. Read `validation.md`'s **three-step pre-flight** first
— particularly step 2, applying this slice's migration to staging; skipping it makes the index rows
report false results rather than fail cleanly.

## What changed and why

**`wrangler.toml` — the `[observability]` block.** Top-level, so both named environments inherit it
(`observability` is an inheritable wrangler key, like `limits`, which the file already sets only at
top level). `head_sampling_rate = 1` is 100% logging: at today's pre-launch traffic a sampled log
cannot answer "what happened on that one broken request", and the comment says explicitly that the
rate should come **down** before launch rather than the block being removed. This is the line
`specs/tech-stack.md` had been promising ("Observability via Cloudflare analytics/logs") since
before there was any config behind it.

**`scripts/measure-nfr.ts` + `npm run nfr:measure`.** Uses `node:http`/`node:https` rather than
`fetch` for two reasons worth keeping: `fetch` resolves after headers *and* stream setup, which
blurs TTFB, and undici silently drops a caller-set `Host` header — a trap this repo already paid for
in P3d. Progress output goes to **stderr** so stdout stays a single parseable JSON document, which
is what `validation.md`'s R5 row pipes into `JSON.parse`. Each route gets one **discarded warm-up**
request whose timing is reported separately as `warmupMs`: a Worker cold start is real but it is not
what "p95 under normal traffic" means, and one 900 ms outlier in twenty samples moves p95 outright.
Non-2xx/3xx responses are counted as `errors` and excluded from the percentiles, so a fast 500
cannot flatter the numbers.

**`docs/nfr-baseline.md`** is the slice's actual product. Structure follows the argument: what was
measured, in what environment, what met its target, what didn't, and why. Every latency figure
carries a **client-observed** or **server-side** label because the two are not interchangeable and
the document would rot quickly if they blurred.

**`prisma/schema.prisma` + migration `20260818233907_p7d_order_user_history_index`.** Adds
`Order(vendorId, userId, createdAt)`. `lib/repositories/orders.ts:710`'s `listForUser` filters
`{vendorId, userId}` and orders by `(createdAt desc, id desc)`; the only `Order` indexes were
`(vendorId, createdAt)` and `(vendorId, status, createdAt)`, so Postgres could only walk the
**vendor's** orders in date order and discard other customers' rows. The existing
`(vendorId, createdAt)` index is deliberately **kept** — it still serves the unfiltered staff list.

**`components/product/ProductCard.tsx`, `ProductImageGallery.tsx`, `components/cart/CartContents.tsx`,
`components/layout/Header.tsx`, `eslint.config.mjs`** — the #46 decision, see below.

**Persistent docs.** `specs/architecture.md` §3.4 (indexing paragraph reconciled to the schema; the
blockquote records what it got wrong so the correction is legible rather than silent),
`specs/tech-stack.md` (observability mechanism; ISR claim corrected), `CLAUDE.md` (the raw-SQL
ruling), `docs/gap-register.md` (GAP-011 updated, GAP-025/GAP-026 added).

## Decisions taken during the build

**`head_sampling_rate = 1` rather than a fraction.** Rejected sampling because the immediate use is
diagnosing specific failures (#236's concurrent errors), which sampling defeats. Recorded as a
launch-time revisit in both `wrangler.toml` and `tech-stack.md` rather than left as a silent choice.

**The harness measures public routes only.** An authenticated route would give richer coverage but
would need a credential, and then it could not run from a clean checkout or in CI — which is the
property that makes the number re-takeable by someone who was not present. R6 encodes this.

**Route list is a hardcoded default with a `--routes` override.** The default slugs
(`fruit-veg`, `basmati-rice-5kg`) are real ones discovered from the deployed storefront, not guessed.
A reseeded database or a different vendor needs `--routes`; a wrong slug surfaces as an `errors`
count rather than being averaged in silently.

**Two databases were measured, and the tables are deliberately not presented as a before/after.**
The index was applied to the dev branch (what `.env` points at) but not yet to staging, which looks
like a natural A/B. It isn't: the dev branch measured ~2× slower across *every* query including ones
the index cannot affect, which is Neon compute state, not a regression. The baseline says so
explicitly. Attributing that difference to the index would have been an easy, wrong, flattering
story.

**#46 decided as "keep `<img>`", and the lint rule turned off repo-wide rather than suppressed per
line.** Previously some call sites carried an inline `eslint-disable` and others didn't, so the
warning conveyed no information; after the decision, two of those directives became "unused
directive" warnings, which is what surfaced the inconsistency. Turning the rule off in
`eslint.config.mjs` with the reasoning inline makes the position reviewable in one place. Rejected:
adopting a `next/image` loader anyway "for future-proofing" — with no resizer behind it that is a
migration across the storefront in exchange for identical bytes.

**#243 and #244 filed to P8, not P7.** Both remediations are account/plan decisions plus asset
operations rather than repo code — the same category as #113 (live Stripe keys) and #104 (Resend
domain). P7d's obligation was to measure. **This is a judgment call and was flagged as one**; if the
reviewer disagrees, re-milestoning is the fix, not re-opening the measurement.

**A temporary `tmp-measure-queries.ts` was written into the repo root and deleted after use.** Per
`CLAUDE.md`, `npx tsx -e` fails silently on this Windows setup once a script imports an installed
package — which it hit immediately. It also needed `new PrismaClient({ adapter: new PrismaNeon(...) })`
rather than a bare `datasources` override (Prisma 6 requires a driver adapter here; the bare form
fails `P2038`). Both worth knowing for anyone re-taking these numbers.

## Deviations from the spec

**R2 was split into R2 + R2a, and R22 into R22 + R22a — both during the slice, both disclosed here.**
Same root cause: each originally demanded evidence that only exists *after* `deploy-staging`, while
Gate 3 runs *before* the staging merge. As written they were unverifiable by construction, which is
the failure mode the Spec stage exists to prevent. The split keeps the checkable half at Gate 3 and
names the post-deploy half as a Ship-stage step. R2 was corrected before the spec commit; R22 after
the #236 measurement made the same flaw concrete.

**`plan.md`'s claim that the raw-SQL question was undecided was wrong, and is corrected in place.**
`specs/architecture.md` §3.1 has said since the schema was written that "DDL for indexes lives in
migrations, which is standard portable SQL, not application queries", and names `pg_trgm` as
acceptable via portable migrations. The deliverable therefore changed shape — from *making* a ruling
to *relocating* one into `CLAUDE.md`, the file actually read at decision time. The correction is
marked in `plan.md` rather than rewritten silently, because the reason GAP-011 stayed blocked is the
more useful finding.

**R13's LCP breach is filed, not remediated** — which R13 explicitly permits ("either remediated
within this slice … or has a GitHub issue citing the measured value"). Recording it here because a
validator seeing a 5× breach on a passing slice should find the decision documented, not infer it.

**Two files outside the strict letter of R26 were touched:** `components/cart/CartContents.tsx` and
`components/layout/Header.tsx`, to remove `eslint-disable` directives that the rule change made
redundant (they emitted "unused directive" warnings and would have failed the lint gate). R26's
actual constraint — no changes under `components/staff/**` or `app/(admin)/**` — is intact.

## Known-shaky areas

**`wrangler tail` does not work from this machine.** It authenticates (`wrangler whoami` succeeds
with the token in `secrets/staging.vars`) and then fails with `fetch failed` before streaming any
event. **R2 is therefore unverified, not passing** — if it works in the validating environment,
capture a real event and add it to `docs/nfr-baseline.md`; if not, report unverified with the
reason. Do not mark it passing on the strength of the config being present.

**LCP numbers are simulated, not real-device.** Lighthouse's `throttlingMethod: simulate` models
slow 4G rather than measuring it, and the runs varied 11.7–12.6 s. The *conclusion* is robust — a
1.9 MB asset over a 1,474 Kbps link cannot be fast, and page weight was consistent at ~2.31 MB
across all three runs — but do not treat any single figure as precise. Re-running will give a
different number in the same band.

**All client-observed latency was measured from one machine in one city, and it is the best case.**
`CF-RAY` reported colo LHR; staging Neon is `eu-west-2`. Client, edge and database were all in
London. A shopper in Manchester on real 4G will be worse, and nothing here bounds by how much. The
API p95 margin (138.92 ms vs 400 ms) is comfortable enough that this is unlikely to flip the
verdict, but the figure is not a claim about typical users.

**The #236 concurrency result is the least certain thing in the slice.** 3 of 20 concurrent
mutations failed at the connection level with no HTTP status. That is equally consistent with a
Worker-side limit and with Node's undici per-origin socket pool on the *client*. The baseline and
the issue comment both refuse to name a cause; if validation is tempted to conclude one, it needs
server-side records that do not exist until after `deploy-staging`.

**Row counts are tiny (118 orders, 22 products), so every query-timing conclusion is
volume-bounded.** Nothing in the index review is index-sensitive at this scale — the ~15 ms Neon
round-trip dominates all four measured queries. The R15 index is justified by the access pattern and
by `architecture.md` being wrong, **not** by a measured improvement, and the baseline is careful to
say so. A validator looking for "the index made it faster" will not find it, and should not.

**The production logo 404 (#244) was found from outside only.** It is inferred that
`VendorBranding.logoStorageKey` is populated in production because the storefront renders the
`<img>` branch rather than its lettermark fallback — the production database was **not** queried
directly. That inference is sound but is an inference. Only Aheed's vendor was checked; SriMart's
production branding was not.
