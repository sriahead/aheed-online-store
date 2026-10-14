# Shopper clarity: delivery intent, skipped shop-list lines, privacy copy (validation)

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
every `node`/`workerd` process still holding the port, or the next build fails with `EBUSY` **and**
the new server silently takes `:8788`, where Better Auth is not trusted. Confirm the server is on
`:8787` before trusting any live row.

**P2. Use `npm run preview`, never `npm run dev`.** `next dev` cannot load the WASM Prisma engine
and renders an error state that looks like a feature failure. Rows marked E2E assume
`npm run preview` is running.

**P3. Local hosts.** Aheed is `http://localhost:8787`; SriMart is `http://srimart.localhost:8787`
and resolves in Chrome but not reliably for `curl`/Node on Windows — for a non-browser request to
SriMart use `127.0.0.1:8787` with a literal `Host: srimart.localhost:8787` header, **including the
port**.

**P4. Postcodes to use.** `prisma/seed.ts:497` gives Aheed `deliveryPrefixes: ["MK"]` and
`:1553` gives SriMart `["RG"]`. So against Aheed, **`MK9 1AA` is deliverable** and **`RG1 1AA` is
not**. Deliverability is computed from vendor configuration alone, so it does not depend on the
reference database being reachable.

**P5. `offerCollection` is NOT seeded.** `prisma/seed.ts:309,323-325` reads it rather than writing
it, so a freshly seeded local Aheed may have collection **off** — in which case
`LocationControl` renders the single-button branch, there is no Click & Collect toggle, and the
`#1087` defect path (a pre-existing `COLLECTION` cookie) cannot be reproduced at all. Before rows
R3-E2E and R5-E2E, confirm the Click & Collect toggle is present in the storefront header; if it is
not, sign in as a local ADMIN and enable collection on `/staff/fulfilment`, then re-check.

