# Shop-list lines the cart notice never names, and header controls with doubled names (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
> 
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Every feature should have appropriate **Unit** and **Integration** testing, followed by relevant validation testing. Broader testing mainly happens before release. However, testing is risk-based: features involving auth, payments, UI changes, performance-sensitive APIs, databases, or external dependencies require additional relevant testing earlier.

1. **Unit Testing**
   - *When needed:* Every feature.
   - *Purpose:* Test isolated business logic, utilities, and components.
2. **Integration Testing**
   - *When needed:* Every feature. (Includes Contract testing).
   - *Purpose:* Verify the component works with its immediate dependencies (e.g., database, external services).
3. **System / End-to-End Testing**
   - *When needed:* For critical user journeys and validation testing.
   - *Purpose:* Validate that the feature works correctly in the real system.
4. **Regression & Acceptance Testing**
   - *When needed:* Mainly before release, or when changing core flows. (Includes Smoke and Sanity testing).
   - *Purpose:* Ensure existing functionality remains unbroken and acceptance criteria are met.
5. **Performance & Resilience Testing**
   - *When needed:* Mainly before release, or for performance-sensitive APIs. (Includes Load, Stress, and Spike testing).
   - *Purpose:* Ensure the system meets throughput/latency targets and degrades gracefully.
6. **Security & Accessibility Testing**
   - *When needed:* Mainly before release, or earlier for features involving auth, payments, or UI changes.
   - *Purpose:* Ensure the system is safe and accessible to all users.

---

## Preconditions — read before running any row

**P1. Kill stray processes first.** Stopping a previous `npm run preview` does not stop it. Kill
every `node`/`workerd` process still holding the port, or the next build fails with `EBUSY` and the
new server silently takes `:8788`. Confirm the server is on `:8787` before trusting any live row.

**P2. Use `npm run preview`, never `npm run dev`.** The shop-list submit writes a cart through
Prisma; `next dev` cannot load the WASM engine and renders an error state that looks like a feature
failure.

**P3. Run `npx vitest run` on its own**, never beside or straight after a build — its forks pool
silently fails to start workers and whole files never execute, sometimes still exiting 0. Check the
reported file count, not just the exit code.

**P4. An out-of-stock product for R10-E2E.** The seed does not guarantee one. Sign in locally as an
ADMIN (`docs/developer-portal/env-setup.md`, "Demo accounts"), open `/staff/products`, set one
Aheed product's stock to `0`, and write down its exact name and original stock. **Restore the
original stock when the row is done.** Pick a product whose full name is distinctive enough that
`/shop-your-list` matches it outright; if the review screen shows "Which one did you mean?" for it,
pick another product — that line is ambiguous, not matched, and does not test R10.

**P5. Browser rows use the connected Chrome extension** against `http://localhost:8787` (Aheed). If
Aheed's header shows no Click & Collect toggle, collection is off locally: sign in as ADMIN and
enable it on `/staff/fulfilment` before R16.

