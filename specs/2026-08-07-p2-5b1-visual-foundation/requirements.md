# P2.5b1 — Visual redesign foundation (requirements / acceptance criteria)

First of two sub-slices of P2.5b (`specs/roadmap.md`'s P2.5), split from the original single-slice
plan during `/spec` because it combined tokens/schema/seed with layout/UI work — bigger than any
slice this session. This slice: real tokens, schema, filters, and seed data. P2.5b2 (issue #43)
applies them to the actual UI.

R1. `design-system/tokens/tokens.css` gains three tint primitives (`#E8F5E9`, `#FFF3E0`,
    `#FFEBEE`) mapped to semantic `--color-action-tint`/`--color-accent-tint`/
    `--color-danger-tint` — named relative to their existing base color, matching the established
    hover/active-shade naming pattern. `specs/design-system.md` documents these, the brand kit's type
    scale as Tailwind utility-class mappings (not new CSS tokens), and resolves its two existing
    open items ("real logo source files" — now committed; "red's exact role" — confirmed as both
    alert/danger and sale-badge color). Version bumped, matching every prior persistent-doc edit
    this session.
R2. `package.json` gains `lucide-react` as a dependency (matches the mockup's actual icon
    library choice, `docs/ui-ref/package.json`).
R3. `prisma/schema.prisma`'s `Product` model gains `origin` (String?), `originalPrice` (Int?,
    pence), `isHalal`/`isFresh`/`isOrganic` (Boolean, `@default(false)`). Migration applied via
    `prisma migrate dev` against the real Neon staging instance and committed under
    `prisma/migrations/`.
R4. `lib/repositories/products.ts`'s `ProductFilters` gains `isHalal`/`isFresh`/`isOrganic`
    (optional booleans), applied in `buildFilterWhere()` alongside the existing price/in-stock
    filters — one shared filter shape. `ProductSummary` and `ProductDetail` both gain `origin`,
    `originalPrice`, `isHalal`, `isFresh`, `isOrganic` in their select clauses and return shapes.
R5. `lib/repositories/products.ts`'s `search()` and `listByCategory()` both accept and apply the
    three new filters identically — no divergent behavior between the two entry points.
R6. `prisma/seed.ts` adds 6 new categories (halal-meat, groceries, international, beverages,
    snacks, household) with 2 placeholder products each (12 new products total), each with
    `origin` set and `isHalal`/`isFresh`/`isOrganic` populated where semantically appropriate
    (e.g. halal-meat category's products get `isHalal: true`). Each product's image is uploaded
    through `lib/storage.ts`'s `putObject()` (same placeholder SVG, real storage round-trip —
    same pattern P2a's seed already established), never an external URL. The existing 3
    categories/6 products (`fruit-veg`, `bakery`, `dairy-eggs`) are unmodified — the seed script's
    idempotency check and transactional upload-then-write structure from P2a apply to the new
    categories/products too.
R7. `lib/delivery.ts` exports a pure function `isDeliverable(postcode: string): boolean` — true
    for any input whose alphanumeric prefix (case-insensitive, tolerant of internal whitespace)
    matches Leicester's LE1 through LE5 postcode districts, false otherwise (including empty or
    malformed input). No Prisma/network dependency, unit-tested directly.
R8. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
R9. `CHANGELOG.md` updated (Gate 4).
