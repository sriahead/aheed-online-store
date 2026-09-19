---
id: runtime-pitfalls
title: "Runtime Pitfalls — code that passes every check and still fails on Workers"
audience: [dev]
type: doc
status: approved
version: "1.0.0"
updated: 2026-09-17
visibility: internal
summary: The failure catalogue for this stack — Prisma and Neon on V8 isolates, storage credentials, edge caching, dependency traps, Workers AI and Better Auth. Everything here passes lint, typecheck, test and build, and fails at runtime anyway.
tags: [runtime, workers, prisma, troubleshooting]
---

# Runtime Pitfalls

Everything in this document passes `lint`, `typecheck`, `test` and `build`, and fails anyway — at
request time on Cloudflare Workers, or against a real Neon database, or on a live deploy. That is
the organising principle: a reader arrives here having been told nothing was wrong.

Boundaries. Per-layer authoring rules (`"use server"` modules, `lib/repositories/*`, staff panel
pages, hooks) are in `app-conventions.md`. Windows shell behaviour and how to prove something live
are in `local-dev-playbook.md`. Design intent — what was decided and why — stays in
`specs/architecture.md` and the ADRs; this file is only about what breaks.

`CLAUDE.md` carries the one-line imperative for each of these. This file carries the evidence.

## Prisma and Neon on V8 isolates

- Neon Serverless Postgres via **Prisma + `@prisma/adapter-neon`** over `@neondatabase/serverless`
  (WebSocket/HTTP). **Never** plain `pg`/TCP at runtime. Hyperdrive only as an optional accelerator
  behind `lib/db`, never the default.
- **Two URLs:** `DATABASE_URL` = **pooled** (host has `-pooler`, runtime). `DIRECT_URL` = **direct**
  (migrations/seed). Schema uses `url = env("DATABASE_URL")`, `directUrl = env("DIRECT_URL")`.
- **Migrations run in CI on a Node runner using `DIRECT_URL` only.** Never on the Worker, never at
  request time, never against the pooled URL.
- Prisma 6: driver adapters are **GA** — do NOT add `driverAdapters` to `previewFeatures`.
  `@prisma/adapter-neon@7.9.1` requires a driver adapter. **Use a Hybrid Strategy for Cloudflare Isolates**:
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
- **`prisma.<model>.updateMany(...)`, `.createMany(...)`, and any write that opens an implicit
  transaction — including a singular `create` carrying NESTED child writes — unconditionally crash
  when run through `getPrisma()`, regardless of `where`-clause shape or match count**, with `Error: Transactions are not supported in HTTP mode` thrown from
  `PrismaNeonHttpAdapter.startTransaction`. This is **not** a Better Auth or application-code bug:
  Prisma 6's client-side query compiler (`engineType = "client"`, mandatory — see below) internally
  wraps `updateMany`/`createMany` in a transaction it opens itself, which the HTTP adapter can never
  execute. Confirmed empirically in #382 (2026-08-27) with a local Node script run directly against
  a live Neon DB (`PrismaNeonHttp` is fetch-based, so it reproduces identically outside Workers):
  `updateMany`/`createMany` crash every time, including a 0-row match; `deleteMany` (0-row AND a
  real match), `upsert`, and singular `create`/`update` all succeed.

  **Corrected and widened 2026-09-18 by #116.** The original "ONLY those two operations" phrasing
  was too narrow, and its "singular `create` succeeds" was true only of the case #382 actually
  tested — a create with no nested writes. The real rule is about **implicit transactions**, not
  about which method name is called. Measured on one `PrismaNeonHttp` client against the dev Neon
  branch, all five in a single run:

  | Operation | HTTP adapter |
  |---|---|
  | singular `create`, no nested children | succeeds |
  | singular `create` **with** nested child writes | **fails** — `Transactions are not supported in HTTP mode` |
  | singular `update` by primary key | succeeds |
  | `updateMany` | **fails** — same error |
  | `deleteMany` | succeeds |

  A nested create is several inserts, so the query compiler opens its own transaction for it for
  exactly the same reason it does for `createMany` — the method name just does not say so. Reproduce
  with `specs/2026-09-18-p116-saved-shopping-lists/verify-saved-lists.ts --prove-http`, which runs
  the failing pair on purpose and reports a SUCCESS as a failed check, so the day this stops being
  true the script says so rather than passing quietly. First found live via
  `setBundleImage` (`lib/repositories/bundles.ts`) 500ing on a real bundle-image upload during
  P8.5d — three prior diagnostic rounds correctly ruled out Better Auth's adapter (its
  `$transaction` really is `undefined` on the HTTP client and really is never called) before a
  fourth round of step-logging pinned it to this instead. **Any `updateMany`/`createMany` call in
  `lib/repositories/*` MUST run through `getPrismaWs()`** (inside a `tx.` block, or directly if no
  application-level transaction is otherwise needed — the query compiler's own internal transaction
  is enough, and the WS adapter can execute it). **So must any singular `create` that carries nested
  child writes.** `deleteMany`, `upsert`, and a singular `create`/`update` with NO nested writes
  have no such requirement and may use either client per the normal read/write split. Full
  investigation: `specs/2026-08-26-auth-http-transaction-fix/build-notes.md`.