**P6. "Unchanged" rows diff against the branch point**, `$(git merge-base origin/staging HEAD)`,
not against a moving `origin/staging`.

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1 | Unit | `npx vitest run tests/shop-list-review-copy.test.tsx` exits 0, with a case rendering `ListReview` with one matched-in-stock, one ambiguous, one matched-out-of-stock and one unmatched line, asserting `document.querySelectorAll('[name="productId"]')`, `input[name="quantity"]`, `input[name="lineLabel"]` and `input[name="lineStatus"]` each have length **4**. The `#1088` assertion that these counts are 2 must be gone — a test still asserting 2 fails this row. |
| R2 | Unit | Same file, same four-line render: the `lineStatus` values in DOM order are exactly `["ready", "choose", "unavailable", "unmatched"]`; the `lineLabel` values are `[<in-stock line's original>, <ambiguous line's original>, <out-of-stock line's product.name>, <unmatched line's original>]`; the hidden `productId` inputs for the out-of-stock and unmatched lines have value `""`; the `quantity` values equal each line's `quantity`. Additionally `new FormData(<the rendered form>)` returns length 4 from `getAll` on each of the four names. |
| R3 | Unit | Same file: render one ambiguous line, read its `lineStatus` and `lineLabel` values, `fireEvent.change` the combobox to a candidate id, and assert both inputs still exist with the same values. |
| R4 | Unit | Same file: the existing `#1077 R15` and `#1088 R10` cases pass, and `git diff $(git merge-base origin/staging HEAD) -- tests/shop-list-review-copy.test.tsx` shows no change inside those two `describe` blocks. And `git diff $(git merge-base origin/staging HEAD) -- components/cart/ListReview.tsx` adds only `<input type="hidden" …>` elements and comments — no changed visible text, `className` or `disabled` expression. |
| R5 | Unit | `npx vitest run tests/add-list-to-cart.test.ts` exits 0, with `redirect`, `@/lib/cart-service` and `@/lib/cart-identity` mocked as in the existing cases, and a case submitting `productId=["p-1","","",""]`, `quantity=["1","2","3","4"]`, `lineLabel=["Milk","Oat drink","Ghost item","Thing"]`, `lineStatus=["ready","unavailable","unmatched","pigeon"]` with `addItems` returning `p-1` as `added`: the decoded redirect URL contains `u~0~2~Oat drink`, `m~0~3~Ghost item` and `s~0~4~Thing`, and `of=4`. A second case with **no** `lineStatus` field at all and one empty `productId` yields an `s` entry (version skew). |
| R6 | Unit | Same file: submitting `productId=["p-1"]`, `quantity=["2"]`, `lineLabel=["Milk"]`, `lineStatus=["unavailable"]` calls `addItems` with exactly `[{ productId: "p-1", quantity: 2 }]`, and with `addItems` returning it as `added` the redirect is exactly `/cart`. |
| R7 | Unit | `npx vitest run tests/restore-notice.test.tsx` exits 0, with cases asserting: `buildRestoreNoticeUrl("list", [{ name: "Ghost item", requested: 3, added: 0, kind: "unmatched" }])` decodes to contain `m~0~3~Ghost item`; `parseRestoreNotice({ restored: "list", of: "3", lines: "m~0~3~Ghost item" })` returns one entry `{ kind: "m", added: 0, requested: 3, name: "Ghost item" }`; and `parseRestoreNotice` returns `null` for `lines: "m~1~3~Ghost item"` and for `lines: "m~0~0~Ghost item"`. Then `grep -n "BulkAddKind =" lib/cart-rules.ts` prints exactly the four members `"added" \| "partial" \| "unavailable" \| "at_limit"`, and `npm run typecheck` exits 0. |
| R8 | Unit | Same file: `restoredLines([{ productId: null, productName: "A", quantity: 1, kind: "unmatched" }, { productId: null, productName: "B", quantity: 1 }], stub, "skipped")` returns kind `unmatched` for A and `skipped` for B. The existing `#957` case ("reports deleted ones as unavailable") and the `#1088 R11a` default-stays-`unavailable` case pass unmodified. `git diff $(git merge-base origin/staging HEAD) -- features/orders/reorder-items.ts features/checkout/cancel-order.ts` prints nothing. |
| R9 | Unit | Same file: a `"list"` notice with one `m` entry named `Ghost item` renders exactly `Ghost item: not added, no match in this shop`. `git diff $(git merge-base origin/staging HEAD) -- components/cart/RestoreNotice.tsx` shows only an added `case "m"` (and comments) — no existing string changed. |
| R10 | E2E | Under `npm run preview` with P4 done, in Chrome on `http://localhost:8787/shop-your-list`, enter three lines: the full name of an in-stock product whose review row shows a single match, the P4 product's full name, and `zzqx flurb`. The review shows the first as matched, the second as `<name> — unavailable, not added`, the third as `No match in this shop`; the button reads `Add 1 item to cart`. Submit. **Pass:** `/cart` shows `2 of 3 items from your list couldn't be added in full:`, then `<P4 product name>: not available right now` and `zzqx flurb: not added, no match in this shop`, and the in-stock product is in the cart. A notice with one entry or none fails this row — that is the `#1090` defect. Restore P4's stock afterwards. |
| R11 | Regression | `tests/add-list-to-cart.test.ts`'s pre-existing `#1088` cases (R13 skipped + resolved, R13 clamp, R14 exactly `/cart`, R14 blank-label fallback, no guest token when nothing to add, guest token on a real add, unusable quantity dropped) all pass. `git diff $(git merge-base origin/staging HEAD) -- tests/add-list-to-cart.test.ts` shows only **added** cases — no existing case's `FormData` or expected URL/entry is edited. |
| R12 | Unit | `npx vitest run tests/location-control.test.tsx` exits 0, with cases asserting `getByRole("button", { name: <exact string> })` (exact match, not a substring regex) finds one button for each of: `Click & Collect` (`offerCollection`, `postcode={null}`); `Delivery · MK9 1AA` (`offerCollection`, `postcode="MK9 1AA"`, `deliverable`); `Delivery` (`offerCollection`, `postcode={null}`); `Delivery · MK9 1AA` (`offerCollection={false}`, `postcode="MK9 1AA"`, `deliverable`); `Check delivery availability` (`offerCollection={false}`, `postcode={null}`). |
| R13 | Unit | Same file: for each R12 button, a case asserts its accessible name includes its narrow span's text — `Collect`; `MK9 1AA`; `Delivery`; `Delivery · MK9 1AA`; `Check delivery`. |
| R14 | Integration | `git diff $(git merge-base origin/staging HEAD) -- components/layout/LocationControl.tsx`: every removed line touching a `<span>` or `<button>` is matched by an added line with the same `className` and text, differing only by an added `aria-hidden` or `aria-label`. The one permitted exception is the Delivery affordance, where the `hidden sm:inline` / `sm:hidden` pair of `Delivery` spans becomes a single `<span>Delivery</span>`. No `className`, `title`, `type`, `name` or `value` attribute on a `<button>` changes. |
| R15 | Unit | `grep -n "deliveryAffordance\|DeliveryDelivery" tests/location-control.test.tsx` prints nothing, and `grep -c 'getByRole("button"' tests/location-control.test.tsx` prints at least 5. |
| R16 | E2E | Under `npm run preview` with P5 done, in Chrome on `http://localhost:8787/`: resize to 375×800, set deliverable postcode `MK9 1AA` via the Delivery control, then read the header's accessibility tree with the extension's `read_page` (or DevTools → Accessibility pane). **Pass:** the Collect toggle's name is `Click & Collect` and the Delivery toggle's is `Delivery · MK9 1AA`. Resize to 1280×800 and read again: the same two names. A name of `Collect`, `MK9 1AA`, or any doubled string fails. Also confirm visually that at 375px the toggle shows `Collect` and `MK9 1AA`, and at 1280px `Click & Collect` and `Delivery · MK9 1AA` (visuals unchanged). |
| R17 | Unit | `npx vitest run tests/vendor-neutral-copy.test.ts` exits 0; then read the strings this slice adds (`not added, no match in this shop`, the four `lineStatus` values, the `aria-label`s) and confirm none names a vendor or a product category — the guard test does not catch new vendor-specific copy, so the reading is part of this row. |
| R18 | Integration | `git diff --stat $(git merge-base origin/staging HEAD) -- prisma/ package.json package-lock.json` prints no rows. |
| R19 | Unit | `grep -nE "^export" features/cart/add-list-to-cart.ts` prints only lines beginning `export async function`. The violation is invisible to `build`/`typecheck`/`test`, so this grep is the check. |
| R20 | Regression | `git diff $(git merge-base origin/staging HEAD) -- CHANGELOG.md` shows an entry naming `#1090` and `#1091`. |
| R21 | Regression | `npm run lint`, `npm run typecheck`, `npm run format:check` exit 0; `npx vitest run` exits 0 run alone (P3). `npm run kms:validate` and `npm run kms:check-generated` exit 0 with this slice's `plan.md` in `ARTIFACT_INDEX.md`; `npm run kms:assemble:internal` followed by a real Next build in `kms/site-internal` exits 0 (`gates` never builds the docs site). |
| R21 | Regression | CI is ground truth: the PR's `docs-gates`, `quality / kms` and `quality / quality` checks all pass. |
