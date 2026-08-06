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
  `@prisma/adapter-neon@6.19.3` builds its own `Pool` internally — construct as
  `new PrismaNeon({ connectionString })`, a `neon.PoolConfig`, **not** a `Pool` instance (passing a
  `Pool` fails with `Type 'Pool' has no properties in common with type 'PoolConfig'`).
  Instantiate Prisma via `lib/db` (lazy singleton), never a long-lived global connection.
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
- Money = **integer pence** + explicit currency. No floats, no `money` type.
- Images: store a **relative key** (e.g. `products/{sku}/main.webp`), **never a URL**.

## Storage (ADR-003)
- Object storage via the **S3-compatible API only**, behind `lib/storage` (`StorageService` port).
  No R2 SDK, no R2-specific features. Prefer `aws4fetch` over the AWS SDK (Worker bundle size).
- DB holds relative keys; compose `${CDN_BASE_URL}/${key}` at read time.

## Config & secrets
- All config through validated **`lib/config`** (zod). Precedence is **`process.env` first**, then the
  Cloudflare request context — so local `.env` wins in dev and a stray `.dev.vars` can't shadow it.
- `.env` format: no spaces around `=`, **quote values**, comments on their own line (a trailing
  `# comment` or leading space has silently broken connection strings here).
- Runtime secrets live in Cloudflare (`wrangler secret put NAME --env <env>`); CI secrets in GitHub
  environments. Never commit secrets; never read `DIRECT_URL` at runtime.

## Branch strategy & CI/CD
- `feature/<slug>` → PR into **`staging`** (auto-deploys to `staging.aheedfoodcentre.nocaped.com`).
- **`staging` → `main`** via PR; merging to `main` requires **manual approval** (GitHub `production`
  environment) and deploys to `aheedfoodcentre.nocaped.com`. Never push directly to `main`/`staging`.

## The four SDD gates (non-negotiable)
1. **Propose before work** — open the issue + a spec proposal; wait for approval.
2. **Spec before code** — no source without `specs/<YYYY-MM-DD-feature>/requirements.md`.
3. **Validate before done** — `lint`, `typecheck`, `test`, and `validation.md` criteria pass.
4. **Changelog before merge** — update `CHANGELOG.md` on the branch.
Every PR references its issue (`Closes #NN`), carries `phase:P_` + `gate:_` labels, touches CHANGELOG.

## Dependency & version discipline (learned the hard way)
- **Exact-pin infrastructure-adjacent packages** — DB drivers, adapters, runtime types. Their
  declared semver ranges are looser than real compatibility. Locked today:
  `@neondatabase/serverless` = **0.10.4 exact** (adapter-neon@6 targets 0.x; 1.x is allowed by the
  range but must not be used). `@cloudflare/workers-types` must match wrangler's major (v5).
- **Do NOT run `npm audit fix --force`.** Here it downgrades wrangler and re-breaks the OpenNext peer.
  Audit findings are dev/build-tooling (undici→miniflare→wrangler); track under P7, don't force-fix.
- **Do NOT jump breaking majors mid-stream.** Stay on **Prisma 6** and **Next 15**. Prisma 7 and
  Next 16 are each their own P7 SDD item (breaking generator / removed `next lint`).
- npm 12 blocks dependency install scripts by default: approve the toolchain
  (`esbuild workerd sharp unrs-resolver @prisma/client @prisma/engines prisma`) before expecting
  test/build/preview to work.

## Hard stops
- Never invent infrastructure or credentials. If a resource/secret is missing, STOP and list what
  the human must create.
- Propose (Gate 1) before implementing anything non-trivial; show the plan and wait.
- Build only what the current stage requires. Reuse before create.
