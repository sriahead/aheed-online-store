# P8.1b — P8.1 Closeout (requirements / acceptance criteria)

Closes the remaining three P8.1 slices — **#335**, **#336**, **#337** — and through them **#252**,
**#269**, **#273**, **#276**, **#277**, **#235** and **#253**. Part A relocates every request-scoped
facade out of `lib/repositories/` and adds the location gate `CLAUDE.md` wrongly claims already
exists; Part B fixes the dev/staging environment defects that decide whether local validation can be
trusted; Part C gives guest shoppers the Art. 15 export they lack. Narrative, rationale and the
scope corrections found at Orient: `plan.md`.

**The three blocks are independent.** No requirement in one block depends on another block's
outcome, and the only file all three touch is `CHANGELOG.md`. A validator may work A, B, C in order
and stop at a failure without invalidating the blocks already proven.

## Block A — Repository facade relocation (#335, closing #252)

R1. No file matching `lib/repositories/*.ts` contains a **value** import of `next/headers`,
    `@/lib/tenant`, `@/lib/auth` or `@/lib/auth-rbac`. Type-only imports (`import type`) remain
    permitted and are unchanged.

R2. Each relocated facade is exported from its new sibling module with an unchanged public
    signature and unchanged behaviour: `getCartRepository` from `lib/cart-service.ts`;
    `getCategoryRepository` from `lib/categories-service.ts`; `getDiscountRepository` from
    `lib/discounts-service.ts`; `getLoyaltyRepository` from `lib/loyalty-service.ts`;
    `getOrderRepository`, `getWebhookOrderService` and `getGuestOrderLookupService` from
    `lib/orders-service.ts`; `getProductRepository` from `lib/products-service.ts`;
    `getReviewRepository` from `lib/reviews-service.ts`; `getVendorTeam` and `setVendorRole` from
    `lib/roles-service.ts`; `getCurrentVendorProfile` and `getCurrentVendorSenderName` from
    `lib/vendor-service.ts`.

R3. `lib/repositories/roles.ts` exports only functions that take `prisma` and `vendorId` as explicit
    parameters — no export in that file resolves a vendor, reads a session, or performs an
    authorization check. The `requireVendorRole("ADMIN")` check that `setVendorRole` performed now
    runs in `lib/roles-service.ts` before it calls the pure function, so a non-admin caller is still
    refused.

R4. No file outside `lib/repositories/` imports any of the **thirteen** names listed in R2 from a
    `@/lib/repositories/*` path. Every call site imports from the new `lib/<name>-service.ts`
    module.

R5. `tests/repository-purity.test.ts` exists, contains **no allowlist or exception list**, and fails
    when a value import of a request-context module is introduced into any `lib/repositories/*.ts`
    file — demonstrated by temporarily introducing one and observing the failure, then reverting.

R6. `tests/repository-vendor-scoping.test.ts`'s `ALLOWED` map no longer contains the eight entries
    made stale by the relocation (`cart.ts:getCartRepository`,
    `categories.ts:getCategoryRepository`, `loyalty.ts:getLoyaltyRepository`,
    `orders.ts:getOrderRepository`, `products.ts:getProductRepository`,
    `reviews.ts:getReviewRepository`, `roles.ts:getVendorTeam`, `roles.ts:setVendorRole`), and still
    contains its genuine cross-vendor exceptions (`data-rights.ts:countOtherVendorData`,
    `data-rights.ts:hasVendorMembership`, `orders.ts:findOrderForWebhook`,
    `orders.ts:confirmPayment`) with their reasons unchanged.

R7. `CLAUDE.md`'s repository-layer section states the corrected rule: it names
    `lib/<name>-service.ts` as the required location, names `tests/repository-purity.test.ts` as
    what enforces it, and no longer claims that `tests/repository-vendor-scoping.test.ts` allowlists
    nine facades or prevents the list from growing. The now-resolved list of nine non-compliant
    factories is described as closed rather than outstanding.

R8. `lib/repositories/promotions.ts`'s docstring no longer states that
    `tests/repository-vendor-scoping.test.ts` is what enforces facade location; it names
    `tests/repository-purity.test.ts` instead.

R9. Part A changes no behaviour: apart from `tests/repository-vendor-scoping.test.ts`'s `ALLOWED`
    map (R6) and import paths, no existing test file's assertions are modified. `git diff` over
    `tests/` shows no changed expectation values.

## Block B — Dev and staging environment hygiene (#336)

