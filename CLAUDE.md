---
id: claude-md
title: "CLAUDE.md — AI Assistant Guardrails"
audience: [dev]
type: doc
status: approved
version: "1.0.0"
updated: 2026-08-06
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
  `@prisma/adapter-neon@6.19.3` builds its own `Pool` internally — construct as
  `new PrismaNeon({ connectionString })`, a `neon.PoolConfig`, **not** a `Pool` instance (passing a
  `Pool` fails with `Type 'Pool' has no properties in common with type 'PoolConfig'`).
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
`/validate`, `/fix`, `/ship`, `/document`). Use them; that doc carries lessons already paid for
(stale-doc traps, CI-vs-local-Windows drift, PR merge races) that are easy to relearn the hard way.

Two rules the assistant **cannot** enforce for itself, so it must ask:
- **`/clear` is user-invoked.** Before either Clear, everything load-bearing must be committed — a
  Clear destroys anything living only in the conversation. `/build-notes` exists to get it on disk.
- **Model switches are user-invoked.** Sonnet 5 for the Validate/Fix/Ship half, Opus 5 for the
  Orient/Propose/Spec/Build/Document half. If a stage is running on the wrong model, say so and ask
  rather than proceeding quietly.

**Gate 4 lands in `/build-notes`, not the final `/document`** — the CHANGELOG entry must be on the
branch before it merges, and Ship precedes the final documentation pass.

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
