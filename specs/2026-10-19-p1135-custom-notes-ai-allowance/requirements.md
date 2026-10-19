# Custom item notes and the AI allowance (requirements / acceptance criteria)

Closes `#1135`, `#1028`, `#1029` and `#1031`. The reasoning, the owner's three Propose rulings and
everything deliberately excluded are in `plan.md`. In one line: shoppers can attach a short note to
a priced basket line where the store allows it per category or product, and the Workers AI allowance
gains a Free/Paid plan mode, a staff view, a platform-admin budget control and an honest backfill
refusal. The two halves share no code.

Terms used below:

- **Accepts notes** — for a product: `Product.allowsCustomNote` is true, or its category's
  `allowsCustomNote` is true, or its category's parent's `allowsCustomNote` is true.
- **Normalised note** — the input trimmed, every run of whitespace (including newlines) replaced by
  one space, control characters (Unicode category Cc) removed, then cut to at most 200 characters.
  An empty result is `null`.
- **Platform admin** — a session for which `requireVendorRole` returns `via: "platform-admin"`
  (`User.role === "ADMIN"`). **Store admin** — `via: "ADMIN"`.
- Locally the seeded vendors are Aheed on `localhost:8787` and SriMart on `srimart.localhost:8787`.
  Every DB-touching check runs under `npm run preview`, never `npm run dev`.

## Half 1 — custom item notes (`#1135`)

### Schema

R1. `prisma/schema.prisma` adds exactly these four columns and nothing else in this half:
    `Category.allowsCustomNote Boolean @default(false)`, `Product.allowsCustomNote Boolean
    @default(false)`, `CartItem.customNote String?`, `OrderItem.customNote String?`. No `Json`
    column. `CartItem`'s `@@unique([cartId, productId])` is unchanged.
R2. Exactly one new directory under `prisma/migrations/` for this slice. Its `migration.sql`
    contains only `ALTER TABLE ... ADD COLUMN` statements for the four columns in R1 — no `DROP` of
    any kind (in particular none of the `pg_trgm` indexes), no `UPDATE`, no `INSERT`.

### Rules (pure functions)

R3. One exported pure function decides whether a product accepts notes from
    `{ allowsCustomNote, category: { allowsCustomNote, parent: { allowsCustomNote } | null } }`, and
    it is the only implementation of that rule: the cart read, the product page, the add and
    set-note actions, and `placeOrder` all call it. Unit tests cover all four outcomes (product only,
    category only, parent only, none).
R4. One exported pure function produces the normalised note. Unit tests show: surrounding spaces
    trimmed; `"a\n\nb"` becomes `"a b"`; a control character is removed; a 250-character input
    returns 200 characters; `"   "` returns `null`.

### Writing a note

R5. On `/products/<slug>` for a product that accepts notes, the page renders a text input with an
    associated `<label>` and `maxlength="200"` alongside the Add to basket control. For a product
    that does not accept notes, no such input is rendered.
R6. Adding from the product page with a non-empty note stores the normalised note on the basket
    line, replacing any existing note. Adding with an empty note leaves an existing note unchanged.
    Adding a note for a product that does not accept notes stores `null` (the add still succeeds).
R7. Product cards and the Quick View drawer render no note input.
R8. In `components/cart/CartContents.tsx` (rendered by both the header drawer and `/cart`), a line
    whose product accepts notes shows its current note and a labelled control to edit or clear it.
    Saving goes through a new server action in a `"use server"` module that exports only async
    functions, stores the normalised note, and refuses (stores nothing) for a product that does not
    accept notes or is not in the caller's basket.
R9. A basket line that carries a note but whose product no longer accepts notes renders the note
    together with a sentence stating that the item no longer takes notes and the note will not be
    sent with the order. A line with no note and no acceptance renders no note UI at all.
R10. Note copy is vendor-neutral: `git diff origin/staging -- components "app/(storefront)"` adds no
    line matching `/aheed|srimart|curry|goat/i`, and `tests/vendor-neutral-copy.test.ts` passes.

### Carrying a note

R11. `applyCartMerge` keeps notes: KEEP_SAVED yields the saved lines' notes, KEEP_NEW the guest
    lines' notes, and COMBINE yields, per product, the guest line's note when it is non-null,
    otherwise the saved line's. Unit tests cover the three resolutions and both COMBINE branches.
