# #955, #996, #994 — Crawlability (requirements / acceptance criteria)

Seventh slice of the mobile programme, closing `#955` (product pages unreachable, unlisted, and
de-indexed on every vendor but Aheed), `#996` (no `generateMetadata` on the product or category
detail route, so every product on a vendor shares one title) and `#994` (the Gate 2 pre-commit hook
blocks a docs-only commit that regenerates the KMS artefact). Builds on `#830`, which removed the
product card's link, and on `#961`, which set the mobile Quick View button's tap target. No schema
change and no migration. `plan.md` carries the reasoning; `validation.md` carries the command for
each row below.

Two hosts are used throughout. Under `npm run preview` the first vendor (Aheed) is
`localhost:8787` and the second (SriMart) is `srimart.localhost:8787` — the port-carrying
`VendorDomain` row `#514` added. **A row that names "both vendors" is not satisfied by checking
one**: the defect in `#955` is one that only a second vendor reveals.

## The product card anchor (`#955`)

R1. In `components/product/ProductCard.tsx`, the product title is rendered inside an `<a>` element
    whose `href` is exactly `/products/${product.slug}`. No `<button>` element wraps the title text.

R2. That anchor's `onClick` handler calls `preventDefault()` on the event and then calls
    `openQuickView` with `product.slug` and `product`, in that order, so a left-click with
    JavaScript active opens the Quick View drawer and performs no navigation.

R3. A served category listing page contains one `href="/products/<slug>"` occurrence for each
    product rendered in its grid, and the count is greater than zero. Verified on **both** vendors.

R4. A served category listing page's product-card markup contains no `after:absolute` or
    `after:inset-0` class on the title anchor — the anchor covers the title text only, not the card.

R5. The desktop hover Quick View button and the mobile corner Quick View button both still render,
    both still call `openQuickView`, and the mobile button's rendered box is at least 44×44 CSS
    pixels at viewport widths 360 and 390 on **both** vendors.

R6. `components/product/ProductCard.tsx` contains neither the string `the only \`<Link>\`` nor the
    string `no navigation to separate product detail page`; its file-header comment still states
    that `AddToCartButton`/`CartQuantityStepper` are `<button>` elements that must stay siblings of
    the anchor rather than descendants of it.

## The sitemap (`#955`)

R7. `GET /sitemap.xml` on a vendor host returns HTTP 200, `content-type` containing `application/xml`,
    and a document whose root element is `<urlset>`.

R8. That document contains a `<loc>` equal to `https://<request host>/products/<slug>` for every
    active product of the vendor that host resolves to, and the number of `/products/` `<loc>`
    entries equals that vendor's active-product count.

R9. It contains a `<loc>` equal to `https://<request host>/categories/<slug>` for every active
    category of that vendor, and the number of `/categories/<slug>` entries equals that vendor's
    active-category count.

R10. It contains exactly these six static `<loc>` values and no other non-product, non-category
     entry: `https://<host>/`, `https://<host>/categories`, `https://<host>/bundles`,
     `https://<host>/help`, `https://<host>/privacy`, `https://<host>/terms`.

R11. It contains no `<loc>` whose path begins with any of `/account`, `/cart`, `/checkout`, `/login`,
     `/register`, `/search`, `/dev`, `/orders`, `/feedback`, `/shop-your-list`, `/forgot-password`,
     `/reset-password`.

R12. Every `<loc>` in the document begins with `https://` followed by the host sent in the request's
     `Host` header. Fetched on the second vendor's host, the document contains no slug that belongs
     only to the first vendor, and vice versa.

R13. The document contains no `<lastmod>` element at all.

R14. `app/sitemap.ts` contains no string matching `nocaped\.com`, and `app/robots.ts` contains no
     string matching `nocaped\.com`.

R15. `app/sitemap.ts` reads the incoming request's headers, directly via `next/headers` or
     transitively through `getCurrentVendorIdOrNull()`, so the route is request-time rather than
     statically cached. R12's two-host difference is the behavioural proof of this.

R16. `GET /sitemap.xml` sent with a `Host` header that matches no `VendorDomain` row returns HTTP 200
     and a `<urlset>` containing zero `<url>` elements.

R17. The product slugs and category slugs consumed by `app/sitemap.ts` come from exported functions
     in `lib/repositories/products.ts` and `lib/repositories/categories.ts` that each take the Prisma
     client as their first parameter and `vendorId` as their second, and read no request context.
     `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts`
     exits 0.

## robots (`#955`)

R18. `app/robots.ts` contains no vendor hostname literal and no `process.env` access; the
     indexability value is read through a function exported by `lib/config.ts`.

R19. `lib/config.ts` exports a zod schema and getter for the indexability variable that is separate
     from `schema`/`getEnv()`, such that calling the new getter with `DATABASE_URL` and
     `BETTER_AUTH_SECRET` both absent does not throw.

R20. With `SEO_INDEXABLE` set to `"true"`, `GET /robots.txt` returns a body containing `Allow: /`
     and a line `Sitemap: https://<request host>/sitemap.xml`, on **both** vendors' hosts, with the
     host in the `Sitemap:` line matching the host the request was sent to.