R10. `.env` and `.dev.vars` both set `CDN_BASE_URL` to `https://images.dev.aheedfoodcentre.nocaped.com`
     alongside `S3_BUCKET="aheed-images-dev"`, and neither file names
     `images.staging.aheedfoodcentre.nocaped.com` or `images.aheedfoodcentre.nocaped.com`. (Already
     true in the working tree — the human applied it during Spec; see `plan.md` Open items. Verify
     the file contents, not this slice's diff.)

R11. `.env.example`'s `CDN_BASE_URL` comment and `docs/env-setup.md` both name the dev CDN host as
     the value local development uses, distinguishing it from the staging and production hosts, and
     state that it is the host bound to `aheed-images-dev` with no hotlink rule.

R12. A `GET` of an object key that exists in `aheed-images-dev`, against
     `https://images.dev.aheedfoodcentre.nocaped.com`, sent with header
     `Referer: http://localhost:3000/`, returns HTTP **200** (#235). A connection failure or DNS
     timeout is not a result — see `plan.md` Open items.

R13. Under `npm run preview`, a storefront page renders its product images and header logo from the
     dev CDN host with no `403` responses in the browser network log (#235, #277).

R14. A checked-in script under `scripts/` deletes the `DiscountRedemption` rows with `seq` 888888
     and 999999. Before deleting it prints the resolved Neon host and the order numbers the rows
     are attached to, and it **exits non-zero without connecting** if that host is the staging or
     production host. The host comparison is a **pure exported function** taking the resolved host
     and the forbidden hosts as arguments, so the guard is unit-tested rather than proven by
     pointing a destructive script at staging.

R14a. `tests/` covers that pure guard: it refuses a staging host, refuses a production host, and
     permits the dev host. This is the whole proof of the guard — no requirement in this slice asks
     anyone to run the deletion script against a non-dev database.

R15. After that script runs against the dev branch, a count of `DiscountRedemption` rows with
     `seq >= 888888` returns **0**, and the orders whose numbers the script printed in R14 render
     no discount line.

R16. Running `prisma/seed.ts` with `SEED_AHEED_HOST` set and `SEED_SRIMART_HOST` unset prints a
     warning naming SriMart as skipped (#276). The existing two warning paths are unchanged.

R17. Two consecutive `GET`s of a `/staff/*` URL on **staging** in a signed-in admin session
     (the session cookie carried on both requests, matching how P7.5a measured the original
     defect), seconds apart, return `Cache-Control: private, no-store, must-revalidate` and a
     `cf-cache-status` that is never `HIT` (#269). The observed header values are recorded verbatim in `build-notes.md`. If the
     edge does serve a `HIT`, R17 fails and the fix is a new issue, not a change inside this slice.

## Block C — Guest machine-readable data export (#337, closing #253)

R18. `exportGuestOrderData(prisma, vendorId, orderNumber, email)` exists in
     `lib/repositories/data-rights.ts`, takes all four as explicit parameters, reads no request
     context, and returns `null` when the order-number/email pair does not match — verifying the
     pair at the query level, as `eraseGuestOrderData` does.

R19. `lib/data-rights-service.ts`'s existing `GuestDataRightsService` gains an
     `exportGuestOrder(orderNumber, email)` method. No new service file is created for it.

R20. `app/(storefront)/orders/lookup/export/route.ts` returns **200** with `Content-Type:
     application/json`, a `Content-Disposition: attachment` header naming a `.json` file, and
     `Cache-Control: no-store`, for a valid order-number/email pair; and **404** for a pair that
     does not match.

R21. That route calls `checkOrderLookupRateLimit` with the same vendor and client-IP resolution the
     lookup page uses, and returns **429** once the limit is exceeded.

R22. The exported document contains only the single order proven by the credential pair. Given two
     orders placed under the same email, exporting one does not disclose the other's order number,
     items or totals (household-mailbox scope, inherited from
     `specs/2026-08-19-p7-closeout/plan.md` Part C decision 2).

R23. `/orders/lookup` renders a download link to the export route once an order has been found,
     beside the existing `GuestEraseForm`, and renders no such link before a successful lookup.

R24. Under `npm run preview` against a real seeded order, following that link downloads a JSON
     document whose content includes that order's order number and its line items.

## Gates

R25. `npm run kms:validate` exits 0, and `ARTIFACT_INDEX.md` / the runbook `docs.ts` index include
     this slice's `plan.md`.

R26. `CHANGELOG.md` updated on the branch (Gate 4).

R27. `lint`, `typecheck`, `test` and `format:check` all remain green after this slice.
