# P7b — UK GDPR data-subject rights (requirements / acceptance criteria)

Closes the gap between what `app/(storefront)/privacy/page.tsx` §5 already promises customers —
access, rectification and deletion — and the fact that none of the three has a mechanism behind it.
Builds on ADR-004's global-identity / row-level-`vendorId` model: export and erasure are
**vendor-scoped**, and the shared `User` identity is removed only when the requesting vendor is the
user's last. Narrative, rationale and the table-by-table erasure shape are in `plan.md`. Issue
**#216**.

Throughout, "vendor A" is the vendor whose storefront the request is made from, and "vendor B" is
any other vendor holding data for the same `User`.

## Repository layer

R1. `lib/repositories/data-rights.ts` exists and exports `exportPersonalData`, `eraseVendorData`
    and `countOtherVendorData`.

R2. Every exported function in `lib/repositories/data-rights.ts` takes its Prisma client and
    `vendorId` as explicit parameters and reads no request context (no `getCurrentVendorId()`, no
    `headers()`, no `getAuth()` call inside them), so each can be invoked from a plain `tsx`
    script.

R2a. `lib/repositories/data-rights.ts` imports `@/lib/db` only with `import type`, so loading the
     module in real Node does not pull in `@prisma/client/wasm`. The module can be imported by a
     `tsx` script without error.

R2b. `countOtherVendorData(prisma, userId, excludingVendorId)` resolves to a number. It is the only
     function in the module that queries across vendors, and it returns no row data, no field
     values and no vendor identifiers.

R3. No file added or modified by this slice under `app/`, `features/` or `components/` imports
    `@/lib/db`, `@prisma/client` or `@prisma/client/wasm`; `npm run lint` exits 0 with the
    ADR-004 slice-2 `no-restricted-imports` rule in force.

## Export — Art. 15 access

R4. `exportPersonalData(prisma, vendorId, userId)` resolves to an object whose top-level keys are
    exactly: `exportedAt`, `vendor`, `identity`, `linkedAccounts`, `sessions`, `addresses`,
    `orders`, `reviews`, `carts`, `loyalty`, `discountRedemptions`.

R5. The value returned by `exportPersonalData` contains no credential material: recursively
    collecting every property name in the returned object yields a set containing none of
    `password`, `accessToken`, `refreshToken`, `idToken`, `token`. (Exact property names, not
    substrings — `Cart.guestToken` is a legitimate property whose name contains "token".)

R6. For a `User` holding data at vendor A and vendor B, `exportPersonalData(prisma, vendorA, userId)`
    returns no record carrying vendor B's `vendorId`, and its `orders`, `addresses`, `reviews`,
    `carts`, `loyalty` and `discountRedemptions` collections each contain exactly the vendor-A rows
    that exist for that user.

R7. `GET /account/data/export` returns `200` with `Content-Type: application/json` and a
    `Content-Disposition: attachment` header naming a `.json` filename, for a request carrying a
    valid session cookie.

R8. `GET /account/data/export` does not return `200` for a request with no session cookie; it
    responds with a redirect to `/login` or a `401`.

## Erasure — Art. 17

R9. `eraseVendorData(prisma, vendorId, userId, …)` performs all of its writes inside a single
    `$transaction`, and the client it is called with in application code is `getPrismaWs()`.

R10. After erasure at vendor A, every `Order` row for that user at vendor A has `userId = null` and
     `guestEmail = null`, while its `orderNumber`, `totalPence`, `subtotalPence`, `discountPence`,
     `deliveryFeePence`, `status`, `createdAt` and its `OrderItem` rows are unchanged from their
     pre-erasure values.

R11. After erasure at vendor A, every `Address` row referenced by those orders still exists and has
     `userId = null`, with `recipientName`, `phone`, `line1`, `city` and `postcode` set to the
     redaction marker, and the two nullable columns `line2` and `notes` set to `NULL`. No original
     personal value remains in any of the seven.
     *(Amended at Build. This read "all seven replaced by redaction placeholders", which would have
     required writing a marker string into columns that can simply hold nothing — storing a value
     where absence is the honest answer. The property that matters, no original value surviving, is
     unchanged; see `build-notes.md`.)*

R12. After erasure at vendor A, the count of `Review`, `Cart`, `CartItem` and `LoyaltyAccount` rows
     for that user at vendor A is `0`.

R13. A Prisma migration in `prisma/migrations/` makes `LoyaltyLedgerEntry.userId` nullable with
     `onDelete: SetNull`, and `prisma migrate diff` reports no drift between
     `prisma/schema.prisma` and the migration history.

R14. After erasure at vendor A, every `LoyaltyLedgerEntry` row that existed for that user at
     vendor A still exists, with `userId = null` and its `orderId`, `kind`, `points`, `tierKey` and
     `multiplierBps` unchanged.

R15. After erasure at vendor A, every `DiscountRedemption` row for that user at vendor A still
     exists with `userId = null`.

R16. After erasure at vendor A, every row belonging to vendor B for that same user — `Order`,
     `Address`, `Review`, `Cart`, `LoyaltyAccount`, `LoyaltyLedgerEntry`, `DiscountRedemption` — is
     unchanged, including the personal fields on vendor B's addresses.

R17. When the user has no remaining non-anonymised data at any other vendor, erasure deletes the
     `User` row and its `Session` and `Account` rows (count `0` for each afterwards).

R18. When the user still has data at vendor B, erasure leaves the `User`, `Session` and `Account`
     rows in place, and the user can still sign in on vendor B's host afterwards.

R19. Erasure is refused, with no rows written, when the submitted password is wrong for an account
     that has a credential `Account` row. (The credential check lives in the Server Action layer,
     not the repository — R2 forbids the repository from calling `getAuth()`.)

R20. Erasure is refused, with no rows written, when the submitted email confirmation does not
     exactly match the account email for an account whose only `Account` rows are OAuth providers.

R21. Erasure is refused, with no rows written, for a user holding any `VendorMembership` row.

## Rectification — Art. 16

R22. An authenticated user can submit a new value for their name from a page under
     `/account`, and `/account` renders the new value on the next request.

R23. The name-change path rejects an empty or whitespace-only submission without writing.

## Surfaces and documents

R24. `app/(storefront)/account/data/page.tsx` exists, is reachable by a link from
     `app/(storefront)/account/page.tsx`, and renders the export control, the erasure form and the
     name-change form.

R25. Any state constant used to seed `useActionState` for these forms is declared in a module that
     does not carry the `"use server"` directive, and every export of each `"use server"` file
     added by this slice is an async function.

R26. `app/(storefront)/privacy/page.tsx` states a retention period for transaction records, states
     that erasure anonymises orders rather than deleting them, and points the reader at the
     in-app export and deletion routes.

R27. `specs/roadmap.md`'s P7 phase line no longer assigns backups and monitoring to P7, and its P8
     line continues to carry them.

R28. `docs/gap-register.md`'s GAP-007 row reads `Fixed` and cites the production CORS application
     recorded on #180.

R29. `npm run kms:validate` exits 0, and `ARTIFACT_INDEX.md` contains an entry for
     `specs/2026-08-18-p7b-data-rights/plan.md`.

## Gates

R30. `CHANGELOG.md` updated (Gate 4).

R31. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
