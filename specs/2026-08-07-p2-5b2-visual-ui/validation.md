# P2.5b2 — Storefront visual redesign UI (validation)

| Req | How to verify |
|-----|---------------|
| R1  | `grep -n "max-w-2xl" app/layout.tsx` returns nothing; the `<body>` className no longer contains `max-w-2xl`/`p-8`. |
| R2  | `app/(storefront)/layout.tsx` exists, contains `export const dynamic = "force-dynamic"` and a `<Header` usage; `grep -c "<main" app/(storefront)/layout.tsx` is `0`. |
| R3  | `grep -L "use client" components/layout/Header.tsx` lists the file (no directive); it contains `getSession`, `action="/search"`, `name="q"`, an `/account` and a `/login` link. In `npm run preview`, load any storefront page signed-out → header shows "Sign in"; with a logged-in session cookie → header shows the user's name linking to `/account`. |
| R4  | `test ! -e app/page.tsx` succeeds; `app/(storefront)/page.tsx` exists with `force-dynamic`. In `npm run preview`, `GET /` renders the hero + category grid; `GET /?postcode=LE1%201AA` shows a deliverable result and `GET /?postcode=SW1A%201AA` shows a non-deliverable result. `curl -s localhost:8788/api/health` (preview port) still returns `db.ok: true`. |
| R5  | `npx vitest run tests/category-icon.test.ts` passes, including an assertion that an unknown slug (e.g. `"does-not-exist"`) returns a defined icon (the default). |
| R6  | `npx tsc --noEmit` passes with `ProductSummary`/`ProductDetail` carrying `averageRating`/`reviewCount`; a scratch call (or `npm run preview`) confirms a seeded product's card-shaped query returns non-`undefined` `averageRating`/`reviewCount`. |
| R7  | In `npm run preview`, a category page renders cards with: a Halal badge on `halal-chicken-breast`, a "Save £…"/strikethrough on `mint-tea-box` (has `originalPrice`), and a star rating with a review count. `grep -nE "#1[bB]5[eE]20|#4[cC]af50|#f57[cC]00|#d32[fF]2[fF]" components/product/ProductCard.tsx` returns nothing. |
| R8  | In `npm run preview`, `GET /categories/halal-meat?isHalal=1` returns only halal products; ticking Halal+Organic on `/search` and submitting carries `isHalal=1&isOrganic=1` into the URL and narrows results; clicking "Next page" preserves the checked filters in the query string. |
| R9  | `components/layout/CategorySidebar.tsx` takes props (category list + active slug) and is imported by both the category-detail and search pages, which fetch and pass the data; in `npm run preview` the sidebar lists all 9 seeded categories with icons and highlights the active one. `grep -rnE "\b(8|16|18)\b" components/layout/CategorySidebar.tsx components/product/ProductCard.tsx` shows no count-based magic numbers (visual inspection confirms any hits are unrelated, e.g. spacing). |
| R10 | `specs/design-system.md` has a new storefront-components section and a bumped `version`/`updated`; `git diff` shows the front-matter change. |
| R11 | Screenshots (or captured `get_page_text`/HTML) attached to the PR / saved under the slice folder showing: hero homepage, a redesigned card with badge+star+discount, header signed-in and signed-out, and the category sidebar — all from `npm run preview`, not `npm run dev`. |
| R12 | `git diff origin/staging...HEAD --name-only` includes `CHANGELOG.md`. |
| R13 | `npm run lint && npm run format:check && npx tsc --noEmit && npx vitest run` all exit 0. |
