# P10 — Fulfilment configuration and checkout fixes (requirements / acceptance criteria)

Closes `#750` (delivery slots and Express Collection shipped with no staff configuration and no
seed) and `#749` (checkout Find Address blocked by CSP and writing to the wrong form; vendor logo
upload failing with no diagnosable message), and resolves `#751` (a unit test making a real network
call) as a consequence of R19. Builds on `#401`/`#402`/`#613`, which shipped the models, checkout UI
and capacity logic this slice makes reachable, and copies the shape of `#612`
(`/staff/delivery-areas`), which solved the identical "only the seed can write this" defect for
`VendorDeliveryArea`. See `plan.md` for why the config fields sit on the new page and why Part C
ends in a filed issue rather than a fix.

## Part A — the fulfilment administration surface (#750)

R1. `app/(admin)/staff/fulfilment/page.tsx` exists, calls `requireVendorRole("ADMIN")`, redirects
    to `/login` on status 401, and renders `<PanelRefusal>` on any other refusal — it never returns
    `null` from an auth-conditioned branch.

R2. The page renders three labelled sections in one document: fulfilment settings, weekly slots,
    and express windows.

R3. Submitting the settings form persists all four of `offerDeliverySlots`,
    `expressCollectionEnabled`, `bookingWindowDays` and `slotHoldDurationMinutes` to the current
    vendor's `VendorConfig` row, and the reloaded page renders the persisted values.

R4. Submitting the add-slot form creates one `VendorFulfilmentSlot` row for the current vendor with
    the submitted `method`, `dayOfWeek`, `startTime`, `endTime` and `capacity`; submitting a row's
    remove control deletes exactly that row.

R5. Submitting the add-express-window form creates one `VendorExpressSchedule` row for the current
    vendor with the submitted `dayOfWeek`, `openTime` and `closeTime`; submitting a row's remove
    control deletes exactly that row.

R6. Each of the following inputs, submitted as a crafted POST (a `<select>` cannot produce the
    out-of-range cases from the UI, and the action is a public endpoint that must reject them
    regardless), is rejected with a field-level error message and writes no row:
    a `startTime`/`endTime`/`openTime`/`closeTime` that is not `HH:mm` in 24-hour form; an
    `endTime` less than or equal to its `startTime` (and a `closeTime` less than or equal to its
    `openTime`); a `capacity` that is not an integer of at least 1; a `dayOfWeek` outside 0-6.

R7. Each of `bookingWindowDays` and `slotHoldDurationMinutes` is rejected with a field-level error
    message, leaving the stored value unchanged, when submitted as a non-integer, as less than 1,
    or as greater than 60 and 120 respectively.

R8. Every export of `lib/repositories/fulfilment-slots.ts` takes its Prisma client and `vendorId`
    as explicit parameters, and the file contains no value import of `next/headers`, `@/lib/tenant`,
    `@/lib/auth` or `@/lib/auth-rbac` and no `getPrisma()`/`getPrismaWs()` call expression. The
    request-scoped facade lives in `lib/fulfilment-slots-service.ts`.

R9. Any `updateMany` or `createMany` call introduced by this slice runs through a client obtained
    from `getPrismaWs()`, never `getPrisma()`.

R10. Every write action added by this slice scopes its query by the vendor resolved from the
     request host: submitting a slot or express-window id belonging to a different vendor deletes
     no row and returns an error rather than succeeding.

R11. `features/admin/fulfilment.ts` begins with `"use server"` and exports only `async` functions;
     the `useActionState` seed constant and the parse helpers are exported from a separate plain
     module.

R12. `/staff/fulfilment` appears in both `components/staff/PanelNav.tsx` and the hub cards in
     `app/(admin)/staff/page.tsx`, and `npx vitest run tests/staff-nav-parity.test.ts` exits 0.

R13. `docs/store-admin-guide/admin-tabs-guide.md` contains a section whose heading names
     `` `/staff/fulfilment` `` and whose body carries all seven labelled parts (`**Purpose:**`,
     `**Who can access:**`, `**What you can do:**`, `**Typical workflow:**`,
     `**Important fields and filters:**`, `**Common mistakes and limitations:**`,
     `**What happens after changes are saved:**`), with the `Who can access` value matching the
     page's real `requireVendorRole` arguments, and no `####` heading inside the section.

R14. Every capability sentence in that new guide section names a control that exists on the page —
     no sentence describes an action the page cannot perform.

R15. `prisma/seed.ts` creates, for each seeded vendor, at least one `DELIVERY`
     `VendorFulfilmentSlot` row and sets `offerDeliverySlots` to `true`. For a vendor whose
     `offerCollection` is `true` it additionally creates at least one `COLLECTION` slot row and at
     least one `VendorExpressSchedule` row, and sets `expressCollectionEnabled` to `true`; for a
     vendor whose `offerCollection` is `false` it creates neither and leaves
     `expressCollectionEnabled` at `false`. Running the seed twice in succession leaves the same row
     counts and the same flag values as running it once.

R15a. On `/staff/fulfilment` for a vendor whose `offerCollection` is `false`, the express-window
      and collection-slot controls are either absent or accompanied by a visible explanation that
      they take no effect until collection is enabled — the page never presents a control whose
      effect is unreachable for the vendor viewing it.

R16. With the seeded data in place, a request to `/checkout` as a signed-in customer with items in
     the cart renders the delivery slot picker when the fulfilment method is delivery, and renders
     the express collection option when the method is collection and the current time falls inside
     a seeded express window.

## Part B — the checkout postcode lookup (#749, #751)

R17. `components/checkout/CheckoutForm.tsx` contains no direct call to `lookupPostcode`; the lookup
     is reached through a server action, and `lib/postcodes-api.ts` is imported by that server
     action rather than by any client component.

R18. `next.config`'s `connect-src` directive does not name `api.postcodes.io`, and the live
     `content-security-policy` response header is unchanged by this slice.

R19. The lookup's success path writes `city` and `county` into the address form specifically,
     resolved by an element reference or an id scoped to that form — `document.querySelector("form")`
     appears nowhere in `components/checkout/`.

R20. Submitting a valid UK postcode through the checkout address lookup populates the `city` and
     `county` inputs of the address form; an unrecognised postcode produces the "Invalid postcode"
     message and populates neither.

R21. `tests/postcodes-api.test.ts` makes no network request to `api.postcodes.io`: the test file
     passes with outbound network access unavailable.

## Part C — the vendor logo upload's diagnosability (#749)

R22. `components/staff/VendorLogoUploader.tsx` contains no corrupted template literal, and its
     storage-rejection message includes the numeric HTTP status returned by the PUT.

R23. The uploader's `fetch` to the presigned URL is wrapped so that a thrown network error sets a
     visible error message rather than rejecting unhandled inside `startTransition`.

R24. `scripts/verify-storage-credentials.ts` exists, performs only `HEAD` requests for a key that
     does not exist, and prints one line per environment (`.env`, `secrets/staging.vars`,
     `secrets/production.vars`) reporting that environment's bucket and whether its credentials were
     accepted — writing, overwriting and deleting nothing in any environment. It exits non-zero when
     any environment's credentials are rejected.

R25. A GitHub issue exists recording the rejected R2 credential pair, its confirmed blast radius
     (every `getStorage()` S3 API caller in all three environments), and the rotation steps,
     and is added to Project #2.

## Gates

R26. `CHANGELOG.md` updated (Gate 4).

R27. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
