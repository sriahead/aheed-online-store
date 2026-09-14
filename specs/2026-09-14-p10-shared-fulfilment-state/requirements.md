# P10 Shared Fulfilment State (requirements / acceptance criteria)

Closes **#748**. The fulfilment method (`DELIVERY` | `COLLECTION`) is currently four independent
client `useState` values that no server component can read, so the header, cart drawer, `/cart`
and `/checkout` disagree; and the fee/progress arithmetic is hand-copied into each surface rather
than derived from `lib/cart-rules.ts` and `lib/order-totals.ts`. This slice promotes the method to
one server-readable cookie beside the existing delivery-postcode cookie, and makes every surface
render from one pure function. See `plan.md` for the narrative and the excluded scope.

Throughout: **"the vendor" means the vendor resolved from the request host**, and every amount
comes from `VendorConfig` — no requirement below is satisfied by a literal amount in code.

## The cookie and its accessors

R1. A new module `lib/fulfilment-cookie.ts` exists and exports a cookie-name constant and a pure
    parser that maps an arbitrary string to `"DELIVERY" | "COLLECTION" | null`. The file imports
    neither `next/headers` nor `@/lib/db`, and contains no `"use server"` directive on its own
    first line.

R2. `features/storefront/delivery.ts` exports an async `setFulfilmentMethod` bound to a
    `<form action=...>`, and **every** export of that file is an async function (CLAUDE.md's
    Server Actions rule — a single value export makes every action in the file 500 at runtime).

R2a. The cookie `setFulfilmentMethod` writes carries the same attributes as the delivery-postcode
     cookie it sits beside (`features/storefront/delivery.ts:56-62`): `HttpOnly`, `Secure`,
     `SameSite=Lax`, `Path=/`, a 30-day `Max-Age`, and **no** `Domain` (host-only by design). It
     is `HttpOnly` because no client component needs to read it — every surface that renders from
     it is server-rendered.

R2b. `setFulfilmentMethod` rejects a value that is neither `DELIVERY` nor `COLLECTION` by leaving
     the existing cookie unchanged rather than writing the unrecognised value.

R3. A new module `lib/fulfilment-service.ts` exports a request-scoped accessor returning the
    effective method for the current request, resolved as:
    (a) `"DELIVERY"` unconditionally when the vendor's `offerCollection` is `false`, regardless of
    cookie contents;
    (b) otherwise the parsed cookie value when one is set;
    (c) otherwise **the same default `LocationControl.tsx:18-19` computes today** — `"DELIVERY"`
    when a stored postcode is deliverable, and `"COLLECTION"` when it is not and the vendor offers
    collection. The no-cookie default is deliberately unchanged by this slice; a shopper who has
    never chosen must land where they land now.

R4. `lib/repositories/` gains no new file and no existing file there imports
    `lib/fulfilment-cookie.ts` or `lib/fulfilment-service.ts` — `tests/repository-purity.test.ts`
    and `tests/repository-client-injection.test.ts` both still pass.

## The pure progress function

R5. `lib/cart-rules.ts` exports a single pure function that takes the subtotal in pence, the
    fulfilment method, the vendor's `minimumOrderPence` and the vendor's
    `freeDeliveryThresholdPence`, and returns a discriminated union distinguishing at least:
    (a) the vendor minimum is not yet met, carrying the remaining pence and a 0-100 percent;
    (b) `DELIVERY` with the minimum met and the free-delivery threshold not yet met, carrying the
    remaining pence and a 0-100 percent; (c) `DELIVERY` with free delivery unlocked;
    (d) `COLLECTION` with the minimum met; (e) nothing to display.
    It reads no I/O and imports nothing from `next/*` or `@/lib/db`.

R6. That function returns case (a) whenever the subtotal is below `minimumOrderPence`, for **both**
    `DELIVERY` and `COLLECTION` — the minimum is method-independent, matching the server-side rule
    already enforced at `lib/repositories/orders.ts:273`.

R7. That function never returns a free-delivery case (b or c) when the method is `COLLECTION`.

