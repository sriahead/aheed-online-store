---
id: p1341-production-cutover-plan
title: "Production cut-over to Merqify, with gated scheduler ticks (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-31
visibility: internal
summary: "#1341 + #1325: create and bind the JOB_SIGNALS KV namespaces, fill the new Merqify production database from old staging, push its secrets, then promote staging to main and prove both production hosts healthy."
tags: [production, cut-over, merqify, neon, kv, scheduler, promotion, p12]
related: [env-setup, architecture]
---

# Production cut-over to Merqify, with gated scheduler ticks (plan)

**Goal:** put the ShopLocal platform cell into production on Merqify, on `aheed.merqify.com` and
`srimart.merqify.com`. It goes there with scheduler gating switched on, so the new production
database is not woken 96 times a day. This ends the 29-commit gap between `staging` and `main`,
and replaces the dead Nocaped production (Neon HTTP 402, `#1289`).

The owner bundled `#1325` with `#1341` on 2026-10-31 to get this done in one pass.

## Scope (this slice)

**A. `#1325`: bind the `JOB_SIGNALS` KV namespaces (the only code change).**

- The **owner** creates `aheed-jobs-staging` and `aheed-jobs-production` in the **Merqify**
  Cloudflare account. An agent does not create infrastructure.
- Their ids replace the "NOT YET CREATED" comment blocks in **both** `wrangler.toml` and
  `workers/scheduler/wrangler.toml`, as `[[env.<env>.kv_namespaces]]` with
  `binding = "JOB_SIGNALS"`. Each environment uses the same id in both files.
- `env-setup.md` "Gated ticks" records that both namespaces exist.
- This lands on `staging` first. The staging tick proves gating before the promotion carries it to
  production.

**B. `#1341`: the production procedure** (`env-setup.md` → "Production cut-over").

- It runs steps 1–5 of the staging cut-over, with `secrets/merqify-production.vars` and
  `--target production`. The copy reads **old staging**; old production is never read.
- Then step 8: the owner's admin account via `grant-role`, and the demo roster via
  `demo:accounts add`. Demo logins are allowed until go-live (`#1332`).
- Then the promotion PR `staging → main`, merged with `--merge`.
- Then health on both production hosts, and the board.
- **Every production command is handed to the owner to run.** Auto mode blocks them, and each one
  needs explicit approval.

**Closing keywords on the promotion PR.**

- The list is derived at Ship from `git log origin/main..origin/staging`: issues whose slice merged
  to staging, with **one keyword per line**.
- It must **not** close `#104`, `#113`, `#1332`, `#1123` (proven by the 2026-11-03 sync run) or
  `#1336` (parent).

## Accepted risk (owner, 2026-10-31)

- The promotion carries every slice merged to staging since `2ffcb41`.
- Two of them have live checks that never ran:
  - `#1319` R25, the staging walk;
  - `#1324` R25, a browser-paid Stripe Checkout.
- The owner accepts promoting them unverified, because the platform has never traded. Each gets a
  follow-up issue, and its own issue still closes at promotion.

## Deliberately excluded

- `#1340` (local dev to Merqify): it is machine-local and does not touch the promotion.
- `#1332` (deleting demo accounts): that waits for go-live.
- Freeing Nocaped (workstream C): only after both environments are proven, one item at a time.
- `#1359` (a write guard for the new hosts).
- Any change to the copy script.

## Open items carried forward

- `#1123`: confirm the 2026-11-03 `sync-reference-data` run on `main`.
- The follow-ups for `#1319` R25 and `#1324` R25.
