# P10 Shared Fulfilment State (build notes)

Closes **#748**. Implementation commit `3790229`, spec commit `cadf5b0`, branch
`feat/p10-shared-fulfilment-state` off `staging` at `b85fc2b`.

## What changed and why

The slice is **subtractive**. It deletes three copies of arithmetic and two copies of state; the
only genuinely new things are a cookie, a pure function and a small React context.

**The cookie and its two halves.** `lib/fulfilment-cookie.ts` holds the cookie name, the parser and
the no-preference default, and imports nothing — it is imported by `CheckoutForm` (a client
component) for its type, so it must not be able to drag `next/headers` or the Prisma client into the
browser bundle. `lib/fulfilment-service.ts` is the request-scoped half and is the only file that
calls `cookies()`. That split is the same one `lib/delivery-cookie.ts` / `features/storefront/
delivery.ts` already uses, and it exists for the reason that file documents: the action module is
`"use server"` and may export only async functions, so a constant cannot live there.

`getFulfilmentMethod()` returns the **effective** method, not the stored one. The vendor check comes
*first*: a vendor with `offerCollection: false` is `DELIVERY` before the cookie is even read, so a
cookie set months ago — or crafted — can never select a method the vendor does not operate. This
mirrors `features/storefront/delivery.ts`'s existing decision to store only the postcode and never
the deliverable verdict: store the preference, derive the consequence per request.

**`fulfilmentProgress` replaces `deliveryProgress`.** The old two-argument signature is **deleted**,
not kept alongside. That was deliberate and is the single most important line in the diff: leaving
it exported would leave the method-blind behaviour reachable, and the defect was never that the old
function was wrong — it was that it was *reachable* from surfaces that needed to know about the
method and the minimum. `npx tsc --noEmit` is what proves no stale caller survives.

The minimum is evaluated first and independently of method, matching the rule `placeOrder` already
enforces at `lib/repositories/orders.ts:273`. Telling a collecting shopper about free delivery
before they can place an order at all would be advertising the wrong next step.

**`LocationControl` stopped being the owner.** It could never have been one: `Header.tsx` renders it
twice (`:242` desktop, `:345` mobile), so its `useState` was two states. The method is now a prop and
the toggle is a real `<form action={setFulfilmentMethod}>`.

**`CheckoutSummary` became a Server Component.** It had been recomputing the fee and total from a
method learned through a `window` CustomEvent, which is why a Click & Collect order rendered
"Delivery FREE". It now renders what the page hands it. The page calls `computeTotals` with the
method — an argument that already existed at `lib/order-totals.ts:73` and simply was not being
supplied.

**The drawer close** is a new client component (`components/cart/CheckoutLink.tsx`) plus a context
(`components/cart/drawer-context.ts`). `CartContents` is a *Server* Component rendered both inside
the drawer and on `/cart`, so it cannot receive `close` as a prop; context is the only direction
that works, and `/cart` gets the `null` default and behaves as a plain link.

## Decisions taken during the build

- **The header toggle binds directly to the server action, not to a client function.** My first pass
  used `<form action={() => submitMethod("COLLECTION")}>`, which type-checks and works — but a
  client-function `action` does **not** submit without JavaScript, so it would have failed R16's
  "operates with client JavaScript disabled" while looking correct. Rebound to
  `<form action={setFulfilmentMethod}>` with the value carried on the submitting button's own
  `name`/`value` pair.
- **The Delivery control is a `<form>` only when a deliverable postcode exists.** With no usable
  postcode it stays a plain `type="button"` that opens the modal, because asking for a postcode is
  more useful than selecting a method the shopper cannot complete. No no-JS behaviour is given up:
  the modal is `<dialog>.showModal()`, which needs JS regardless.
- **The postcode edit affordance is a separate control from the method toggle**, not a re-purposing
  of the Delivery button. Changing where you live is not the same action as changing how you receive
  the order, and conflating them is what produced the original lockout.
