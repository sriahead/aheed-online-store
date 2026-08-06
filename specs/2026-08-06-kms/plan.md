---
id: kms-design
title: Aheed KMS — Design (structure, deployment, schema)
audience: [dev]
type: spec
status: draft
version: 0.1.0
updated: 2026-08-06
visibility: internal
tags: [kms, docs-as-code, nextra, rag, governance]
summary: Folder structure, deployment plan, and front-matter schema for the Aheed knowledge system — phased to M0 reality, with a generated index and an internal/public publication split.
---

# Aheed KMS — Design

> Council-shaped design. Three principles override the original proposal:
> **(1)** the `ARTIFACT_INDEX.md` is *generated + gated*, never hand-authored;
> **(2)** internal (dev/staff) and public (customer) content are *separate deploys*,
> not just separate folders — ADRs and `CLAUDE.md` must never reach a public site;
> **(3)** tracks are *phased* — track 1 ships now, tracks 2–3 are stubbed until the
> admin panel (P6) and storefront exist. Single source of truth is preserved: the
> site is a **build artifact**, source docs stay in `specs/` + `docs/`.

---

## 1. Folder structure

Two Nextra apps (one internal, one public) that **assemble** their content at build
time from the single-source repo files. No doc body is duplicated; only nav/index
MDX and genuinely new content (the prompt library) live under the sites.

```
aheed-online-store/
├── specs/                         # SINGLE SOURCE — governed by SDD gates (unchanged)
├── docs/                          # SINGLE SOURCE — onboarding, runbook, structure (unchanged)
├── CLAUDE.md                      # SINGLE SOURCE — guardrails (internal only)
├── ARTIFACT_INDEX.md              # GENERATED — do not edit by hand (see §3, §4)
│
├── kms/                           # ── KNOWLEDGE SYSTEM ──
│   ├── schema/
│   │   ├── frontmatter.ts         # zod schema + types (the contract, §3)
│   │   └── validate.ts            # CI validator (fails gates on bad/missing front-matter)
│   ├── scripts/
│   │   ├── build-index.ts         # walks **/*.md(x) → writes ARTIFACT_INDEX.md
│   │   └── assemble.ts            # copies single-source docs into a site build dir by `visibility`
│   │
│   ├── prompts/                   # NEW first-class content — the AI prompt library (track 1)
│   │   ├── index.mdx
│   │   └── <name>.prompt.mdx      # each carries front-matter, type: prompt
│   │
│   ├── site-internal/             # ── DEPLOY A: internal (tracks 1 + 2) ──
│   │   ├── next.config.mjs        # Nextra + @opennextjs/cloudflare
│   │   ├── theme.config.tsx
│   │   ├── wrangler.toml          # env.internal → docs.internal.<domain>, behind Cloudflare Access
│   │   ├── package.json
│   │   └── content/
│   │       ├── index.mdx          # "Start here"
│   │       ├── dev/               # TRACK 1 (NOW): architecture, ADRs, APIs, runbooks, prompts
│   │       │   └── _meta.json     # nav; bodies assembled from specs/, docs/, kms/prompts/
│   │       └── staff/             # TRACK 2 (STUB until P6): operational SOPs, admin how-tos
│   │           └── index.mdx      # placeholder w/ schema ready
│   │
│   └── site-public/               # ── DEPLOY B: public (track 3) — STUB until storefront exists ──
│       ├── next.config.mjs
│       ├── theme.config.tsx
│       ├── wrangler.toml          # env.public → help.<domain>, public
│       ├── package.json
│       └── content/
│           └── customer/          # TRACK 3: help centre, FAQs, guides (empty until there's a UI)
│               └── index.mdx
│
└── .github/workflows/
    ├── gates.yml                  # + validate front-matter, + rebuild & diff ARTIFACT_INDEX.md
    ├── deploy-docs-internal.yml   # assemble(internal) → build → wrangler deploy --env internal
    └── deploy-docs-public.yml     # assemble(public)   → build → wrangler deploy --env public  (deferred)
```

