# Guided help assistant with WhatsApp handoff and conversation logging (requirements / acceptance criteria)

Closes **#1015** and **#1014** together, as approved at Gate 1 on 2026-10-11. Builds on #1012
(`VendorFaq`), #1013 (`lib/help-facts.ts`), #565/#570 (`SearchQueryLog`'s no-user-link log shape)
and #567 (`lib/repositories/list-normalisation-rate-limit.ts`). One line: a per-vendor, off-by-
default guided help assistant that answers from facts the platform already computes plus the
vendor's own active FAQ answers, hands everything else to the store's WhatsApp with a bounded
summary containing no personal data, and logs each conversation's topic and outcome without
linking it to anyone. No AI and no free text. #1021 stays open and is not a prerequisite.

Paths named below are the required locations. "The repository file" means
`lib/repositories/assistant-conversations.ts`; "the actions file" means
`features/assistant/assistant.ts`; "the content module" means `lib/assistant-content.ts`; "the
handoff module" means `lib/assistant-handoff.ts`.

## Schema and migration

R1. `prisma/schema.prisma`'s `VendorConfig` model has a field `assistantEnabled Boolean @default(false)`.

R2. `prisma/schema.prisma` declares `enum AssistantTopic` with exactly the values `DELIVERY`,
    `COLLECTION`, `REWARDS`, `DISCOUNT_CODES`, `STORE_QUESTION`, `ORDER_STATUS`, `ITEM_SWAP`,
    `CANCEL_PAID_ORDER`, `OTHER`, and `enum AssistantOutcome` with exactly `ANSWERED`, `HANDED_OFF`,
    `ABANDONED`.

R3. `prisma/schema.prisma` declares `model AssistantConversation` whose scalar fields are exactly
    `id` (String, uuid default), `vendorId` (String, relation to `Vendor`), `topic`
    (`AssistantTopic`), `openingQuestion` (String), `outcome` (`AssistantOutcome`,
    `@default(ABANDONED)`), `ipHash` (String), `createdAt` (`@default(now())`) and `updatedAt`
    (`@updatedAt`), with `@@index([vendorId, createdAt])` and `@@index([vendorId, ipHash, createdAt])`.
    It has no field or relation referencing `User`, `Order` or `VendorFaq`, and no `Json` field.

R4. Exactly one new directory under `prisma/migrations/` is added by this branch, its name contains
    `p1015_1014`, and its `migration.sql` contains no `DROP` statement.

## Repository (`lib/repositories/assistant-conversations.ts`)

R5. The repository file exports `startConversation`, `recordOutcome` and `assistantReport`; each
    takes a Prisma client and `vendorId` as explicit parameters and reads no request context.
    `tests/repository-purity.test.ts` and `tests/repository-client-injection.test.ts` pass.

R6. `startConversation(prisma, vendorId, ip, topic, openingQuestion)` stores `ipHash` as the
    64-character lowercase hex SHA-256 of `ip`, computed inside the repository file; the raw `ip`
    is stored in no column. `openingQuestion` is stored truncated to at most 200 characters. It
    returns `{ id }` for a created row.

R7. When 20 or more `AssistantConversation` rows already exist for the same `vendorId` and `ipHash`
    with `createdAt` within the last 10 minutes, `startConversation` creates no row and returns
    `null`. Rows for a different `ipHash` or a different `vendorId` do not count toward the limit.

R8. On a `startConversation` call where `Math.random()` returns a value below `0.01`, the repository
    deletes every `AssistantConversation` row whose `createdAt` is more than 90 days old; at
    `0.01` or above it deletes nothing.

R9. `recordOutcome(prisma, vendorId, conversationId, outcome)` changes a row's `outcome` only for
    the transitions `ABANDONED → ANSWERED`, `ABANDONED → HANDED_OFF` and `ANSWERED → HANDED_OFF`,
    and returns `true` exactly when it changed a row. Every other requested transition, an unknown
    `conversationId`, and a `conversationId` belonging to a different vendor leave every row
    unchanged and return `false` without throwing.

R10. The repository file, the actions file and the request-scoped service module that wraps the
     repository (`lib/*-service.ts`, name chosen at Build) contain no call to `updateMany`,
     `createMany`, `$transaction`, `$queryRaw`, `$executeRaw`, `$queryRawUnsafe` or
     `$executeRawUnsafe`, and none imports `getPrismaWs`.

R11. `assistantReport(prisma, vendorId, now)` counts only rows of `vendorId` with `createdAt` in the
     90 days before `now`, and returns: the total; a count per `AssistantOutcome`; a count per
     (`AssistantTopic`, `AssistantOutcome`) pair; and up to 10 `openingQuestion` values ordered by
     their `HANDED_OFF` count descending, each with that count. Rows of another vendor never
     contribute to any figure.

## Content (`lib/assistant-content.ts`, pure)

R12. The content module exports a function `buildAssistantContent` that performs no I/O and imports
     nothing from `@/lib/db`, `@/lib/repositories/*` or any `*-service` module. Its input carries
     the vendor name, a `HelpDeliveryFacts` value, `offerCollection`, a `LoyaltyConfig`, the active
     FAQ rows, and whether the shopper is signed in.