- **`setFulfilmentMethod` ignores an unrecognised value rather than clearing the cookie.** A
  cookie-setting action reachable from a plain form is reachable from a crafted one; silently
  discarding a shopper's real choice because someone posted junk is worse than ignoring the post.
- **"FREE" is reserved for delivery actually earned.** A collection order reads "No charge" against a
  "Click & Collect" label. Rendering `£0.00` for free delivery was considered and rejected — it
  loses a real affordance for shoppers who crossed the threshold.
- **`CheckoutForm` keeps no optimistic echo of the method.** Toggling costs a server round-trip. The
  spec's stated fallback if that feels wrong is `useOptimistic` over the same server value, never a
  second copy of the state — see Known-shaky below.

## Deviations from the spec

**None.** R1–R24 were built as written. Two clarifications that are not deviations:

- R13 says `CheckoutSummary` may still receive the method to label its fee row, and it does. The
  requirement is the absence of *arithmetic*, which is what the validation row checks.
- R15 says `CheckoutForm`'s `document.querySelector("form")` calls must be left **unchanged** — they
  are. They belong to **#749**, and `git diff` on that file shows them untouched. The only
  `localStorage` change is `delete details.fulfilmentMethod` in the save payload plus removal of the
  `fulfilmentMethod` branch in the restore loop, both required by R15 itself.

## Known-shaky areas

- **R14 is the one to check first.** Deriving the method from a server prop means toggling at
  checkout re-renders `CheckoutForm` from the server. Uncontrolled inputs should keep their DOM
  values, but that is reasoning, not evidence, and it is the only requirement in this slice whose
  failure mode is data loss for the shopper (a typed-in address disappearing). It needs a real
  browser — `curl` cannot observe DOM value preservation.
- **Context through server-rendered `children`.** `CheckoutLink` consumes a context provided by
  `CartDrawerShell` across a Server Component boundary (`CartContents` sits between them). This is
  the documented React pattern and it type-checks, but it is not exercised by any unit test — the
  fallback if it silently returns `null` is simply the previous behaviour (drawer closes late), so a
  failure here is quiet rather than loud. Verify R20 in a browser, not by reading the code.
- **`getFulfilmentMethod()` has no unit test**, by design — it reads `cookies()` and the vendor, so
  it needs a live request. `lib/fulfilment-cookie.ts` carries the pure coverage. R3's three live
  cases (SriMart ignoring the cookie, Aheed honouring it, and the no-cookie default) are the only
  thing that exercises the reconciliation logic, and the SriMart case is the one that matters most —
  it is the security-shaped half.
- **The no-cookie default is a behaviour-preservation claim.** `defaultFulfilmentMethod` is asserted
  against a literal re-implementation of the old `LocationControl` expression in
  `tests/fulfilment-cookie.test.ts`, over all four input combinations. If that test is ever changed,
  the claim "shoppers who never touched the toggle are unaffected" stops being backed by anything.
- **Pre-existing, unrelated, and will bite the full-suite run:** `tests/postcodes-api.test.ts` makes
  a **real network call** to `api.postcodes.io` with a 3s timeout. It failed one full-suite run here
  with `PostcodeApiError: This operation was aborted` and passed in 907ms alone. This file is
  untouched by this slice. Filed as **#751**. Do not read it as a regression from this work. This is
  distinct from **#538** (`tests/repository-transaction-safety.test.ts`, a load-dependent 5000ms
  timeout), which did not reproduce on either run here.

## Verified at Build (not a substitute for `/validate`)

- `npm run lint`, `npx tsc --noEmit`, `npm run format:check` — all exit 0.
- `npx vitest run` alone — **128 files / 1632 tests**, green. `CLAUDE.md`'s baseline updated from
  `127/1618` in the same commit.
- `npm run kms:check-generated` — both generated artefacts current.
- `npm run kms:assemble:internal` + `next build --webpack` in `kms/site-internal` — **exit 0**, 191
  pages prerendered including this slice's spec. Run before the spec commit; re-run after
  `build-notes.md` lands.
