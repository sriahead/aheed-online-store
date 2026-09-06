# P9.2 — Delivery areas admin & staff navigation reconciliation (requirements / acceptance criteria)

Closes `#612`. A vendor's `VendorDeliveryArea` rows — postcode district prefixes — are written only
by `prisma/seed.ts`, yet `features/checkout/place-order.ts` uses them via `lib/delivery.ts`'s
`isDeliverable()` to refuse an order outright. This slice adds a staff admin page for them, with
validation strict enough that no stored prefix can break the regular expression `lib/delivery.ts`
builds from it, and reconciles the two staff navigation surfaces that currently disagree about what
the admin panel contains. No schema change. Builds on the `brands` repository trio (`#569`) as its
structural template and on `lib/repositories/roles.ts` for its last-one-standing guard.

## Field rules

R1. `lib/delivery-area-form.ts` exists and exports `parsePrefixInput(raw: string)`, returning a
    discriminated result carrying either a normalised prefix or a field error naming the form
    control.

R2. `parsePrefixInput` accepts a one- or two-letter input in any case, with surrounding whitespace,
    and returns the trimmed, upper-cased prefix — `"mk"`, `" Mk "` and `"MK"` all yield `"MK"`.

R3. `parsePrefixInput` returns an error, never a value, for each of: the empty string; a string of
    three or more letters; a string containing a digit; and each of the characters `[`, `(`, `\`,
    `.`, `*`, `+`, `?`, `^`, `$`, `{` and the pipe character, submitted alone and appended to a
    valid letter pair.

R4. `lib/delivery-area-form.ts` contains no import of `@/lib/db`, `@prisma/client`, `next/headers`,
    `@/lib/tenant`, `@/lib/auth` or `@/lib/auth-rbac`.

## Repository layer

R5. `lib/repositories/delivery-areas.ts` exists and exports functions to list, create and remove a
    vendor's delivery areas, each taking a Prisma client as its first parameter and `vendorId` as
    its second, with the remove function identifying its target row by `id`.

R6. `tests/repository-purity.test.ts` and `tests/repository-client-injection.test.ts` both pass with
    `lib/repositories/delivery-areas.ts` present, without either test's coverage being narrowed,
    allowlisted or otherwise modified to accommodate the new file.

R7. The create function returns a typed failure result — not a thrown error — when the prefix
    already exists for that vendor, and detects that condition using `isUniqueViolation` from
    `lib/repositories/prisma-errors.ts`.

R8. The remove function returns a typed failure result, and deletes nothing, when the row identified
    by `id` is the only remaining delivery area for that vendor.

R9. The remove function performs its count check and its delete inside a single
    `prismaWs.$transaction(...)` call whose options set `isolationLevel` to `"Serializable"`.

R10. Every delivery-area query in `lib/repositories/delivery-areas.ts` constrains `vendorId` in its
     `where` clause, so a row belonging to another vendor is not read, not deleted and not counted.

## Service and actions

R11. `lib/delivery-areas-service.ts` exists, is the only file in the slice resolving both a live
     Prisma client and the current vendor, and constructs its Prisma clients on every call rather
     than caching them at module scope.

R12. `features/admin/delivery-areas.ts` begins with the `"use server"` directive and every one of
     its exports is an async function.

R13. Each exported action in `features/admin/delivery-areas.ts` calls `requireVendorRole("ADMIN")`
     itself and returns a refusal result, without performing a write, when that check fails.

R14. The add action passes the submitted value through `parsePrefixInput` and returns that
     function's field error without calling the repository when parsing fails, so no unvalidated
     string reaches the database.

R15. Each exported action that completes a write calls both `revalidatePath("/staff/delivery-areas")`
     and `revalidatePath("/", "layout")` — the second because `components/layout/Header.tsx` renders
     a per-request deliverability badge from these rows and lives in the storefront layout, matching
     what `features/storefront/delivery.ts` already does for the same reason.

## Page

R16. `app/(admin)/staff/delivery-areas/page.tsx` exists, calls `requireVendorRole("ADMIN")`, and its
     refusal branch renders a `PanelRefusal` element — the file contains no `return null;` statement
     in that branch.

R17. The page redirects to `/login` when `requireVendorRole` fails with status 401.

R18. The rendered page lists each of the current vendor's delivery-area prefixes, and renders an add
     form plus one remove control per listed prefix.

## Navigation

R19. `components/staff/PanelNav.tsx`'s admin-tier branch renders links to `/staff/delivery-areas`,
     `/staff/brands`, `/staff/customers` and `/staff/payments`, in addition to every link it
     rendered before this slice.

R20. `app/(admin)/staff/page.tsx` renders hub cards linking to `/staff/delivery-areas`,
     `/staff/bundles`, `/staff/promotions` and `/staff/storefront`, in addition to every card it
     rendered before this slice.

R21. A test asserts that the set of `/staff/*` links in `PanelNav.tsx`'s admin-tier branch and the
     set of `/staff/*` card links in `app/(admin)/staff/page.tsx` are equal, excluding
     `/staff/errors` and `/staff/search-synonyms`, and fails if either surface gains or loses a link
     the other does not have.

R22. `app/(admin)/staff/page.tsx` renders a link to `/staff/errors` only when `auth.via` equals
     `"platform-admin"`, evaluated independently of the page's existing `isAdmin` flag.

## Live behaviour

R23. Under `npm run preview`, signed in as a store admin, submitting a valid new prefix through the
     real add form creates the row, and the storefront header's deliverability badge for a stored
     postcode in that district changes from not-deliverable to deliverable on the next request.

R24. Under `npm run preview`, a checkout attempt carrying a postcode in a district the vendor has no
     prefix for is refused by `features/checkout/place-order.ts`, and the same postcode is accepted
     after that prefix is added through the admin page.

R25. Under `npm run preview`, submitting a prefix that already exists for the vendor re-renders the
     page with a visible field error and returns no HTTP 500.

R26. Under `npm run preview`, submitting a prefix containing a regex metacharacter re-renders the
     page with a visible field error, writes no row, and leaves the header's deliverability badge
     rendering correctly for an already-valid postcode.

R27. Under `npm run preview`, with exactly one delivery area remaining for the vendor, submitting the
     remove control for it re-renders the page with a visible error and the row still present.

R28. Under `npm run preview`, submitting the remove action with the `id` of a delivery area belonging
     to a different vendor removes no row.

R29. Under `npm run preview`, requesting `/staff/delivery-areas` while signed in as a non-staff
     account renders the `PanelRefusal` body rather than a blank content area.

## Repository hygiene

R30. `prisma/schema.prisma` is unchanged by this slice and `prisma/migrations/` gains no new
     directory.

R31. `tests/delivery-area-form.test.ts` exists and covers R2 and R3, and
     `tests/delivery-areas-repository.test.ts` exists and covers the duplicate-prefix and
     last-remaining-area failure results.

R32. `CLAUDE.md`'s recorded vitest baseline count has been updated to the file and test totals a
     clean `npx vitest run` reports on this slice's tree.

R33. `CHANGELOG.md` updated (Gate 4).

R34. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