R13. `buildAssistantContent`'s output includes `DELIVERY`, `DISCOUNT_CODES`, `ORDER_STATUS`,
     `ITEM_SWAP`, `CANCEL_PAID_ORDER` and `OTHER` for every input; includes `COLLECTION` exactly
     when `offerCollection` is true; includes `REWARDS` exactly when `loyaltyEnabled` is true; and
     includes one `STORE_QUESTION` entry per FAQ row passed, in the order passed, and none when the
     list is empty.

R14. Each fixed topic's label in the output is exactly the text in `plan.md` §3's "Label shown"
     column. A `STORE_QUESTION` entry's label is the FAQ row's `question` and its answer is the
     row's `answer`, both unchanged.

R15. The `DELIVERY` answer states `defaults.deliveryFeePence` and, when greater than 0,
     `defaults.minimumOrderPence`, each formatted with `formatPrice`; mentions free delivery only
     when `freeDeliveryOffered(defaults.freeDeliveryThresholdPence)` is true, stating that
     threshold; and, when any of `varies.fee`, `varies.minimum` or `varies.threshold` is true,
     includes the sentence `Some areas have different charges. The Help Centre lists each area.`
     with a link to `/help`.

R16. The `REWARDS` answer states `pointsPerPoundEarned` and `minRedeemPoints`, states the expiry
     only when `pointsExpiryMonths` is not null, and links to `/account/loyalty`. The `COLLECTION`
     answer states `collectionMinimumOrderPence` when greater than 0. The `ORDER_STATUS` answer links
     to `/account/orders` when the shopper is signed in and to `/orders/lookup` otherwise.

R17. `ITEM_SWAP`, `CANCEL_PAID_ORDER` and `OTHER` entries carry no answer and are marked
     handoff-only. The text shown for `ITEM_SWAP` and `CANCEL_PAID_ORDER` is exactly
     `This needs a person at the store. Tap below to start a WhatsApp message with this topic filled in.`
     and for `OTHER` exactly
     `Tap below to start a WhatsApp message to the store with this topic filled in.`

## Handoff (`lib/assistant-handoff.ts`, pure)

R18. The handoff module exports `buildHandoffText({ vendorName, subject, orderNumber })` whose
     parameter type declares exactly those three properties (`orderNumber` optional). Its output is
     `Hi <vendorName>, I have a question about: <subject>.` followed, when `orderNumber` is given,
     by ` Order number: <orderNumber>.`

R19. `buildHandoffText`'s output never exceeds 300 characters for any input, including a
     1,000-character `vendorName` and a 1,000-character `subject`. When shortening is needed,
     `vendorName` is cut to at most 60 characters first, then `subject` is cut and ends with `…`;
     the order-number sentence, when given, is always present in full.

R20. The handoff module exports `buildHandoffUrl(whatsappNumber, text)` returning
     `https://wa.me/<whatsappNumber>?text=<encodeURIComponent(text)>`.

## Server actions (`features/assistant/assistant.ts`)

R21. The actions file begins with `"use server"` and every export is an `export async function`;
     it contains no `export const`, `export let`, `export type`, `export interface`, `export enum`,
     `export class` or `export {`. It exports `loadAssistantContent`,
     `startAssistantConversation` and `recordAssistantOutcome`.

R22. All three actions return `null` and create or change no `AssistantConversation` row when the
     current vendor's `assistantEnabled` is false or its `whatsappNumber` is null.

R23. `loadAssistantContent` returns `buildAssistantContent`'s output for the current vendor, built
     from `getCurrentVendorProfile()`, `helpDeliveryFacts()`, the vendor's `LoyaltyConfig` and
     `listActive()` FAQs, plus the vendor's `whatsappNumber`, plus, for a signed-in shopper only,
     the `orderNumber` of up to 5 of that shopper's most recent orders at the current vendor
     (from `listOrdersForUser`). For a guest the order list is empty.

R24. `startAssistantConversation` accepts only `{ topic }`, or `{ topic: "STORE_QUESTION", faqId }`,
     and never reads question text from its input. It stores, as `openingQuestion`, the R14 label
     for a fixed topic, or the `question` of the `VendorFaq` row whose `id` is `faqId`, whose
     `vendorId` is the current vendor's, and which is active. An unknown topic, or a `faqId`
     that is unknown, inactive or another vendor's, creates no row and returns `null`.

R25. `startAssistantConversation` and `recordAssistantOutcome` catch every error from the repository
     and return `null`/`false` instead of throwing.

## Storefront

R26. `VendorProfile` (from `lib/repositories/vendor.ts`) carries `assistantEnabled`, read in the
     query that already loads the profile; `StorefrontChrome` passes
     `profile.assistantEnabled && profile.whatsappNumber !== null` to `FloatingContact`.

R27. When that value is true, `FloatingContact`'s disclosure contains a button with the accessible
     name `Open help assistant`; when it is false, a storefront page's server-rendered HTML contains
     no `Open help assistant`. No database read is added to the storefront page render: content is
     fetched only by `loadAssistantContent`, called when the panel opens.

