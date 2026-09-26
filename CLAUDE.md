---
id: claude-md
title: "CLAUDE.md — AI Assistant Guardrails"
audience: [dev]
type: doc
status: approved
version: "2.0.0"
updated: 2026-09-17
visibility: internal
summary: Always-loaded guardrails for the Aheed Online Store — runtime, database, schema, storage, config, CI and the SDD gates — reduced to what every session needs, with pointers to the documents that carry the detail.
tags: [guardrails, ai-assistant, conventions]
---

# CLAUDE.md — AI assistant guardrails (Aheed Food Centre Online Store)

Read this first, every session. It encodes decisions already made; do not re-derive them from
training defaults. It holds the **rule**, not the evidence. Open the matching document when an area
becomes relevant — each is authoritative, and none is loaded automatically.

- Designing, or the data model — `specs/architecture.md`, then `specs/decisions/`
- A runtime failure a green build did not predict — `docs/developer-portal/runtime-pitfalls.md`
- Writing in `lib/repositories/`, `app/(admin)/staff/`, or a `"use server"` module —
  `docs/developer-portal/app-conventions.md`
- Running or proving something locally — `docs/developer-portal/local-dev-playbook.md`
- Environments and secrets — `docs/developer-portal/env-setup.md`
- A delivery stage or a spec — `specs/sdd-workflow.md`, `.claude/commands/`
- What CI runs — `docs/developer-portal/sdd/operator-runbook.md`
- Dependencies — `specs/tech-stack.md`. Branding — `specs/design-system.md`

## What this project is

UK grocery e-commerce for **Aheed Food Centre**: **PostgreSQL-first, vendor-agnostic,
cost-effective, multi-tenant** (ADR-004) — vendor, branding and delivery rules come from the
database, never hardcoded. Currently **P10 (post-launch improvements)**; M0–P9 are in production.
**The platform has never traded** — `#113` (live Stripe keys) and `#104` (verified email domain)
are open owner-gated blockers — so no financial figure here is a realised number.

## Runtime & hosting (overrides any GCP/Pages/edge assumption)

- Next.js on **Cloudflare Workers** via `@opennextjs/cloudflare`. **Not** Pages, **not**
  `@cloudflare/next-on-pages`, **not** Next's `edge` runtime — never add an edge runtime export.
- **Node.js runtime** (`nodejs_compat`); keep that flag and a recent `compatibility_date`.
- Deploy: `opennextjs-cloudflare build`, then `wrangler deploy --env <env>`.
- **No `proxy.ts`/`middleware.ts` can ship at all.** No per-file workaround — pass a prop from the
  layout. `next build` stays green regardless, so it proves nothing.

## Database (Neon + Prisma on V8 isolates)

Every rule here fails **silently**. Evidence: `docs/developer-portal/runtime-pitfalls.md`.

- Neon Postgres via **Prisma + `@prisma/adapter-neon`**. **Never** plain `pg`/TCP at runtime.
- **`DATABASE_URL` is pooled (runtime); `DIRECT_URL` is direct.** Migrations run **in CI on a Node
  runner against `DIRECT_URL` only** — never on the Worker, never at request time.
- **Hybrid client, not optional:** `getPrisma()` (HTTP) for reads and ordinary writes;
  `getPrismaWs()` (WebSocket) **only** where an interactive `$transaction` is needed — that
  isolation keeps an isolate under its socket limit.
- **Construct a client fresh every call; never cache across requests**, including inside wrappers
  such as `getAuth()`.
- **`updateMany`/`createMany` must use `getPrismaWs()`** — through `getPrisma()` they crash
  unconditionally, even on zero rows. **So must a singular `create` carrying nested child writes**
  (`data: { …, items: { create: [...] } }`) — the rule is "does this open an implicit transaction",
  not which method is named, and a nested create is several inserts (measured `#116`, 2026-09-18;
  `#382`'s original note said singular `create` was always fine because it only tested the
  childless case). `deleteMany`, `upsert`, and singular `create`/`update` with **no** nested writes
  are fine.
- **The two adapters report the same Postgres error under different `.code` values** (raw SQLSTATE
  `"23505"` vs Prisma `P2002`). Any `error.code` check guarding a write must accept **both**, and be
  verified against a real failing request — a hand-built double only reproduces its author's guess.
- **`engineType = "client"`**; runtime code imports from **`@prisma/client/wasm`**, Node scripts
  from the bare specifier. Same for `@aheed/reference-client/wasm`.
