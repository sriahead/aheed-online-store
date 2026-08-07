# P2.5b2 — Storefront visual redesign UI (requirements / acceptance criteria)

Second and final sub-slice of P2.5b (`specs/roadmap.md`'s P2.5), applying P2.5b1's tokens, schema
fields, and seed data (see `related:` docs) to a real storefront: layout + header, hero homepage,
redesigned product cards, category sidebar, and speciality filters — matching the AI Studio mockup
in `docs/ui-ref/`. Closes #43.

R1. Root `app/layout.tsx`'s `<body>` no longer carries the `max-w-2xl` (or `p-8`) width
    constraint — it keeps only the html/body/font-variable shell.

R2. `app/(storefront)/layout.tsx` exists, exports `const dynamic = "force-dynamic"`, renders
    `components/layout/Header.tsx` above `{children}`, and does not introduce a second `<main>`
    element (existing pages keep their own).

R3. `components/layout/Header.tsx` exists, contains no `"use client"` directive, and reads the
    session via `getAuth().api.getSession({ headers: await headers() })`. It renders: a promo bar
    with a static Leicester LE1–LE5 delivery note, a logo linking to `/`, a
    `<form method="GET" action="/search">` containing an input named `q`, an account control that
    links to `/account` (showing the signed-in user's name) when a session exists and to `/login`
    otherwise, and a non-interactive cart button with no numeric count.

R4. `app/page.tsx` no longer exists; `/` is served by `app/(storefront)/page.tsx`, which exports
    `const dynamic = "force-dynamic"` and renders a hero section, a category grid built from
    `getCategoryRepository().listTopLevel()`, and a postcode checker `<form method="GET">` whose
    result is computed by `lib/delivery.ts`'s `isDeliverable()` against a `postcode` search param.
    `app/api/health/route.ts` is unchanged.

R5. `components/product/category-icon.ts` (or `.tsx`) exports a function mapping a category slug to
    a lucide-react icon component and returns a defined non-null icon for a slug not in its map
    (verified by a unit test passing an unknown slug).

R6. `lib/repositories/products.ts`'s `ProductSummary` and `ProductDetail` interfaces include
    `averageRating: number` and `reviewCount: number`, and both `findPage()`'s and `getBySlug()`'s
    `select` clauses request those two columns.

R7. `components/product/ProductCard.tsx` renders, from a `ProductSummary`: Halal and Fresh badges
    gated on `isHalal`/`isFresh`; a discount badge plus a strikethrough `originalPrice` only when
    `originalPrice` is set; a star rating showing `averageRating` and `reviewCount`; `origin` when
    set; the name, `unitLabel`, and price; and an inert Add-to-Cart control. No raw brand hex
    literals appear in the file (brand colors come from semantic token utility classes).

R8. `components/product/ProductFilterForm.tsx` includes checkboxes named `isHalal`, `isFresh`, and
    `isOrganic`; `app/(storefront)/search/page.tsx` and `app/(storefront)/categories/[slug]/page.tsx`
    each read those three params, pass the corresponding booleans into the product repository call,
    and include any set ones in their `nextPageHref` pagination query string.

R9. `components/layout/CategorySidebar.tsx` exists as a presentational component that receives the
    category list and the active slug as props (it does not fetch data itself — the pages fetch via
    `getCategoryRepository().listTopLevel()` and pass down, mirroring how `ProductCard` receives
    its `product`), renders one entry per passed category (with an icon per R5 and the active slug
    visually distinguished), and is rendered on both `app/(storefront)/categories/[slug]/page.tsx`
    and `app/(storefront)/search/page.tsx`. No component hardcodes a fixed category or product count.

R10. `specs/design-system.md` gains a section documenting the storefront component conventions
     introduced here (header/promo bar, redesigned card, badge→semantic-token mapping, star using
     stock Tailwind amber), with its `version`/`updated` front-matter bumped.

R11. Rendered output is verified via `npm run preview` (not `npm run dev`): the hero homepage, a
     product card showing a badge + star rating + discount, the header in both signed-in and
     signed-out states, and the category sidebar all render correctly (screenshot or captured
     DOM/HTML evidence, per validation.md).

R12. `CHANGELOG.md` updated (Gate 4).

R13. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice (Gate 3).