**What the index indexes (Outsider's fix):** *documents and prompts* — things with a
front-matter block. Not `wrangler.toml`, not diagrams-as-binaries. A config is not a
doc; git already lists files. Diagrams are referenced *by* a doc, indexed via that doc.

---

## 2. Deployment plan

Reuses your existing pattern exactly: Next.js → `@opennextjs/cloudflare` → Workers,
per-env `wrangler.toml`, GitHub Actions deploy-on-push. Two Workers instead of one.

| | Deploy A — internal | Deploy B — public (deferred) |
|---|---|---|
| Audience | dev/AI + staff | customers |
| Tracks | 1 (now) + 2 (stub) | 3 (stub) |
| Domain | `docs.internal.aheedfoodcentre.nocaped.com` | `help.aheedfoodcentre.nocaped.com` |
| Access | **Cloudflare Access** (zero-trust; email/SSO) | Public + WAF |
| Trigger | push to `staging`/`main` (like your app) | later, once storefront ships |
| Content filter | `visibility: internal` **and** `public` | `visibility: public` **only** |

**Pipeline (per deploy), mirroring `deploy-staging.yml`:**
1. `npm ci`
2. `tsx kms/scripts/build-index.ts` → regenerate `ARTIFACT_INDEX.md`
3. `tsx kms/schema/validate.ts` → every `.md(x)` has valid front-matter (else fail)
4. `tsx kms/scripts/assemble.ts --visibility internal|public` → copy single-source docs into the site's build dir (gitignored)
5. `next build --webpack` (same `--webpack` pin your app needs)
6. `opennextjs-cloudflare build && wrangler deploy --env internal|public`

**Gate wiring (in `gates.yml`, mirroring your Gate-4 changelog check):**
- run the front-matter validator on all `.md(x)`;
- run `build-index.ts` and `git diff --exit-code ARTIFACT_INDEX.md` — a stale index
  fails the PR, exactly the way a missing CHANGELOG entry does. This is what makes the
  index safe to trust: it cannot drift.

**Cost/ops:** two more Workers, both scale-to-zero. The public one is dormant (deferred)
until there's a storefront to support.

---

## 3. Front-matter schema (the contract)

One schema for all three tracks, so tracks 2–3 need **zero rework** later (whereas the
*RAG* claim is downgraded to "RAG-ready metadata" — chunking/embeddings/eval are separate).
Sketched in your `lib/config` zod style.

```ts
// kms/schema/frontmatter.ts
import { z } from "zod";

export const Audience   = z.enum(["dev", "staff", "customer"]);
export const Track      = z.enum(["internal-eng", "staff-ops", "customer-help"]);
export const DocType    = z.enum(["doc", "adr", "spec", "runbook", "prompt", "sop", "faq"]);
export const Status     = z.enum(["draft", "review", "approved", "deprecated"]); // mirrors the SDD gates
export const Visibility = z.enum(["internal", "public"]);                        // drives WHICH deploy

export const FrontMatter = z.object({
  // required — RAG + index depend on these
  id:        z.string().regex(/^[a-z0-9-]+$/),   // stable slug; RAG chunk provenance
  title:     z.string().min(3),
  audience:  z.array(Audience).min(1),           // a doc may serve more than one
  type:      DocType,
  status:    Status,
  version:   z.string(),                          // semver or date
  updated:   z.string().date(),                   // ISO; freshness signal for RAG
  visibility: Visibility,                         // internal | public — NEVER default to public
  summary:   z.string().min(20).max(300),         // 1–2 sentences; doubles as the RAG chunk description
  tags:      z.array(z.string()).default([]),
  // optional
  owner:     z.string().optional(),
  related:   z.array(z.string()).optional(),      // ids/paths of related specs/ADRs
});
export type FrontMatter = z.infer<typeof FrontMatter>;

// track is DERIVED (audience → track) so it can't disagree with audience.
export function trackFor(fm: FrontMatter): z.infer<typeof Track> {
  if (fm.audience.includes("customer")) return "customer-help";
  if (fm.audience.includes("staff"))    return "staff-ops";
  return "internal-eng";
}
```

**Example block (top of any doc/prompt):**
```yaml
---
id: adr-003-storage-abstraction
title: "ADR-003 — Object Storage Abstraction (S3-compatible)"
audience: [dev]
type: adr
status: approved
version: "1.0.0"
updated: 2026-08-05
visibility: internal
tags: [storage, r2, s3, portability, adr]
summary: Access object storage only via the S3 API behind a StorageService port; the DB stores relative keys and URLs are composed at read time.
related: [adr-001-hosting, architecture]
---
```

**Why these fields, briefly:** `id` + `updated` give RAG stable provenance and freshness;
`summary` becomes the retrieval description; `tags`/`audience`/`type` are metadata filters;
`visibility` is the safety valve that keeps ADRs and guardrails off the public site;
`status` reuses your gate vocabulary so review state is visible in the index.

---

## 4. How the index is produced (not authored)

`kms/scripts/build-index.ts` walks every `**/*.md(x)` (including `specs/`, `docs/`,
`CLAUDE.md`, `kms/prompts/`), parses front-matter, validates it against the schema,
derives `track`, and writes `ARTIFACT_INDEX.md` grouped by track. It runs in CI; the
committed file is diffed to catch staleness. See `ARTIFACT_INDEX.md` for the shape.