- **Validate DB-touching code with `npm run preview`, never `npm run dev`** — `next dev` cannot load
  the WASM engine and silently renders an error state. Fine for UI-only work.
- **Two databases exist.** `uk-location-reference` is reached **only** via `lib/reference/`. A
  coverage or infrastructure gap degrades to UNVERIFIED, never to telling a customer their address
  is wrong.
- **Neon Auth stays OFF** — auth is Better Auth (ADR-002).

## Schema rules

Modelling rules, the raw-SQL exception, the migration procedure: `specs/architecture.md` §3.1.

- Strict relational / 3NF, explicit foreign keys, provider-neutral Postgres types.
- **No `Json` columns** for domain data. **No raw SQL in application code** — one permitted
  exception exists (`lib/error-event-fallback.ts`); do not widen it. Migration DDL is allowed.
- Money = **integer pence** plus explicit currency. No floats, no `money` type.
- Images: store a **relative key**, never a URL; keys are immutable.
- **Generate every migration with `--create-only` and read the SQL before it applies** — Prisma has
  proposed dropping the hand-authored `pg_trgm` indexes on every migration since `#508`.

## Storage (ADR-003)

- **S3-compatible API only**, behind `lib/storage`; no R2 SDK. Prefer `aws4fetch`.
- DB holds relative keys; compose the URL from `CDN_BASE_URL` plus the key at read time.
- **Broken S3 credentials are invisible to every check here, including `/api/health`** — only writes
  break. Run `npx tsx scripts/verify-storage-credentials.ts` before trusting an upload path; green
  means "nothing obviously wrong", not proof.

## Config & secrets

Detail and the deployed-binding traps: `docs/developer-portal/env-setup.md`.

- All config through validated **`lib/config`** (zod); never read `process.env` directly.
- Precedence is **Cloudflare request context first, then `process.env`** — `.dev.vars` wins under
  `npm run preview` and on a Worker; `.env` wins only without a Worker context. It is **per key**,
  so simulating an unset secret means removing it from **both** files.
- `.env` format: **no spaces around the equals sign, quoted values, comments on their own line.**
  Two reference-database keys carry the spaced form, so a script rewriting an env file must tolerate
  both (`#505`).
- Runtime secrets live in Cloudflare (`wrangler secret put`); CI secrets in GitHub environments —
  **two stores**, and setting one does not populate the other. Never commit secrets; never read
  `DIRECT_URL` at runtime.
- Before live-database work, diff `.env` and `.dev.vars` against `secrets/staging.vars` and
  `secrets/production.vars` — two files agreeing is not evidence they are right.

## Commands

`npm run lint` · `typecheck` · `format:check` · `npx vitest run` · `build` (pinned `--webpack`;
Turbopack cannot resolve `@prisma/client/wasm`) · `preview` · `db:generate` (after every `npm ci`) ·
`kms:validate` · `kms:build-index` · `kms:check-generated` · `sdd:audit` · `sdd:preclear`.
After editing `docs/` or `specs/`, also run `kms:assemble:internal` **and** a real Next build in
`kms/site-internal` — `gates` never builds the docs site.

## Branch strategy & CI/CD

Rulesets, workflows, deploy ordering: `docs/developer-portal/sdd/operator-runbook.md`.

- `feature/<slug>` into **`staging`** by PR, then **`staging` into `main`** by PR. **Never push
  directly to either** — both carry rulesets requiring a PR and blocking a merge with red checks.
- Every PR references its issue (`Closes #NN`) and touches `CHANGELOG.md`. **Check the base branch
  of every PR you open** — nothing constrains a PR's source, and three have reached `main` directly.
- **Quality checks live in `.github/workflows/quality.yml`**, used by all three callers — **add a
  check there, not to a caller**, or the deploy paths drift into running less than a PR does.
- **Both deploy workflows build before they migrate.** Do not reorder.
- A `schedule`/`workflow_dispatch` workflow does nothing until it reaches **`main`**.

## The four SDD gates (non-negotiable)

1. **Propose before work** — open the issue + a spec proposal; wait for approval.
2. **Spec before code** — no source without `specs/<YYYY-MM-DD-feature>/requirements.md`.
3. **Validate before done** — `lint`, `typecheck`, `test`, and `validation.md` criteria pass.
4. **Changelog before merge** — update `CHANGELOG.md` on the branch.

