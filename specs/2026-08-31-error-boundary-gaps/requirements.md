# Error boundary gaps — requirements / acceptance criteria

Closes **#478** (no chrome, no vendor branding), **#479** (off-system danger colour) and **#467**
(no test, no executed validation) — all defects in the artifact #459 shipped.

## R1 — One branded panel, defined once

`components/errors/ErrorPanel.tsx` holds the branded "Something went wrong" markup: the
`AlertTriangle` icon in a tinted disc, a heading, a body paragraph and a retry button. Every
boundary renders it. No boundary re-implements the markup.

## R2 — Storefront crashes keep the storefront

`app/(storefront)/error.tsx` exists and renders inside `app/(storefront)/layout.tsx`, so a throw in
any storefront page leaves `StorefrontChrome` mounted: header, footer and navigation still visible,
and `brandStyle()` still applied to the surrounding element.

## R3 — Staff crashes keep the staff portal

`app/(admin)/error.tsx` exists and renders inside `app/(admin)/layout.tsx`, so a throw in any
`/staff/*` page leaves the portal `Header` and `PanelNav` mounted, with `brandStyle()` applied.

## R4 — The root boundary survives as the outer fallback

`app/error.tsx` is **not** deleted. It is what catches a throw from a route-group layout itself,
which a boundary inside that layout cannot catch. Its copy acknowledges that the surrounding page
could not be loaded, rather than claiming chrome that is not there.

## R5 — Audited danger tokens, not the stock palette

No boundary and no shared panel contains a `red-<n>00` Tailwind utility. The icon disc uses
`bg-danger-tint` and `text-danger` — the semantic tokens `tests/design-tokens-contrast.test.ts`
audits.

## R6 — Nothing about the error reaches the user

Rendering any boundary with an `Error` carrying a `message`, a `stack` and a `digest` produces DOM
output containing none of those three values. This is the requirement that matters most: #430 makes
a misconfigured production key throw, and a Zod issue list naming environment variables is exactly
the kind of string that must not reach a shopper.

## R7 — The error is logged for observability

Each boundary calls `console.error` exactly once per distinct error, passing the raw error object,
so `wrangler tail` and Workers Logs can see what a user could not.

## R8 — `reset()` is wired

The retry button invokes the `reset()` callback React supplies. Asserted per boundary, not only on
the shared panel.

## R9 — `global-error.tsx` still stands alone

It keeps its own `<html>`/`<body>` and its `import "./globals.css"`, since it replaces the root
layout. It carries no vendor branding and cannot — recorded as a known limit in the build notes,
not silently accepted.

## R10 — Tests exist and run in the normal suite

`tests/error-boundary.test.tsx` runs under the repo's existing jsdom opt-in
(`// @vitest-environment jsdom`, as `tests/a11y/*.tsx` and `tests/order-items-card.tsx` do) and is
picked up by a plain `npx vitest run`. No new test-runner configuration.

## R11 — The #459 spec is corrected where it is wrong

`specs/2026-08-30-global-500-error-boundary/plan.md`'s header/footer claim and `build-notes.md`'s
"Deviations from Spec: None" are corrected in place with a dated note pointing at this slice. A
stale spec that asserts a property the code never had is the failure mode `CLAUDE.md` documents
repeatedly; leaving it to be re-read as true is not an option.

## Non-requirements

- Restyling the four pre-existing raw-`red-*` call sites elsewhere in the app (#479 scope note).
- Changing what `reset()` does.
- Any change to `app/not-found.tsx` or 404 behaviour.
- Any schema change or migration. This slice touches no database.