## The second database (`uk-location-reference`)

Design intent and the schema split are in `specs/architecture.md` §3.0; provisioning and the
bootstrap procedure are in `docs/developer-portal/env-setup.md`. What follows is only the part that
bites at runtime.


- **Aheed's application database is NOT the only one.** A second Neon project,
  **`uk-location-reference`**, holds shared UK postcode and place reference data. It has its own
  schema (`prisma/reference/schema.prisma`), its own migration history
  (`prisma/reference/migrations/`, applied with `npm run ref:migrate`) and its own generated client.
  Env vars: **`UK_LOCATION_REF_DATABASE_URL`** (pooled, runtime) and **`UK_LOCATION_REF_DIRECT_URL`**
  (direct, migrations and sync), plus **`UK_LOCATION_REF_POSTCODE_AREAS`** (coverage, e.g. `"MK,RG"`).
  Dev and staging share one branch; production is separate.
- **Why it exists, in numbers.** Reference data was first built into Aheed's own database. A full-GB
  Code-Point import succeeded at 1,749,109 rows and **456.9 MB**, taking that project to **489.8 MB
  of its 512 MB ceiling** against under 5 MB for every transactional table combined; the Open Names
  import then failed outright and **ordinary application writes started failing**. The tell was
  three unrelated live-DB tests failing with `could not extend file because project size limit
  (512 MB) has been exceeded` — nothing to do with their own subject matter. **If a live-DB test
  fails with a message unrelated to what it tests, check `pg_database_size(current_database())`
  against the 512 MB ceiling before debugging the test.**
- **Reach reference data ONLY through `lib/reference/`.** Nothing under `app/`, `components/` or
  `features/` may import the reference client. The reference service answers "does this postcode
  exist and what is near it"; it must never own vendor delivery rules, which stay in
  `lib/delivery-eligibility.ts` reading `VendorDeliveryArea`.
- **A generated Prisma client MUST live in `node_modules`, never inside the project.** The reference
  client generates to `node_modules/@aheed/reference-client`. Generated under `lib/` instead,
  webpack parses its `query_compiler_bg.wasm` as source and `opennextjs-cloudflare build` fails
  outright with `Module parse failed ... not flagged as WebAssembly module for webpack`.
  `next.config.mjs`'s `serverExternalPackages` is what exempts `@prisma/client` from that, and it
  matches **package specifiers** — which a relative path can never be. Consequence: `npm ci` wipes
  it, so every workflow that builds must run `npm run db:generate` first. **Both deploy workflows
  previously ran no generate step at all**, relying on `@prisma/client`'s postinstall, which only
  ever knew about the default schema.
- **Import the reference client's `/wasm` entry in runtime code** (`@aheed/reference-client/wasm`)
  and its bare entry in Node scripts — the identical trap this file already records for
  `@prisma/client/wasm`. A second generated client is not exempt.
- **Coverage is demand-driven, and a missing row is ambiguous.** Only the postcode areas in
  `UK_LOCATION_REF_POSTCODE_AREAS` are materialised, so "no row" can mean the postcode does not
  exist **or** that we never imported that part of the country. Covered area with no active row is
  **INVALID**; an uncovered area is **UNVERIFIED**, as is an unreachable or unconfigured reference
  database. **Never convert an infrastructure or coverage gap into INVALID** — it degrades to manual
  address entry, never to telling a customer their address is wrong.
