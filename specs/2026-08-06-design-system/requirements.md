# P0 — Design-system tokens (requirements / acceptance criteria)

Encodes the Aheed brand kit (`specs/design-system.md`) as real Tailwind v4 tokens and proves them
live by restyling the existing walking-skeleton page. Closes the last open item from
`specs/2026-08-06-p0-foundation/` ("design-system tokens (no `specs/design-system.md` spec exists
yet)").

R1. `tailwindcss` and `@tailwindcss/postcss` are installed as devDependencies; `postcss.config.mjs`
    registers the plugin; `npm run build` (the existing `next build --webpack` pin) compiles
    cleanly with Tailwind's PostCSS pipeline.
R2. `design-system/tokens/tokens.css` defines a Tailwind v4 `@theme` block with the primitive and
    semantic color tokens from `specs/design-system.md`'s table (`--color-brand-*` primitives,
    `--color-primary`/`--color-action`/`--color-accent`/`--color-danger`/`--color-surface-muted`
    semantics), plus `--radius-sm`/`--radius-md`/`--radius-full`. Derived hover/active shades are
    commented `/* derived, not from brand kit */`.
R3. Poppins is loaded via `next/font/google` in `app/layout.tsx` at weights `400` and `600`,
    exposed as a CSS variable consumed by `tokens.css`'s `--font-sans`. No other font family is
    introduced.
R4. `app/globals.css` imports Tailwind and `tokens.css` (`@import "tailwindcss"; @import
    "../design-system/tokens/tokens.css";`); the old hand-rolled `.card`/`.ok`/`.bad` rules are
    removed, not left dead alongside the new tokens.
R5. `app/page.tsx`'s existing card/ok/bad styling is re-expressed with token-driven Tailwind
    utility classes — same visual intent (ok = green, bad = red, card = bordered/rounded box) — so
    the tokens are proven live, not inert config.
R6. `specs/design-system.md` exists (persistent decision doc) documenting the brand-kit-to-token
    mapping and the explicit open items (logo source files pending, red's exact role pending real
    comps).
R7. `lint`, `typecheck`, `format:check`, and `test` all remain green after this slice (Gate 3).
