# P10 Shared Fulfilment State (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Every feature should have appropriate **Unit** and **Integration** testing, followed by relevant validation testing. Broader testing mainly happens before release. However, testing is risk-based: features involving auth, payments, UI changes, performance-sensitive APIs, databases, or external dependencies require additional relevant testing earlier.

1. **Unit Testing** — *Every feature.* Isolated business logic, utilities, components.
2. **Integration Testing** — *Every feature.* The component against its immediate dependencies.
3. **System / End-to-End Testing** — *Critical user journeys.* The feature in the real system.
4. **Regression & Acceptance Testing** — *Before release / core-flow changes.*
5. **Performance & Resilience Testing** — *Before release / performance-sensitive APIs.*
6. **Security & Accessibility Testing** — *Before release, earlier for auth, payments or UI.*

---

## Before you start

These four setup facts are load-bearing. Getting any of them wrong produces a confidently wrong
result rather than an obvious failure.

1. **Use `npm run preview`, never `npm run dev`.** Every live row below touches Prisma. Plain
   `next dev` runs in real Node, which cannot load `@prisma/client/wasm`, and a DB-touching route
   silently renders an error state with no crash (CLAUDE.md, Database).
2. **Do not assume the local `Host` header values.** Query the database `npm run preview` is
   actually connected to before writing any `curl -H "Host: ..."`:
   ```
   npx tsx -e "…"   # NO — see CLAUDE.md's Windows section; write a real .ts file instead
   ```
   Write a short script under `scripts/` that runs `prisma.vendorDomain.findMany({ select: { host: true, vendorId: true } })`
   against the same `DATABASE_URL`, read the real hosts, and use **those**. A dev database seeded
   as `localhost:8787` / `srimart.localhost` will silently redirect the documented
   `*.nocaped.com` hostnames to `/coming-soon`. Delete the script afterwards.
3. **Two vendors matter here.** Aheed has `offerCollection: true`; SriMart has
   `offerCollection: false`. R3 and R10 are only meaningful when checked against both.
