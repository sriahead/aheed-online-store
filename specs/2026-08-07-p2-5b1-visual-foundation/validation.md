# P2.5b1 — Visual redesign foundation (validation)

| Req | How to verify |
|-----|---------------|
| R1  | `design-system/tokens/tokens.css` contains the three new tint primitives and semantic mappings; `specs/design-system.md`'s "What's deliberately not here yet"/"Open items" sections no longer list logo files or red's role as open, and its `version`/`updated` front-matter changed. |
| R2  | `grep '"lucide-react"' package.json` — present; `npx tsc --noEmit` passes (import resolves). |
| R3  | `npx prisma migrate status` shows the new migration applied; `prisma/schema.prisma`'s `Product` model has the 5 new fields listed in R3. |
| R4  | `npx tsc --noEmit` passes with the extended `ProductFilters`/`ProductSummary`/`ProductDetail` types; `npm run preview`, hit `/categories/fruit-veg?isHalal=1`-equivalent repository call (or a scratch script) and confirm the filter actually narrows results once seed data with mixed `isHalal` values exists (R6). |
| R5  | Scratch script or `npm run preview`: call both `search()` and `listByCategory()` with the same `isHalal`/`isFresh`/`isOrganic` filter values against the same underlying data — confirm identical inclusion/exclusion behavior. |
| R6  | `npm run db:seed` exits 0; querying the DB afterward shows 8 total categories and 16 total products; a seeded halal-meat product has `isHalal: true`; fetching a new product's image via `${CDN_BASE_URL}/${storageKey}` returns 200 (same check P2a's validation used); re-running the seed script is still a no-op for both the old and new categories (idempotency intact). |
| R7  | `npx vitest run tests/is-deliverable.test.ts` — covers a plain match (`"LE1 1AA"` → `true`), case-insensitivity (`"le3 4xy"` → `true`), a non-Leicester postcode (`"SW1A 1AA"` → `false`), and blank/malformed input → `false`. |
| R8  | `npm run lint && npm run format:check && npx tsc --noEmit && npx vitest run` — all exit 0. |
| R9  | `git diff origin/staging...HEAD --name-only` includes `CHANGELOG.md`. |
