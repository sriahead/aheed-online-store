# P2b — Catalogue search & filters (validation)

| Req | How to verify |
|-----|---------------|
| R1  | `npm run preview` (Workers runtime — `next dev` can't load `@prisma/client/wasm`), hit `/search?q=apple` — returns the seeded "Apples" product, not others; `/search?q=` (empty) returns no items; seed enough matching products past one page and confirm a second `cursor` page returns a disjoint set (same check P2a used for `listByCategory`). |
| R2  | `npm run preview`, hit `/categories/fruit-veg?minPrice=1` — excludes Bananas (£0.89), includes Apples (£1.50); `?inStock=1` on the Bakery category — excludes the seeded out-of-stock Croissants, includes Sourdough. |
| R3  | `npm run preview`, visit `/search` with no query param — form renders, no product grid, no error; `/search?q=bread` — form pre-filled with "bread", matching results shown. |
| R4  | `npm run preview`, visit `/categories/fruit-veg` with no filter params — identical output to before this slice (both seeded products shown). |
| R5  | View source / rendered HTML on `/search` and `/categories/[slug]` — a plain `<form method="GET">` with no `<script>`-driven behavior; submitting it round-trips through a real page navigation (query string updates the URL). Filter inputs show the current `searchParams` values already filled in after a search. |
| R6  | `npx vitest run tests/parse-price-input.test.ts` — covers `"3.20"` → `320`, `""` → `undefined`, and a non-numeric string → `undefined`. |
| R7  | `grep -rn "@prisma/client" app components` (excluding `lib/`) returns nothing. |
| R8  | `npm run preview`, hit `/search?q=apple` and `/categories/fruit-veg?inStock=1` in a fresh/incognito session (no auth cookie) — both return 200, neither redirects to `/login`. |
| R9  | `npm run lint && npm run format:check && npx tsc --noEmit && npx vitest run` — all exit 0. |
| R10 | `git diff origin/staging...HEAD --name-only` includes `CHANGELOG.md`. |