**Read `specs/sdd-workflow.md`** for the full loop and its two context resets: **Orient → Propose →
Spec → Build → Build notes → CLEAR → Validate/Fix → Ship → Document → CLEAR**. Each stage is a slash
command with its procedure in `.claude/commands/`. `/discover`, `/learn` and the business case
review run on the **milestone**, are evidence rather than scope, and are **not** gates — a lesson
recorded only in a retrospective has not been promoted; anything that should change every future
session belongs in this file.

- **Gate 4 lands in `/build-notes`**, not the final `/document`.
- **`sdd:preclear`** must exit 0 before it is safe to `/clear`; **`sdd:audit`** is the only check
  after Ship. A skip line is not a pass.
- **The delivery board** (Project #2) carries **Status, Priority and Phase**; scope lives in
  `specs/`. An open `High` item goes to Propose ahead of any ranking you generate. **`Done` means in
  production**, so open issues for staging-merged slices are expected.

Two rules the assistant **cannot** enforce for itself, so it must ask:

- **`/clear` is user-invoked.** Before either Clear, everything load-bearing must be committed.
- **Model switches are user-invoked** — Sonnet 5 for Validate/Fix/Ship/Document, Opus 5 for
  Orient/Propose/Spec/Build, switching at the *end* of Document. If a stage is on the wrong model,
  say so and ask rather than proceeding quietly.

## Dependency & version discipline

Policy: `specs/tech-stack.md`. Failures: `docs/developer-portal/runtime-pitfalls.md`.

- **Exact-pin infrastructure-adjacent packages**, enforced by `tests/dependency-pins.test.ts`:
  `@neondatabase/serverless` **1.1.0**, `@prisma/adapter-neon` **7.9.1**, `@prisma/client`
  **6.19.3**. The 7.x adapter against the 6.x client is a **deliberate, ratified straddle** no
  tooling can warn about (`#560`). Change a pin and its test literal in the same commit.
- **Never `npm audit fix --force`** — it downgrades wrangler and breaks the OpenNext peer.
- **Never absorb a breaking major** as a side effect of an unrelated change.

## Server Actions (`"use server"` files)

- **Such a file may export ONLY async functions — not even a plain constant.** Enforced at
  *runtime*, so `build`/`typecheck`/`test` stay green while **every** action in the file 500s for
  every caller. Keep state constants in a plain module.

## Repository layer (`lib/repositories/*`)

- **Every export takes its Prisma client and `vendorId`/`userId` as explicit parameters and reads no
  request context**; request-scoped facades live in a sibling `lib/<name>-service.ts`. Both halves
  are enforced without allowlists by `tests/repository-purity.test.ts` and
  `tests/repository-client-injection.test.ts`.

## Staff panel pages (`app/(admin)/staff/*`)

- **A new `/staff/*` page must land on three surfaces** — `components/staff/PanelNav.tsx`, the hub
  at `app/(admin)/staff/page.tsx`, and one of the three operator guides — and its
  `requireVendorRole` refusal branch must render the `PanelRefusal` component, never `return null`.
  Three tests enforce this. **No test checks whether a documented capability exists**, so trace
  every capability sentence to a real control.

## Design tokens & per-vendor branding

- **A `tokens.css` edit may never reach a browser** — `brandStyle()` injects competing custom
  properties inline, and inline beats `:root`. Check whether `brandStyle()` lists the token too, and
  verify against a **second vendor**: SriMart's colours differ, and several checks false-positive
  against Aheed's.
- **UI copy comes from the vendor or is neutral** — vendors sell different things (Aheed groceries,
  SriMart electronics). Never write a vendor's name or a grocery example into a component or a
  default parameter; make the prop required. Rule and its guard test:
  `docs/developer-portal/app-conventions.md` ("User-facing copy").

## React & Next.js Hooks

- **A `useEffect` that closes a UI element on `pathname` change must NOT list that element's `open`
  state in its dependencies** — opening it re-triggers the effect and closes it immediately. Call
  the close function unconditionally and silence the specific lint rule instead.

## Windows shell & local development

- **Use the Edit/Write tools for file content; keep PowerShell for git, npm and gh.**
  `Get-Content`/`Set-Content` double-encodes UTF-8 and rewrites line endings. Check
  `git diff --numstat` after any scripted rewrite.
- **Run `npx vitest run` alone** — beside or straight after a heavy build its forks pool silently
  fails to start workers and whole files never execute, sometimes still exiting 0.
- **Stopping `npm run preview` does not stop it** — kill the whole `node`/`workerd` chain first, or
  the next build fails with `EBUSY`.
- **Server actions and staff pages are drivable with `curl`, no browser needed.**

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
