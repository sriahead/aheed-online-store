# Shopper clarity: delivery intent, skipped shop-list lines, privacy copy (requirements / acceptance criteria)

Closes `#1087`, `#1088` and `#1089` — the three "Club A" items from the owner's user-testing pass of
2026-10-13 (`docs/business-analysis/user-testing-feedback-2026-10-13.md`, items 4, 21 and 6). Three
independent files, no schema change and no migration: a postcode entered from the Delivery
affordance now selects Delivery **without** reverting `#748`'s pencil rule; a shop-list line the
shopper declined to resolve is named on `/cart` through `#957`'s existing notice; and `/privacy`
leads each storage entry with its purpose instead of its technical name. Narrative, and the two
corrections to the triage this is written against: `plan.md`.

Throughout, "the postcode cookie" is `delivery-postcode` (`DELIVERY_POSTCODE_COOKIE`) and "the
method cookie" is `fulfilment-method` (`FULFILMENT_METHOD_COOKIE`).

## `#1087` — delivery intent

R1. `lib/delivery-cookie.ts` exports `POSTCODE_INTENT_FIELD` with the exact value `"intent"`, and a
    synchronous `parsePostcodeIntent(raw: string | null | undefined)` returning `"delivery"` for
    exactly the string `"delivery"` and `"edit"` for every other input, including `null`,
    `undefined`, `""`, `"DELIVERY"`, `"Delivery"`, `"edit"` and any unrecognised string.

R2. `features/storefront/delivery.ts` exports only `async function` declarations — no constant, type
    or re-export (CLAUDE.md's Server Actions rule; enforced at runtime, so no build or test catches
    a violation).

R3. `setDeliveryPostcode`, given a form whose `intent` field is `"delivery"` and whose `postcode`
    normalises to a non-empty value that `isPostcodeDeliverable` resolves `true` for, sets the
    method cookie to `"DELIVERY"` with the same attributes the postcode cookie is written with in
    that file: `httpOnly: true`, `secure: true`, `sameSite: "lax"`, `path: "/"`, `maxAge` of 30 days
    in seconds.

R4. `setDeliveryPostcode`, given `intent` `"delivery"` and a postcode that `isPostcodeDeliverable`
    resolves `false` for, does not write the method cookie at all.

R5. `setDeliveryPostcode` never writes the method cookie when the parsed intent is `"edit"` — for
    any postcode, deliverable or not, and including a form with no `intent` field. This is the
    `#748` regression guard: a shopper on Click & Collect who edits their postcode stays on Click &
    Collect.

R6. An empty `postcode` submission still deletes the postcode cookie and writes no method cookie,
    whatever the intent.

R7. `components/layout/LocationControl.tsx` submits the intent as a hidden input inside the modal's
    form, with value `"delivery"` when the modal was opened from either Delivery affordance (the
    "ask for a postcode" button rendered when no deliverable postcode is stored, and the single
    button rendered for a vendor that does not offer collection) and `"edit"` when it was opened
    from the pencil button.

R7a. `docs/developer-portal/app-conventions.md` gains a short rule stating that the fulfilment
     method is a stored preference, that a postcode submission sets it only when the submission
     carried delivery intent, and that the pencil/edit path must never change it (`#748`). Before
     this slice the rule existed only as comments in `components/layout/LocationControl.tsx` and
     `lib/fulfilment-cookie.ts`, which is why it could be read as an absolute. Those comments are
     updated in the same slice so they no longer state the superseded absolute form.

R8. The Delivery control displays the stored postcode whenever one is stored and deliverable,
    regardless of the current method — both the desktop label and the narrow-viewport label. A
    shopper on Click & Collect with a deliverable postcode stored can read that postcode without
    opening the modal.

## `#1088` — a skipped shop-list line is accounted for

R9. `components/cart/ListReview.tsx` emits a `lineLabel` hidden input carrying that line's
    `original` text for exactly the lines that also emit `productId` and `quantity` — matched lines
    with stock above zero, and ambiguous lines — and for no other line, so that `lineLabel`,
    `productId` and `quantity` are three positionally aligned arrays of equal length. The input is
    unconditional: it is not gated on component state.

R10. `ListReview` states the number of ambiguous lines whose selection is still empty, in the exact
     form `1 line will be skipped unless you choose an item` for one and
     `N lines will be skipped unless you choose an item` for more than one. The figure reflects the
     shopper's current selections, and the text is absent entirely when no ambiguous line is
     unresolved.

R11. `lib/restore-notice.ts` accepts `"list"` as a third `RestoreSource` and `"s"` as a fourth
     `RestoreEntryKind`: `buildRestoreNoticeUrl("list", …)` produces `restored=list`, and
     `parseRestoreNotice` returns a notice for `restored=list` and for an entry of kind `"s"` whose
     `added` is `0` and `requested` is at least `1`. Entries of kind `"s"` with a non-zero `added`
     are rejected, as the existing kinds' invariants are.

