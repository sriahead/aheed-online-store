# P8.5f — Landing Slim-Down, Header Postcode & Campaign Date/Banner Fixes (requirements / acceptance criteria)

Follows P8.5e (#356, `specs/2026-08-25-p8.5e-hero-campaigns/`), approved in-conversation at
`/propose` with no issue opened yet (see `plan.md`'s Open items). One-paragraph version of
`plan.md`: the landing page keeps only its hero and trust strip, handing the department scroller and
both product rows to a rebuilt `/categories`; the postcode checker moves into a header that adapts
to its route via a new Next 16 `proxy.ts`; a live timezone defect that stored campaign and discount
schedules one BST hour from what the admin typed is fixed by a pure `lib/local-datetime.ts` pinned
to `Europe/London`; and the campaign banner gains an "Auto-Generate" button reusing the Workers AI
pipeline that already backs product images. No schema change and no migration.

Throughout, "under preview" means `npm run preview` (OpenNext + local Workers runtime), never
`npm run dev` — `next dev` cannot load `@prisma/client/wasm`, so every DB-touching route silently
renders an error state (CLAUDE.md, Database).

**Landing page and the rebuilt `/categories`**

R1. The rendered HTML of `/` contains none of the strings `Shop by department`, `New Arrivals`, or
    `Featured Products`.

R2. The rendered HTML of `/` still contains the hero `<h1>`, the `DepartmentHero` panel markup, and
    all three trust tiles (`Local Delivery`, `Secure Checkout`, `Order Updates`).

R3. The rendered HTML of `/categories` contains a `Shop by department` heading followed by
    `DepartmentScroller`'s markup, a `New Arrivals` section containing at most 4 product cards, and
    a `Featured Products` section containing at most 4 product cards.

R4. With a product in the current session's cart, that product's card on `/categories` renders the
    cart-aware quantity state (the stepper showing the current quantity), not the plain add control
    — i.e. `/categories` passes `getRequestCartQuantities()`'s result into both `ProductRow`s.

R5. `/categories` derives its `<title>` from the current vendor: served under a SriMart host the
    title contains `SriMart` and does not contain `Aheed Food Centre`.

R6. The `New Arrivals` section on `/categories` renders a "View all" link whose `href` is `/search`.

**Header: postcode checker and cookie**

R7. The rendered HTML of `/` contains a `<form>` inside the `<header>` element carrying an
    `<input name="postcode">` and a submit control.

R8. Submitting that form with a deliverable postcode sets a `delivery-postcode` cookie whose
    `Set-Cookie` header includes `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` and a `Max-Age` of
    `2592000`, and includes no `Domain` attribute.

R9. After R8's submission, the ✓ badge naming that postcode appears in the header on `/` **and** on
    at least one other storefront route (`/categories`), with no further submission.

R10. Submitting a postcode outside the vendor's `deliveryPrefixes` renders the ✗ refusal message
     naming the vendor's locality and prefixes, and still stores the cookie, so the ✗ state also
     persists across routes.

R11. Submitting the form with an empty postcode value deletes the `delivery-postcode` cookie
     (`Set-Cookie` with an expiry in the past or `Max-Age=0`) and the header renders neither badge.

R12. No file added or modified to render the postcode form declares `"use client"` — the form, its
     server action and the badge are all server-rendered.

**Header: route-aware landing variant**

R13. A `proxy.ts` exists at the repository root exporting a default function that returns
     `NextResponse.next({ request: { headers } })` with an `x-pathname` header set to the request's
     pathname, and exporting a `config` whose `matcher` excludes `_next/static`, `_next/image` and
     `favicon.ico`. It declares no `runtime` export (forbidden in Next 16 Proxy files).

R14. Under preview, the rendered HTML of `/` contains no `<input name="q">` and no link with
     `href="/shop-your-list"`; the rendered HTML of `/categories` contains both.

R15. Under preview, `/staff` still returns 200 for a signed-in vendor `ADMIN` and its portal header
     renders without a search input, unchanged from before this slice.

R16. A request for a static asset path under `/_next/static/` returns its asset normally under
     preview (the matcher exclusion is live, not merely written).

**Timezone correctness**

R17. `lib/local-datetime.ts` exists and exports `STORE_TIMEZONE` (equal to the string
     `Europe/London`), `parseLocalInput` and `formatLocalInput`. It contains no value import of
     `next/headers`, `@/lib/db`, `@/lib/config`, `@prisma/client` or `@prisma/client/wasm`.

R18. Unit tests prove all four of: `parseLocalInput("2026-08-25T07:25")` equals the instant
     `2026-08-25T06:25:00.000Z` (BST, UTC+1); `parseLocalInput("2026-01-15T07:25")` equals
     `2026-01-15T07:25:00.000Z` (GMT, UTC+0); `formatLocalInput` inverts both exactly; and
     `parseLocalInput("")` returns `null`.

R19. The test file from R18 passes with the process timezone set to `UTC` **and**, unchanged, with
     it set to `America/New_York` — the module's output does not depend on the runtime's own clock.

R20. Neither `lib/campaign-form.ts` nor `features/admin/discount-codes.ts` converts a submitted
     `startsAt`/`endsAt` form value into a `Date` by any route other than `parseLocalInput`; a unit
     test asserts `parseCampaignForm` given `startsAt: "2026-08-25T07:25"` yields the instant
     `2026-08-25T06:25:00.000Z`.

R21. Under preview, signed in as a vendor `ADMIN`: opening a department's campaign edit form,
     entering `07:25` on a BST date in **Starts**, saving, and reloading the page renders `07:25` in
     that field — not `08:25` and not `06:25`.

**AI-generated campaign banner**

R22. `POST /api/admin/campaign-images/generate` exists, calls `requireVendorRole("ADMIN")` before
     any other work, and returns `401` for an unauthenticated request and `403` for a signed-in
     non-admin, in both cases writing nothing.

R23. The route reads only a `categoryId` from the request body; the text prompt sent to the image
     service is constructed server-side from the department name and the campaign's
     headline/subtitle, and no caller-supplied prompt or storage key is accepted.

R24. A successful generation stores an object whose key matches `categories/{categoryId}/{uuid}` per
     `isCampaignImageKey`, and updates that department's campaign row so `imageKey` equals the
     stored key.

R25. The campaign row written by R24 has a non-empty `altText`: the admin's typed alt text when the
     form carries one, otherwise a server-derived description naming the department. No code path in
     the route writes an `imageKey` while leaving `altText` null or empty.

R26. With `CLOUDFLARE_ACCOUNT_ID` or `CLOUDFLARE_API_TOKEN` absent, the route returns a JSON error
     response with a non-2xx status and the campaign row is left unmodified — no partial write, no
     unhandled exception in the Worker log.

R27. `components/staff/CampaignBannerUploader.tsx` renders an "Auto-Generate" button that posts to
     `/api/admin/campaign-images/generate` and refreshes the route on success, alongside the
     existing upload control which continues to work unchanged.

**Slice-wide**

R28. `git diff --stat` against the base branch shows no change to `prisma/schema.prisma` and no new
     directory under `prisma/migrations/`.

R29. `specs/architecture.md` §2.1 documents `proxy.ts` — why a layout cannot see its own route, the
     Next 16 `middleware`→`proxy` rename, the `NextResponse.next({ request: { headers } })` form,
     and what deliberately stays out of the proxy — with its front-matter `version` and `updated`
     bumped.

R30. `specs/decisions/ADR-004-multi-tenancy.md` carries an implementation note recording that
     `STORE_TIMEZONE` is a platform constant rather than vendor data, why that is safe today, and
     what it blocks (non-UK vendor onboarding), with its front-matter `version` and `updated`
     bumped.

R31. `npm run kms:validate` exits 0, and this slice's `plan.md` front-matter `id` matches
     `^[a-z0-9-]+$` (no literal `.`).

R32. `CHANGELOG.md` is updated on this branch (Gate 4).

R33. `npm run lint`, `npm run typecheck`, `npm test` and `npm run format:check` all exit 0.
