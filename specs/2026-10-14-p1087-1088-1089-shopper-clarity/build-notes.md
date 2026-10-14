# Shopper clarity: delivery intent, skipped shop-list lines, privacy copy (build notes)

Written at the end of Build, before the Clear. Spec: `plan.md`, `requirements.md` (R1–R21),
`validation.md` (30 rows + 7 preconditions) in this folder.

Two commits on `feature/p1087-shopper-clarity`, branched from `origin/staging`:

- `8318b48` — the spec, plus the dated status register in the user-testing triage document.
- `f1c68b9` — the implementation, its tests, and `app-conventions.md`.

**Local gate state at the end of Build:** `lint`, `typecheck`, `format:check`, `kms:validate` and
`kms:check-generated` all exit 0. `npx vitest run` (run alone) is **3200 passed, 2 failed** — both
failures are `tests/storefront-chrome-rewards-gate.test.tsx`, which **passes in isolation** and
covers `StorefrontChrome`/`RewardsLauncher`, neither of which this slice touches
(`git diff --name-only origin/staging` confirms). That is the known `#1037` whole-tree timeout
flake, not a regression here. **No live proof has been taken** — see Known-shaky areas.

## What changed and why

### `#1087` — the method follows the submitted intent

- `lib/delivery-cookie.ts` gains `POSTCODE_INTENT_FIELD` (`"intent"`), the `PostcodeIntent` type and
  `parsePostcodeIntent`. It went here, not in the action's own file, for the reason that module
  already exists: `features/storefront/delivery.ts` is `"use server"` and may export only async
  functions. `parsePostcodeIntent` returns `"edit"` for everything that is not exactly `"delivery"`,
  so an absent, mis-cased or crafted value lands on the pre-slice behaviour rather than switching a
  shopper's method.
- `setDeliveryPostcode` reads the intent and writes `fulfilment-method: DELIVERY` only for
  `"delivery"` **and** `isPostcodeDeliverable(submitted)`, with the same cookie attributes it already
  used for the postcode. The `&&` short-circuits, so an edit-intent submission never calls the
  eligibility service — there is a test asserting exactly that, because it is the difference between
  "free" and "one extra lookup per postcode edit".
- `LocationControl` holds the intent in state, set by whichever control opened the modal
  (`openModal("delivery" | "edit")`), and submits it as a hidden field. The component acts on none of
  it: the action decides, so a crafted post cannot claim an intent the server treats differently.
- `deliveryLabel` no longer requires `method === "DELIVERY"`, and the narrow-viewport span matches.
  A shopper on Click & Collect can now read their stored postcode without opening the modal and
  cancelling out of it.

**Why intent-scoping rather than reverting `#748`.** `#748` removed an unconditional "a postcode
submission selects Delivery" because it switched a Click & Collect shopper back to Delivery for
merely correcting a typo. What went in instead was "never set the method", which is wider than the
rule needs: it also covers the case where the shopper has just *asked* for delivery. `#748`'s real
distinction — changing where you live is not changing how you receive the order — is already encoded
in which control opens the modal, so that is what the fix reads.

### `#1088` — the shop list says what did not go in

- `ListReview` emits a third positional field, `lineLabel` (`line.original`), on exactly the lines
  that already emit `productId` and `quantity`, and renders the unresolved-line count above the
  submit button.
- `lib/restore-notice.ts` gains the `"list"` source, the `"s"` entry kind, and `RestoredLineKind`
  (`BulkAddKind | "skipped"`). `parseEntry` rejects an `"s"` entry with a non-zero `added` or a
  `requested` below 1, mirroring the invariant the `"p"` kind already carried.
- `lib/restore-lines.ts` gains one optional third parameter, `missingKind`, defaulting to
  `"unavailable"`. That is the whole difference between the reorder/cancel path and the list path: a
  line with no product id means "the product was deleted" for the first and "the shopper never chose
  one" for the second. Everything else — the id-to-name mapping, the empty-`live` short-circuit —
  is shared.
- `features/cart/add-list-to-cart.ts` is rewritten around `restoredLines` and redirects through
  `buildRestoreNoticeUrl("list", lines)`.
- `components/cart/RestoreNotice.tsx` gains the `"s"` entry text and the `"list"` heading, and its
  `restoreHeading` ternary became a `switch` so a future source cannot silently fall through to the
  cancelled-order wording.

### `#1089` — purpose first on `/privacy`

The seven list items now lead with plain-language purpose and name the cookie afterwards, in an
emphasised (not code-styled) span. Every name is kept and every one is still a literal in the page,
matching the pre-slice design where `tests/privacy-cookies-section.test.tsx` is what couples three of
them to their exported constants.

### Persistent documentation

`docs/developer-portal/app-conventions.md` 1.9.0 gains "Fulfilment method and the postcode control
(`#748`, `#1087`)". Before this slice the rule existed **only** as comments in `LocationControl.tsx`
and `lib/fulfilment-cookie.ts` — nothing in `architecture.md`, `app-conventions.md` or
`design-system.md` mentioned it, which is precisely why the absolute form was readable as the rule.
The superseded comment ("deliberately no longer touches the fulfilment method") is rewritten, not
left sitting beside the new behaviour; there is a validation row grepping for its absence.

## Decisions taken during the build