**P6. This control is not curl-drivable — this is already documented, do not re-derive it.**
`LocationControl` calls `setDeliveryPostcode(formData)` from inside a client
`action={(formData) => startTransition(...)}` closure, so it renders neither the
`$ACTION_ID_<hash>` progressive-enhancement field nor the `useActionState` four-field shape, and a
`Next-Action` header with a multipart body returns an opaque `500` with only a digest
(`docs/developer-portal/local-dev-playbook.md`, hit at `#613`'s `/validate`). **Use the connected
Chrome extension for the two E2E rows that submit this form.** Reading the rendered header with
hand-set cookies (row R8-E2E) needs no browser and stays a `curl` check.

**P7. Run `npx vitest run` on its own.** Beside or straight after a build, its forks pool silently
fails to start workers and whole files never execute, sometimes still exiting 0.

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1 | Unit | `npx vitest run tests/delivery-postcode-intent.test.ts` exits 0, with a case asserting `parsePostcodeIntent` returns `"delivery"` for `"delivery"` and `"edit"` for each of `null`, `undefined`, `""`, `"DELIVERY"`, `"Delivery"`, `"edit"` and `"pigeon"`, and a case asserting `POSTCODE_INTENT_FIELD === "intent"`. |
| R2 | Unit | `grep -nE "^export" features/storefront/delivery.ts` prints only lines beginning `export async function`. Any other `export` line fails this row — the violation is invisible to `build`, `typecheck` and `test`, so this grep is the only check. |
| R3 | Unit | In `tests/delivery-postcode-intent.test.ts`, with `next/headers`, `next/cache`, `@/lib/delivery-refusals-service` and `@/lib/delivery-eligibility-service` mocked (`isPostcodeDeliverable` → `true`): calling `setDeliveryPostcode` with `intent=delivery`, `postcode=MK9 1AA` calls the jar's `set` for `fulfilment-method` with value `"DELIVERY"` and options exactly `{ httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 2592000 }`. |
| R3 | E2E | Under `npm run preview`, in the connected Chrome extension on `http://localhost:8787`: click **Click & Collect** (so the method cookie holds `COLLECTION`), then click **Delivery**, enter `MK9 1AA`, submit. **Expected: the Delivery control is the selected one after the page settles, and shows `MK9 1AA`.** Before this slice the control stayed on Click & Collect — that is the defect being closed, so a validator seeing Click & Collect still selected must fail this row. |
| R4 | Unit | Same file, `isPostcodeDeliverable` → `false`: calling `setDeliveryPostcode` with `intent=delivery`, `postcode=RG1 1AA` produces **no** `set` call whose first argument is `fulfilment-method` (the postcode cookie is still written). |
| R5 | Unit | Same file: with `isPostcodeDeliverable` → `true`, calling `setDeliveryPostcode` with `intent=edit` and with a form carrying **no** `intent` field both produce no `fulfilment-method` `set` call. |
| R5 | E2E | Continuing R3-E2E's browser session (method now `DELIVERY`, postcode `MK9 1AA`): click **Click & Collect**, then click the **pencil**, enter `MK9 1AA` again and submit. **Expected: Click & Collect is still the selected method afterwards.** This is the `#748` regression guard — if Delivery becomes selected, the fix is not intent-scoped and this row fails. |
| R6 | Unit | Same file: submitting an empty `postcode` calls the jar's `delete` for `delivery-postcode` and produces no `fulfilment-method` `set` call, for `intent=delivery` and for `intent=edit`. |
| R7 | Unit | `npx vitest run tests/location-control.test.tsx` exits 0. It mocks `@/features/storefront/delivery` (so the `"use server"` module is never imported into jsdom) and renders `LocationControl`. Opening the modal from the Delivery button, and from the single no-collection button, each yields a hidden input named `intent` with value `delivery`; opening it from the pencil yields value `edit`. jsdom 29 implements `HTMLDialogElement.showModal`, so the clicks work as written; if a future jsdom regresses it, stub `HTMLDialogElement.prototype.showModal` with a no-op — the hidden input is in the DOM whether or not the dialog is open. |
| R7a | Integration | `grep -n "intent" docs/developer-portal/app-conventions.md` finds the new rule naming `#748`, and `grep -n "deliberately no longer touches the fulfilment method" components/layout/LocationControl.tsx` finds **nothing** — the comment stating the superseded absolute form has been rewritten rather than left beside the new behaviour. |
| R8 | Unit | Same file: rendered with `method="COLLECTION"`, `postcode="MK9 1AA"`, `deliverable={true}`, `offerCollection={true}`, the Delivery control's accessible text contains `MK9 1AA`. |
| R8 | E2E | `curl -s -b "fulfilment-method=COLLECTION; delivery-postcode=MK9 1AA" http://localhost:8787/ \| grep -c "MK9 1AA"` prints a number greater than 0. Grep for the postcode as plain bytes; do not use a quoted-JSON regex against the flight payload, which is backslash-escaped and silently matches nothing. |
| R9 | Unit | `npx vitest run tests/shop-list-review-copy.test.tsx` exits 0, with a case rendering one matched-in-stock line, one ambiguous line, one out-of-stock matched line and one unmatched line, asserting `document.querySelectorAll('input[name="lineLabel"]').length === 2` and that the three arrays `lineLabel`, `productId`, `quantity` have equal length with `lineLabel` values equal to the two lines' `original` text in render order. |
| R10 | Unit | Same file: with one unresolved ambiguous line present the exact text `1 line will be skipped unless you choose an item` is in the document; after `fireEvent.change` selects a candidate on that line the text is absent; with two unresolved ambiguous lines the text is `2 lines will be skipped unless you choose an item`. |
| R11 | Unit | `npx vitest run tests/restore-notice.test.tsx` exits 0, with cases asserting `buildRestoreNoticeUrl("list", …)` produces a URL containing `restored=list`; `parseRestoreNotice({ restored: "list", of: "3", lines: "s~0~2~Apple juice" })` returns a notice whose single entry is `{ kind: "s", added: 0, requested: 2, name: "Apple juice" }`; and `parseRestoreNotice` returns `null` for an `"s"` entry with a non-zero `added`. |
| R11a | Unit | `grep -n "BulkAddKind" lib/cart-rules.ts` still prints the original four-member union `"added" \| "partial" \| "unavailable" \| "at_limit"` with no `"skipped"` member, and `grep -n "skipped" lib/restore-notice.ts` shows the kind declared there instead. `npm run typecheck` exits 0 (it is what would catch an exhaustive switch elsewhere losing a case). |
| R12 | Unit | Same file: a `"list"`-source notice with one `"s"` entry renders the exact strings `1 of 3 items from your list couldn't be added in full:` and `Apple juice: not added, no product chosen`. A `"reorder"` notice with one `"u"` entry still renders `1 of 3 items from your past order couldn't be added in full:` and `<name>: not available right now`, byte-identical to before this slice. |
| R13 | Unit | `npx vitest run tests/add-list-to-cart.test.ts` exits 0. With `next/navigation`'s `redirect`, `@/lib/cart-service` and `@/lib/cart-identity` mocked, a `FormData` carrying `productId=["p-1", ""]`, `quantity=["2", "3"]`, `lineLabel=["Milk", "Apple juice"]`, and `addItems` stubbed to return `[{ productId: "p-1", requested: 2, added: 2, kind: "added" }]`, calls `redirect` once with a URL containing `restored=list`, `of=2`, and the entry `s~0~3~Apple juice` — and calls `addItems` with only the `p-1` line. |
| R13 | Unit | Same file, the clamp case: with the same form and `addItems` stubbed to return `[{ productId: "p-1", requested: 2, added: 1, kind: "partial" }]`, the redirect URL carries **two** entries — `p~1~2~Milk` and `s~0~3~Apple juice` — proving the result this action used to discard is now reported. |
| R14 | Unit | Same file: a `FormData` whose every `productId` is non-empty, with `addItems` returning every line as `kind: "added"`, calls `redirect` with exactly `/cart` (no `?`); and a `FormData` with an empty `productId` whose aligned `lineLabel` is absent or blank still calls `redirect` with a URL containing an `"s"` entry whose name is `An item from your list`. |
| R15 | Unit | `npx vitest run tests/privacy-cookies-section.test.tsx` exits 0, asserting the cookies list contains zero `code` elements (`container.querySelectorAll("code").length === 0` within that section) and that each of the seven list items' text **starts with** its purpose string from `requirements.md` R15's table. |
| R16 | Unit | Same file: all seven technical names are present in the table's order, with `aheed_cart`, `delivery-postcode` and `fulfilment-method` asserted through the imported `CART_COOKIE`, `DELIVERY_POSTCODE_COOKIE` and `FULFILMENT_METHOD_COOKIE` constants rather than string literals. |
| R16 | E2E | `curl -s http://localhost:8787/privacy \| grep -c "Keeps the items in your basket."` prints greater than 0, and `curl -s http://localhost:8787/privacy \| grep -c "<code>"` prints `0`. |
| R17 | Integration | `git diff origin/staging -- lib/cart-identity.ts components/consent/CookieBanner.tsx components/rewards/RewardsLauncher.tsx components/checkout/CheckoutForm.tsx` shows no change to any storage-key string value, and `grep -rn "aheed_cart\|aheed_cookie_consent\|aheed_referral_code\|aheed_checkout_details" lib components --include=*.ts --include=*.tsx` still finds all four keys at their original definitions. |
| R18 | Unit | `npx vitest run tests/vendor-neutral-copy.test.ts` exits 0. Additionally, read every string this slice added (R10, R12, R14 and R15's table) and confirm none names a vendor or a product category — the guard test catches `#729`'s removed literals returning, **not** new vendor-specific copy, so this row needs the reading as well as the run. |
| R19 | Integration | `git diff --stat origin/staging -- prisma/schema.prisma prisma/reference/schema.prisma package.json package-lock.json` prints no rows, and `git diff --stat origin/staging -- prisma/migrations/` prints no rows. |
| R20 | Regression | `git diff origin/staging -- CHANGELOG.md` shows an entry naming `#1087`, `#1088` and `#1089` (Gate 4). |
| R21 | Regression | `npm run lint`, `npm run typecheck`, `npm run format:check` and `npx vitest run` each exit 0, the vitest run started on its own per P7. Then `npm run kms:validate` and `npm run kms:check-generated` each exit 0 — this slice edits `docs/` and `specs/`, so `ARTIFACT_INDEX.md` **and** `app/(admin)/staff/runbook/docs.ts` must both have been regenerated by `npm run kms:build-index` and committed. Finally `npm run kms:assemble:internal` followed by a real Next build in `kms/site-internal` exits 0 — `gates` never builds the docs site. |
| R21 | Regression | CI is ground truth, not local output: the PR's `docs-gates`, `quality / kms` and `quality / quality` checks all pass. A local green run is necessary, not sufficient. |