R8. `lib/cart-rules.ts` exports no function that computes free-delivery progress without taking a
    method — i.e. the previous `deliveryProgress(subtotalPence, thresholdPence)` two-argument
    signature no longer exists, so no caller can reach the method-blind behaviour.

## Rendering — the three shopper surfaces

R9. `components/cart/CartContents.tsx` renders its progress indicator from the R5 function and
    contains no arithmetic over `minimumOrderPence` or `freeDeliveryThresholdPence` of its own.

R10. With the method `COLLECTION`, the cart drawer and `/cart` render text naming Click & Collect
     and do **not** render the strings `FREE Local Delivery` or `Delivery FREE`.

R11. With the method `COLLECTION` and a subtotal below the vendor's minimum, the cart drawer,
     `/cart` and `/checkout` each render the remaining amount needed to reach that minimum,
     formatted through `formatPrice`.

R12. `app/(storefront)/checkout/page.tsx` passes the effective method (R3) as `computeTotals`'
     `method` argument, and passes the resulting totals to `CheckoutSummary`.

R13. `components/checkout/CheckoutSummary.tsx` renders money it is given and derives none: no
     addition or subtraction involving `subtotalPence`, `deliveryFeePence`, `discountPence` or
     `totalPence` appears in the file, and it contains no `window.` access and no `localStorage`
     access. It may still receive the method as a prop — it needs it to label the fee row — so the
     check for this requirement is the absence of *arithmetic*, not the absence of the word
     `COLLECTION`. It renders a discount row whenever `discountPence` is greater than zero.

R14. `components/checkout/CheckoutForm.tsx` derives its method from a prop rather than holding it
     in `useState`, and its Delivery / Click & Collect control invokes `setFulfilmentMethod`.
     Switching method at checkout preserves values already typed into the contact fields.

R15. `components/checkout/CheckoutForm.tsx` contains no `dispatchEvent` of a
     `fulfilment-method-changed` event, and no `fulfilmentMethod` key is written to or read from
     `localStorage` anywhere in the repository. The rest of that file's `localStorage`
     save/restore behaviour is unchanged (it belongs to **#749**).

## The header control

R16. `components/layout/LocationControl.tsx` holds no `useState` for the fulfilment method; the
     method arrives as a prop, and the toggle submits a form bound to `setFulfilmentMethod`, so it
     operates with client JavaScript disabled. Because `Header.tsx` renders this component twice
     (`:233` desktop, `:333` mobile), a consequence of this requirement is that the two instances
     always render the same method — they can no longer hold divergent state.

R17. When a postcode is stored and deliverable, `LocationControl` still exposes a control that
     opens the postcode modal, so the stored postcode can be changed.

R18. Submitting a new postcode while the method is `COLLECTION` leaves the method `COLLECTION` —
     the effect at `LocationControl.tsx:25-41` no longer forces `DELIVERY` on a settled
     transition.

R19. The method selected in the header is the method rendered at `/checkout` after navigating
     there, and the method selected at `/checkout` is the method rendered in the header.

## The drawer

R20. `components/cart/CartContents.tsx`'s checkout control closes the cart drawer at the moment it
     is activated, rather than relying on `CartDrawerShell`'s pathname effect firing after the
     server round-trip completes.

## Tests, changelog and gates

R21. `tests/cart.test.ts` covers the R5 function for, at minimum: below-minimum under `DELIVERY`;
     below-minimum under `COLLECTION`; minimum met and free-delivery threshold not met;
     free-delivery unlocked; `COLLECTION` with the minimum met; and a vendor with a null
     free-delivery threshold. A new test file covers `lib/fulfilment-cookie.ts`'s parser, including
     rejection of an unrecognised value.

R22. `npx vitest run` reports a file and test count at or above the baseline recorded in
     `CLAUDE.md`, and `CLAUDE.md`'s recorded baseline is updated to the count this slice's own
     clean run reports.

R23. `CHANGELOG.md` updated (Gate 4).

R24. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