R28. The panel element has `role="dialog"`, `aria-modal="true"` and an accessible name; pressing
     Escape closes it and returns focus to the `Open help assistant` button; a back control returns
     from an answer to the topic list.

R29. Within one open panel, the shopper's first topic choice calls `startAssistantConversation`
     once; later choices in the same panel call it no further times. Displaying the answer of a
     `DELIVERY`, `COLLECTION`, `REWARDS`, `DISCOUNT_CODES`, `STORE_QUESTION` or `ORDER_STATUS`
     entry calls `recordAssistantOutcome` with `ANSWERED`; activating the handoff link calls it with
     `HANDED_OFF`. Closing and reopening the panel starts a new conversation on the next first
     choice.

R30. When `startAssistantConversation` returns `null`, the panel still shows every answer and the
     handoff link, and makes no `recordAssistantOutcome` call for that conversation.

R31. The handoff link's `href` is `buildHandoffUrl(whatsappNumber, buildHandoffText(...))` with
     `subject` set to the chosen entry's label and `orderNumber` set only when a signed-in shopper
     has picked one of the orders from R23. The panel shows the exact sentence
     `This opens WhatsApp with a short summary. Your conversation here is not sent.` next to the
     handoff link, and the link opens in a new tab with `rel="noopener noreferrer"`.

R32. At viewport widths 360 and 390, with the panel open, the page has no horizontal overflow
     (`document.documentElement.scrollWidth` is at most the viewport width).
     `scripts/verify-mobile-layout.ts` gains an `--open-help-assistant` flag that opens the contact
     disclosure and then the panel before measuring.

R33. `tests/vendor-neutral-copy.test.ts` passes, and no new or changed file under `components/`,
     `features/assistant/` or `app/` contains a string literal naming `Aheed` or `SriMart`.

## Staff page (`/staff/assistant`)

R34. `app/(admin)/staff/assistant/page.tsx` calls `requireVendorRole("ADMIN")`; on a 401 it
     redirects to `/login`, and on a 403 it renders `PanelRefusal`.

R35. The page has a form with a checkbox for `assistantEnabled`, saved by an `ADMIN`-gated action in
     a `"use server"` file that writes `VendorConfig.assistantEnabled` for the current vendor only;
     a non-admin caller of that action changes nothing.

R36. When the current vendor's `whatsappNumber` is null, the page shows the sentence
     `The help assistant stays hidden until you add a WhatsApp number.` with a link to
     `/staff/storefront`.

R37. The page renders `assistantReport` for the current vendor: the total, the three outcome counts,
     a table of topic by outcome, and the up-to-10 opening questions with their handed-off counts.
     With no rows, it shows `No conversations in the last 90 days.` instead of the tables.

R38. `/staff/assistant` appears in `components/staff/PanelNav.tsx`'s admin tier with the label
     `Help Assistant`, as a card in `app/(admin)/staff/page.tsx`, and as a level-2 section in
     `docs/store-admin-guide/admin-tabs-guide.md` whose heading reads "Help Assistant —" followed by
     the path `/staff/assistant` in backticks (the same form as the `/staff/faqs` section's heading);
     `tests/staff-nav-parity.test.ts`, `tests/panel-refusal-coverage.test.ts` and
     `tests/operator-doc-coverage.test.ts` pass. Every capability that guide section names
     corresponds to a control or figure on the page.

R39. `/staff/faqs`'s intro paragraph and the guide's `/staff/faqs` section each state that active
     answers also appear in the help assistant when it is switched on.

## Privacy and data rights

R40. `app/(storefront)/privacy/page.tsx` section 5 contains a paragraph stating that the help
     assistant records the topic chosen and whether it was answered or passed to the store,
     together with a scrambled (hashed) form of the network address, not linked to the shopper's
     name or account, and deleted after 90 days.

R41. `lib/repositories/data-rights.ts` is unchanged by this branch.

## Live proof

R42. Against the dev database, a `tsx` script calling the repository file's exports directly
     demonstrates R6, R7, R8 (with `Math.random` forced), R9 (including a second vendor's
     `conversationId`) and R11 (with rows for two vendors), and leaves no rows it created behind.

R43. Under `npm run preview` against the dev database, with `assistantEnabled` set true for one
     vendor that has a `whatsappNumber` and left false for a second vendor: on the first vendor,
     choosing `Delivery charges and minimums` produces a row with `outcome` `ANSWERED`; choosing
     `Swap an item in my order` and activating the handoff produces a row with `outcome`
     `HANDED_OFF` and a link whose decoded `text` is at most 300 characters; choosing
     `Something else` and closing without the handoff leaves a row with `outcome` `ABANDONED`. On
     the second vendor, the page HTML contains no `Open help assistant` and the three actions
     create no row. The first vendor's `assistantEnabled` is restored to its prior value afterwards.

## Gates

R44. `CHANGELOG.md` is updated on this branch (Gate 4).

R45. `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run format:check`,
     `npm run kms:validate` and `npm run kms:check-generated` exit 0, and
     `npm run kms:assemble:internal` followed by `npx next build` in `kms/site-internal` exits 0.
