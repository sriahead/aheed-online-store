# Error boundary gaps — build notes

Written at the end of Build, before the Clear. Slice-local; no front-matter, no KMS index entry.

Closes **#478**, **#479**, **#467**.

## What changed and why

| File | Change |
|---|---|
| `components/errors/ErrorPanel.tsx` | **New.** The branded markup, defined once. |
| `app/(storefront)/error.tsx` | **New.** Storefront boundary, inside `StorefrontChrome`. |
| `app/(admin)/error.tsx` | **New.** Staff-portal boundary, inside the admin layout. |
| `app/error.tsx` | Rewritten onto `ErrorPanel`; copy corrected; kept as the outer fallback. |
| `app/global-error.tsx` | Rewritten onto `ErrorPanel`; known limits documented in the file. |
| `tests/error-boundary.test.tsx` | **New.** 23 tests across all four boundaries. |
| `specs/2026-08-30-global-500-error-boundary/{plan,build-notes}.md` | Two false claims corrected in place. |

## Deviations from the spec

**One, and it is an addition rather than a shortfall.** `requirements.md` R3 asked only for
`app/(admin)/error.tsx` to exist alongside R2's storefront one; while writing it, it became clear the
admin boundary needed a docstring warning that it is a *crash* boundary and not an authorization
refusal — `CLAUDE.md`'s staff-panel rule says every `requireVendorRole(...)` refusal must render
`<PanelRefusal>`, and a page that instead threw would now land on a generic "Something went wrong"
that looks plausible and hides a permissions bug. The warning is in the file. No code enforces it;
saying so here is the honest version.

Nothing else deviates. Every requirement R1–R11 is implemented as written.

## Decisions taken during the build

- **The root `app/error.tsx` was NOT deleted, and that is the whole design.** The obvious reading of
  #478 is "the root boundary is in the wrong place, move it down." That would have been wrong: a
  route-group boundary cannot catch a throw from its own group layout, and
  `app/(storefront)/layout.tsx` calls `getCurrentVendorProfile()` — a live DB read that can fail.
  Deleting the root file would have made a vendor-resolution failure fall all the way through to
  `global-error.tsx`, losing the root layout for an error that did not happen in it. Four boundaries
  at three depths is not over-engineering here; each catches something the one below it cannot.

- **`ErrorPanel` is never given the error object.** The no-leak requirement could have been met by
  simply not rendering `error.message`, which is what #459 did and what a future edit could
  casually undo. Withholding the object from the component makes the leak unrepresentable — the same
  reasoning P4a used to make `OrderStatusEvent.note` unrenderable on a customer's order page rather
  than merely unrendered. One test asserts the props shape, so the guarantee is checked, not just
  intended.

- **`global-error.tsx` keeps no vendor branding and that is written in the file, not smoothed over.**
  `brandStyle()` runs below the root layout; if the root layout is what threw, nothing can have
  applied it. A SriMart shopper who hits a root-layout crash sees Aheed's palette. The three lower
  boundaries do keep their vendor's branding, so this is now the only case, down from all of them.
  The font is absent for the same reason — `--font-poppins` is injected by `next/font` on the root
  layout's `<html>`.

- **Colour choices were checked against `tests/design-tokens-contrast.test.ts`'s pair list rather
  than picked.** `--color-danger` on `--color-danger-tint`, `--color-primary` on white, and
  `--color-primary` on `--color-surface-muted` are all already-audited pairs (lines 84, 100, 103).
  Nothing new needed auditing, which is why no contrast test changed.

## Known-shaky areas

Everything in `validation.md`'s **live** section — L1 through L7. They need `npm run preview` and a
deliberately thrown error, and they are the rows #459 never had. The automated rows (A1–A9) all
pass; passing them is not the same as having seen a real crash render inside real chrome, and this
slice would be repeating #459's own mistake if it claimed otherwise.

Specifically unproven until `/validate`: that `app/(storefront)/error.tsx` really does render inside
`StorefrontChrome` on the Workers runtime (asserted here from App Router semantics and the layout
files, not observed), and the L2 two-host branding check.

## Gate results at Build

- `npm run lint` — pass. `npm run typecheck` — pass. `npm run format:check` — pass.
- `npx vitest run` — **763 passed / 61 files** (740 before this slice; +23).
- `npm run kms:validate` — 0 invalid front-matter.
- `npx opennextjs-cloudflare build` — run, because `next build` alone proves nothing about
  deployability on this adapter (`CLAUDE.md`, twice over: the `proxy.ts` case and the
  Turbopack/`@prisma/client/wasm` case). Adding files under `app/` is exactly the change class that
  has broken only at this step before.

## Fix, after `/validate` (2026-08-31)

`/validate` ran the live rows this slice's own notes above flagged as unproven. L1, L3, L4, L5, L6
all confirmed clean under `npm run preview` (L1/L5 via headless-Chrome full hydration since
`error.tsx`/`global-error.tsx` are Client Components and curl alone only sees the pre-hydration RSC
payload; L3/L4 via structural RSC-payload evidence, L3 also requiring a real staff sign-in — the dev
DB had no demo accounts, added via the project's own `npm run demo:accounts -- add`). L2 could not
be run: the dev DB has zero `VendorDomain` rows (SriMart seeding is opt-in at `db:seed` time via
`SEED_SRIMART_HOST`) — a missing environment fixture, not a code defect, left unverified rather than
worked around by reseeding data outside this fix's scope.

**L7 genuinely failed, and it was a code defect, not a validation-environment problem.** R7's own
prose asserted a boundary's `console.error` would be visible via `wrangler tail`/Workers Logs. It
cannot be: `error.tsx`/`global-error.tsx` are Client Components, and their `console.error` runs
inside a `useEffect`, which only ever executes in the browser after hydration — this is true of
every "use client" error boundary Next.js can produce, not a bug specific to this implementation.
Confirmed live: forcing a throw and querying the Worker's local observability log store found no
line naming any boundary, only Next's own generic per-request framework error log (present with or
without this PR's code, carrying no route context).

Fixed at the root cause — added `instrumentation.ts` exporting `onRequestError`
(`tests/instrumentation.test.ts`, new), which Next.js calls **server-side**, once, for every request
whose render/route/action throws, independent of which boundary later displays the fallback. This is
Next's documented mechanism for exactly this ("integrate observability tools... track... errors to
any custom provider" — `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
instrumentation.md`), and `@opennextjs/cloudflare` explicitly patches Next's build to wire it up
(`node_modules/@opennextjs/cloudflare/dist/cli/build/patches/plugins/instrumentation.js`), so it
runs under this stack. Re-verified live: a forced throw at `/help` produced exactly one
`"Unhandled request error:", { path, routerKind, routeType, error }` line in the Worker's log.

Each boundary's own `console.error` call was kept, not removed — it is Next's own documented
client-side pattern (useful later for a RUM/browser-error tool), it is what the unit tests in
`tests/error-boundary.test.tsx` actually prove, and removing it would trade a true, narrower
guarantee for nothing. What changed is which claim it's allowed to make: `requirements.md`'s R7 is
corrected in place to say plainly that a boundary's call cannot be the source of Worker-log
visibility, and that `instrumentation.ts` is. `validation.md`'s L7 row and status line are corrected
to match what was actually run and found.

Gates re-run after the fix: `npm run lint`, `npm run typecheck`, `npm run format:check`,
`npx vitest run` (**764 passed / 62 files** — +1 for `tests/instrumentation.test.ts`), all pass; the
working tree is clean (every temporary throw used to force a boundary was reverted after use).