R12. `placeOrder` reads each cart line's note inside its existing transaction and writes
    `OrderItem.customNote` as the note if the product accepts notes at that moment, else `null`.
    A note never causes a `CheckoutError`. Unit tests in `tests/orders.test.ts` cover an accepted
    note copied, a no-longer-accepted note written as `null`, and a line without a note.
R13. `restoreCartFromOrder` and the order-again path (`lib/restore-lines.ts`) carry each order line's
    `customNote` back onto the basket line. Unit tests cover both.
R14. Every Prisma call added or changed in this half follows CLAUDE.md's client rules: any
    `createMany`, `updateMany`, or `create` with nested child writes runs on `getPrismaWs()` (inside
    the existing transactions where they already are). `tests/repository-purity.test.ts` and
    `tests/repository-client-injection.test.ts` pass.

### Reading a note

R15. The note of each order line, when non-null, is rendered under that line on
    `/account/orders/<orderNumber>`, on `/checkout/<orderNumber>`, and on
    `/staff/orders/<orderNumber>`. A line with a `null` note renders no note element.
R16. Each row of the staff order list (`/staff/orders`) for an order with at least one non-null
    `OrderItem.customNote` shows a visible text marker reading "Has item notes"; rows without one do
    not.
R17. The order confirmation email (`features/checkout/send-confirmation.ts`) renders each non-null
    note under its line. The note **and** the product name are passed through one HTML-escaping
    helper that escapes `&`, `<`, `>`, `"` and `'`. A unit test shows a note of
    `<script>alert(1)</script> & "x"` appears in the email HTML only in escaped form.

### Data rights

R18. The signed-in export (`lib/repositories/data-rights.ts`) includes `customNote` on each order
    item and each cart item; the guest-order export includes it on each order item.
R19. `eraseVendorData` and `eraseGuestOrderData` set `customNote` to `null` on every `OrderItem` of
    the orders they anonymise, inside their existing transaction. Unit tests show it for both.

### Staff configuration

R20. `components/staff/CategoryForm.tsx` and `components/staff/ProductForm.tsx` each render one
    labelled checkbox named `allowsCustomNote`, reflecting the saved value. `lib/catalogue-form.ts`
    parses it (checked → `true`, absent → `false`), and the existing `saveCategory`/`saveProduct`
    actions persist it under their existing role gates. A category saved with the box unticked
    stores `false`.

### Live behaviour (two vendors)

R21. On the dev database under `npm run preview`, with one Aheed category ticked: a product in that
    category (or in a sub-category of it) shows the note input; a product in an unticked category
    shows none; a note added on the product page appears on the basket line in the drawer and on
    `/cart`; editing and clearing it there works; after checkout the note appears on the staff order
    detail and the shopper's order detail.
R22. SriMart, with no category or product ticked, renders no note input on any product page and no
    note control on any basket line.
R23. With Aheed's category unticked after a note was added, the basket shows R9's sentence, and the
    order placed from that basket has `OrderItem.customNote` `null`.
R24. `scripts/verify-mobile-layout.ts` (or an equivalent measured check recorded in
    `build-notes.md`) shows no horizontal overflow at 375 px width on a product page with the note
    input and on `/cart` with a noted line.

## Half 2 — the AI allowance (`#1028`, `#1029`, `#1031`)

### Plan mode (`#1028`)

R25. `lib/config.ts`'s `aiSchema` adds `WORKERS_AI_PLAN`, resolving to `"free"` or `"paid"`; unset,
    empty or any other value resolves to `"free"`. Unit tests cover `"paid"`, `"free"`, unset and
    `"PAID-typo"`.
R26. `createAiMeter` takes the plan as a required parameter. Every caller passes the value from
    `getAiEnv()` (`typecheck` passes with the parameter required).
R27. `AiBudgetCheck` carries `scope: "vendor" | "platform"`. In Free mode, `check()` returns
    `allowed: false, scope: "vendor"` when the vendor's own budget is reached (as today); otherwise
    `allowed: false, scope: "platform"` with `usedNeurons` = the platform total since 00:00 UTC and
    `budgetNeurons` = 10,000 when that total has reached 10,000; otherwise `allowed: true`. In Paid
    mode no platform total is read and only the vendor check applies. On a database error `check()`
    still fails closed. Unit tests in `tests/ai-meter.test.ts` cover each branch in both modes.