4. **Grep the HTML-escaped form.** React renders `Click & Collect` as `Click &amp; Collect`. A row
   below that greps for the literal `&` will false-negative on a page that is perfectly correct
   (CLAUDE.md's escaping trap). Every string check below is already written escaped where needed.
5. **Exclude the generated KMS bundle from repo-wide greps.** `app/(admin)/staff/runbook/docs.ts`
   embeds the full body of every spec, including this one, so it matches phrases this document
   merely discusses. Every repo-wide grep below carries `| grep -v "runbook/docs.ts"`.

**Getting items into a cart without a browser.** A client component calls `addToCart` directly, so
it ships as a `Next-Action` POST, not a form (CLAUDE.md's live-testing section):

```
curl -c jar.txt -s "$BASE/" -o /dev/null
# read a product id from the DB, then:
curl -b jar.txt -c jar.txt -X POST "$BASE/products/<slug>" \
  -H "Next-Action: <id from .next/server/server-reference-manifest.json>" \
  -H "Content-Type: text/plain;charset=UTF-8" --data-raw '["<productId>", 1]'
```

Reuse `jar.txt` for every live row so the guest cart and the fulfilment cookie persist.

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `grep -nE "next/headers\|@/lib/db" lib/fulfilment-cookie.ts` prints nothing, and `sed -n 1p lib/fulfilment-cookie.ts` is not `"use server"`. Confirm the exported parser name and constant name are both present with `grep -n "^export" lib/fulfilment-cookie.ts`. |
| R2  | Unit | `grep -n "^export" features/storefront/delivery.ts` — **every** printed line must begin `export async function`. One line matching `export const`/`export type`/`export {` fails this row outright (a single value export makes every action in the file 500 at runtime). Confirm `setFulfilmentMethod` is among them. |
| R2a | E2E | Under `npm run preview`, POST the toggle and read the response's `Set-Cookie` header directly: `curl -b jar.txt -s -D - -o /dev/null -X POST ...` then inspect the line naming the fulfilment cookie. It must contain `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age=2592000`, and **no** `Domain=`. Compare against the `delivery-postcode` line in the same response set. |
| R2b | E2E | POST `setFulfilmentMethod` with a junk value (e.g. `PIGEON`) while the cookie holds `COLLECTION`, then fetch `/checkout`: the method is still `COLLECTION`, and the response set no new fulfilment cookie. |
| R3  | E2E | Three cases. **(a)** Against **SriMart's** real host (`offerCollection: false`), POST `setFulfilmentMethod` with `COLLECTION`, then fetch `/checkout`: it must still render the delivery path — `grep -c 'type="radio" name="fulfilmentMethod"' srimart-checkout.html` prints `0` and the hidden `value="DELIVERY"` input is present. A vendor that does not offer collection must ignore the cookie entirely. **(b)** Against **Aheed's** host, POST `COLLECTION` then fetch `/checkout` and confirm the collection radio renders `checked`. **(c)** With **no** fulfilment cookie in the jar (`rm jar.txt` and re-fetch), confirm the default still matches today's behaviour: with a deliverable postcode stored the method is `DELIVERY`; with no postcode stored and Aheed offering collection it is `COLLECTION`. This row fails if the no-cookie default changed. |
| R4  | Unit | `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts` exits 0. Separately, `git status --porcelain lib/repositories/` shows no added file. |
| R5  | Unit | `npx vitest run tests/cart.test.ts` exits 0 with the new cases present. `grep -nE "next/|@/lib/db" lib/cart-rules.ts` prints nothing. |
| R6  | Unit | In `tests/cart.test.ts`, two assertions with identical subtotal and minimum — one `DELIVERY`, one `COLLECTION` — both return the below-minimum case. Both pass under `npx vitest run tests/cart.test.ts`. |
| R7  | Unit | In `tests/cart.test.ts`, a `COLLECTION` call with a subtotal above the free-delivery threshold returns the collection case, not an unlocked-free-delivery case. Passes under the same command. |
| R8  | Unit | `grep -n "deliveryProgress" -r lib/ components/ app/ tests/ \| grep -v "runbook/docs.ts"` — no call site passes exactly two arguments. Simplest unambiguous form: the identifier `deliveryProgress` no longer appears at all, or appears only with the new signature. `npx tsc --noEmit` exits 0, which is what proves no stale two-argument caller survives. |
| R9  | Unit | `grep -nE "minimumOrderPence\|freeDeliveryThresholdPence" components/cart/CartContents.tsx` shows them only being passed into the R5 function — no `-`, `<`, `>=` or `Math.` operating on either in that file. |
| R10 | E2E | With items in `jar.txt`'s cart and the method set to `COLLECTION`, `curl -b jar.txt -s "$BASE/cart" -o cart-collect.html`. Then `grep -c "FREE Local Delivery" cart-collect.html` prints `0`, `grep -c "Delivery FREE" cart-collect.html` prints `0`, and `grep -c "Click &amp; Collect" cart-collect.html` prints a non-zero count. Note the escaped `&amp;` — grepping `Click & Collect` matches nothing even when correct. |
| R11 | E2E | Set the cart subtotal below Aheed's `minimumOrderPence` (read the live value first — it is £15.00 on staging, but read it, do not assume). With the method `COLLECTION`, fetch `/cart` and `/checkout` and confirm each renders the shortfall as a `£` amount. Re-check the drawer by fetching any storefront page and scoping the grep to the drawer region, e.g. `grep -oE 'bg-action-tint.{0,400}' home.html` — inspect **that extract**, not the whole page, since the header legitimately carries other `£` figures. |
| R12 | Unit | `grep -n "computeTotals" "app/(storefront)/checkout/page.tsx"` shows the call passing a method argument (four arguments, or an explicitly named method). `npx tsc --noEmit` exits 0. |
| R13 | Unit | `grep -nE "window\.\|localStorage" components/checkout/CheckoutSummary.tsx` prints nothing. Then `grep -nE "(subtotalPence\|deliveryFeePence\|discountPence\|totalPence)[^,)]*[-+]\|[-+][^,(]*(subtotalPence\|deliveryFeePence\|discountPence\|totalPence)" components/checkout/CheckoutSummary.tsx` prints nothing — the file renders money, it does not compute it. **Do not** grep for the word `COLLECTION` here: the component legitimately receives the method to label its fee row, so that pattern matches a correct implementation (this is the CLAUDE.md trap where a check cannot tell right from wrong). Finally `grep -n "discountPence" components/checkout/CheckoutSummary.tsx` shows a rendered row guarded on `> 0`. |
| R14 | E2E, Manual | Requires a real browser — this row checks DOM value preservation, which `curl` cannot observe. Under `npm run preview`, open `/checkout` with a cart, type a name and a phone number, then switch Delivery → Click & Collect. Both typed values must still be present after the summary updates. Also confirm `grep -n "useState" components/checkout/CheckoutForm.tsx` shows no state holding the method. |
| R15 | Unit | `grep -rn "fulfilment-method-changed" --include=*.ts --include=*.tsx . \| grep -v node_modules \| grep -v "runbook/docs.ts"` prints nothing. `grep -rn "fulfilmentMethod" --include=*.tsx components/checkout/CheckoutForm.tsx` shows no `localStorage` interaction on that key. `git diff` on `CheckoutForm.tsx` shows the `document.querySelector("form")` calls at the old `:68`/`:106` **unchanged** — they belong to #749 and must not be touched here. |
| R16 | Unit, E2E | `grep -n "useState" components/layout/LocationControl.tsx` shows no method state. `grep -n "setFulfilmentMethod" components/layout/LocationControl.tsx` shows a `<form action=...>` binding. Live: fetch any storefront page and confirm the toggle renders inside a real `<form>` element, so it works with JS disabled. Because the component is rendered twice, also confirm both instances agree — count the rendered "selected" markers for the active method and check the desktop and mobile blocks match rather than grepping the page for a single occurrence (a whole-page count cannot distinguish "both agree" from "one is wrong"). |
| R17 | E2E | With a deliverable postcode already stored in `jar.txt`, fetch a storefront page and confirm a control that opens the postcode modal is still rendered — e.g. the `<dialog>` and its opener are both present, and the opener is not gated away. Then in a browser: with a stored deliverable postcode, click the postcode control and confirm the modal opens. |
| R18 | E2E | In a browser under `npm run preview`: select Click & Collect, open the postcode modal, submit a **different** valid deliverable postcode, and confirm the method is still Click & Collect once the transition settles. This is the exact regression `LocationControl.tsx:25-41` caused; a passing R18 means the forced `DELIVERY` is gone. |
| R19 | E2E | Set the method to `COLLECTION` via the header, then `curl -b jar.txt -s "$BASE/checkout"` and confirm the collection radio is `checked`. Then POST `setFulfilmentMethod` with `DELIVERY` from `/checkout`, fetch any storefront page, and confirm the header renders the delivery state. Both directions must hold. |
| R20 | Unit, Manual | `grep -n "Proceed to checkout" -A4 -B12 components/cart/CheckoutLink.tsx` shows the control invoking a close on activation rather than being a bare `<Link>`. **Corrected at `/validate`**: the original row pointed at `components/cart/CartContents.tsx`, but the control was factored out into its own `CheckoutLink.tsx` component during the build (`CartContents` just renders `<CheckoutLink />`), so the original command matched nothing even though the requirement is met. In a browser: open the drawer, click Proceed to checkout, and confirm the drawer disappears immediately rather than after the checkout page finishes loading. |
| R21 | Unit | `npx vitest run tests/cart.test.ts` and the new fulfilment-cookie test file both exit 0, and the cookie parser test includes a case asserting an unrecognised string maps to `null`. |
| R22 | Regression | Run `npx vitest run` **alone**, with no other build running, and redirect to a file rather than piping to `head` (a closed pipe can kill the writer before it finishes). The `Test Files` / `Tests` line must be at or above `CLAUDE.md`'s recorded baseline. A shortfall — or `Failed to start forks worker` — is a non-result to re-run, not a pass. Update `CLAUDE.md`'s baseline to this run's figures. |
| R23 | Regression | `git diff origin/staging -- CHANGELOG.md` is non-empty and names this slice. |
| R24 | Regression | `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run format:check` each exit 0. CI on Linux is the authority; a local-only pass is not sufficient. |

## Known flake, not a failure

`tests/repository-transaction-safety.test.ts` times out at 5000ms under full-suite load and passes
in under 3s alone (**#538**). If it fails during R22 or R24, re-run that file by itself before
treating it as a real failure.
