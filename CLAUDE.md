---
id: claude-md
title: "CLAUDE.md — AI Assistant Guardrails"
audience: [dev]
type: doc
status: approved
version: "1.11.0"
updated: 2026-08-31
visibility: internal
summary: AI assistant guardrails for the Aheed Online Store — runtime/hosting, database, schema, storage, config, CI/CD, and the SDD gates every session must follow.
tags: [guardrails, ai-assistant, conventions]
---

# CLAUDE.md — AI assistant guardrails (Aheed Food Centre Online Store)

Read this first, every session. It encodes decisions already made; do not re-derive them from
training defaults. For depth, read `specs/architecture.md`, `specs/tech-stack.md`, and
`specs/decisions/ADR-001..003` **before proposing anything**.

## What this project is
UK grocery e-commerce for **Aheed Food Centre**. **PostgreSQL-first, vendor-agnostic,
cost-effective.** Currently at **Milestone 0 (walking skeleton)** — a minimal app proving
`browser → Worker → Prisma → Neon` end to end. No features until M0 is green.

## Runtime & hosting (authoritative — overrides any GCP/Pages/edge assumptions)
- Next.js on **Cloudflare Workers** via `@opennextjs/cloudflare`. **NOT** Cloudflare Pages, **NOT**
  `@cloudflare/next-on-pages`, **NOT** Next's `edge` runtime. Never add `export const runtime = 'edge'`.
- App runs on the **Node.js runtime** (Workers `nodejs_compat`). Keep `compatibility_flags =
  ["nodejs_compat"]` and a recent `compatibility_date` in `wrangler.toml`.
- Build/deploy: `opennextjs-cloudflare build` then `wrangler deploy --env <env>`. Local dev: `next dev`.
  Local Workers runtime: `opennextjs-cloudflare preview`.

## Database (Neon + Prisma on V8 isolates)
- Neon Serverless Postgres via **Prisma + `@prisma/adapter-neon`** over `@neondatabase/serverless`
  (WebSocket/HTTP). **Never** plain `pg`/TCP at runtime. Hyperdrive only as an optional accelerator
  behind `lib/db`, never the default.
- **Two URLs:** `DATABASE_URL` = **pooled** (host has `-pooler`, runtime). `DIRECT_URL` = **direct**
  (migrations/seed). Schema uses `url = env("DATABASE_URL")`, `directUrl = env("DIRECT_URL")`.
- **Migrations run in CI on a Node runner using `DIRECT_URL` only.** Never on the Worker, never at
  request time, never against the pooled URL.
