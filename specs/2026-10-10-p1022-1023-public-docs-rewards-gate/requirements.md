# Public docs boundary and loyalty-gated Rewards launcher (requirements / acceptance criteria)

Closes `#1022` (the follow-up its "What is NOT fixed" section lists: a mechanical guard for the
public direction, and selecting the shopper guide by id rather than array position) and `#1023`
(the floating Rewards launcher rendering for vendors with loyalty off). Builds on PR #1024, which
added `visibility === "public"` to `/help`'s filter. One-line version of `plan.md`: route the
public Help Centre's shopper guide through one id-selecting, visibility-checking helper; fail a
test if any other non-staff file imports the internal docs corpus; render `RewardsLauncher` only
when the vendor's `loyaltyEnabled` is true. No schema change, no migration, no server action.

"The generated docs module" below means `app/(admin)/staff/runbook/docs.ts`, which exports
`DOC_ARTICLES`. "The guide id" means the exact string `docs/shopper-help/shopping-guide.md`.

R1. `lib/public-docs.ts` exists, has no `"use server"` directive, and exports a function
    `getPublicShopperGuide` taking one optional parameter (an article array) that defaults to
    `DOC_ARTICLES`.
R2. `getPublicShopperGuide` returns the article whose `id` equals the guide id when that article's
    `visibility` equals `"public"`, and returns `null` when the guide id is absent from the array or
    its article's `visibility` is anything other than `"public"`. It never returns an article with a
    different `id`, regardless of array order or of that article's `audience` or `visibility`.
R3. A unit test file exercises R2 with: the real `DOC_ARTICLES` (returns the guide id, visibility
    `public`); a crafted array whose first element is an internal article with `audience`
    containing `shopper`, followed by the public guide (returns the guide); a crafted array where
    the guide id's article is `visibility: "internal"` (returns `null`); and a crafted array without
    the guide id (returns `null`). All four cases pass.
R4. `app/(storefront)/help/page.tsx` contains no import of the generated docs module, and its
    "Detailed Shopping Guide" section renders the `content` of the article returned by
    `getPublicShopperGuide()`; when that call returns `null`, the section (heading included) does
    not render.
R5. `tests/help-vendor-facts.test.tsx` (or a new test rendering the same page) asserts that the
    rendered `/help` page contains the text `Guest Checkout` (from the public guide) and does not
    contain `PENDING_PAYMENT` or `Known Trap` (from the internal operations document), and the
    assertion passes.
R6. `tests/public-docs-boundary.test.ts` exists and, using the TypeScript compiler API rather than a
    text search, scans every `.ts` and `.tsx` file under `app/`, `components/`, `lib/` and
    `features/`, failing if any file outside `app/(admin)/` other than `lib/public-docs.ts` imports
    a module specifier that, with any extension removed, ends in `staff/runbook/docs`. Import forms
    covered: static `import` (including `import type`), `export ... from`, dynamic `import()` and
    `require()`. Its only exemption is `lib/public-docs.ts`; it contains no other allowlist.
R7. The test in R6 also asserts that its own detector flags, from in-memory source strings: a
    relative static import, an `@/app/(admin)/staff/runbook/docs` alias import, an `export ... from`
    re-export, and a dynamic `import()` of the generated docs module; and that it does not flag a
    source string that only mentions `staff/runbook/docs` inside a comment.
R8. `tests/public-docs-boundary.test.ts` passes against the tree as committed, and fails when an
    import of the generated docs module is temporarily added to any file under
    `app/(storefront)/` (verified by adding one, running the test, and reverting).
R9. `components/layout/StorefrontChrome.tsx` renders `RewardsLauncher` if and only if
    `initialRewardsData.loyaltyEnabled` is `true`; no other element of the chrome changes.
R10. A test renders `StorefrontChrome` (dependencies such as `next/headers`, `@/lib/auth` and
    `@/lib/rewards-service` mocked as needed) and asserts that no element with
    `aria-label="Open rewards and loyalty panel"` exists when the mocked rewards data has
    `loyaltyEnabled: false`, and that exactly one exists when it has `loyaltyEnabled: true`.
R11. Under `npm run preview`, a signed-out `GET /` and `GET /help` with `Host:
    srimart.localhost:8787` return HTTP 200 and HTML that does not contain `Open rewards and loyalty
    panel`; the same two requests with `Host: localhost:8787` (Aheed, loyalty on) return HTTP 200
    and HTML that does contain it.
R12. Under `npm run preview`, a signed-out `GET /help` for both hosts in R11 returns HTML containing
    `Guest Checkout` and containing neither `PENDING_PAYMENT` nor `Known Trap`.
R13. `docs/developer-portal/app-conventions.md`'s `#1022` bullet (the one stating that
    `visibility: public` is the only field that says a document may leave the building) also states,
    in the same bullet, that `lib/public-docs.ts` is the only route from a non-staff surface to the
    generated docs module and that `tests/public-docs-boundary.test.ts` enforces it; the file's
    `version` is incremented.
R14. `npm run kms:validate` exits 0, `npm run kms:check-generated` reports all generated artefacts
    current, and `npm run kms:assemble:internal` followed by `npx next build --webpack` in
    `kms/site-internal` both exit 0.
R15. `CHANGELOG.md` updated (Gate 4).
R16. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
