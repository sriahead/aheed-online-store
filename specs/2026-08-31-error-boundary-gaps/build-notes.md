# Error boundary gaps — build notes

Written at the end of Build, before the Clear. Slice-local; no front-matter, no KMS index entry.

Closes **#478**, **#479**, **#467**.

## What was built

| File | Change |
|---|---|
| `components/errors/ErrorPanel.tsx` | **New.** The branded markup, defined once. |
| `app/(storefront)/error.tsx` | **New.** Storefront boundary, inside `StorefrontChrome`. |
| `app/(admin)/error.tsx` | **New.** Staff-portal boundary, inside the admin layout. |
| `app/error.tsx` | Rewritten onto `ErrorPanel`; copy corrected; kept as the outer fallback. |
| `app/global-error.tsx` | Rewritten onto `ErrorPanel`; known limits documented in the file. |
| `tests/error-boundary.test.tsx` | **New.** 23 tests across all four boundaries. |
| `specs/2026-08-30-global-500-error-boundary/{plan,build-notes}.md` | Two false claims corrected in place. |

## Deviations from spec

**One, and it is an addition rather than a shortfall.** `requirements.md` R3 asked only for
`app/(admin)/error.tsx` to exist alongside R2's storefront one; while writing it, it became clear the
admin boundary needed a docstring warning that it is a *crash* boundary and not an authorization
refusal — `CLAUDE.md`'s staff-panel rule says every `requireVendorRole(...)` refusal must render
`<PanelRefusal>`, and a page that instead threw would now land on a generic "Something went wrong"
that looks plausible and hides a permissions bug. The warning is in the file. No code enforces it;
saying so here is the honest version.

Nothing else deviates. Every requirement R1–R11 is implemented as written.

## Decisions worth keeping

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

## What is NOT proven yet

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