R28. The platform total is read by one new export in `lib/repositories/ai-usage.ts` that takes
    `prisma` and a `since` date and no `vendorId`; it has an allowlist entry with a written
    justification in `tests/repository-vendor-scoping.test.ts`, and that test passes.
R29. `describeAiBudgetRefusal` returns the existing store sentence for `scope: "vendor"` and, for
    `scope: "platform"`, a sentence stating that the platform's shared AI allowance for today is used
    (with the used and 10,000 figures) and resets at 00:00 UTC. Neither sentence names a vendor.
R30. `specs/architecture.md`'s Workers AI paragraph no longer says the plan is unverified; it
    describes both modes, the `WORKERS_AI_PLAN` key and its Free default, and that the Free cap
    counts only this platform's ledger (partly estimated), not other usage on the same Cloudflare
    account. `docs/developer-portal/env-setup.md` lists `WORKERS_AI_PLAN`.

### Staff AI page (`#1029`)

R31. `app/(admin)/staff/ai-usage/page.tsx` exists, gates on `requireVendorRole("ADMIN")`, redirects
    a 401 to `/login`, and renders `PanelRefusal` for a 403.
R32. For a store admin or platform admin the page shows: today's neurons used and the vendor's daily
    budget; a table with one row per `AiFeature` giving neurons today and over the last seven UTC
    days (today plus the six before); the plan mode; and, in Free mode only, the platform's total
    today against 10,000. All figures are read for the vendor resolved from the request host.
R33. Only for a platform admin, and only in Paid mode, the page shows the estimated charge for
    today's platform usage above 10,000 neurons, computed in integer arithmetic as
    `ceil(max(0, used − 10,000) × 11 / 10,000)` US cents and displayed in dollars. A unit test covers
    0, 1,000 and 12,345 neurons over the allowance.
R34. Only for a platform admin, the page renders a form to set the vendor's `aiDailyNeuronBudget`.
    A store admin sees the budget as text with no form.
R35. The form's server action (a `"use server"` module exporting only async functions) re-checks
    `auth.via === "platform-admin"` and refuses every other caller without writing; accepts only an
    integer from 0 to 1,000,000; and writes only the current host vendor's `VendorConfig`. Unit tests
    cover a store-admin refusal, a non-integer, an out-of-range value, and a valid write.
R36. `/staff/ai-usage` appears in `components/staff/PanelNav.tsx`'s admin tier and on the hub
    (`app/(admin)/staff/page.tsx`); `docs/store-admin-guide/admin-tabs-guide.md` has a section for it
    with all seven labelled parts and "Who can access: Store admins only"; and
    `tests/staff-nav-parity.test.ts`, `tests/panel-refusal-coverage.test.ts` and
    `tests/operator-doc-coverage.test.ts` pass.
R37. `docs/platform-admin-guide/platform-admin-guide.md` describes setting a vendor's AI budget on
    `/staff/ai-usage` and what `WORKERS_AI_PLAN` does, without adding a second route section for
    `/staff/ai-usage`.
R38. Live, under `npm run preview`: a store admin on Aheed sees the page without the budget form or
    the charge; a platform admin sees the form, saves a new budget, and the page then shows it;
    a STAFF-only account gets `PanelRefusal`; SriMart's page shows SriMart's own figures.

### Backfill refusal tone (`#1031`)

R39. On a budget refusal, `POST /api/admin/jobs/backfill-images` still answers 200 with `message`,
    `processed` and `totalFound`, and adds `budgetRefused: true`. Other responses do not carry
    `budgetRefused`.
R40. `components/staff/BackfillImagesButton.tsx` renders a 200 response carrying
    `budgetRefused: true` in its error tone (`role="alert"`, the error styling), and every other 200
    in its success tone as today. `tests/backfill-images-button.test.tsx` covers the refusal tone and
    keeps the success case.

### Live AI checks

R41. A script in this spec folder, run against the **dev** database, inserts marked `AiUsageEvent`
    rows bringing the platform total to at least 10,000, shows `check()` refused with
    `scope: "platform"` for a vendor under its own budget in Free mode and allowed in Paid mode,
    deletes every row it inserted, and exits 0. Its output is recorded in `build-notes.md`.

## Gates

R42. `CHANGELOG.md` updated (Gate 4), and `specs/roadmap.md`'s change log carries a row for PR #1155
    (the `#1134` promotion flagged by `sdd:audit` as pending carry-forward).
R43. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice, and
    `npm run build` succeeds.