- Prisma 6: driver adapters are **GA** — do NOT add `driverAdapters` to `previewFeatures`.
  `@prisma/adapter-neon@6.19.3` requires a driver adapter. **Use a Hybrid Strategy for Cloudflare Isolates**:
  - `getPrisma()` (fetch-based `PrismaNeonHttp`): Use for 99% of read operations. Stateless `fetch` sidesteps Cloudflare WebSocket connection limits entirely.
  - `getPrismaWs()` (WebSocket-based `PrismaNeon`): Use STRICTLY for operations requiring `$transaction` (e.g., checkout, cart items). `PrismaNeonHttp` does not support interactive transactions. By isolating WebSocket usage to just transactions, we avoid hitting the 50-socket limit per isolate.
  Instantiate Prisma via `lib/db`'s `getPrisma()` — **construct fresh on every call, never cache
  across requests.** A cached cross-request singleton was the original pattern here and shipped in
  M0; it throws `"Cannot perform I/O on behalf of a different request"` on Cloudflare Workers
  (I/O objects can't cross request boundaries) on roughly 1-in-3 rapid sequential requests — caught
  in P1 once something actually stress-tested it, not before. Any function wrapping `getPrisma()`
  (e.g. `lib/auth.ts`'s `getAuth()`) must also construct fresh per call — caching the wrapper still
  pins the first request's Prisma client inside it.
- **`getPrisma()`'s HTTP adapter (`PrismaNeonHttp`) and `getPrismaWs()`'s WebSocket adapter
  (`PrismaNeon`) surface the SAME underlying Postgres error with DIFFERENT `.code` values** — a
  driver-error-code check written and tested against one silently doesn't fire under the other.
  Confirmed for a unique-constraint violation: the WebSocket adapter normalises it to Prisma's own
  `P2002`; the HTTP adapter — what `getPrisma()` returns, i.e. what the large majority of writes in
  this app actually run through — throws the same `PrismaClientKnownRequestError` but with the raw
  Postgres SQLSTATE `"23505"` on `.code` instead. `lib/repositories/prisma-errors.ts`'s
  `isUniqueViolation()` checked only `P2002`, so `lib/repositories/bundles.ts`'s `upsertBundle`
  (writing through `getPrisma()`) 500ed uncaught on a real duplicate-slug submission — found live at
  P8.5c's `/validate` (#347, PR #374) against `npm run preview`, invisible to `lint`/`typecheck`/
  `npx vitest run`/`npm run build`, because a unit test constructing the error object by hand
  reproduces whichever shape the test author assumed, not the shape either real adapter actually
  throws. Fixed by widening the shared predicate to accept both codes — `lib/repositories/
  categories.ts` had the identical exposure through the same predicate, unconfirmed (#375). **The
  transferable lesson: any `error.code`/error-shape check guarding a write reachable through
  `getPrisma()` needs to be verified against what that adapter actually throws, not against what
  Prisma's own docs or `PrismaClientKnownRequestError`'s shape under the WebSocket adapter would
  suggest** — reproduce it live (a real duplicate/invalid submission through `npm run preview`), not
  by constructing the error object from a guess.
- **Validate DB-touching code with `npm run preview` (OpenNext + local Workers/Miniflare), never
  `npm run dev`.** Plain `next dev` runs in real Node, which cannot load `@prisma/client/wasm`'s
  WASM query engine — any DB-touching route silently renders an error state, with no crash and no
  obvious signal. The M0 homepage did exactly this, unnoticed, until P1 checked. `next dev` is
  fine for UI-only iteration; anything touching Prisma needs `npm run preview`.
- `generator client` in `prisma/schema.prisma` **must** set `engineType = "client"`. The default
  `"library"` engine locates its native binary via `fs.readdir` at runtime — workerd's
  `nodejs_compat` `fs` polyfill doesn't implement it, so every query fails with
  `[unenv] fs.readdir is not implemented yet!`.
- In runtime code (`lib/db.ts`), import `PrismaClient` from **`@prisma/client/wasm`**, never the
  bare `@prisma/client` specifier. Next's build-time file tracer runs in real Node, so a bare
  specifier resolves via the package's `"node"` export condition (`index.js`, which loads its WASM
  via `fs.readFileSync`) even though the code runs in workerd — failing with
  `[unenv] fs.readFileSync is not implemented yet!`. `@prisma/client/wasm` sidesteps
  conditional-exports resolution and always uses the `import()`-based loader workerd actually
  supports. `prisma/seed.ts` runs in real Node (CI runner via `tsx`), so it correctly keeps the
  bare `@prisma/client` specifier there — don't "fix" it to `/wasm`.
- **Neon Auth: leave OFF.** Auth is Better Auth (ADR-002), added in P1 via a normal Prisma migration.
- **`prisma.<model>.updateMany(...)` and `.createMany(...)` — and ONLY those two operations —
  unconditionally crash when run through `getPrisma()`, regardless of `where`-clause shape or match
  count**, with `Error: Transactions are not supported in HTTP mode` thrown from
  `PrismaNeonHttpAdapter.startTransaction`. This is **not** a Better Auth or application-code bug:
  Prisma 6's client-side query compiler (`engineType = "client"`, mandatory — see below) internally
  wraps `updateMany`/`createMany` in a transaction it opens itself, which the HTTP adapter can never
  execute. Confirmed empirically in #382 (2026-08-27) with a local Node script run directly against
  a live Neon DB (`PrismaNeonHttp` is fetch-based, so it reproduces identically outside Workers):
  `updateMany`/`createMany` crash every time, including a 0-row match; `deleteMany` (0-row AND a
  real match), `upsert`, and singular `create`/`update` all succeed. First found live via
  `setBundleImage` (`lib/repositories/bundles.ts`) 500ing on a real bundle-image upload during
  P8.5d — three prior diagnostic rounds correctly ruled out Better Auth's adapter (its
  `$transaction` really is `undefined` on the HTTP client and really is never called) before a
  fourth round of step-logging pinned it to this instead. **Any `updateMany`/`createMany` call in
  `lib/repositories/*` MUST run through `getPrismaWs()`** (inside a `tx.` block, or directly if no
  application-level transaction is otherwise needed — the query compiler's own internal transaction
  is enough, and the WS adapter can execute it). `deleteMany`/`upsert`/singular `create`/`update`
  have no such requirement and may use either client per the normal read/write split. Full
  investigation: `specs/2026-08-26-auth-http-transaction-fix/build-notes.md`.

## Schema rules
- Strict relational / 3NF, explicit foreign keys, provider-neutral Postgres types only.
- **No `Json` columns / document storage** for domain data. **No raw SQL** in application code.
- **"No raw SQL" governs application code, NOT migrations.** Confirmed and written down here in P7d
  (#218). This was **never actually an open question** — `specs/architecture.md` §3.1 has said it
  since the schema was written ("DDL for indexes lives in migrations, which is standard portable
  SQL, not application queries"), and §3.1 even names `citext`/`pg_trgm` as acceptable "via portable
  migrations". But **this file never said it**, and this file is what gets read every session, so
  GAP-011 sat deferred behind a question that was already answered one document over. That is the
  transferable lesson: a ruling that lives only in a doc nobody opens at decision time is not a
  ruling. The rule's purpose is that the Prisma schema stays the single source of truth for the data
  model and that queries stay portable; a migration is the mechanism by which the schema *becomes*
  the database. Concretely: **DDL that Prisma generates from a
  schema declaration is always fine** (P7d's `CREATE INDEX` came from an `@@index` line —
  `schema.prisma` still describes it fully). **Hand-authored DDL in a migration is permitted but is
  a deliberate exception**, and it costs something specific: for anything Prisma's schema language
  cannot express — a `pg_trgm` trigram index (GAP-011), a row-level-security policy (#220) — the
  schema stops describing the database, so `prisma migrate diff` can report drift that isn't drift
  and a future `migrate dev` can propose dropping the object. So: hand-authored DDL requires a
  comment in the migration saying what Prisma cannot express and why, and a note in the ADR or spec
  that introduced it. What stays banned either way is raw SQL **at request time** in `app/`,
  `features/`, `components/` or `lib/repositories/*` — that is the portability and injection
  surface the rule was written for.
- **The GAP-011 drift risk above is not hypothetical — it fired for real in #508 (2026-09-01).**
  Adding a new model (`ErrorEvent`) with no relationship whatsoever to `Order` or `User` was enough
  for `prisma migrate dev` to generate `DROP INDEX` for all three hand-authored `pg_trgm` indexes
  from `20260820143949_p7_5de_order_search_trigram` — and that drop **executed** against the dev
  database before it was caught by reading the generated `migration.sql`, not before applying it.
  Recovery needed three separate steps, not just re-adding the `CREATE INDEX`: restoring the
  indexes on the already-mutated database, rewriting the migration file to remove the erroneous
  drops (so a fresh `migrate deploy` elsewhere never repeats them), and reconciling Prisma's own
  `_prisma_migrations` checksum for that file (delete the stale row, `prisma migrate resolve
  --applied <name>`) since editing an already-applied migration's contents leaves the recorded
  checksum stale. **The transferable step this adds: read every `migrate dev`-generated
  `migration.sql` before letting it apply — a `--create-only` run followed by a manual review would
  have caught this before the drop ever touched a real database, which "keep them and re-assert
  this migration" (the original migration's own comment) assumes you already know to do.**
- Money = **integer pence** + explicit currency. No floats, no `money` type.
- Images: store a **relative key** (e.g. `products/{productId}/{uuid}.webp`), **never a URL**.
  Keys are **immutable** — replacing an image writes a new key and repoints the row, so a CDN purge
  is never needed. (This line said `products/{sku}/main.webp` until P6b2; `Product` has no `sku`
  field and the seed writes `products/{slug}/main.svg`, so the example matched nothing in the repo.)
- **A `ProductImage` row and the object it names are written by different systems, so a row can and
  does outlive its object — treat "the row exists" as no evidence the image loads.** Found in #502
  (2026-09-01): `prisma/seed.ts`'s `seedGeneratedCatalogue` wrote both, but guarded both behind a
  **row-only** check (`if (existing >= count) return;`) placed *above* its own `putTracked` uploads.
  So the moment a database held the generated products, no later seed run uploaded the objects into
  that environment's bucket. The dev bucket had every `products/gen-<subcategory>/main.svg`; staging's
  had none, and returned **404** for all of them while staging's pages went on referencing them —
  invisible to `lint`/`typecheck`/`test`/`build`, and invisible locally, because dev's bucket was
  complete. Production was untouched only by luck: it carries no generated products. **Two
  transferable rules.** First, when one function writes both a row and its object, any idempotency
  guard must be positioned so the storage write still happens on a re-run, or the two diverge
  silently and per-environment. Second, **verify an image key against the CDN of the environment
  that actually serves it** (`curl -I "${CDN_BASE_URL}/${key}"`) rather than against dev — the same
  key legitimately returns 200 in one environment and 404 in another, which is exactly the case no
  local check can see. `scripts/restore-placeholder-images.ts` repairs a database whose rows already
  exist; the seed fix alone cannot, since it only helps databases seeded after it. Storefront cards
  now degrade a missing object to the "no image" box (`components/product/ProductImage.tsx`) rather
  than a broken-image icon, so this class of gap is no longer *visibly* broken — which makes
  checking the CDN, not the page, the way to catch the next one.

## Storage (ADR-003)
- Object storage via the **S3-compatible API only**, behind `lib/storage` (`StorageService` port).
  No R2 SDK, no R2-specific features. Prefer `aws4fetch` over the AWS SDK (Worker bundle size).
- DB holds relative keys; compose `${CDN_BASE_URL}/${key}` at read time.
- **Raster images (confirmed: `.png`) cannot be validated visually under `npm run preview` —
  accept this and check them on a deployed environment instead.** Both the staging and dev CDN
  zones enforce Cloudflare hotlink/referer protection: a request carrying `Referer:
  http://localhost:8787/` gets **403**, live-confirmed against both hosts on 2026-08-24 (#235,
  originally found in #231's `/build`, 2026-08-18). `next.config`'s CSP is not the cause and logs no
  violation — the block happens at the CDN edge, before the app is involved, so it cannot be fixed
  in application code. **`.svg` is not covered by the rule** — every seeded *product* image is
  `.svg` and loads fine locally; only raster assets are blocked, which today means just the vendor
  logo. Provisioning a dev-tier CDN host (#277) did not incidentally fix this — the restriction is
  zone-level, not host-specific, and the dev zone carries the identical rule. Walk image-load rows
  in `validation.md` against a real deployed environment, not local preview; see
  `specs/2026-08-13-p6.6-p0-ui-overhaul/validation.md` for the pattern this line generalizes.

## Config & secrets
- All config through validated **`lib/config`** (zod). Precedence is the **Cloudflare request context
  first**, then `process.env` — `readEnv()` tries `getCloudflareContext()` and only falls through to
  `process.env` when there is no Worker request context. So under `npm run preview` (and on a real
  Worker) **`.dev.vars` wins**; `.env` wins only where no Cloudflare context exists — `next dev` and
  plain Node scripts (`prisma/seed.ts`, `scripts/*`, migrations). This line previously claimed the
  reverse ("`process.env` first … a stray `.dev.vars` can't shadow it"); it was wrong from the day
  `lib/config.ts` was written and was corrected during P4a's validation, where it mattered — see
  **#119**, where `.env` and `.dev.vars` point at *different Neon projects*, so a fixture script and
  the app under `preview` silently read different databases. Check both before trusting a live result.
- **Checking `.env` against `.dev.vars` is necessary but NOT sufficient — diff both against
  `secrets/staging.vars` and `secrets/production.vars` before any live-DB work.** Two files drift
  into agreement on the *wrong* target as easily as they drift apart from each other. At P5a's
  validation they agreed perfectly and both pointed at **production** (`ep-young-glitter-…`), while
  the surrounding config in the same file (`S3_BUCKET`, `CDN_BASE_URL`) correctly said *staging* —
  so nothing about the file looked wrong, and P5a's migration reached the production database ahead
  of its promotion PR. It was additive and provably harmless (row counts unchanged, no drift), but
  the same mistake against a destructive migration would not have been. **A "staging-sounding" file
  is not evidence the DB host is staging; only the host is.** `secrets/*.vars` are gitignored but
  present in a working checkout, which is what makes this a two-second check.
- `.env` format: no spaces around `=`, **quote values**, comments on their own line (a trailing
  `# comment` or leading space has silently broken connection strings here).
- Runtime secrets live in Cloudflare (`wrangler secret put NAME --env <env>`); CI secrets in GitHub
  environments. Never commit secrets; never read `DIRECT_URL` at runtime.
- **`instrumentation.ts`'s `onRequestError` DOES have a working Cloudflare Workers request context
  under this app's Next 16 / OpenNext / Workers stack** — `getCloudflareContext()`/`readEnv()`
  resolve normally there, confirmed live in `#508` (2026-09-01): a forced throw under `npm run
  preview` reached a plain, uncached `PrismaClient` constructed inside the hook, and it resolved
  `DATABASE_URL` and wrote a real row on the first try. This was flagged as a genuinely unconfirmed
  risk at that slice's `/propose` (this repo has a documented history of Next-on-Workers behaviour
  not matching framework-documented semantics — `proxy.ts`, `edge` runtime, `@prisma/client/wasm`
  resolution, all elsewhere in this file), so `getPrismaUncached()` was built deliberately *not*
  wrapped in React's `cache()` to sidestep the question rather than gamble on it. The mitigation
  turned out not to be needed for context availability itself, but keep using an uncached client
  for any future `onRequestError` work anyway — `cache()`'s per-request de-dupe still isn't needed
  for a handler that only ever runs once per throw, and reaching for it would reopen a question
  that's now moot rather than genuinely require re-answering it.

## Branch strategy & CI/CD
- `feature/<slug>` → PR into **`staging`** (auto-deploys to `staging.aheedfoodcentre.nocaped.com`).
- **`staging` → `main`** via PR, deploying to `aheedfoodcentre.nocaped.com`. Never push directly to
  `main`/`staging`.
- **Known gap — NOTHING MECHANICALLY ENFORCES ANY OF THE ABOVE.** Two separate controls are both
  absent, and this line previously described the first as if it existed ("merging to `main` requires
  manual approval") while implying the second was a live fallback:
  1. **No environment approval gate.** GitHub's required-reviewers protection needs a paid plan for
     private repos and was rejected with a 422 on this repo's current (free) plan. `environment:
     production` in `deploy-production.yml` selects that environment's secret set and nothing more.
  2. **No required status check on either branch** — but **both branches ARE covered by repository
     rulesets**, and this line said "No branch protection at all, on either branch" until
     2026-09-02 (#537). **The check it cited cannot see rulesets.**
     `gh api repos/sriahead/aheed-online-store/branches/main/protection` queries *classic* branch
     protection and returns **`404 Branch not protected`** whether or not a ruleset is active, so
     P9.2's verification was structurally incapable of finding the thing it concluded was absent.
     **Use `gh api repos/sriahead/aheed-online-store/rulesets` instead** (add `/<id>` for the
     rules), and **`gh api repos/sriahead/aheed-online-store/rules/branches/<branch>` to ask what
     actually applies to a branch** — that second endpoint is the one that catches a ruleset
     created successfully with a ref condition matching nothing, which a reading of the
     declaration alone cannot.
     Actual state, confirmed 2026-09-02: two **active** rulesets, each carrying `pull_request`
     (so a **direct push to either branch is blocked**), `non_fast_forward` and `deletion`, each
     with **`required_approving_review_count: 0`**, **no `required_status_checks` rule** and **no
     bypass actors**. `protect-main`'s condition is `~DEFAULT_BRANCH` (`main` only);
     **`protect-staging`** (added by #539) is scoped to `refs/heads/staging`.
  So the substance of the warning survives, narrowed further: **a PR into either branch can still be
  opened and merged by its own author with every check red** — that is #472's territory, and adding
  a `required_status_checks` rule was deliberately left out of #539 because whether it is available
  on this plan is unverified and a misnamed required check blocks every merge. What is no longer
  possible is reaching either branch *without* a PR at all. Note the paid-plan 422 recorded above
  is about **required reviewers specifically**, not about rulesets — reading it as "branch
  protection is unavailable here" is what kept `staging` uncovered for so long.
  The historical warning still stands as written for a different reason: **PRs #464, #465 and #466
  all merged straight into `main` on 2026-08-30**, bypassing `staging` entirely, and
  `deploy-production` ran on each; **neither ruleset would have stopped any of them**, since each
  was a genuine PR and nothing constrains a PR's *source* branch. Treat PR review discipline as the
  only real gate for that, and check the base branch of every PR you open.
- **Quality checks live in `.github/workflows/quality.yml`** (`on: workflow_call`), added by P9.2
  (#435). **All three of `gates.yml`, `deploy-staging.yml` and `deploy-production.yml` call it**, so
  neither deploy path runs a weaker set than a PR runs. (`deploy-staging.yml` was the last to get it,
  in #539; it previously ran **no** checks, justified by a comment asserting that `gates` had already
  run on the PR that produced the merge — true only once a ruleset made a PR mandatory, which is why
  #539 added `protect-staging` in the same slice rather than the workflow job alone.)
  **Add a new check there, not to a caller** — duplicating the steps into each is
  what let the production path drift to running none at all. **Only the Gate 4 CHANGELOG diff stays
  inline in `gates.yml`'s `docs-gates` job**, because it genuinely needs `github.base_ref`, which a
  `push` event does not have.
- **Both KMS checks (`kms:validate` and `kms:check-generated`) live in `quality.yml`'s own `kms`
  job**, moved there 2026-09-02 (#537, resolving #473). Until then this file, `gates.yml` and
  `quality.yml` all claimed the `ARTIFACT_INDEX` staleness check *also* needed `github.base_ref`;
  it never did — it copied a file, regenerated, and diffed. That untrue sentence, repeated in three
  places, is the whole reason the production deploy path ran **no** KMS checks at all. The `kms` job
  is separate from `quality` because `continue-on-error` is per-job: it is **blocking on the
  pull-request path and non-blocking on both deploy paths** (`kms_blocking: false` from
  `deploy-production.yml` and, since #539, from `deploy-staging.yml`). The PR is the gate; on a
  branch the same check is a drift tripwire, and failing a deploy cannot un-merge drift that already
  landed — it only withholds the fix. **Whether the non-blocking branch actually resolves as
  intended is still unverified (#541)** — `continue-on-error` is inert on a *passing* job, so the
  first post-promotion `deploy-production` run (`33606818256`, 2026-09-02) proved nothing despite
  being the run everyone was waiting for. The failure direction is safe: a broken expression stays
  blocking.
- **`npm run kms:build-index` writes TWO files** — `ARTIFACT_INDEX.md` and
  `app/(admin)/staff/runbook/docs.ts` — and they go stale under **different** conditions, which is
  what made a one-file check look adequate for so long. The index renders **front-matter only**;
  `docs.ts` embeds each document's **full body**. So editing a doc's content without touching its
  front-matter rebuilds the index byte-identically and `docs.ts` differently. Commit `122609c` did
  exactly that (five roadmap change-log rows, front-matter untouched) and shipped a stale
  `/staff/runbook` article to production with every check green. **Never enumerate the generated
  files by hand** — `kms/scripts/build-index.ts` exports `GENERATED_ARTIFACTS`, and both
  `kms/scripts/check-generated.ts` and `scripts/sdd-check.ts` derive their coverage from it, so a
  third output is covered the moment it is added. `npm run kms:check-generated` is the one command
  that answers "are the generated artefacts current?".
- **Both deploy workflows build BEFORE they migrate** (P9.2, #434). `prisma migrate deploy` used to
  run first, so a build failure left the database migrated while the Worker still served the previous
  bundle — and the adapter build is the step most likely to fail (a root `proxy.ts` once passed
  `next build`, `lint`, `typecheck` and every test, failing only there). Do not reorder these back.
  The window is narrowed, not closed: a `wrangler deploy` failure *after* a successful migrate still
  leaves production migrated ahead of its code, which is #438's territory.
- Both `staging` and `production` need their own GitHub environment secrets: `CLOUDFLARE_API_TOKEN`,
  `CLOUDFLARE_ACCOUNT_ID`, `DIRECT_URL` (used for `prisma migrate deploy` in CI). Separately, each
  Cloudflare Worker needs its own **runtime** secret set via `wrangler secret put NAME --env <env>`
  (`DATABASE_URL` at minimum) — the GitHub Actions secrets above do not populate these; they're two
  different secret stores.
- **A `prisma migrate deploy` step failing with `P1001: Can't reach database server` in
  `deploy-staging`/`deploy-production` is not necessarily a real outage** — before assuming Neon is
  down and either blind-retrying or escalating, run `DIRECT_URL=<the same URL> npx prisma migrate
  status` from a local machine against the identical `DIRECT_URL`. Hit at PR #485's `deploy-staging`
  run (2026-08-31, run `33366365439`): the migrate step failed with `P1001` against staging's direct
  endpoint, but a local `prisma migrate status` against that exact URL succeeded seconds later and
  correctly reported the pending migration — proving the database was up and reachable, and the
  failure was a transient GitHub Actions-runner-to-Neon network blip. `gh run rerun <id> --failed`
  then succeeded on the first retry. The local check is what distinguishes this from a real outage
  (where retrying would be pointless) or a genuine connection-string/firewall problem (where
  retrying would just fail again) — don't skip straight to either conclusion.

## The four SDD gates (non-negotiable)
1. **Propose before work** — open the issue + a spec proposal; wait for approval.
2. **Spec before code** — no source without `specs/<YYYY-MM-DD-feature>/requirements.md`.
3. **Validate before done** — `lint`, `typecheck`, `test`, and `validation.md` criteria pass.
4. **Changelog before merge** — update `CHANGELOG.md` on the branch.
Every PR references its issue (`Closes #NN`), carries `phase:P_` + `gate:_` labels, touches CHANGELOG.

**Full operational workflow:** `specs/sdd-workflow.md` expands these four gates into a delivery
**loop** with two deliberate context resets:

**Orient → Propose → Spec → Build → Document (build notes) → CLEAR → Validate ⇄ Fix → Ship →
Document (final) → CLEAR → Orient**

Most stages are slash commands (`/orient`, `/propose`, `/spec`, `/build`, `/build-notes`,
`/validate`, `/fix`, `/ship`, `/document`). For detailed procedures on each stage, read the corresponding markdown file in `.claude/commands/`. Use them; that doc carries lessons already paid for
(stale-doc traps, CI-vs-local-Windows drift, PR merge races) that are easy to relearn the hard way.

**Two further phases sit outside that per-slice loop and run on the MILESTONE, not the slice:**
**`/discover`** (forward-looking — unowned customer problems, opportunities, friction, operational
gaps, risks, assumptions, constraints) and **`/learn`** (retrospective — what a completed milestone
actually delivered, which assumptions held, what emerged, which lessons get promoted). Both are
invocable at any time, and both run **automatically at milestone close, Discover first**, as part of
the final `/document` and before the model switch and second `/clear`. Their output is evidence, not
scope: findings append to `docs/research/discovery-log.md` and
`docs/research/milestone-retrospectives.md`, and reach the roadmap only through `/propose`. **Neither
is a gate** — evidence a merge depends on gets written to pass rather than to be true, so the four
gates above are unchanged. **A lesson recorded only in the retrospective has not been promoted**;
anything that should change every future session belongs in this file.

Two rules the assistant **cannot** enforce for itself, so it must ask:
- **`/clear` is user-invoked.** Before either Clear, everything load-bearing must be committed — a
  Clear destroys anything living only in the conversation. `/build-notes` exists to get it on disk.
- **Model switches are user-invoked.** Sonnet 5 for the Validate/Fix/Ship/Document (final) half,
  Opus 5 for the Orient/Propose/Spec/Build half. The switch to Opus 5 happens at the *end* of
  Document (final), immediately before the second `/clear` — not right after Ship — so Document
  runs on the model that already has context from Ship rather than a freshly-switched one spending
  tokens re-orienting to do reconciliation work. If a stage is running on the wrong model, say so
  and ask rather than proceeding quietly.

**Gate 4 lands in `/build-notes`, not the final `/document`** — the CHANGELOG entry must be on the
branch before it merges, and Ship precedes the final documentation pass.

**Two machine checks back the loop's honor-system stages** (`scripts/sdd-check.ts`):
- `npm run sdd:preclear` — run at the end of `/build-notes`; must exit 0 before saying it's safe to
  `/clear`. Verifies the four spec files, the build-notes template's sections, a CHANGELOG diff vs
  base, and a clean tree.
- `npm run sdd:audit` — run at `/orient`. Reports slices that shipped without a roadmap change-log
  entry, **and merged `staging → main` promotions with no roadmap row** (#207, added 2026-08-18 —
  a row must cite `PR #NNN` or the merge SHA; a bare `#NNN` doesn't count, since issues and PRs
  share one number space). Every other gate fires before or at merge; this is the only one after
  Ship, which is how P3a/P3b/P3c all shipped undocumented — and how PRs #118/#121/#134 sat
  undocumented until the promotion half of this check existed to find them. It **skips** the
  promotion half rather than failing when `gh` is unavailable, so a skip line is not a pass.

**Delivery board** — GitHub Project #2 "Aheed Online Store — Delivery" (owner `sriahead`), a
generated *view* of `specs/roadmap.md` holding **status only**; scope lives in `specs/`. Propose adds
the issue (Phase set, Backlog) → Build moves it to In Progress → Ship moves it to **In Review** on
staging merge → it closes to **Done** only when promoted to `main`. **`Done` means in production**:
PRs merge into `staging`, not the default branch, so `Closes #NN` never fires on merge and open
issues for shipped slices are expected. The Status field's one-time UI rename
(`scripts/provision-project.sh` manual steps) is **done** — all four options `Backlog` /
`In Progress` / `In Review` / `Done` exist, so no board setup is outstanding.

## Windows shell & file encoding (learned the hard way)
- **Never rewrite a repo file through `Get-Content` / `Set-Content` on Windows PowerShell 5.1.**
  `Get-Content -Raw` reads with the system ANSI codepage unless `-Encoding utf8` is passed, so every
  non-ASCII character in a UTF-8 file (this repo's docs are full of em-dashes and arrows) is decoded
  as mojibake and then written back **double-encoded** — `—` becomes `â€”` throughout. It also
  rewrites line endings, so a two-line version bump lands as a 147-line diff. Hit in P6b2 bumping
  front-matter on `architecture.md`, `tech-stack.md` and ADR-003; caught only because the diff
  size was implausible, and fixed by `git checkout --` on all three and redoing the edits with the
  Edit tool. **Use the Edit/Write tools for file content; keep PowerShell for git, npm and gh.**
- **Check `git diff --numstat` after any scripted file rewrite.** A line count far larger than the
  edit is the cheapest possible signal that an encoding or line-ending rewrite happened.
- **`format:check` failing on dozens of untouched files was the `core.autocrlf` artifact — FIXED in
  PR #328 (`.gitattributes`, #327), so it is no longer the expected explanation.** `eol=lf` now pins
  the working tree, which is what makes local Prettier agree with CI; `git add --renormalize .`
  produces zero changes and `prettier --check .` passes across the repo. **If `format:check` fails
  on files you did not touch today, treat it as real drift and read the diff** rather than reaching
  for the old ritual. Should a line-ending question genuinely resurface, the way to settle it is
  still to write a file's committed blob (`git show HEAD:<file>`) out with LF endings and run
  `prettier --config .prettierrc.json --check` on it — **in a directory prettier can resolve the
  config from, or passing `--config` explicitly**, since checking a copy in a temp directory
  silently falls back to prettier's *defaults* and reports failures that mean nothing. CI on Linux
  remains the authority.
- **Anchor patterns when grepping an env file.** `DATABASE_URL` ends in `BASE_URL`, so a filter for
  `BASE_URL` prints the Neon connection string, password included (#175). Prefer `^SEED_` over
  `SEED_`, and prefer printing keys over lines.
- `gh` args containing double quotes break native argument parsing in PS 5.1 (`accepts 1 arg(s),
  received 8`). Write the body to a file and use `--body-file`.
- **`npx tsx -e "<multi-line script>"` fails silently on this Windows setup the moment the script
  imports an installed package (e.g. `@prisma/client`) — no stdout, no stderr, exit 0, even with an
  explicit `.catch()`/`.finally()` around every promise.** It isn't a working-directory problem
  (the shell's cwd is already the repo, so `node_modules` resolves fine) — a script that does
  nothing but `console.log('hello')` via `-e` works, but the same process with a real `import`
  produces no output at all, indistinguishable from success without independently confirming the
  side effect happened. Hit in the dev-environment slice's `/validate` (R10's live isolation
  check, inserting a marker `HealthCheck` row into a Neon branch) — three silent `-e` attempts
  before switching to a real `.ts` file. **Write the script to a file inside the repo (so module
  resolution and `tsx`'s own error reporting both work) and run `npx tsx path/to/script.ts`
  instead of `-e`** for anything beyond a trivial one-liner; delete the scratch file afterward.
- **Stopping `npm run preview` does not stop `npm run preview`.** The task-runner kill only ends the
  top-level `npm` process; `opennextjs-cloudflare preview` chains into `wrangler dev`, which spawns
  its own `wrangler.js` and `workerd.exe` children that survive the parent's termination on Windows.
  The next `npm run preview` then fails the build with `EBUSY: resource busy or locked, rmdir
  '.open-next\assets'` — the orphaned `workerd.exe` still has the directory open. Killing just
  `workerd.exe` is not enough either; the whole chain (`npm run-cli.js run preview` →
  `opennextjs-cloudflare … preview` → `npm … exec wrangler dev` → `wrangler.js dev` →
  `wrangler-dist\cli.js dev` → `workerd.exe` ×2) must go. Find it with
  `Get-CimInstance Win32_Process -Filter "Name='node.exe' or Name='workerd.exe'" | Select
  ProcessId,CommandLine` (match on the repo path and `wrangler dev` in the command line, not just
  the image name — other unrelated `node.exe`/`workerd.exe` processes are common) and
  `taskkill /F /PID <every id>` before retrying the build.
- **Never pipe a live-writing script's output through `head` (or anything else that closes the pipe
  early).** The reader closing the pipe sends the writer SIGPIPE, which can kill the process **before
  its own cleanup section runs** — indistinguishable from the command completing normally except for
  a shorter-than-expected output. Hit at `/validate` for #411/#412 (2026-08-27):
  `npx tsx scripts/verify-repository-injection.ts | head -30` — a script that creates real rows and
  deletes them itself at the end — got cut off mid-run and left one `__verify-`-prefixed product, two
  images and one category behind in the dev database, found only by a follow-up query and cleaned up
  by hand before the real (untruncated) run could be trusted. **Redirect to a file and `Read` it, or
  let it print in full** — never truncate a script's stdout with a command that can close the pipe
  before the writer's own exit path runs.
- **Never run `npx vitest run` concurrently with another heavy build on this machine — vitest
  reports `exit 0` while whole test files silently never execute.** Under load its forks pool fails
  to start workers (`Error: [vitest-pool]: Failed to start forks worker for test files ...` /
  `[vitest-pool-runner]: Timeout waiting for worker to respond`), and those files are counted as
  **unhandled errors, not failures** — so the process still exits 0 and a casual reading of the
  summary looks like a pass. Hit 2026-09-02 during #539's Build: the suite was launched alongside
  `next build --webpack` for `kms/site-internal` and reported **`Test Files 64 passed (64)` /
  `Tests 784 passed (784)` with `Errors 10 errors`, exit 0**. Run alone seconds later, the same tree
  gave **74 files / 874 tests** — ten files, ninety tests, had never run at all. **The tell is the
  file count, not the exit code**: know what the suite's file/test totals should be (currently
  74/874) and treat any shortfall as a non-result to re-run, not a pass. This is distinct from
  **#538**, which is a genuine 5000ms timeout on `tests/repository-transaction-safety.test.ts` under
  full-suite load (2.69s green in isolation) and reports as a real *failure*; CI's Linux runners are
  the authority for both.

## Dependency & version discipline (learned the hard way)
- **Exact-pin infrastructure-adjacent packages** — DB drivers, adapters, runtime types. Their
  declared semver ranges are looser than real compatibility. Locked today:
  `@neondatabase/serverless` = **0.10.4 exact** (adapter-neon@6 targets 0.x; 1.x is allowed by the
  range but must not be used). `@cloudflare/workers-types` must match wrangler's major (v5).
- **Do NOT run `npm audit fix --force`.** Here it downgrades wrangler and re-breaks the OpenNext peer.
  Audit findings are dev/build-tooling (undici→miniflare→wrangler); track under P7, don't force-fix.
- **Do NOT jump breaking majors mid-stream** without deliberately absorbing the migration (as done for
  Next 16 / vitest 4 below) — don't let a version bump land as a side effect of an unrelated change.
  Prisma 7 is still its own future item (breaking generator).
- npm 11+ blocks dependency install scripts by default: approve the toolchain via `package.json`'s
  `allowScripts` (`esbuild workerd sharp unrs-resolver @prisma/client @prisma/engines prisma dotenv`
  — keys are exact `name@version`, must match what's actually resolved) before expecting
  test/build/preview to work.
- **Next 16 defaults to Turbopack for `next build`/`next dev`, and Turbopack cannot resolve
  `@prisma/client/wasm`'s subpath export** (`Module not found`) even though webpack handles it fine
  and the package.json `exports` map is valid. Both `dev` and `build` scripts pin `--webpack`
  explicitly until Turbopack's resolver catches up — don't remove that flag without re-verifying.
- **There is no `proxy.ts`/`middleware.ts` this project can currently ship, on any configuration.**
  Next 16 renamed `middleware.js` to `proxy.js` and made Node.js the *only* runtime a Proxy file can
  use — the `runtime` segment option is not just defaulted, it's **forbidden**; setting it throws.
  But `@opennextjs/cloudflare` (pinned `^1.20.2`, and `1.20.2` is the newest version published as of
  P8.5f) unconditionally `process.exit(1)`s the `opennextjs-cloudflare build` step the moment it
  detects Node-runtime middleware (`ERROR Node.js middleware is not currently supported. Consider
  switching to Edge Middleware.` — `useNodeMiddleware()` in its own `build.js`). Next 16 forbids the
  one thing that would satisfy the adapter (opting back into Edge). `next build` alone stays green
  and even prints `ƒ Proxy (Middleware)` — it never runs the Cloudflare adapter's build step, so it
  proves nothing about deployability. **Only `npm run preview` (`opennextjs-cloudflare build`) or an
  actual `deploy-staging`/`deploy-production` run surfaces this.** Hit in P8.5f (#362): a root
  `proxy.ts` annotating requests with a pathname header passed `next build` and every local
  `lint`/`typecheck`/`test`, merged to `staging`, and only failed when `deploy-staging` actually ran
  — confirmed by deliberately merging the unfixed build and watching the real deploy fail before
  fixing it, not by local reasoning alone. **There is no per-file workaround** — the incompatibility
  is between "any Proxy file exists" and "this adapter version," not between two implementation
  choices within one. If a route needs to differ by path (e.g. a header rendering differently on `/`
  than elsewhere), reach for **an explicit prop passed down from whichever layout/route renders it**
  instead — a second route group sharing an extracted layout-body component if the App Router
  structure requires it (see `components/layout/StorefrontChrome.tsx` / `app/(landing)/`), same
  pattern as the existing `isPortal` prop. Re-check `@opennextjs/cloudflare`'s changelog before
  reaching for `proxy.ts` again — this note is only current as of `1.20.2`.
- **ESLint 9 requires flat config** (`eslint.config.mjs`), not `.eslintrc.json`. `eslint-config-next`
  (bumped to match `next`'s major) exports flat-config-ready arrays directly:
  `eslint-config-next/core-web-vitals`. The `lint` script is plain `eslint .`, not `next lint`
  (Next 16 removed that command).
- `vitest.config.ts` must be `.mts` (or set `"type": "module"` in package.json) — vitest 4's native
  config loader warns/will error on ESM syntax in a file it loads as CommonJS.

## Server Actions (`"use server"` files) — learned the hard way
- **A `"use server"` file may export ONLY async functions — nothing else, not even a plain constant
  used purely to seed `useActionState`.** The restriction is enforced at *runtime*, not build time:
  `next build`, `tsc --noEmit`, and `npm test` all stay green with a violating file, because none of
  them load the module through the flight-loader's action-dispatch path. The compiled bundle calls
  `ensureServerEntryExports([...allExportsOfTheFile])` unconditionally the moment *any* action from
  that file is dispatched — so a same-file value export (e.g. `export const initialFormState = {...}`
  living next to the real actions "for convenience") makes **every** action in that file 500 for
  **every** caller, real browser included, with `Error: A "use server" file can only export async
  functions, found object`. First hit in P6b1 (#159) — `features/admin/catalogue.ts` exported
  `initialCatalogueState` alongside `saveProduct`/`saveCategory`; nothing caught it until
  `npm run preview`'s live write rows at Validate. Keep any such state constant in a plain module
  (e.g. `lib/<feature>-form.ts`) and import it from the client component directly — never from the
  `"use server"` file itself.
- **A page needing both a per-row action and a bulk action over the same rows cannot nest one
  `<form>` inside another** — HTML forbids it outright. Bind a row's control to a form it isn't a
  DOM descendant of via the standard `form="<id>"` attribute on that `<input>`/`<button>`, pointing
  at a separate top-level `<form id="...">` elsewhere on the page; both stay real progressive-
  enhancement forms, no client JS. First used in the P7a fix (#162) for `/staff/orders`: each row
  keeps its own untouched single-order `<form action={advanceStatus}>`, and a row's bulk-select
  checkbox sits in the same `<li>` but carries `form="bulk-advance"` to bind to a separate
  `<form id="bulk-advance" action={advanceStatusBulk}>` rendered once above the list.

## Repository layer (`lib/repositories/*`) — learned the hard way
- **A request-scoped facade (resolving a live Prisma client and/or the current vendor from request
  context) does not belong in the same file as the pure functions it wraps.** Every function
  exported from a `lib/repositories/<name>.ts` file is expected to take its Prisma client and
  `vendorId`/`userId` as **explicit parameters** and read no request context — that is what lets a
  plain `tsx` script (a validation harness, a seed script) import the module in real Node and
  exercise it directly, without a live Workers request. Adding a `getCurrentVendorId()`-calling
  factory to the same file — even one that only wraps the pure functions "for convenience" — breaks
  that property for the whole module, not just for itself: the file's own contract becomes true of
  *some* of its exports and not others, and a validator running the file's own literal check (grep
  for `getCurrentVendorId(`, `headers(`, `getAuth(`) will find it. Put the facade in a sibling
  `lib/<name>-service.ts` instead, matching `lib/auth-rbac.ts`'s existing pattern — a request-context
  wrapper living *beside*, not inside, `lib/repositories/`. First hit in P7b (#216, PR #223):
  `getDataRightsRepository()` was added to `lib/repositories/data-rights.ts` at Build for exactly
  this "convenience" reason, `build-notes.md` disclosed two smaller deviations from spec but not this
  one, and `/validate` caught it by running `validation.md`'s own R2 probe rather than re-deriving
  it. Fixed at `/fix` by moving it to `lib/data-rights-service.ts`; the facade also became a plain
  sync factory once it no longer needed a dynamic `import()` to stay loadable by the same file a
  `tsx` script has to import.
- **The rule has TWO halves, and they are enforced by two different tests. Both must pass.**
  - **Request context** — `tests/repository-purity.test.ts` (#252, CLOSED at P8.1b) fails if any file
    in `lib/repositories/*.ts` contains a *value* import of `next/headers`, `@/lib/tenant`,
    `@/lib/auth` or `@/lib/auth-rbac`. Type-only imports stay legal and are the documented pattern
    (`import type { getPrisma } from "@/lib/db"`). Whole-file, import-level, **no allowlist** — put
    the facade in `lib/<name>-service.ts` and it passes.
  - **Client injection** — `tests/repository-client-injection.test.ts` (#409) fails on a
    `getPrisma()`/`getPrismaWs()` **call expression** inside a repository file. AST-based, not a
    grep, because these files legitimately name both functions in prose and in
    `ReturnType<typeof getPrisma>` type positions. **Unscoped as of #411/#412 (2026-08-27): it walks
    every `.ts` file in `lib/repositories/` discovered from the filesystem**, so a newly added
    repository file is covered the moment it exists. It shipped in #410 scoped to an explicit
    four-file list because the other four files were still non-compliant; that list is gone and must
    not come back.
  Every repository module has a sibling service where one is needed: `cart`, `categories`,
  `customers`, `discounts`, `loyalty`, `order-lookup-rate-limit`, `orders`, `products`, `reports`,
  `reviews`, `roles`, `vendor`, `data-rights`, `promotions`.
- **When you convert an export, the client moves to the sibling service and the call sites keep the
  function's NAME.** #411/#412 imported each repository function into its service under a `…Repo`
  alias and re-exported a same-named wrapper, so 29 call sites changed only their import path. That
  is deliberate: across 26 conversions a rename is the mistake most likely to go unnoticed, and a
  type-only import (`import type { AdminProductRow }`) must keep pointing at the repository while
  the value import moves. **Sweep by symbol, not by name** — `features/admin/storefront.ts` imported
  `updateVendorStorefrontConfig as updateConfigRepo` and called it under the alias, so a grep for the
  function name reported zero call sites and made it look like dead code.
- **A repository export that resolves its own Prisma client cannot be run from a plain `tsx` script
  AT ALL — this is structural, not a matter of inconvenience, and it is why the client must be a
  parameter.** `lib/db.ts` imports `PrismaClient` from `@prisma/client/wasm`, which is mandatory on
  Workers (see the Database section). **Node cannot load that build's WASM query compiler**, so any
  call routed through `lib/db` dies with `PrismaClientKnownRequestError (ERR_UNKNOWN_FILE_EXTENSION):
  Unknown file extension ".wasm" for node_modules/.prisma/client/query_compiler_bg.wasm`. Measured
  2026-08-27 against the dev Neon branch: `getAvailableSpecialities(prisma, vendorId)` **passed** with
  a client the script built from the bare `@prisma/client` specifier (as `prisma/seed.ts` does);
  `getVendorConfig(vendorId)`, which resolved its own, **failed**; the identical query through the
  script's own client **passed**. Same query, same database — the only variable was where the client
  came from. `scripts/verify-repository-injection.ts` is the committed harness that demonstrates this.
- **This rule has now claimed a false enforcement THREE times, and the third is the most instructive.**
  The first two pointed at `tests/repository-vendor-scoping.test.ts` (a test about *scoping*, not
  *location*). The third was subtler: `tests/repository-purity.test.ts` genuinely enforces what it
  claims — but its docstring also asserted that "several **compliant** repository functions call
  `getPrisma()` internally while still taking `vendorId` explicitly," which quietly blessed the other
  half of the rule as optional. **32 of 109 exports across 8 files** had done exactly that, including
  every catalogue write, every product-image mutation, loyalty tier CRUD, discount create/deactivate,
  and the guest order-lookup **rate limiter** — a security control that could not be exercised outside
  a live request. Three separate repository docstrings (`customers.ts`, `reports.ts`, and
  `discounts-service.ts`'s "every export there takes `prisma`") asserted the property while the file
  violated it. **The transferable lesson beyond the earlier two: a test that correctly enforces its
  own invariant can still launder a second, unenforced invariant if its comments opine on one.**
  Scope a test's prose to what it checks; if it must mention a neighbouring rule, name the test that
  enforces that one, or say plainly that nothing does.
  **A FOURTH docstring turned up while finishing the conversion** — `lib/products-service.ts` said
  the repository's "admin write path takes `vendorId` explicitly for the same reason these reads now
  do, so a plain `tsx` script can exercise either without a live Workers request," false for all 14
  of those exports. Four files asserting the same untrue sentence is what a property nobody ever
  executed looks like; the fix is `scripts/verify-repository-injection.ts`, which now *runs* all four
  files' exports against a real database instead of asserting anything.
- **The conversion found three dead Prisma clients, and the reason nothing caught them matters more
  than the waste.** `updateProductForVendor`, `setPrimaryProductImage` and `quickUpdateInventory` each
  opened with `const prisma = getPrisma();` and then **never read it** — every statement ran on the
  transaction client. So each admin product update, image set and stock tweak constructed an
  HTTP-adapter `PrismaClient` and discarded it. They had also been recorded in #409's own plan as
  functions "needing both clients," a claim that survived into two issues and a spec before anyone
  checked the bodies. **`eslint.config.mjs` enables no `no-unused-vars` rule of any kind** (verified
  empirically — a file with an unused local lints clean), so nothing in `lint`/`typecheck`/`test`
  reports an assigned-and-never-read variable. Tracked as **#416**. Until that lands, an unused
  binding is invisible here: do not assume a variable is used because CI is green.
- **The reason it took three attempts is worth more than the fix.** This rule twice claimed an
  enforcement that did not exist: it said `tests/repository-vendor-scoping.test.ts` "allowlists all
  nine by name … so the list cannot quietly grow." Both halves were false. That test asks whether an
  exported function **queries a vendor-scoped model without taking a vendor id** — a question about
  *scoping*, not about *location*. It held six of the nine plus two functions that were never on the
  list, and was structurally blind to `getDiscountRepository`, `getWebhookOrderService` and
  `getGuestOrderLookupService`, because a facade that *delegates* to pure functions issues no Prisma
  call of its own for it to see. An earlier version of this rule also pointed at `getCartRepository`
  as the example to copy while `getCartRepository` was itself the defect, so a reader following it
  literally reproduced the problem. **The transferable lesson: a rule that names its own enforcement
  must be checked against that enforcement, or it becomes a rule that documents a guarantee nobody
  provides.**
- **`lib/repositories/roles.ts` was the hardest case and shows what a real fix looks like.** It was
  never on #252's list, and it had **no pure functions at all** — both exports resolved the vendor
  themselves and one ran its own `requireVendorRole("ADMIN")`. So it needed a *split written*, not a
  move: `listVendorTeam(prisma, vendorId)` / `applyVendorRole(prisma, prismaWs, vendorId, actor, …)`
  stayed, and `lib/roles-service.ts` performs the session check and passes the resulting actor in as
  **data**. That is what made the hierarchy rules (who may grant ADMIN, who may touch a platform
  admin, the last-admin self-demotion guard) testable at all — which authorization logic needs most.

## Staff panel pages (`app/(admin)/staff/*`) — learned the hard way
- **Every page's `requireVendorRole(...)` refusal branch must render `<PanelRefusal>` — never
  `return null` or fall through silently.** **`app/(admin)/layout.tsx`** renders the portal shell
  (header, tier badge, "View store" link) around whatever the page returns, so a page that returns
  `null` on refusal still serves `200` with that shell and a blank content area — no "Staff only"
  message, easy to mistake for a loading state rather than a real refusal. (This line said
  `app/(admin)/staff/layout.tsx` until P7.5d+e; **no such file has ever existed** — the shell is one
  segment up, at the route group. The rule's substance was unaffected, but the path a reader would
  open to check it was wrong, which is the same failure mode as a ruling nobody can find.) All other
  `/staff/*` pages (`categories`, `inventory`, `orders`, `products`, `reports`, `team`, `customers`,
  `staff/page.tsx`) use `<PanelRefusal title="..." message="..." />`; `runbook/page.tsx` didn't,
  until #231's `/validate` fired the exact signed-in-non-staff case its own `validation.md` had
  flagged as never exercised and found it. Fixed at `/fix` to match the established pattern.
  **`loyalty/page.tsx` was a second instance** — it hand-rolled equivalent markup rather than
  returning `null`, so it was a consistency defect rather than a live one, and it was converted in
  P7.5d+e (#136) while that slice was editing the page anyway. When adding a new `/staff/*` page,
  copy an existing one's refusal branch rather than writing a bare `if (!auth.ok) return null`.

## KMS docs (`docs/*.md`, `specs/*.md`) — learned the hard way
- **A GFM table cell (or any prose) containing a bare `<` immediately followed by a digit breaks
  the internal KMS docs site build, and nothing in the app's own `lint`/`typecheck`/`test`/`build`
  catches it.** `docs/*.md` and `specs/*.md` are assembled into MDX (`npm run
  kms:assemble:internal`) and built with Nextra in `kms/site-internal`, a separate pipeline the
  `gates` workflow never runs. MDX parses `<1%` as the start of an invalid JSX tag name
  (`Unexpected character '1' before name`), so a slice's own PR can pass every check and merge
  clean while `deploy-docs-internal` fails on the very next push. Hit in P7d (#218):
  `docs/nfr-baseline.md` shipped a `<1%` table cell in PR #245, and the break was found only when
  `/ship` opened the staging→main promotion PR and read `deploy-docs-internal`'s status. Fixed as
  its own follow-up PR (#248) rather than amending the already-merged one. Write `under 1%` (or
  wrap the value in backticks) instead of a bare `<N` anywhere in `docs/`/`specs/` prose or tables.
  Before merging a slice that adds or edits either directory, a real check is `npm run
  kms:assemble:internal && (cd kms/site-internal && npx next build --webpack)` — not just the root
  `lint`/`build`.
- **The same pipeline breaks on a bare `{...}` in prose, and this has now cost a build THREE times.**
  MDX evaluates `{anything}` outside backticks as a **JSX expression**, so quoting a code fragment
  the natural way — `"Save {formatPrice(saving)}"` inside double quotes — compiles fine, passes every
  root gate, and then dies at *prerender* with `ReferenceError: formatPrice is not defined` naming
  the doc's own URL (`/dev/<id>`). Double quotes do not escape anything in Markdown; only backticks
  do. **Write `` `Save {formatPrice(saving)}` ``**, and note a path template like
  `` `bundles/{bundleId}/{uuid}.webp` `` is already safe *because* it is in backticks — the trap is
  the unbackticked case, not the braces themselves. First hit at P8.5e (PR #360, "escape bare
  curly-brace reference breaking `deploy-docs-internal`"); hit again at P8.5c's `/build-notes`,
  caught before merge only because that slice actually ran the check above. **A third hit, in the
  storefront-browsing-ux-fixes slice (#496, 2026-08-31), is the more instructive one**: it wasn't an
  edit to an existing doc, it was a bare `"Shop {Department}"` written into a brand-new `plan.md`'s
  *first draft*, describing a UI button's own label in prose. Writing fresh spec prose is exactly as
  exposed as editing an existing one — there is no "this file is new, so it's fine" exemption. Caught
  the same way as the second hit: the two-command check below, run before push, not discovered via a
  failed `deploy-docs-internal` after merge. **Run the two-command check on every slice that adds or
  edits a spec file, including the very first one you write for it, and read its real exit status** —
  piping it through `tail` reports the pipe's success, not the build's, which is how a `Next.js build
  worker exited with code: 1` can look like `exited with code 0`.
- **A spec's front-matter `id` cannot contain a literal `.`** — `kms/schema/frontmatter.ts`'s `id`
  regex is `^[a-z0-9-]+$`. A phase name that already has a dot (`P8.1a`, `P7.5a`, `P6.5`, …) is easy
  to copy straight into `id:` when writing a new `plan.md` at `/spec`, and none of
  `lint`/`typecheck`/`test`/`format:check`/`build` catch it — only the `gates` workflow's own "KMS —
  front-matter validation" step does, on the next push. Every existing dotted-phase slice's `id`
  replaces the dot with a dash and suffixes `-plan` (e.g. `p7-5a-reports-cart-integrity-plan`);
  follow that convention at `/spec` rather than rediscovering the regex at `/ship`. First hit this
  way in P8.1a (#334, PR #338): `id: p8.1a-frontend-a11y-debt` failed `gates` on first push, fixed to
  `p8-1a-frontend-a11y-debt-plan` — which then required its own `npm run kms:build-index` (a
  previously-invalid `plan.md` becoming valid makes it a newly-countable artifact, so the checked-in
  `ARTIFACT_INDEX.md`/`docs.ts` go stale in the same commit that fixes the `id`). Run `npm run
  kms:validate` locally after writing or editing any spec's front-matter — it's fast and catches
  this before a push, unlike the `<1%` MDX trap above which needs the heavier
  `kms:assemble:internal` build.

## Design tokens & per-vendor branding (`design-system/tokens/tokens.css`, `lib/vendor-theme.ts`) — learned the hard way
- **A jsdom test that parses `tokens.css` directly proves the file is right — it proves nothing
  about what a browser actually renders, because `lib/vendor-theme.ts`'s `brandStyle()` injects a
  second, competing set of CSS custom properties as an inline `style` on every page's root element
  (ADR-004 decision 5, per-vendor branding), and an inline style always beats a `:root` stylesheet
  rule on specificity.** `brandStyle()` re-declares each semantic token it lists from that vendor's
  raw primitive colour — correct for `--color-primary`/`--color-surface-muted`/the three semantic
  tints, which really are simple `var()` aliases of a primitive in `tokens.css` and need the
  per-element re-declaration to pick up an override at all (a custom property's `var()` substitutes
  once, where the property is *declared* — a descendant overriding the referenced primitive does not
  make an ancestor's already-computed alias recompute). It is **wrong** for any semantic token
  `tokens.css` has decoupled into an independent literal value, because re-declaring it from a
  primitive silently reintroduces whatever `tokens.css` moved away from. Hit in P7 closeout (#251):
  darkening `--color-action`/`--color-accent`/`--color-danger` (plus hover shades) for WCAG AA
  landed cleanly in `tokens.css` and its contrast test passed, but every real page kept rendering the
  pre-slice, AA-*failing* hex — found only by pulling live rendered HTML from `npm run preview`
  against staging at `/validate`, not from the test suite. **Before trusting a `tokens.css` edit,
  check whether `brandStyle()` also lists the token being changed** — if it does and the change is
  meant to be a fixed, audited constant rather than something that should keep tracking a vendor's
  brand colour, remove it from `brandStyle()`'s per-vendor list too, or the CSS file's value never
  reaches a browser.
- **SriMart's `VendorBranding` primitives are real, live-differentiated colours (`#1e88e5` blue,
  `#8e24aa` purple, `#c62828` red), not filler test data** — a change that assumes every vendor
  looks like Aheed's default green/orange/red will visibly break SriMart's theme, and nothing in
  `lint`/`typecheck`/`test` checks a second vendor's rendered output. Curl or otherwise fetch a page
  with `Host: srimart-staging.nocaped.com` (or `srimart.nocaped.com` in production) under
  `npm run preview` before treating a branding/token change as verified.
- **A local `VendorDomain.host` value that includes a port can never resolve — seed it port-less,
  always, even for local-only testing.** `lib/tenant.ts`'s `getCurrentVendorIdOrNull()` runs every
  request host through `splitHostPort(...).hostname` before the `VendorDomain` lookup, which always
  strips the port — deliberate and correct, since a real `Host` header on
  `staging.aheedfoodcentre.nocaped.com`/`nocaped.com` never carries one. A row seeded with a port
  (e.g. `SEED_SRIMART_HOST=srimart.localhost:8787`, the value a from-scratch local seed might
  reasonably reach for) silently can never match, and the request falls through to `/coming-soon` —
  indistinguishable from "this host genuinely isn't mapped," no error anywhere. The line above
  already models the right convention (`srimart-staging.nocaped.com`, no port, reused as the local
  `Host` header value even though nothing is actually listening on that domain — only the header
  string matters to `getCurrentVendorIdOrNull()`, not where the TCP connection actually goes) but
  didn't say why it has to be port-less until this was hit live: `/validate` for #501 slice A
  (2026-09-01, `#514`) found a dev-DB row seeded as `srimart.localhost:8787` in an earlier session,
  fixed by rewriting it port-less. Any `SEED_SRIMART_HOST`/`SEED_AHEED_HOST` value — local, staging,
  or production — must never contain a port.

## Local Stripe webhook testing — learned the hard way
- **This repo's `.dev.vars` and `.env` both carry a real `STRIPE_SECRET_KEY` (test-mode) by
  default, so `npm run preview` does NOT run the stub payment adapter** — `lib/payments.ts` picks
  the stub only when the key is unset, and here it never is. Any spec's `validation.md` that writes
  "with no `STRIPE_SECRET_KEY` set, the stub adapter is active" (a reasonable-sounding default) is
  describing a hypothetical, not this environment: checking out in local preview redirects to real
  hosted Stripe Checkout, same as staging/production. Confirmed at P9.1's `/validate` (#427/#428,
  2026-08-29) — the guest-order-authorization slice's own `validation.md` assumed the stub path for
  its live rows; the actual redirect went to `checkout.stripe.com`. Where a live row needs the order
  a real checkout produced but not the payment itself, resolve the order directly against the dev
  database instead of relying on the stub's synchronous redirect — it exercises the same
  post-checkout code either way. Where a row genuinely needs the stub adapter (e.g. asserting the
  *fallback* URL shape itself, as opposed to what it leads to), that requires temporarily unsetting
  `STRIPE_SECRET_KEY` and restarting `npm run preview` — `.dev.vars` is read at Worker boot.
- **`stripe listen`'s webhook signing secret is per-invocation, not fixed** — it will differ from
  whatever is already sitting in `.dev.vars`'s `STRIPE_WEBHOOK_SECRET` (itself likely written down
  from a previous, different `stripe listen` session). A mismatch fails the webhook route's
  signature check silently from the outside: the Stripe test-card payment itself succeeds, the
  order sits forever in `PENDING_PAYMENT`, and nothing in the browser or `npm run preview` console
  says why. Before relying on a live checkout→webhook round-trip, start
  `stripe listen --forward-to <preview-url>/api/webhooks/stripe`, copy the secret it prints into
  `.dev.vars`, and **restart `npm run preview`** — `.dev.vars` is read at Worker boot, so editing it
  with the preview server already running has no effect until it restarts.
- **`stripe listen` only forwards events that occur while it is running.** A payment completed
  *before* starting the listener is not retroactively forwarded — `stripe events resend <id>`
  resends to a registered webhook **endpoint** in the Stripe dashboard, not to an ad-hoc CLI
  listener, so it doesn't help here either. Place a fresh order after `stripe listen` is confirmed
  ready (`Ready! ... webhook signing secret is whsec_...` in its output) rather than trying to
  recover an already-completed payment's event.
- **Resend's API rejects `to` addresses on unverified domains (`example.com` included) even in test
  mode**, so a live checkout using a demo account's `@example.com` address will genuinely fail to
  send — `lib/email.ts`'s try/catch swallows it correctly (this is what R20-style requirements are
  for), but it also means the actual outbound HTML is never observable this way. Confirmed in
  P7.5b's `/validate` (#262): the full webhook→confirm→email pipeline was proven live up to the
  point of the real Resend call; the literal HTML bytes still have to come from a unit test that
  parses the outbound request body, not from watching a real send succeed.
- **`npm run preview`'s local Worker exposes a queryable log of its own `console.*` output — use it
  instead of trying to read `npm run preview`'s own terminal, which interleaves the dev server's own
  noise with application logs and scrolls past whatever a webhook call just printed.** `wrangler dev`
  captures every request/console line into a local SQLite-backed store, queryable via
  `POST http://127.0.0.1:8787/cdn-cgi/local/explorer/api/local/observability/query` with a body of
  `{"sql": "..."}` against a `logs` table (`ts_ms`, `level`, `message`, plus `trace_id`/`span_id`).
  This is what actually proves a `console.error` line's exact wording, that it fired exactly once,
  and that it did **not** fire on an adjacent case — filter on `level = 'error'` and a substring of
  the order number or session id. Used to confirm R23/R24/R31–R33 live for #429's webhook-binding
  slice (2026-08-29): a `binding-mismatch` refusal logs exactly the reason/event-type/order/session
  line the route promises, a duplicate delivery (`already-processed`) logs nothing, and no unrelated
  error fires alongside either. `GET .../cdn-cgi/local/explorer/api/local/workers` lists the other
  endpoints the same Explorer API exposes (KV, D1, R2, Durable Objects, Workflows).

## Better Auth (`lib/auth.ts`, ADR-002) — learned the hard way
- **A bare top-level `onRequest` key in `betterAuth({...})`'s config is accepted by TypeScript and
  never invoked at runtime.** `BetterAuthOptions`'s type carries an `onRequest` field, so
  `betterAuth({ onRequest: myHandler, ... })` type-checks cleanly and looks correct on read — but
  Better Auth's own `router()` (`node_modules/better-auth/dist/api/index.mjs`) always installs its
  *own* internal `onRequest` on the underlying `better-call` router, and that internal
  implementation only loops over `ctx.options.plugins[].onRequest`; it never reads a bare
  `ctx.options.onRequest`. The only way to hook a request is a **plugin**: `{ id: "some-id",
  onRequest: async (request, ctx) => {...} }` registered via `plugins: [...]`, and its return
  contract also differs from what a bare handler would suggest — `{ response: Response }` to
  short-circuit, `{ request: Request }` to continue with a modified request, or `void`/`undefined`
  to continue unmodified (`@better-auth/core`'s `BetterAuthPlugin` type). A bare `Response` return
  value, or nothing, is silently swallowed either way, because the code path that would have read it
  never runs. Found live in **#483** (2026-08-31): P9.1's auth rate limiter (#431, `lib/auth.ts`)
  had used a top-level `onRequest` key since it shipped on 2026-08-29 — confirmed with a temporary
  diagnostic log that it never printed for any real request, at any point, regardless of path or
  database state. **Any future request-level hook into Better Auth (rate limiting, logging,
  header injection, request rewriting) must be a plugin, never a bare config key** — verify live
  under `npm run preview` with a real request, not by reading the type or by `tsc --noEmit` passing,
  since neither would have caught this.
- **Confirm a Better Auth endpoint's real path from its own route registration
  (`node_modules/better-auth/dist/api/routes/*.mjs`'s `createAuthEndpoint("/...")` calls), never
  from the intuitive short form.** Email/password sign-in is `/sign-in/email`, not `/sign-in`;
  sign-up is `/sign-up/email`; the password-reset request endpoint is `/request-password-reset`,
  not `/forget-password` (that name exists only as an internal label inside the unused `emailOTP`
  plugin). A path-matching check written against the short form silently never matches real traffic
  — found live in **#481** (2026-08-31) the same way as #483 above: 7 wrong-password requests to the
  real `/sign-in/email` endpoint all returned `401`, never `429`, because `endsWith("/sign-in")` is
  false for a path that ends in `/email`. Better Auth's own internal default rate limiter
  (`node_modules/better-auth/dist/api/rate-limiter/index.mjs`'s `getDefaultSpecialRules`) matches
  the *stripped*, basePath-relative path with `startsWith` — not directly transferable to a hook
  reading `new URL(req.url).pathname`, which is the full, unstripped path (`authOnRequest` in
  `lib/auth.ts` reads `endsWith` against the real full-path suffixes instead; see the code comment
  there for why `startsWith` would silently never match anything in that context).
- **A model added to `prisma/schema.prisma` for a Better Auth–adjacent feature needs its own
  migration checked in the same PR, and CI passing is not evidence one exists.** `#431` added the
  `AuthenticationAttempt` model but no migration was ever generated or committed for it, in any
  branch (**#482**, 2026-08-31) — `lint`/`typecheck`/`test`/`build` all stayed green throughout,
  because none of them touch a live database. `prisma migrate status` reporting "up to date" is not
  reassurance either: with no migration to be pending, there is nothing for it to flag. The table
  did not exist in the dev database and, since `deploy-staging`/`deploy-production` both run
  `prisma migrate deploy` from the same committed `prisma/migrations/` directory, almost certainly
  never existed in staging or production either. After adding or changing a model this app's runtime
  code depends on, confirm the migration exists (`ls prisma/migrations/`, not just `git diff
  prisma/schema.prisma`) and — for anything security- or data-integrity-relevant — that a live query
  against it actually succeeds under `npm run preview`, not just that the ORM call type-checks.

## React & Next.js Hooks — learned the hard way
- **A `useEffect` that listens for `pathname` changes to auto-close a UI element (e.g. a drawer/modal) must NOT include its `open` state in its dependencies.** If `open` is included, the act of opening the drawer changes `open` to true, which triggers the effect immediately and closes the drawer right back. Hit in P8: a cart drawer instantly closed on open because the builder passed `open` and `close()` into the dependency array to satisfy the lint rule. The correct pattern is to call the closure function unconditionally (e.g., `close()`) inside the effect, leaving `open` out of the dependency array, and if needed, explicitly silencing the specific lint rule (e.g., `react-hooks/set-state-in-effect`) for that line rather than changing the dependency semantics.

## Hard stops
- Never invent infrastructure or credentials. If a resource/secret is missing, STOP and list what
  the human must create.
- Propose (Gate 1) before implementing anything non-trivial; show the plan and wait.
- Build only what the current stage requires. Reuse before create.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
