# Error boundary gaps — validation

Every row names the requirement it proves and the command that proves it. Rows are either
**automated** (a test in the suite, so it keeps proving itself) or **live** (run against
`npm run preview`, the OpenNext + local Workers runtime).

> **`npm run dev` cannot validate any of this, and #459's validation.md was wrong to ask for it.**
> Next only substitutes `global-error.tsx` in a **production** build — under `next dev` the error
> overlay owns the screen, so step V2 of that document ("In development, temporarily throw an error
> inside the root layout … verify the branded `global-error.tsx` UI renders") could never have
> observed what it claimed to observe. `CLAUDE.md` says the same thing for a different reason:
> `next dev` runs in real Node and cannot load `@prisma/client/wasm`, and both storefront and admin
> layouts are DB-touching. Use `npm run preview`.

## Automated rows — `npx vitest run tests/error-boundary.test.tsx`

| # | Requirement | Assertion |
|---|---|---|
| A1 | R1 | `ErrorPanel` renders a `<main>` with an `h1` and a retry button; all four boundaries render it rather than their own markup. |
| A2 | R5 | For each of the four boundaries, the rendered HTML matches no `\b(bg\|text\|border)-red-\d{2,3}\b` and does contain `bg-danger-tint` and `text-danger`. |
| A3 | R6 | For each boundary, given an `Error` whose message names `STRIPE_SECRET_KEY`/`RESEND_API_KEY`, with a `digest` and a `stack`: neither `textContent` nor `innerHTML` contains the message, the digest, or any stack frame. |
| A4 | R6 | `ErrorPanel` takes no error object in its props at all, and its source references neither `stack` nor `digest` — so a future "show details" toggle must add a prop rather than arrive quietly. |
| A5 | R7 | Each boundary calls `console.error` exactly once, with a label naming that boundary and the raw error object as the second argument. |
| A6 | R8 | Clicking "Try again" invokes the injected `reset` exactly once, asserted per boundary. |
| A7 | R10 | The file runs under a plain `npx vitest run` with no config change — jsdom via the `// @vitest-environment jsdom` docblock. |

**Status: PASS** — 23 tests, run 2026-08-31.

> One transient: the first invocation failed with `[vitest-pool]: Failed to start forks worker …
> Timeout waiting for worker to respond` after 74s, with no test executed. An immediate re-run passed,
> as did an unrelated jsdom test in between, and two single-import probes isolated it to neither the
> `globals.css` import chain nor the parenthesised `@/app/(storefront)/error` specifier. Recorded as a
> Windows worker-startup flake, not a property of this file. If it recurs in CI, that judgement is
> wrong and it needs its own issue.

## Automated rows — whole suite

| # | Requirement | Assertion |
|---|---|---|
| A8 | — | `npm run lint`, `npm run format:check`, `npm run typecheck` and `npx vitest run` all pass, with no regression in the pre-existing suite. |
| A9 | R5 | `tests/design-tokens-contrast.test.ts` still passes, i.e. the tokens these boundaries now consume are the audited ones. |
| A10 | R7 | `tests/instrumentation.test.ts` asserts `instrumentation.ts`'s `onRequestError` calls `console.error` exactly once, passing the raw error object plus `{ path, routerKind, routeType }` from the request/context Next.js supplies. |

## Live rows — `npm run preview`

Force a real throw with a temporary throwing segment, then delete it. Do **not** validate by loading
a healthy page: a `200 OK` on a working page exercises no boundary at all, which is precisely the
non-evidence #459 recorded.

| # | Requirement | Procedure | Expected |
|---|---|---|---|
| L1 | R2 | Add `throw new Error("validation L1")` to a storefront page (e.g. `app/(storefront)/page.tsx`), load `http://localhost:8787/`. | The branded panel renders **with the storefront header, navigation and footer still on the page**. Confirm by fetching the HTML and finding both the panel's `h1` and a header landmark in the same document. |
| L2 | R2 | Same page, fetched with `Host: srimart-staging.nocaped.com`. | The surrounding chrome carries SriMart's primitives, not Aheed's — i.e. the wrapper's inline `style` contains SriMart's `#1e88e5`, per `CLAUDE.md`'s two-host rule. |
| L3 | R3 | Throw from a `/staff/*` page while signed in as staff. | The panel renders with the portal `Header` and `PanelNav` still present. |
| L4 | R4 | Throw from `app/(storefront)/layout.tsx` itself. | The **root** `app/error.tsx` renders (no chrome — the layout is what failed), proving the group boundary cannot catch its own layout and the root fallback is not redundant. |
| L5 | R9 | Throw from `app/layout.tsx`. | `global-error.tsx` renders a styled panel with its own `<html>`/`<body>` — styled, i.e. the `globals.css` import is doing its job. |
| L6 | R6 | For each of L1–L5, read the served HTML. | The literal error string appears nowhere in the response body. |
| L7 | R7 | Force a throw (any of L1/L3/L4/L5's segments), query the local Worker log store (`POST http://127.0.0.1:8787/cdn-cgi/local/explorer/api/local/observability/query`, `{"sql": "select * from logs where message like '%Unhandled request error%'"}`). | Exactly one line, from `instrumentation.ts`'s `onRequestError` — not from any boundary's own `console.error`, which cannot reach this log (see R7's corrected text). The line names the failing route (`path`), `routerKind` and `routeType`. |

**Status: RUN at `/validate` (2026-08-31), corrected at `/fix`.** L1, L3, L4, L5 confirmed via
`npm run preview` (headless-Chrome full hydration for L1/L5; structural RSC-payload evidence plus a
real staff sign-in for L3; structural RSC-payload evidence for L4). L6 confirmed clean across all
four. **L7 as originally written could not pass — no boundary's `console.error` ever reaches the
Worker log, by construction (see R7).** Fixed by adding `instrumentation.ts`; re-verified live
against the dev preview: a forced throw at `/help` produced exactly one
`"Unhandled request error:", { path: "/help", routerKind: "App Router", routeType: "render", error: { digest: ... } }`
line in the Worker's local observability log. **L2 unverified** — the dev database has zero
`VendorDomain` rows and only Aheed as an active vendor (SriMart seeding is opt-in via
`SEED_SRIMART_HOST`, `docs/developer-portal/env-setup.md`); this is a missing environment fixture,
not a code defect, and reseeding the dev DB was out of scope for this fix.

## Documentation rows

| # | Requirement | Assertion |
|---|---|---|
| D1 | R11 | `specs/2026-08-30-global-500-error-boundary/plan.md` §2 no longer asserts that `app/error.tsx` preserves header and footer, and says what is true instead. **Done.** |
| D2 | R11 | That slice's `build-notes.md` §3 no longer reads "Deviations from Spec: None". **Done.** |
| D3 | — | `npm run kms:validate` passes (this slice's `plan.md` front-matter `id` contains no dot). |
