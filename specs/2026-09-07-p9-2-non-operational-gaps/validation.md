# P9.2 — Remaining non-operational gaps (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Every feature should have appropriate **Unit** and **Integration** testing, followed by relevant validation testing. Broader testing mainly happens before release. However, testing is risk-based: features involving auth, payments, UI changes, performance-sensitive APIs, databases, or external dependencies require additional relevant testing earlier.

1. **Unit Testing**
   - *When needed:* Every feature.
   - *Purpose:* Test isolated business logic, utilities, and components.
2. **Integration Testing**
   - *When needed:* Every feature. (Includes Contract testing).
   - *Purpose:* Verify the component works with its immediate dependencies (e.g., database, external services).
3. **System / End-to-End Testing**
   - *When needed:* For critical user journeys and validation testing.
   - *Purpose:* Validate that the feature works correctly in the real system.
4. **Regression & Acceptance Testing**
   - *When needed:* Mainly before release, or when changing core flows. (Includes Smoke and Sanity testing).
   - *Purpose:* Ensure existing functionality remains unbroken and acceptance criteria are met.
5. **Performance & Resilience Testing**
   - *When needed:* Mainly before release, or for performance-sensitive APIs. (Includes Load, Stress, and Spike testing).
   - *Purpose:* Ensure the system meets throughput/latency targets and degrades gracefully.
6. **Security & Accessibility Testing**
   - *When needed:* Mainly before release, or for features involving auth, payments, or UI changes.
   - *Purpose:* Ensure the system is safe and accessible to all users.

---

## Before you start

Two environment facts this slice's live rows depend on, both recorded in `CLAUDE.md` and both easy
to get wrong from a fresh context:

- **`npm run preview`, never `npm run dev`.** Every DB-touching row below needs the OpenNext/Workers
  runtime; plain `next dev` cannot load `@prisma/client/wasm` and renders a silent error state.
- **Unsetting a secret takes an edit to BOTH `.env` and `.dev.vars`, then a restart.** `readEnv`
  falls through to `process.env` per key, and `next build` bakes `.env` into the built Worker, so
  commenting a key out of `.dev.vars` alone proves nothing (`#618`).