R11a. The `"skipped"` line kind is declared in `lib/restore-notice.ts` as its own union
     (`BulkAddKind | "skipped"`, with `KIND_CODE` gaining `skipped: "s"`), and `lib/cart-rules.ts`'s
     `BulkAddKind` is **unchanged**. A line the shopper declined to resolve never reached the cart
     layer, so it is not one of that layer's outcomes.

R12. `components/cart/RestoreNotice.tsx` renders an `"s"` entry as the exact text
     `<name>: not added, no product chosen`, and `restoreHeading` returns
     `<k> of <of> <item|items> from your list couldn't be added in full:` for a `"list"`-source
     notice — "in full" because a `"list"` notice can also carry a `"p"` entry (R13). The
     `"reorder"` and `"cancelled"` headings and the `"u"`, `"p"` and `"h"` entry texts are
     byte-identical to before this slice.

R13. `features/cart/add-list-to-cart.ts` redirects to `buildRestoreNoticeUrl("list", lines)`, where
     `lines` has one member per submitted line — so the notice's `of` is the number of lines the
     shopper submitted — and each member is named from the `lineLabel` at that index:
     - a line whose `productId` is empty contributes kind `"skipped"`, `added: 0`, and `requested`
       taken from the `quantity` at that index (or `1` when that quantity is not a finite number of
       at least 1);
     - a line that was sent to the cart contributes the kind `addItems` returned for it
       (`"added"`, `"partial"`, `"unavailable"` or `"at_limit"`) with that result's `added` and
       `requested`. `addItems` already returns `BulkAddLine[]` and this action currently discards
       it, so no new query or stock logic is introduced.

R14. When every submitted line was added in full, `addListToCart` redirects to exactly `/cart` with
     no query string — `buildRestoreNoticeUrl` already returns that when nothing fell short. When
     the `lineLabel` value aligned to a line is missing or blank, the entry is still produced and
     its name is the exact text `An item from your list`; a line is never dropped from the notice
     for want of a label.

## `#1089` — privacy page leads with purpose

R15. The cookies and local-storage list in `app/(storefront)/privacy/page.tsx` contains **no**
     `<code>` element, and each of its seven list items begins with its purpose text from the table
     below, with the technical name appearing later in the same list item.

| # | Technical name (unchanged) | Purpose text the entry begins with |
|---|---|---|
| 1 | `__Secure-better-auth.session_token` | `Keeps you signed in.` |
| 2 | `aheed_cart` | `Keeps the items in your basket.` |
| 3 | `aheed_cookie_consent` | `Remembers your cookie choices.` |
| 4 | `delivery-postcode` | `Remembers the postcode you entered, so we can show delivery availability and fees.` |
| 5 | `fulfilment-method` | `Remembers whether you chose delivery or collection.` |
| 6 | `aheed_referral_code` | `Remembers a referral code from a link you followed, so it can be applied at checkout. Only set if you arrive through a referral link.` |
| 7 | `aheed_checkout_details` | `Keeps the contact and delivery details you type at checkout, so they are filled in next time. Stored on your device, not on our servers.` |

R16. All seven technical names appear on the page as the exact strings in the table above, in that
     order, and `tests/privacy-cookies-section.test.tsx` is updated to pin the new presentation —
     including the three names still read from `CART_COOKIE`, `DELIVERY_POSTCODE_COOKIE` and
     `FULFILMENT_METHOD_COOKIE` rather than written as literals.

R17. No storage key is renamed by this slice: `CART_COOKIE` (`lib/cart-identity.ts`), the consent
     key (`components/consent/CookieBanner.tsx`), the referral key
     (`components/rewards/RewardsLauncher.tsx`) and the checkout-details key
     (`components/checkout/CheckoutForm.tsx`) all hold the same values after this slice as before
     it. `#1080` owns that rename and is not in scope.

## Cross-cutting

R18. Every user-facing string added or changed by this slice is vendor-neutral — no vendor name and
     no grocery-specific example — and the copy guard test described in
     `docs/developer-portal/app-conventions.md` ("User-facing copy") stays green.

R19. This slice changes no schema and adds no dependency: `prisma/schema.prisma` and
     `prisma/reference/schema.prisma` are unchanged, `prisma/migrations/` gains no directory, and
     `package.json`/`package-lock.json` dependency entries are unchanged.

R20. `CHANGELOG.md` updated on the branch (Gate 4).

R21. `lint`, `typecheck`, `test` and `format:check` all remain green after this slice.
