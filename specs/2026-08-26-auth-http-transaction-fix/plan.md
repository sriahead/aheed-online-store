---
id: auth-http-transaction-fix-plan
title: "Auth HTTP-mode transaction crash fix (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-26
visibility: internal
summary: Fix Better Auth's Prisma adapter throwing "Transactions are not supported in HTTP mode" by hiding $transaction on the client it's handed, triggering the adapter's own existing non-transactional fallback.
tags: [auth, bugfix, prisma]
---

# Auth HTTP-mode transaction crash fix (plan)

Found live while shipping P8.5d (#348, PR #380/#381) — a bundle image upload on staging 500'd
intermittently. `wrangler tail` showed the real exception: `Error: Transactions are not supported
in HTTP mode`, thrown from `PrismaNeonHttpAdapter.startTransaction` inside Better Auth's own
Prisma adapter. Filed as #382 with full reproduction and root-cause detail.

**Goal:** stop authenticated actions from randomly 500ing, without opening a WebSocket connection
on every authenticated request (which would reintroduce the socket-exhaustion risk the HTTP/WS
split in `lib/db.ts` exists to avoid).

**Root cause, precisely.** `lib/auth.ts`'s `getAuth()` calls
`prismaAdapter(getPrisma(), { provider: "postgresql" })` — `getPrisma()` returns the app's
HTTP-mode client (`PrismaNeonHttp`), which does not support interactive transactions but still
exposes a `$transaction` method that throws when called. Two internal operations in
`@better-auth/prisma-adapter` (`node_modules/better-auth/node_modules/@better-auth/prisma-adapter/
dist/index.mjs`, a token/session "consume" path and a "find-then-update" path) each guard with
`typeof db.$transaction !== "function"` before calling `db.$transaction(...)` — and each already
has a working non-transactional fallback for exactly the case where that guard trips. Because
`getPrisma()`'s client's `$transaction` genuinely *is* a function (just one that throws at
runtime), the guard never trips, and the adapter calls the throwing method instead of using its
own fallback.

**Scope (this slice):**
- `lib/auth.ts`: wrap the client handed to `prismaAdapter()` so `$transaction` reads as
  `undefined` rather than a throwing function — a `Proxy` around `getPrisma()`'s client, not a new
  Prisma client and not a switch to `getPrismaWs()`. Every other method passes through unchanged
  (bound to the real client so internal `this`-dependent calls keep working).
- Confirm live, not just by removing the throw locally: the exact reproduction from #382
  (bundle-image upload's second server action, `requireVendorRole` re-invoked) must stop 500ing on
  a real deployed environment.

**Deliberately excluded:**
- **No change to `lib/db.ts`, `getPrisma()`, or `getPrismaWs()` themselves.** Those are correct;
  the defect is in how `lib/auth.ts` hands its client to a third-party adapter that makes its own
  transaction decision based on introspecting that client.
- **No change to any application repository's own `$transaction` usage** — those already
  correctly use `getPrismaWs()` (verified during #382's investigation: every repository call site
  under `lib/repositories/*` either uses `getPrismaWs()` or doesn't call `$transaction` at all).
- **Not attempting to identify the exact Better Auth internal call site** that triggers the
  transactional path (session rotation vs. a token-consume flow) — the fix is general (it corrects
  the client's shape for *any* such call, present or future), so pinning the exact trigger isn't
  load-bearing for the fix and isn't spec'd as a requirement.
- **No behavioural change to what Better Auth actually does** — the fallback path it takes when
  `$transaction` isn't available is Better Auth's own designed-in behaviour for HTTP-only Prisma
  drivers, not something invented here.

**Open items carried forward:** none. This is a self-contained fix; #382 is closed by it.
