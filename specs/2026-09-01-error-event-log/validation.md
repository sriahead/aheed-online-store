# Database-backed error event log (validation)

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
   - *When needed:* Mainly before release, or earlier for features involving auth, payments, or UI changes.
   - *Purpose:* Ensure the system is safe and accessible to all users.

---

## Before you start

This slice writes to the **dev** database during Build/Validate and, for R14/R15's live rows, exercises
`npm run preview`. Confirm `.env`/`.dev.vars` resolve to the dev host per `CLAUDE.md`'s config rules
before running anything DB-touching:

```
grep -oE '@ep-[a-z0-9-]+' .env .dev.vars
```

Expected: `ep-sparkling-paper-za3j7xza` (or whatever host is currently configured as dev — confirm
it is neither the staging nor production host recorded in `secrets/staging.vars`/
`secrets/production.vars` before proceeding).

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Integration  | `grep -n "model ErrorEvent" -A 12 prisma/schema.prisma` shows the fields listed in the requirement, no `Vendor` relation. `ls prisma/migrations/ \| grep -i error` shows a new migration folder. With `.env`/`.dev.vars` already confirmed pointed at dev (see "Before you start"), `npx prisma migrate status` reports it applied (no pending migrations) against the dev branch. |
| R2  | Unit         | `npx vitest run tests/error-events.test.ts` exits 0, including cases asserting `normalizeCaughtError(new Error("boom"))` returns `{ message: "boom", stack: <a string>, digest: null }`; a case setting `.digest = "abc123"` on the `Error` before calling returns `digest: "abc123"`; and `normalizeCaughtError("plain string")` / `normalizeCaughtError(42)` / `normalizeCaughtError(undefined)` each return `{ message: String(value), stack: null, digest: null }`. |
| R3  | Unit         | Same test file: a case building a 3000-character `message` and a 9000-character `stack`, calling `recordErrorEvent` against a fake/mock Prisma client (an object whose `errorEvent.create` and `errorEvent.deleteMany` are `vi.fn()`), and asserting the `data` passed to `create` has `message.length === 2000` and `stack.length === 8000`. A separate case passes `path: "/orders/lookup?email=someone@example.com"` and asserts the `create` call's `data.path` is exactly `"/orders/lookup"`. |
| R4  | Unit         | Same test file: `listRecentErrorEvents` against a mock Prisma client asserts the `findMany` call passed `orderBy: { createdAt: "desc" }` and `take: <the limit argument>`. |
| R5  | Unit         | Same test file: with `Math.random` stubbed below `SWEEP_PROBABILITY`, `recordErrorEvent` also calls the mock's `errorEvent.deleteMany` with a `where.createdAt.lt` cutoff approximately 30 days before "now" (stub `Date.now` or compare within a tolerance); with `Math.random` stubbed above it, `deleteMany` is not called. |
| R6  | Integration  | `grep -n "getPrismaUncached\|export const getPrisma \|export const getPrismaWs " lib/db.ts` — read the surrounding lines and confirm `getPrismaUncached`'s definition is a plain function/arrow, not the argument to a `cache(...)` call, while `getPrisma`/`getPrismaWs` remain wrapped in `cache(...)` exactly as before. |
| R7  | Unit         | `npx vitest run tests/instrumentation.test.ts` exits 0. Extend the existing "logs the raw error... exactly once" test (or add a sibling) so that with `recordErrorEvent` mocked (`vi.mock("@/lib/repositories/error-events")`) and awaited, the mock is called exactly once with an object matching `{ message: "boom", path: "/staff", routerKind: "App Router", routeType: "render" }`, and the pre-existing `console.error` assertion (`toHaveBeenCalledTimes(1)` with the `"Unhandled request error:"` payload) still passes unmodified. |
| R8  | Unit         | Same file: a case where the mocked `recordErrorEvent` (or `getPrismaUncached`) rejects — `onRequestError`'s returned promise still resolves (doesn't reject), and `console.error` was called a second time (distinct from R7's call) with the rejection. |
| R9  | E2E          | Under `npm run preview` (not `npm run dev`), signed out entirely, request `/staff/errors` and confirm a redirect to `/login` (matching `requireVendorRole`'s 401 branch, same as every other `/staff/*` page). Then sign in as `demo-store-admin@example.com` (`DEMO_ACCOUNT_PASSWORD` from `.dev.vars` — vendor ADMIN, not platform ADMIN, per `scripts/demo-accounts.ts`) and load `/staff/errors` again: confirm `<PanelRefusal>`'s markup renders (same shape as an existing refused `/staff/*` page) rather than a row list — this is the `via !== "platform-admin"` branch, not the 401 branch. |
| R10 | E2E          | Same session, sign in as `demo-admin@example.com` (platform ADMIN) and load `/staff/errors`. Confirm the page renders without `<PanelRefusal>` and lists whatever `ErrorEvent` rows already exist (message/path/method/routerKind/routeType/createdAt columns present in the rendered HTML). |
| R11 | Regression   | `git diff origin/staging...HEAD -- components/errors/ErrorPanel.tsx app/error.tsx app/global-error.tsx "app/(storefront)/error.tsx" "app/(admin)/error.tsx"` prints nothing. |
| R7/R8 live | E2E | The open risk from `plan.md`: temporarily add `throw new Error("validation-error-event-log")` to a low-traffic page (e.g. `app/help/page.tsx`, matching the method `specs/2026-08-31-error-boundary-gaps/validation.md` already used), load it under `npm run preview`, then query the dev database directly (`npx tsx` a small script, or via `/staff/errors` as the platform admin) and confirm exactly one new `ErrorEvent` row exists with `message` containing `"validation-error-event-log"`. Revert the temporary throw afterward — `git diff` must be clean of it before commit. |
| R12 | Regression   | `git diff origin/staging...HEAD -- CHANGELOG.md` prints a non-empty diff naming #508. |
| R13 | Regression   | `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run format:check` each exit 0. CI on the PR is the authority — a green local run on Windows is necessary, not sufficient. |
