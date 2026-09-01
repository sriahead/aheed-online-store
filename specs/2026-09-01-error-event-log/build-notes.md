# Database-backed error event log (build notes)

Written at the end of Build, before the Clear. Branch `feature/error-event-log`, cut from a
freshly-fetched `origin/staging` at `f1c4fd5` (the merge commit for #506) — not from the stale
local `feature/product-image-integrity` tip, which had already merged.

## What changed and why

**`prisma/schema.prisma` / a new migration** — `ErrorEvent`, vendor-less (mirrors `HealthCheck`'s
existing precedent), written from `instrumentation.ts`'s `onRequestError`. See "Known-shaky areas"
below for the migration incident this produced.

**`lib/repositories/error-events.ts`** (new) — `normalizeCaughtError`, `recordErrorEvent`,
`listRecentErrorEvents`, exactly as `requirements.md` R2–R5 describe. Pure functions taking an
explicit Prisma client, so `tests/repository-purity.test.ts` /
`tests/repository-client-injection.test.ts` cover it automatically (confirmed: both still pass,
unmodified, after adding this file).

**`lib/db.ts`** gains `getPrismaUncached()` — a fresh, non-`cache()`-wrapped `PrismaClient`. See
`plan.md`'s "Why an uncached client" for the reasoning; nothing new to add here beyond confirming
the implementation matches: `getPrisma`/`getPrismaWs` remain wrapped in `cache(...)`, this export
is a plain function (R6, confirmed by `grep`).

**`instrumentation.ts`** — `onRequestError` now also calls `recordErrorEvent` via
`getPrismaUncached()`, wrapped in its own `try`/`catch` so a write failure logs separately
(`"Failed to persist ErrorEvent:"`) and never propagates. The pre-existing
`console.error("Unhandled request error:", ...)` call is byte-for-byte unchanged.

**`lib/error-events-service.ts`** (new, not named in `requirements.md`) — a one-line wrapper,
`getRecentErrorEvents(limit)` calling `listRecentErrorEvents(getPrisma(), limit)`. Added to match
this codebase's established page → service → repository layering (`lib/roles-service.ts` is the
model followed) rather than have the page import `getPrisma` directly. `requirements.md` R10 names
`listRecentErrorEvents` directly and doesn't preclude a thin wrapper in front of it.

**`app/(admin)/staff/errors/page.tsx`** (new) — the two-branch refusal pattern copied from
`app/(admin)/staff/team/page.tsx` (401 → redirect, other refusal → `PanelRefusal`), with the extra
`auth.via !== "platform-admin"` check R9 requires layered on top of the second branch. Table
columns: When / Method / Path / Router / Type / Message / Digest, newest 50 rows.

## Decisions taken during the build

**No nav link added anywhere in the admin panel.** Not asked for by `requirements.md` (R9/R10 only
require the route to behave correctly, not to be discoverable from navigation), and this is a
platform-admin-only diagnostic tool rather than a page any vendor staff would browse to — closer in
spirit to the Cloudflare dashboard fallback #246 already accepts needing a known URL for. If this
turns out wrong, adding a link is a trivial follow-up, not worth a tracked issue on its own.

**`getPrismaUncached()` placed in `lib/db.ts` beside its siblings, not in a new file.** It's
infrastructure of the same kind as `getPrisma`/`getPrismaWs`, just without the `cache()` wrapper —
keeping it beside them makes the contrast (what's memoized, what isn't, and why) visible in one
place rather than split across files.

**Table columns chosen for what a first responder needs, not for completeness.** `message`/`path`/
`method`/`routerKind`/`routeType`/`createdAt`/`digest` are shown; `stack` is stored but not
rendered on the list page — a full stack trace in a table row would make every row unreadable.
Not in `requirements.md` either way; R10 only names the columns it lists as a minimum, and showing
more would need its own row-detail view this slice doesn't build.

## Deviations from the spec

None. `requirements.md` R1–R11 are implemented as written; R12 (CHANGELOG) and R13 (gate commands)
are satisfied by this same commit — see the CHANGELOG diff and the fact that
`lint`/`typecheck`/`test`/`format:check` all exit 0 locally (confirmed again just before this file
was written).

## Known-shaky areas

**The migration `prisma migrate dev` generated on the first run was wrong, and this is now the
SECOND time this exact hazard has fired for real, not just been warned about.** Adding `ErrorEvent`
(a model with no relationship to `Order` or `User` at all) made `migrate dev` propose `DROP INDEX`
for all three hand-authored `pg_trgm` GIN indexes from
`20260820143949_p7_5de_order_search_trigram` — `Order_orderNumber_trgm_idx`,
`Order_guestEmail_trgm_idx`, `User_email_trgm_idx` — because `schema.prisma` has never been able to
describe them (documented in that migration's own comment and in `CLAUDE.md`'s schema-rules
section, which already predicted exactly this: "a future `prisma migrate dev` may propose DROPPING
these indexes"). The drop **executed** against the dev database before this was caught — found by
reading the generated `migration.sql` before committing it, not before applying it. Fixed by: restoring the three indexes directly against dev (`CREATE INDEX IF NOT EXISTS`, verified
present before/after via `pg_indexes`), rewriting `migration.sql` to remove the erroneous `DROP
INDEX` statements, and reconciling Prisma's own bookkeeping (`_prisma_migrations`' stored checksum
no longer matched the edited file — deleted that row and re-ran `prisma migrate resolve --applied
<name>` to record a correct checksum without re-executing anything). Further confirmed all three
report `indisvalid = true` in `pg_index` (not just present — actually valid), and that
`EXPLAIN ... WHERE "orderNumber" ILIKE '%1%'` picks an index scan when `enable_seqscan` is forced
off — the planner otherwise prefers a sequential scan on this dev branch's currently-empty `Order`
table, which is a data-volume artifact of this branch, not evidence about the index. **Validation
should still re-confirm `/staff/orders?q=` itself returns correct results on a branch with real
order data** — this check proves the index objects are healthy, not that the feature built on top
of them is untouched.

**The core, unproven assumption this whole slice rests on: whether `onRequestError` has a working
request/environment context for `getPrismaUncached()`'s `getEnv()` call to resolve `DATABASE_URL`
from, under this app's actual Next 16 / OpenNext / Cloudflare Workers stack.** `plan.md`'s "Why an
uncached client" explains why `cache()` was avoided, but that only removes one specific failure
mode — it does not confirm `onRequestError` has *any* usable context at all. If it doesn't,
`getEnv()` falls through to `process.env` (empty on a real Worker outside a request), `getEnv()`
throws on the missing `DATABASE_URL`, and the write's own `try`/`catch` swallows it — meaning the
whole feature could silently write zero rows, ever, and nothing local would show that: every unit
test here mocks `getPrismaUncached`/`recordErrorEvent` outright. **This can only be answered by the
live check `validation.md` describes** (temporarily throw in a page, hit it under `npm run
preview`, confirm a real row lands in the dev database) — deliberately not attempted during Build,
per the stage boundary ("do not validate it in the context that wrote it").

**`app/(admin)/staff/errors/page.tsx` has no test of its own.** `requirements.md` R9/R10 are both
E2E rows in `validation.md`, matching `app/(admin)/staff/team/page.tsx`'s own precedent (also
untested at the component level, verified live instead) — consistent with this codebase's existing
posture, not a gap introduced here, but worth naming since it means the refusal branches' actual
behaviour is unverified until Validate runs them.