R21. With `SEO_INDEXABLE` absent, and separately with `SEO_INDEXABLE` set to `"false"`,
     `GET /robots.txt` returns a body containing `Disallow: /` and containing no `Sitemap:` line.

R22. With `SEO_INDEXABLE` set to `"true"`, the `/robots.txt` body contains a `Disallow:` line for
     each of `/account`, `/cart`, `/checkout`, `/orders/lookup` and `/dev`.

R23. `wrangler.toml` declares `SEO_INDEXABLE` under `[env.production.vars]` and does not declare it
     under `[env.staging.vars]`.

R24. `tests/vendor-neutral-copy.test.ts`'s scanned file list includes `app/robots.ts` and
     `app/sitemap.ts`, its "scans a real set of files" assertion still passes, and the whole test
     file exits 0.

## Per-page metadata (`#996`)

R25. `GET /products/<slug>` returns a document whose `<title>` contains the product's `name` and
     whose `<title>` is not equal to the `<title>` served by `GET /` on the same host.

R26. That document contains a `<meta name="description">` whose `content` is derived from that
     product's `description` column and is at most 160 characters long.

R27. That document contains `<link rel="canonical" href="https://<request host>/products/<slug>">`,
     with an absolute URL — no `metadataBase` is configured, and a relative value in a URL-based
     metadata field is a build error in this version of Next.

R28. Two different products on the same vendor return two different `<title>` values from
     `/products/<slug>`.

R29. `GET /categories/<slug>` satisfies R25, R26 and R27 with the category's `name` and
     `/categories/<slug>` in place of the product's, except that its description is composed from
     the category name and the vendor name, since `Category` has no description column.

R30. Both `generateMetadata` implementations return the route's inherited metadata rather than
     throwing when the vendor profile or the record cannot be read: a unit test in which the
     injected repository or profile lookup rejects produces a resolved value, not a rejection.

R31. Neither new `generateMetadata` implementation contains the literal `Aheed` or `SriMart` or any
     product-category noun; the vendor's name is read from `getCurrentVendorProfile()`.
     `npx vitest run tests/vendor-neutral-copy.test.ts` exits 0.

## The Gate 2 hook (`#994`)

R32. With `app/(admin)/staff/runbook/docs.ts` and `ARTIFACT_INDEX.md` staged, no other
     `SOURCE_DIRS` path staged, and no `specs/*/requirements.md` new on the branch relative to
     `origin/main`, `hooks/pre-commit` exits 0.

R33. With a hand-authored file under `app/`, `components/`, `features/`, `lib/`, `prisma/`, `kms/`
     or `design-system/` staged and no `specs/*/requirements.md` new on the branch relative to
     `origin/main`, `hooks/pre-commit` exits non-zero and prints its `Gate 2 failed` message.

R34. `npm run kms:check-generated` still exits non-zero when `app/(admin)/staff/runbook/docs.ts` is
     stale relative to the documents it is generated from, and exits 0 when it is current.

## Tests and gates

R35. New test files exist and pass: coverage for the sitemap document's contents, the robots
     document in both indexability states, the product card's title anchor, and both
     `generateMetadata` builders including their degradation path.

R36. `scripts/verify-crawlability.ts` exists and, against a running `npm run preview` and the dev
     database, prints one `PASS`/`FAIL` line per live row below and exits 0 only when every line is
     `PASS`. It takes both vendor hosts, counts that vendor's active products and categories from
     the database rather than from the sitemap it is checking, and refuses to run against a
     `DATABASE_URL` that is not the dev endpoint — matching
     `scripts/verify-delivery-areas.ts`'s guard.

## Persistent documentation

These are standing facts, not slice history, so they land in the authoritative documents rather than
only in `build-notes.md`. They are written at `/build-notes`, before the pre-validation Clear.

R37. `docs/developer-portal/env-setup.md` documents `SEO_INDEXABLE`: what it controls, that it is a
     committed `wrangler.toml` variable rather than a secret, that it is declared for production
     only, and that an absent or non-`"true"` value means `Disallow: /`.

R38. `docs/developer-portal/app-conventions.md` records the standing rule that a product card's
     title is a real `<a href>` to the product page with Quick View layered on as a JavaScript
     enhancement, and that `app/robots.ts` and `app/sitemap.ts` are in
     `tests/vendor-neutral-copy.test.ts`'s explicit file list because the `.tsx` glob cannot see
     them.

R39. After those edits, `npm run kms:validate` exits 0, `npm run kms:build-index` leaves
     `ARTIFACT_INDEX.md` and `app/(admin)/staff/runbook/docs.ts` committed and current
     (`npm run kms:check-generated` exits 0), `npm run kms:assemble:internal` exits 0, and a real
     Next build in `kms/site-internal` succeeds — `gates` never builds the docs site.

R40. `ARTIFACT_INDEX.md` carries an entry for this slice's `plan.md`.

## Gates

R41. `CHANGELOG.md` updated (Gate 4).

R42. `npm run lint`, `npm run typecheck`, `npm run format:check` and `npx vitest run` all exit 0
     after this slice, with `npx vitest run` executed on its own rather than beside a build.
