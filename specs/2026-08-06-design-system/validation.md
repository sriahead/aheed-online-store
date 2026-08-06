# P0 — Design-system tokens (validation)

| Req | How to verify |
|-----|---------------|
| R1  | `npm run build` — exits 0, no PostCSS/Tailwind errors. `grep tailwindcss package.json` shows it under `devDependencies`. |
| R2  | Read `design-system/tokens/tokens.css` — `@theme` block present with all primitive + semantic color tokens and radius tokens matching `specs/design-system.md`'s tables; derived shades carry the `/* derived, not from brand kit */` comment. |
| R3  | Read `app/layout.tsx` — `next/font/google` Poppins import with `weight: ["400", "600"]`; `npm run dev`, inspect the rendered page's computed `font-family` → Poppins. |
| R4  | Read `app/globals.css` — Tailwind + `tokens.css` imports present; no `.card`/`.ok`/`.bad` rules remain. |
| R5  | `npm run dev`, visit `/` — card renders bordered/rounded with a cream-toned background, "connected ✓" renders green, "error ✗" renders red; inspect `app/page.tsx` — no `className="card"`/`"ok"`/`"bad"` remain, replaced with Tailwind utility classes. |
| R6  | `specs/design-system.md` exists and covers colors, typography, shape, and the two open items. |
| R7  | `npm run lint && npm run format:check && npx tsc --noEmit && npx vitest run` all exit 0. |
