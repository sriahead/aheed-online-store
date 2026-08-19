# RLS session-GUC experiment — raw record (#251 / #220)

Evidence for R11. This file exists so the determination in `ADR-004` rests on something executed
rather than something reasoned, and so a future session can re-run it instead of re-deriving it.

## The question

Postgres row-level security policies read the current tenant from **session state** —
conventionally a GUC set with `SET LOCAL app.current_vendor = '...'` and read inside the policy via
`current_setting('app.current_vendor', true)`. That only works if the `SET` and the guarded query
run on the **same session**.

`lib/db.ts` exposes two clients:

- `getPrisma()` — `PrismaNeonHttp`, stateless `fetch`, one HTTP request per query. Used for roughly
  every read in the app.
- `getPrismaWs()` — `PrismaNeon` over WebSocket. Reserved strictly for `$transaction`, because
  routing ordinary reads through WebSockets exhausted the 50-socket-per-isolate limit and produced
  the #187 outage.

So the question is not "should we adopt RLS" but "is there a session for a GUC to live on at all".

## Method

`scripts/rls-experiment.ts`, run with `npx tsx scripts/rls-experiment.ts` (a real file, not
`tsx -e` — a multi-line `-e` script that imports an installed package exits 0 with no output on
this Windows setup, per `CLAUDE.md`).

The script builds its adapters with the **same configuration `lib/db.ts` uses**, from the bare
`@prisma/client` rather than `@prisma/client/wasm` because it runs in Node rather than workerd.
It sets a GUC, reads it back four different ways, and creates no rows, no schema and no policies.

Raw SQL in the script is deliberate and in bounds — `CLAUDE.md`'s "no raw SQL" rule governs
application code, and nothing here runs at request time or ships.

**Target:** the per-developer Neon branch from #226 (`ep-soft-band-za9nj4sj`), not staging and not
production. The result is a property of the driver and of Postgres, not of any particular branch's
data, so the branch choice does not affect it — and a read-only probe on an isolated branch is the
cheapest safe place to run it.

## Raw output

```
RLS session-GUC experiment (#251 / #220)
target: postgresql://neondb_owner:****@ep-soft-band-za9nj4sj-pooler.c-2.eu-west-2.aws.neon.tech/neondb
GUC:    app.current_vendor
run at: 2026-08-19T08:00:49.082Z

  [LOST    ] A. HTTP client, SET and read as two separate queries
             read back "" — the second request did not see the first request's session
  [ERROR   ] B. HTTP client, SET LOCAL and read in one batched $transaction
             Error: Transactions are not supported in HTTP mode
  [SURVIVES] C. WebSocket client, SET LOCAL then read inside one interactive $transaction
             read back a4ed0000-0000-4000-a000-000000000001 — a real session exists here
  [LOST    ] D. WebSocket client, GUC set in a previous transaction, read outside it
             read back "" — correctly scoped to the transaction

summary
  LOST      A. HTTP client, SET and read as two separate queries
  ERROR     B. HTTP client, SET LOCAL and read in one batched $transaction
  SURVIVES  C. WebSocket client, SET LOCAL then read inside one interactive $transaction
  LOST      D. WebSocket client, GUC set in a previous transaction, read outside it
```

## What each case establishes

**A — the app's actual read path cannot carry a tenant.** Two queries through `getPrisma()` do not
share a session. `current_setting` returned the empty string, not the vendor id. Every
`lib/repositories/*` read has exactly this shape, so a policy reading a GUC would see nothing on
every single one of them. Under RLS that fails closed — which means it returns **no rows at all**,
not "the wrong tenant's rows".

**B — there is no batched escape hatch either, and this was the surprise.** The spec anticipated
that Neon's HTTP endpoint might allow a batched transaction, which would at least have made a GUC
possible for a query that opted into one. It does not get that far:
`@prisma/adapter-neon` refuses with **`Transactions are not supported in HTTP mode`**. The option
does not exist at the adapter layer, so it is not a matter of restructuring calls.

**C — a session exists only where the app already opens one.** The GUC survives inside an
interactive `$transaction` on the WebSocket client. That is the one place `lib/db.ts` opens a real
session today, and it is deliberately confined to the handful of mutations that need atomicity
(checkout, cart writes, erasure).

**D — `SET LOCAL` does not leak, which is the one reassuring result.** After the transaction ended,
the GUC read back empty on the same client. Had it leaked, a pooled connection could have carried
one tenant's id into the next caller's queries — a cross-tenant disclosure strictly worse than
having no RLS. It is correctly transaction-scoped.

## Consequence

Adopting per-request RLS would require routing **every read** through `getPrismaWs()` so that each
one has a session to carry the GUC. That is precisely the configuration `CLAUDE.md` records as
having caused #187: WebSocket connections exhausted the per-isolate limit under ordinary
concurrent load, and the fix was to move reads to HTTP. RLS would therefore trade a defence-in-depth
control for a known, previously-experienced production outage.

## One path not taken

Neon offers an RLS integration that carries identity in a **JWT on the connection** rather than in a
session GUC, which would sidestep case A entirely. It is not evaluated here because it is gated
behind **Neon Auth**, which `CLAUDE.md` states is deliberately **off** — authentication is Better
Auth per ADR-002. Adopting it would mean reopening a settled authentication decision to obtain a
secondary control, which is out of proportion. Recorded so the next reader knows it was considered
rather than missed.

## Reproducing

```
npx tsx scripts/rls-experiment.ts
```

Read-only. Expect A and D to report `LOST`, B to report `ERROR`, and C to report `SURVIVES`. A
different result on any of the four would mean the driver's behaviour has changed and ADR-004's
determination needs revisiting.