- **A sync decision has TWO dimensions: has the upstream release changed, AND is required coverage
  complete?** Checking only the publisher's checksum means a newly configured area never imports,
  silently. `ReferenceAreaCoverage` is the second dimension, and a coverage row is written only
  after that area's import completes.
- **`.env`/`.dev.vars` here use `KEY = "value"` with spaces around the `=`.** That contradicts this
  file's own env-format rule below, and it parses fine in practice — but any script that rewrites an
  env file must tolerate the spacing. A `^KEY=` substitution silently matches nothing, which once
  made a live outage test appear to pass while actually exercising the healthy path. **Verify an env
  edit landed before trusting any result that depends on it.**


## Object storage

The port rule and the decision behind it are ADR-003. Credential provisioning and rotation are in
`docs/developer-portal/env-setup.md`. What follows is how storage fails without telling you.

- Object storage via the **S3-compatible API only**, behind `lib/storage` (`StorageService` port).
  No R2 SDK, no R2-specific features. Prefer `aws4fetch` over the AWS SDK (Worker bundle size).
- DB holds relative keys; compose `${CDN_BASE_URL}/${key}` at read time.
- **Broken S3 credentials are invisible to every check this repo has, including `/api/health`.**
  Reads never touch the S3 API — `publicUrl()` is pure string composition over `CDN_BASE_URL` and
  the bytes come from the CDN — so a revoked key pair breaks **only writes**, i.e. every staff
  upload, while the storefront looks perfectly healthy. `lint`/`typecheck`/`test`/`build` execute no
  request; `/api/health`'s `storage: { configured: true }` asserts only that the **variables are
  present**, never that they work. Found at `#749`/`#755` (2026-09-15): the pair was rejected in
  **dev, staging AND production simultaneously** — all three share one key pair and differ only in
  `S3_BUCKET` — and the only visible symptom anywhere was one staff form failing. **`npx tsx
  scripts/verify-storage-credentials.ts` is the closest thing to an answer for "do these credentials
  actually work?", and it is important to know exactly what it covers** (read-only: a `HEAD` for a
  key that does not exist — `404` proves the credential works, `403` proves it does not). Run it
  before trusting any image-upload path, and after any Cloudflare token rotation — the R2 keys live
  in **two** stores per environment (all four env FILES, and `wrangler secret put`), so a file-only
  rotation leaves the deployed Worker on the old value, exactly as recorded for Neon passwords.
- **That script checks FOUR files and reports the deployed Worker's version — but it still cannot
  read a deployed secret's value, and nothing can.** It probes `.env`, `.dev.vars`,
  `secrets/staging.vars` and `secrets/production.vars` (**`.dev.vars` was missing until `#780`,
  and it is the file that wins under `npm run preview`** per the Config section — so a rotation
  could pass this check while local preview stayed broken). It then reports, for staging and
  production, whether each Worker's newest version is the deployed one, because that divergence is
  what made `#755` invisible: **the script reported ACCEPTED for all three environments while both
  deployed Workers served a revoked key**, the new values sitting in dashboard-created versions
  that were never deployed. A Worker reported `IN SYNC` proves the newest version is live, **not**
  that it carries the key you think it does. **The only complete proof of an image-upload path
  remains a real upload through the deployed environment** — treat a green script run as "nothing
  is obviously wrong", never as "this works".
- **A browser-reported storage bug does not need a browser to reproduce.** `lib/storage.ts` imports
  only `aws4fetch` and `lib/config`, so the entire presign/PUT path runs in plain Node via `npx tsx`.
  `#749`'s vendor-logo failure had been carried for days as "needs a browser reproduction with
  DevTools open"; a scratch script reproduced it in one run and bisected it in three more
  (every presign variant, a header-signed `putObject`, and a presigned GET all `403`, which is what
  ruled out the signing options and pointed at the credentials). Check whether the failing path
  actually depends on the browser before deferring on the browser's availability.
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


### A row and the object it names are written by different systems

Moved here from `CLAUDE.md`'s schema rules in #786: the rule is about storage failing at
runtime per environment, not about the data model, so it belongs with the other storage
pitfalls rather than in `specs/architecture.md` §3.1.

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


## Cloudflare edge caching of Worker routes