- **`"skipped"` went into `lib/restore-notice.ts`, not `lib/cart-rules.ts`.** Extending
  `BulkAddKind` would have been the smaller diff and was the first draft, but a line the shopper
  declined to resolve never reached the cart layer, so it is not one of that layer's outcomes.
  `BulkAddKind` is unchanged, with a requirement (R11a) and a test pinning that.
- **Reporting `addItems`' per-line outcome was folded in** (decided at Spec, recorded here because
  it is the one thing in the slice that was not in the owner's report). `addItems` already returned
  `BulkAddLine[]` and this action discarded it, so a clamped line — or one whose stock the cart
  already holds in full — was dropped exactly as silently as a skipped line. It reuses `#957`'s
  existing `u`/`p`/`h` codes and adds no query. This is why the `"list"` heading says "couldn't be
  added in full" rather than "weren't added".
- **`lineLabel` is unconditional, not gated on the component's `choices` state.** A hidden input
  conditioned on client state would report a line the shopper really did resolve as skipped whenever
  the select changes without React. The positional label needs no client state and cannot produce a
  false skip. There is a test for this specific property.
- **A line carrying a product but an unusable quantity is still dropped, and still reported as
  nothing.** The pre-slice action `continue`d past it. Only a crafted post produces one, since the
  review step writes the quantity itself, and no notice wording would be true of it — so it is
  filtered out before the report is built rather than mislabelled.
- **The guest-token rule was preserved by construction.** `restoredLines` calls its `addItems`
  callback only when there is something to send, so the token is still issued only on a real add.
  Two tests cover both directions, because this was easy to lose in the rewrite.
- **`parsePostcodeIntent` is case-sensitive**, matching `parseFulfilmentMethod` beside it: the only
  producer is our own hidden input.
- **The `/privacy` secondary text carries no colour class at all.** The first attempt used
  `text-primary-muted/80`, which `tests/token-alpha-purity.test.ts` (`#649`) correctly rejected — an
  alpha modifier composites `brandStyle()`'s clamped value back below the contrast floor. The span
  now inherits the list's `text-primary-muted` and the name is distinguished by weight instead.
- **`tests/location-control.test.tsx` mocks the action module** rather than importing it, so a
  `"use server"` module (and through it Prisma) is not dragged into jsdom to assert a hidden input's
  value. Same trade the existing `shop-list-review-copy` test documents for `ShopYourList`.

## Deviations from the spec

- **`validation.md`'s R7 row was wrong when written and is corrected in place.** It claimed jsdom 29
  implements `HTMLDialogElement.showModal`, with a stub as a hypothetical fallback. Measured during
  Build: jsdom **29.1.1 does not implement it**, and the click handler throws
  `showModal is not a function`. The test stubs `showModal`/`close` on the prototype in a
  `beforeAll`, and the row now says so. No requirement changed.
- **R15's purpose strings shipped exactly as specified, but the markup around them was not
  specified** beyond "no `<code>`" and "name later in the same list item". Each entry renders as
  `<purpose> Shown in your browser as <name>.`, which the guard test now pins in full.
- Otherwise none. R1–R19 are implemented as written; R20 (CHANGELOG) lands in this commit.

## Known-shaky areas

- **Nothing in this slice has been proved live.** No `npm run preview`, no browser, no deployed
  host. Every claim above rests on unit tests and greps. The three rows that matter most are
  `validation.md`'s **R3-E2E** (delivery intent really selects Delivery) and **R5-E2E** (the pencil
  really does not), which need a real browser, and **R8-E2E**.
- **`LocationControl` is not curl-drivable** — `setDeliveryPostcode` is called from a client closure
  with a `FormData` argument, so neither curl technique works and `Next-Action` returns an opaque
  500 (`docs/developer-portal/local-dev-playbook.md`, from `#613`'s Validate). A connected browser
  is the only live route for R3/R5. R8 and R16 are plain `curl` reads and need no browser.
- **`offerCollection` is not seeded** (`prisma/seed.ts:309,323-325` read it, nothing writes it), so a
  freshly seeded local Aheed may render the single-button branch with no Click & Collect toggle at
  all — in which case `#1087`'s defect path cannot be reproduced and R3-E2E/R5-E2E would silently
  test nothing. `validation.md` P5 says to confirm the toggle is present and enable collection on
  `/staff/fulfilment` first. **Check this before concluding either row passes.**
- **The duplicate-product case in a shop list is reported once, not twice.** `restoredLines` maps
  `addItems`' report (one entry per distinct product) back to names by product id, so two list lines
  resolving to the same product yield one notice entry and `of` counts the reported units rather than
  the typed lines. This is the shipped `#957` behaviour inherited unchanged, not a decision taken
  here, and it is invisible unless a shopper types the same item twice. Worth a look if the notice's
  "N of M" ever reads oddly.
- **The `"s"` kind travels in a URL anyone can hand-write**, like every other entry kind — the names
  are escaped by React and capped by the parser. Unchanged posture from `#957`, but this is the first
  kind whose name comes from shopper-typed text rather than from an order's stored product name.
- **The KMS 300-character `summary` limit bit twice in this slice** — once on the triage document
  (already failing in the working tree when Build started) and once on `app-conventions.md` after
  the new section was summarised. Both are fixed. Worth knowing *how* it fails: `kms:build-index`
  **drops** the invalid artifact from `ARTIFACT_INDEX.md` rather than erroring, so the visible
  symptom is the artifact count falling by one (231 → 230) while the build "succeeds".
  `npm run kms:validate` is what names the file.
