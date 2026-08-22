---
id: claude-md
title: "CLAUDE.md — AI Assistant Guardrails"
audience: [dev]
type: doc
status: approved
version: "1.8.0"
updated: 2026-08-20
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
- Money = **integer pence** + explicit currency. No floats, no `money` type.
- Images: store a **relative key** (e.g. `products/{productId}/{uuid}.webp`), **never a URL**.
  Keys are **immutable** — replacing an image writes a new key and repoints the row, so a CDN purge
  is never needed. (This line said `products/{sku}/main.webp` until P6b2; `Product` has no `sku`
  field and the seed writes `products/{slug}/main.svg`, so the example matched nothing in the repo.)

## Storage (ADR-003)
- Object storage via the **S3-compatible API only**, behind `lib/storage` (`StorageService` port).
  No R2 SDK, no R2-specific features. Prefer `aws4fetch` over the AWS SDK (Worker bundle size).
- DB holds relative keys; compose `${CDN_BASE_URL}/${key}` at read time.

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

## Branch strategy & CI/CD
- `feature/<slug>` → PR into **`staging`** (auto-deploys to `staging.aheedfoodcentre.nocaped.com`).
- **`staging` → `main`** via PR; merging to `main` requires **manual approval** (GitHub `production`
  environment) and deploys to `aheedfoodcentre.nocaped.com`. Never push directly to `main`/`staging`.
- **Known gap:** GitHub's required-reviewers environment protection needs a paid plan for private
  repos — rejected with a 422 on this repo's current (free) plan. `production` currently has no
  enforced approval gate; treat PR review discipline as the real gate until this is resolved
  (upgrade plan, make the repo public, or accept branch-protection-only review).
- Both `staging` and `production` need their own GitHub environment secrets: `CLOUDFLARE_API_TOKEN`,
  `CLOUDFLARE_ACCOUNT_ID`, `DIRECT_URL` (used for `prisma migrate deploy` in CI). Separately, each
  Cloudflare Worker needs its own **runtime** secret set via `wrangler secret put NAME --env <env>`
  (`DATABASE_URL` at minimum) — the GitHub Actions secrets above do not populate these; they're two
  different secret stores.

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
- **`format:check` failing on dozens of untouched files is the `core.autocrlf` artifact, not drift.**
  Confirm it the documented way — write a file's committed blob (`git show HEAD:<file>`) out with LF
  endings and run `prettier --config .prettierrc.json --check` on it. **Do that in a directory
  prettier can still resolve the config from, or pass `--config` explicitly**: checking a copy in a
  temp directory silently falls back to prettier's *defaults* and reports failures that mean
  nothing. CI on Linux is the authority.
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
- **`getCartRepository` et al. are the right SHAPE but the wrong LOCATION — copy the shape, not the
  address.** This rule previously pointed at `getCartRepository` as the thing to match, without
  saying which part, and that sentence was self-defeating: `getCartRepository` lives *inside*
  `lib/repositories/cart.ts`, which is exactly what the rule forbids. A reader following it
  literally reproduced the defect. **Nine facade factories are known non-compliant** —
  `getCartRepository`, `getCategoryRepository`, `getDiscountRepository`, `getLoyaltyRepository`,
  `getOrderRepository`, `getWebhookOrderService`, `getGuestOrderLookupService`,
  `getProductRepository`, `getReviewRepository` — across seven files. `lib/repositories/data-rights.ts`
  is the only compliant one. Tracked as **#252**; the P7 closeout slice (#251) corrected this wording
  only, because moving nine factories and every call site is a refactor of its own. Until #252 lands,
  the compliant examples to copy are `lib/data-rights-service.ts` and `lib/auth-rbac.ts`.
  `tests/repository-vendor-scoping.test.ts` allowlists all nine by name with their reasons, so the
  list cannot quietly grow.

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

## Local Stripe webhook testing — learned the hard way
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
