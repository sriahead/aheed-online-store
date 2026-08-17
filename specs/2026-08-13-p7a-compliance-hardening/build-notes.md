# P7a — Compliance, Operational Closure & Application Hardening (build notes)

P7a originally shipped to `staging` by direct push (commit `624a842`, 2026-08-13) with no PR, no
`gates` run, and no `build-notes.md` — one of several slices in that window that bypassed the
gated loop entirely (see `specs/roadmap.md`'s 2026-08-13/2026-08-17 rows). This file is written
retroactively, at the `/fix` stage following the first real `/validate` pass this slice has ever
had (2026-08-17), and covers only that fix — not a reconstruction of the original ungated build,
which no build notes exist for.

## What changed and why

Three defects `/validate` found against `requirements.md`/`validation.md`, all fixed on the
current branch:

1. **Missing `Content-Security-Policy` header** (`next.config.mjs`). Required by §3.3 and
   `validation.md` §3, absent from both the config and every live response. Added, scoped to what
   this app actually loads externally (checked against the repo, not guessed): the per-vendor CDN
   (`https://*.nocaped.com`) and the R2 S3 endpoint P6b2's browser-direct presigned-PUT upload
   targets (`https://*.r2.cloudflarestorage.com`) — confirmed both host patterns against
   `secrets/staging.vars`/`secrets/production.vars` before writing the directive, since a bare
   `connect-src 'self'` would have silently broken image upload. `script-src`/`style-src` stay
   `'unsafe-inline'` (`'unsafe-eval'` too, for `next dev`'s HMR) — this project has no nonce
   middleware, and ADR-004 slice 3b's own precedent is to keep host/tenant resolution out of Next
   middleware entirely, so building nonce infrastructure now would be a larger change than a
   Fix-stage correction should make.

2. **Staff bulk order transitions never built** (`requirements.md` §4.3 / GAP-010,
   `validation.md` §5). `/staff/orders` had only ever shipped P6a's single-order `advanceStatus`
   action; issue #162 already tracked the gap, and the roadmap's P7a-closure row claimed it had
   shipped — it hadn't. Added `advanceOrderStatusBulk` (`lib/repositories/orders.ts`), the bulk
   sibling of `advanceOrderStatus`: every selected row's read-check-write runs inside ONE
   `$transaction`, satisfying "moves multiple orders simultaneously in one transaction" literally.
   Legality is still evaluated per order against ITS OWN persisted status — the queue mixes orders
   at different stages, so there's no single shared `toStatus`, and a stale/forged pairing for one
   row is skipped rather than failing the whole batch (same compare-and-set posture the single-row
   path already uses). The new server action (`features/orders/advance-status-bulk.ts`) re-runs
   its own RBAC check, matching `advanceStatus`. UI: each actionable row's checkbox is bound to a
   separate top-level `<form id="bulk-advance">` via the HTML5 `form="bulk-advance"` attribute
   rather than DOM nesting, since a `<form>` cannot contain another `<form>` and every row still
   needs its own untouched single-order form.

3. **Guest order lookup (`/orders/lookup`) had no rate limiting and disclosed any order's full
   contents given only an order number** (requirements.md §4.1, GAP-008; issue #123). The shipped
   page reused `findOrderForWebhook`, a function this same file's own comment marks as "the single
   justified un-scoped read in the codebase" for Stripe's server-to-server calls — wired into a
   public page with an "Email Address (Optional)" field, order number alone was sufficient to view
   any customer's order, any vendor, no auth, no throttle. #123 had explicitly deferred this exact
   design (credential pair / rate limiting / enumeration) pending "its own `/propose` before any
   spec" — P7a's `requirements.md` §4.1 already settled the credential pair as Order Number +
   Email, so the fix is enforcing what was already approved, not a new decision. Added
   `findOrderForGuestLookup` (vendor-scoped, email-matched at the query level — never fetched then
   compared in application code) and `getGuestOrderLookupService()` (the request-scoped factory
   the no-direct-Prisma guard requires). Email is now `required` in the form. Rate limiting is a
   new `OrderLookupAttempt` table (`prisma/migrations/20260817120702_p7a_order_lookup_rate_limit`,
   additive) checked via `checkOrderLookupRateLimit` (`lib/repositories/order-lookup-rate-limit.ts`)
   — Postgres-backed rather than a Cloudflare rate-limiting binding, since none is provisioned
   (checked `wrangler.toml`) and adding one is new infrastructure a Fix-stage correction shouldn't
   invent unasked. IP is hashed (SHA-256, WebCrypto) before storage, never kept raw.

## Decisions taken during the build

- The bulk-transition email loop (`advanceStatusBulk`) sends one status email per order that
  actually moved, same copy/timing as the single-row path (`sendOrderStatusEmail`, after commit,
  never inside the transaction) — P4b's rule that a physically-happened delivery must not be
  undone by an email failure applies identically whether one order moved or five.
- The rate limiter is deliberately best-effort, not compare-and-set: two concurrent requests could
  both read the same under-threshold count and both be admitted. A `$transaction` on the
  WebSocket-based client for every public lookup was judged disproportionate to what's being
  protected (worst case, one caller gets one extra try in a window) versus the stock/points/
  discount counters elsewhere in this codebase, which guard real money and inventory.
- `checkOrderLookupRateLimit` runs *before* the email-presence check, so a request with a missing
  email still consumes a rate-limit slot — an attacker fishing for valid order numbers with no
  email at all is throttled exactly like one supplying a wrong email.

## Deviations from the spec

None from `requirements.md`/`validation.md` as approved. The fix corrects the artifact to match
what was already specified (Order Number + Email, rate limiting) rather than changing the spec.

## Known-shaky areas

- The CSP's `'unsafe-inline'`/`'unsafe-eval'` are a real weakening versus a nonce-based policy —
  acceptable for closing the "header present" gap `validation.md` actually asks for, but a future
  hardening pass (P7b or P8) should revisit once/if this project adopts request middleware.
- The rate limiter's fixed-window count (not sliding) means a burst straddling a window boundary
  can admit slightly more than 5/minute in the worst case — not exploited by anything tested here,
  but worth knowing if #123's threat model is ever revisited.
- Live-verified against real Postgres on staging via `npm run preview` (see `validation.md` for
  the walk): bulk-advance moved two real orders atomically with correct per-order attribution;
  guest lookup correctly succeeded on matching order+email, refused on mismatched email, refused
  on missing email, and the 5/minute limit tripped exactly as designed. Not yet verified: a real
  browser driving the bulk-select checkboxes end-to-end (the headless POST proves the server side;
  the checkbox/`form` HTML5 association wiring itself was inspected in rendered HTML but not
  clicked in a live browser).