- **A `Cache-Control: public, max-age=N` header on a Worker route's response does NOT make
  Cloudflare cache it at the edge — that needs an explicit zone-level Cache Rule or the Worker
  calling the Cache API (`caches.default.put()`/`.match()`) itself, neither of which exists anywhere
  in this repo.** Confirmed live in P2.6 slice 5 (#568, #599, 2026-09-05): `/api/search/suggest`
  emits exactly that header, but six requests against two vendor hosts on staging — including four
  rapid repeats against one host — never once returned a `cf-cache-status` or `Age` header. Every
  request reached the Worker fresh. This is the CDN-caches-static-assets rule from the Storage
  section above running in reverse: that section is about a real cache (hotlink protection firing at
  the edge, before the app sees the request) blocking something that should load; this is about an
  *assumed* cache (a route designed to lean on edge caching for cost control) never actually forming
  at all, silently. Neither failure mode is visible from `lint`/`typecheck`/`test`/`build`, and
  neither is visible from a single request either — the tell here specifically was the *absence* of
  a cache-status header across repeats, not an error. **Before designing a cost or isolation
  argument around "Cloudflare will cache this by default," check a real deployed response's headers
  for `cf-cache-status`/`Age` across repeated requests** — a `Cache-Control` header alone proves the
  route is willing to be cached, never that anything upstream of the Worker actually will.


## Framework and dependency traps

Version policy and the pins themselves live in `specs/tech-stack.md`. What follows is the set of
version-adjacent facts that break a build or a runtime rather than a policy.

- **Exact-pin infrastructure-adjacent packages** — DB drivers, adapters, runtime types. Their
  declared semver ranges are looser than real compatibility. **Locked today, and enforced by
  `tests/dependency-pins.test.ts`:** `@neondatabase/serverless` = **1.1.0 exact**,
  `@prisma/adapter-neon` = **7.9.1 exact**, `@prisma/client` = **6.19.3 exact**. All three are
  declared with no range operator, and that test asserts both halves — the installed version *and*
  the absence of a caret — because checking only the version passes right through a re-loosened pin
  that happens to still resolve correctly today.
  **These were raised from `0.10.4` / `^6.19.3` in commit `ac3f0d6` (2026-08-14), deliberately, as
  part of the Cloudflare connection-exhaustion fix** that introduced `lib/db.ts`'s hybrid
  `getPrisma()`/`getPrismaWs()` strategy. That commit updated this file's hybrid-driver section but
  not this paragraph, so for three weeks the pins documented here had not existed since mid-August —
  and because both became **caret** ranges, `npm install` could have moved them again at any point.
  Found by hand at `#489`'s `/spec`, ratified rather than reverted in `#491`; the versions have
  production behind them and reverting would have undone half of a real fix.
  **`@prisma/adapter-neon` is a full major ahead of `@prisma/client` (7.x against 6.19.3). That is
  deliberate, known, and tracked by `#560`** — not an oversight to "correct" by bumping one of them.
  Nothing in the toolchain can warn about it: adapter-neon@7 declares **no `peerDependencies` at
  all** (it takes `@prisma/driver-adapter-utils` at an exact `7.9.1` and `@neondatabase/serverless`
  at `>0.6.0 <2`), so npm has nothing to check the client version against. The pin test is the only
  thing that makes the pairing unable to change silently.
  `@cloudflare/workers-types` is **not** exact-pinned and is **not** covered by that test — it is
  types-only, on date-based versioning, and ships no runtime behaviour. Its majors do **not** track
  wrangler's, whatever this line used to claim: the observed working pairing today is
  `@cloudflare/workers-types` **5.x** (`5.20260804.1`) with `wrangler` **4.x** (`4.119.0`). Record
  what is observed here rather than asserting a rule; `#491` found the old "must match wrangler's
  major (v5)" sentence was false in both halves.
  **`prisma` (the CLI/generator) is still `^6.19.3` and floats.** `npm ci` pins it via the lockfile
  so CI is unaffected, but a local `npm install`/`npm update` can drift the generator away from the
  now-pinned client. Deliberately left out of `#491`'s scope; raise it at `/propose` if it bites.
- **Do NOT run `npm audit fix --force`.** Here it downgrades wrangler and re-breaks the OpenNext peer.
  Audit findings are dev/build-tooling (undici→miniflare→wrangler); track under P7, don't force-fix.
- **Do NOT jump breaking majors mid-stream** without deliberately absorbing the migration (as done for
  Next 16 / vitest 4 below) — don't let a version bump land as a side effect of an unrelated change.
  Taking **`@prisma/client`/`prisma` themselves** to 7 is still its own future item (breaking
  generator) — `#560`. Note the *adapter* is already on 7.9.1 per the pin bullet above; that is the
  straddle `#560` closes, not a contradiction of this rule.
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
- **Any test file that constructs its own live Prisma/Neon client (`new PrismaClient({ adapter })`
  against a real `DATABASE_URL`) must guard its test(s) with `it.skipIf(!process.env.DATABASE_URL)`
  (or `test.skipIf(...)`), or it crashes the whole `npm test` step in CI — never just fails its own
  test.** `.github/workflows/quality.yml`'s `quality` job sets no `DATABASE_URL` at all (checked
  directly: `grep -n DATABASE_URL .github/workflows/*.yml` returns nothing), so
  `new PrismaNeon({ connectionString: undefined })` throws at construction or first query, outside
  any `it()` vitest can catch and report as a normal failure. Missed three separate times across
  two slices before this line existed: `tests/concurrency-slot-booking.test.ts` and
  `tests/slot-capacity.test.ts` (P401, found fixing PR #744, 2026-09-13) and
  `tests/express-sla.test.ts` (P402, found during PR #746's pre-flight, 2026-09-14) — the first two
  were fixed once and the third was written afterward, by a different session, without the guard,
  proving the lesson doesn't transfer just because the fix exists elsewhere in the same repo.
  **Verify locally by temporarily moving `.env` aside** (`mv .env .env.bak && npx vitest run
  <file> ; mv .env.bak .env` — `.env` is what supplies `DATABASE_URL` outside a real Cloudflare
  request context per the Config section above) and confirming the file reports **skipped**, not
  run and not crashed; a green full-suite run alone proves nothing here, since `DATABASE_URL` is
  always set locally.


## Workers AI (Cloudflare REST API calls)

- **`result.response` from `POST /accounts/<id>/ai/run/<model>` is NOT reliably a string — for
  `@cf/meta/llama-3.1-8b-instruct` it comes back as an ALREADY-PARSED JSON value (an array, when
  the model's reply is JSON) when the reply parses as such, with the string form of the same
  content sitting separately at `result.choices[0].message.content`.** Both
  `lib/search-synonym-proposals.ts` (#566) and `lib/list-normalisation.ts` (#567) were written with
  `typeof payload.result?.response === "string" ? payload.result.response : ""`, and both were
  built and unit-tested entirely against a stubbed `fetch` that only ever returns `response` as a
  string — because that is what the code assumed, so that is what the test double encoded, and the
  double proved nothing about what Cloudflare's own endpoint actually returns. Confirmed live for
  the first time at `#567`'s `/validate` (2026-09-04): a real call with real
  `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN` succeeded (200, valid JSON body) and the pre-pass
  still silently extracted zero items on every single call, because `typeof response !== "string"`
  made the extraction fall through to `""` every time — no error, no failed request, nothing in any
  log to suggest anything was wrong; the feature just never worked. **This is the same failure
  shape this file already records for Prisma driver error codes** (`isUniqueViolation()` checking
  only `P2002` when the HTTP adapter throws `23505`): a hand-constructed test double reproduces
  whichever shape its author assumed, not the shape the real service actually returns, and the only
  way to find the gap is a live call. Fixed in `lib/list-normalisation.ts` via an `extractReplyText`
  helper that accepts `response` as a string (used directly), as a non-string non-null value
  (re-serialised with `JSON.stringify` so the same bracket-and-`JSON.parse` parser still runs
  unmodified), or falls back to `choices[0].message.content` when `response` is absent entirely.
  **`lib/search-synonym-proposals.ts` still has the unfixed assumption** — flagged on `#583` but not
  fixed there, since that module was out of this slice's scope. **Any code calling Workers AI's REST
  endpoint and expecting a string reply must widen its extraction the same way, and must verify it
  against a real call under `npm run preview`** (`.dev.vars` needs `CLOUDFLARE_ACCOUNT_ID`/
  `CLOUDFLARE_API_TOKEN` — see the Config section above for precedence) — a green unit suite proves
  nothing here, exactly as it didn't for the Prisma error-code case.


## Better Auth (`lib/auth.ts`, ADR-002)

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