Before re-running `npm run preview` after a stop, check for orphaned `node.exe` / `workerd.exe`
processes holding `.open-next\assets` — see `CLAUDE.md`'s Windows section.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1 | Unit | `grep -n "export function readOptional" lib/config.ts` prints one line. A unit test asserts `readOptional(() => 1)` returns `1` and `readOptional(() => { throw new Error("x"); })` returns `undefined`. |
| R2 | Unit | `grep -c "function readOptional" app/api/jobs/reconcile-payments/route.ts` prints `0`, and `grep -n "readOptional" app/api/jobs/reconcile-payments/route.ts` shows it imported from `@/lib/config`. Existing tests for that route's 503 bodies still pass under `npx vitest run`. |
| R3 | Unit | `grep -n "getPaymentEnv" app/api/webhooks/stripe/route.ts` shows the call only as the argument to `readOptional`, with no bare `getPaymentEnv()` invocation. |
| R4 | E2E | Comment `STRIPE_WEBHOOK_SECRET` out of **both** `.env` and `.dev.vars`, restart `npm run preview`, then `curl -s -o body.txt -w '%{http_code}' -X POST http://127.0.0.1:8787/api/webhooks/stripe -H "stripe-signature: t=1,v1=deadbeef" --data '{}'`. Expect `500`, and `cat body.txt` to print exactly `Webhook not configured`. Confirm the log line via the local Explorer API: `POST http://127.0.0.1:8787/cdn-cgi/local/explorer/api/local/observability/query` with `{"sql": "select message from logs where level = 'error' order by ts_ms desc limit 20"}` contains `STRIPE_WEBHOOK_SECRET is unset`. |
| R5 | E2E | Restore the key in **both** files, restart `npm run preview`, repeat R4's `curl`. Expect a signature-rejection status and a body that is **not** `Webhook not configured`. |
| R6 | Unit | `npx vitest run tests/repository-client-injection.test.ts tests/repository-purity.test.ts` exits 0, and `grep -n "export async function deleteAbandonedGuestCarts" lib/repositories/cart.ts` prints one line whose signature starts with a `prisma` parameter. |
| R7 | Unit | A new unit test drives `deleteAbandonedGuestCarts` against a stub Prisma client and asserts the `where` clause it issues requires `guestToken` not-null and `updatedAt` strictly less than the supplied bound. `npx vitest run tests/guest-cart-reaper.test.ts` exits 0. |
| R8 | Unit | `grep -n -B3 "60 \* 60 \* 24 \* 30\|30 \* 24 \* 60 \* 60" lib/repositories/cart.ts` shows one constant with an adjacent comment naming `lib/cart-identity.ts`. |
| R9 | Unit | `grep -n "@/lib/db" lib/guest-cart-reaper-service.ts` prints one import, and `grep -n "getPrisma()" lib/guest-cart-reaper-service.ts` shows the call inside the returned function body, not at module scope. |
| R10 | E2E | Under `npm run preview` with `JOB_INVOCATION_TOKEN` set in both env files: `curl -s -o /dev/null -w '%{http_code}' -X GET .../api/jobs/reap-guest-carts` prints `405`; the same path with `POST` and no header prints `401`; with `-H "x-job-token: <wrong>"` prints `401`; with the correct token prints `200` and a JSON body naming a deleted count. Then comment the token out of both files, restart, and confirm `POST` with any header prints `503`. |
| R11 | Unit | `grep -n "reap-guest-carts" workers/scheduler/src/index.ts` prints a line inside the `JOBS` array. |
| R12 | Integration | Run `npx tsx scripts/verify-guest-cart-reaper.ts > reaper.log` (redirect, do **not** pipe to `head` — a closed pipe can kill the script before its own cleanup runs, `CLAUDE.md`), then `Read` the log. It must seed three carts against the dev database — an expired guest cart with items, a recent guest cart, a signed-in cart — call the repository function, and report the expired cart and its `CartItem` rows gone while the other two remain. The script deletes its own fixtures; confirm the log's final cleanup lines before trusting the result. |
| R13 | Unit | `grep -n "export async function countRecentErrorEvents" lib/repositories/error-events.ts` prints one line. A unit test asserts it issues a `count` whose `where` requires `createdAt` at or after the supplied bound. |
| R14 | Unit | A unit test calls `evaluateErrorRate` directly with **no stubs of any kind** — a count below the threshold, equal to it, and above it — and asserts the breach flag and the summary fields each time. `grep -n "@/lib/db\|next/headers" <the pure module>` prints nothing. |
| R15 | E2E | Same four-status sweep as R10 against `/api/jobs/check-error-rate`. On the `200`, the JSON body parses and its keys match `evaluateErrorRate`'s summary shape. |
| R16 | E2E | Under `npm run preview`, invoke the route once with the live count below the threshold and once above it (force the second by inserting `ErrorEvent` rows via a committed `tsx` script, then deleting them). Query the Worker log each time via `POST http://127.0.0.1:8787/cdn-cgi/local/explorer/api/local/observability/query` with `{"sql": "select message from logs where level = 'error' order by ts_ms desc limit 20"}`. Expect exactly one line carrying the fixed prefix after the breaching call, and none after the non-breaching one. |
| R17 | Unit | `grep -n "crons" workers/scheduler/wrangler.toml` shows the interval, and the window constant in the route's module equals it. `grep -n -B3 "THRESHOLD" <the pure module>` shows the comment recording it as a starting value pending `#246`. |
| R18 | Unit | `grep -n "check-error-rate" workers/scheduler/src/index.ts` prints a line inside the `JOBS` array. |
| R19 | Regression | `git diff origin/staging -- lib/repositories/error-events.ts` shows additions only: no change to `recordErrorEvent`, `SWEEP_PROBABILITY` or `RETENTION_MS`. |
| R20 | Unit | `grep -n "force-dynamic" app/api/jobs/reap-guest-carts/route.ts app/api/jobs/check-error-rate/route.ts` prints one line for each file. |
| R21 | Unit | `grep -ln "scripts/lib/env-file" scripts/copy-product-images.ts scripts/fill-product-images.ts scripts/remove-vendor-domains.ts scripts/restore-placeholder-images.ts` lists all four files. |
| R22 | Unit | `grep -rn "function parseEnvFile" scripts/` prints exactly one line, in `scripts/lib/env-file.ts`. |
| R23 | Unit | `sed -n '1,40p' scripts/lib/env-file.ts` shows a docstring naming both the `dotenv` decision and the outstanding local normalisation, citing `#505`. |
| R24 | Integration | `gh api repos/sriahead/aheed-online-store/rules/branches/main --jq '[.[].type]'` and the same for `staging` each include `required_status_checks`. |
| R25 | Integration | For each ruleset, list the configured contexts with `gh api repos/sriahead/aheed-online-store/rulesets/<id> --jq '.rules[] \| select(.type=="required_status_checks") \| .parameters.required_status_checks[].context'`, then list what a real run reported with `gh pr checks <a merged PR on that branch> --json name`. Every configured context must appear in the reported set, spelled identically. A context present in the rule but absent from the run is a fail — that is the misconfiguration `#539` deferred this over. |
| R26 | E2E | On the slice's own PR into `staging`, `gh pr view <N> --json statusCheckRollup` shows the required contexts, and once they pass `gh pr view <N> --json mergeStateStatus` is not `BLOCKED` on a missing required check. This row is the proof the rule does not block a green PR; it can only be run after the PR exists, so it is validated at `/ship`. |
| R27 | Acceptance | `gh issue view 541 --json state` reports `CLOSED`, and `gh issue view 541 --json comments` contains a comment naming run `34103597181` and the safe failure direction. |
| R28 | Acceptance | `gh issue view 101 --json state` reports `CLOSED`, and its comments name `app/api/jobs/reconcile-payments/route.ts` and `JOB_INVOCATION_TOKEN`. |
| R29 | Unit | `grep -n "required_status_checks" CLAUDE.md` shows the rule described. Then read the branch-strategy section **whole** — grep alone cannot show that the old paid-plan-as-current-limitation wording is gone, and that removal is the substance of this row. |
| R30 | Unit | `grep -n "541" CLAUDE.md` shows the accepted-risk closure and its reasoning. |
| R31 | Unit | Run `npx vitest run` **alone**, with no other build running, and confirm `CLAUDE.md`'s baseline names the file and test totals it reports. A shortfall against a previously-recorded number is a non-result to re-run, not a pass — check for orphaned `node.exe` / `workerd.exe` first. |
| R32 | Regression | `git diff --name-only origin/staging -- prisma/` prints nothing. |
| R33 | Unit | `npm run kms:validate` exits 0; `npm run kms:check-generated` reports all generated artefacts current. |
| R34 | Unit | `git diff origin/staging -- CHANGELOG.md` is non-empty and describes this slice (Gate 4). |
| R35 | Regression | `npm run lint`, `npm run typecheck`, `npx vitest run` and `npm run format:check` each exit 0. CI on the PR is the authority, not local output. |

## Rows that cannot be run before `/ship`

**R26** needs the slice's own pull request to exist. Run it at `/ship`, after the PR is open and its
checks have completed, and record the result there rather than marking it unverified.

## Sequencing note

**R24–R26 must be performed last, and R24 must not be attempted until Build has confirmed the API
accepts the rule at all.** A `required_status_checks` rule naming a context no workflow reports
blocks every merge on that branch, so the rule is added only once R25's name-matching check has been
performed against a real run, and R26 confirms a green PR still merges. If the API refuses the rule
outright, record it on `#472` and mark R24–R26 not-applicable with that evidence — every other row
in this table is independent of them.
