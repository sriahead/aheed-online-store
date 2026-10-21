# The Quick Shop hub, and a Regulars placeholder (requirements / acceptance criteria)

Closes `#1187` (a four-tile Quick Shop hub at `/quick-shop`, and the paste-a-list page retitled
"Smart Lists") and `#1186` (an authenticated-only Regulars placeholder at `/account/regulars`),
combined into one slice so the hub and its fourth destination ship together and no deployed state
shows a tile that goes nowhere. Builds on `#232`'s favourites page (the template for an
authenticated account page that is also a hub tile), `#1180`'s `PageContainer` and its width
registry, and `#1145`'s one-name-per-feature ruling — which this slice honours by giving the
saved-list collection a single label rather than adding a third. Reasoning, rejected alternatives
and the full call-site enumeration are in `plan.md`. No schema change, no migration, no new
dependency.

## The hub

R1. `app/(storefront)/quick-shop/page.tsx` exists and its default export returns
    `<PageContainer width="standard">` as the first JSX element after its top-level `return (`.

R2. That page renders `<h1>` with the exact text `Quick Shop`, and exports
    `metadata` whose `title` is the exact string `Quick Shop`.

R3. That page renders exactly four `next/link` elements whose `href` values are, in this order:
    `/account/favourites`, `/account/regulars`, `/shop-your-list`, `/bundles`.

R4. Each of those four links carries a label equal to its destination page's own `<h1>` text —
    `Your favourites`, `Your regulars`, `Smart Lists`, `Value Bundles` respectively — and one
    description sentence, exactly: `Everything you have tapped the heart on, ready to add to your
    basket again.` / `The items you order most often, in one place.` / `Paste or type a list and
    match it to what is in stock.` / `Multi-item bundles at a set price.`

R5. Each of those four links carries the class string
    `rounded-2xl border border-black/10 bg-white p-5 hover:border-action transition block`, the same
    string the six tiles in `app/(storefront)/account/page.tsx` carry.

R6. `app/(storefront)/quick-shop/page.tsx` reads no session and performs no database query: its
    source contains none of `getAuth`, `getSession`, `getPrisma`, `getUserId`, and imports no
    module matching `@/lib/*-service` or `@/lib/repositories/*`.

R7. `app/(storefront)/quick-shop/page.tsx` declares no `export const dynamic` and no
    `export const revalidate`, matching `app/(storefront)/help/page.tsx`; the `(storefront)` layout
    at `app/(storefront)/layout.tsx:9` already forces dynamic rendering for the group.

## The Regulars placeholder

R8. `app/(storefront)/account/regulars/page.tsx` exists, declares
    `export const dynamic = "force-dynamic"`, and exports `metadata` whose `title` is the exact
    string `Your regulars`.

R9. A `GET /account/regulars` with no session cookie returns a redirect to `/login`.

R10. A `GET /account/regulars` with a valid customer session returns HTTP 200 whose body contains
     `<h1` with the exact text `Your regulars` and the exact sentence
     `Your regularly ordered items will appear here once you start shopping.`

R11. `lib/regulars.ts` exists and exports a const `REGULARS_PLACEHOLDER_MESSAGE` whose value is
     exactly `Your regularly ordered items will appear here once you start shopping.`, and
     `app/(storefront)/account/regulars/page.tsx` renders that import rather than a second copy of
     the string (the literal sentence appears nowhere in the page file).

R12. That page returns `<PageContainer width="standard">` as the first JSX element after its
     top-level `return (`, and renders a `next/link` to `/account` labelled `Your account`.

## `/account` entry point

R13. `app/(storefront)/account/page.tsx` renders a `next/link` with `href="/account/regulars"`
     labelled `Your regulars`, carrying the same tile class string named in R5.

R14. `app/(storefront)/account/page.tsx:106`'s Lists tile description no longer contains the
     substrings `recurring shopping lists` or `quick shopping`.

## The rename, by call site

R15. `components/layout/ShoppingListLink.tsx`'s `Link` has `href="/quick-shop"`, and the string
     `/shop-your-list` appears nowhere in that file.

R16. In `components/layout/ShoppingListLink.tsx`, the `aria-label` value and the visible `<span>`
     text are both exactly `Quick Shop` and are byte-identical to each other (WCAG 2.5.3), and its
     `title` attribute no longer contains the substring `pasting`.

R17. `app/(storefront)/shop-your-list/page.tsx` exports `metadata` whose `title` is exactly
     `Smart Lists`, and renders `<h1>` with the exact text `Smart Lists`. The string `Quick Shop`
     appears nowhere in that file outside a comment.

R18. `app/(storefront)/shop-your-list/page.tsx` renders `<h2>` with the exact text `Your lists`,
     and the string `Your saved lists` appears nowhere in the repository's `app/` or `components/`
     trees outside a comment.

R19. `app/(storefront)/cart/page.tsx` and `app/(storefront)/account/lists/page.tsx` each still
     carry a `next/link` with `href="/shop-your-list"`, and the visible text of each is
     `Smart Lists` rather than `Quick Shop`.

R20. `app/(storefront)/account/lists/page.tsx` renders `<h1>` with the exact text `Your lists`,
     unchanged by this slice.

## Guards, registry and scope

R21. `tests/page-container.test.ts`'s `EXPECTED` map contains exactly two new keys —
     `app/(storefront)/quick-shop/page.tsx` and `app/(storefront)/account/regulars/page.tsx` — both
     with `{ width: "standard", padY: "default" }`, and the whole file passes.

R22. `app/sitemap.ts`'s `STATIC_PATHS` is unchanged: it contains neither `/quick-shop` nor
     `/account/regulars`.

R23. `tests/vendor-neutral-copy.test.ts` passes with the new tile and placeholder copy, and none of
     the four tile sentences or the placeholder sentence names a vendor or a product category.

R24. A new test file asserts, and is proven non-vacuous by being seen to fail when each assertion's
     subject is mutated: the hub's four hrefs and their order (R3), the four tile labels (R4), and
     that `/account/regulars` renders `REGULARS_PLACEHOLDER_MESSAGE` (R11).

R25. `git diff --stat` for this slice shows no change under `prisma/`, no new file under
     `prisma/migrations/`, and no change to `package.json` or `package-lock.json`.

R26. `tests/quick-shop-copy.test.tsx` passes unmodified — `git diff` shows zero changes to that
     file.

R27. `#1184` and `#1188` are still open after this slice's PR merges, and the PR's
     `closingIssuesReferences` is exactly `[1186, 1187]`.

R28. `components/account/AccountNav.tsx` and `tests/account-nav.test.tsx` are both unchanged by this
     slice, and `tests/account-nav.test.tsx` passes. (The persistent account nav is deliberately not
     extended — see `plan.md`. `/account/favourites` is already absent from it and the gap is filed
     as its own issue rather than fixed here.)

R29. `CHANGELOG.md` updated on the branch (Gate 4).

R30. `npm run lint`, `npm run typecheck`, `npx vitest run --maxWorkers=4` and `npm run format:check`
     all exit 0 after this slice.
