# Guided help assistant with WhatsApp handoff and conversation logging (build notes)

Written at the end of Build (2026-10-11), before the Clear. Spec commit `d459643`; build commit
`0ac7b07` on `feature/p1015-1014-help-assistant`, branched from `origin/staging` at `2516321`. Built
on **Opus 5.5**. `/validate` should run from a fresh context on **Sonnet 5**.

**This branch also carries PR #1040's docs commit** (the `#1022`/`#1023` promotion record), merged in
at `dabcf7e` because #1040 was still open and both edit `docs/model-handoff.md`. If #1040 merges to
`staging` first, that commit is already in this branch's history and nothing conflicts; if not, this
PR carries it. Diff this slice against its own commits, not against `origin/staging` alone, when
checking which files it touched — `CHANGELOG.md`, `specs/roadmap.md` and `docs/model-handoff.md`
show #1040's hunks too.

## What changed and why

- **Schema and migration.** `VendorConfig.assistantEnabled Boolean @default(false)`, enums
  `AssistantTopic`/`AssistantOutcome`, model `AssistantConversation` (with the `Vendor`
  back-relation `assistantConversations`). Migration
  `prisma/migrations/20261011120000_p1015_1014_help_assistant/` is purely additive: two
  `CREATE TYPE`, one `ADD COLUMN`, one `CREATE TABLE`, two indexes, one FK. No `DROP`, and no
  `pg_trgm` index line was proposed this time.
- **`lib/repositories/assistant-conversations.ts`** — `startConversation`, `recordOutcome`,
  `assistantReport`, modelled on `search-query-log.ts` and `list-normalisation-rate-limit.ts`. The
  rate limit counts rows of this table itself (one row per conversation already is the attempt), so
  no attempts table.
- **`lib/repositories/vendor.ts`** — `VendorProfile.assistantEnabled` (in the existing profile
  select, so the storefront render gains no query) and `setVendorAssistantEnabled` (a singular,
  childless `vendorConfig.update` on `getPrisma()`, not routed through the storefront `$transaction`).
- **`lib/assistant-service.ts`** — the request-scoped facade (HTTP client only, fresh per call).
  `validation.md` R10 names an example file `lib/assistant-conversations-service.ts`; **the real one
  is `lib/assistant-service.ts`** (R10's text allowed the build to choose).
- **`lib/assistant-content.ts`** (pure) — topics, fixed labels, the R17 sentences, and the
  `AssistantPanelData` type. **`lib/assistant-handoff.ts`** (pure) — `buildHandoffText`,
  `buildHandoffUrl`, `HANDOFF_NOTE`.
- **`features/assistant/assistant.ts`** (`"use server"`) — `loadAssistantContent`,
  `startAssistantConversation`, `recordAssistantOutcome`. Each re-reads the profile and returns
  `null` when the switch is off or there is no WhatsApp number.
- **`components/assistant/HelpAssistant.tsx`** — the panel. **`components/layout/FloatingContact.tsx`**
  gains the `assistantAvailable` prop, the `Open help assistant` control and the mount.
  **`components/layout/StorefrontChrome.tsx`** passes
  `profile.assistantEnabled && profile.whatsappNumber !== null`.
- **Staff:** `app/(admin)/staff/assistant/page.tsx`, `components/staff/AssistantSettingsForm.tsx`,
  `features/admin/assistant.ts` (`saveAssistantSettings`), `lib/assistant-settings-form.ts`;
  `PanelNav` (admin tier, after Help Centre Answers), the hub card, and a new section in
  `docs/store-admin-guide/admin-tabs-guide.md` (2.8.0). `/staff/faqs` intro and its guide section
  each gained the R39 sentence.
- **`/privacy`** section 5 — the R40 paragraph.
- **`scripts/verify-mobile-layout.ts`** — `--open-help-assistant`.
  **`scripts/verify-assistant-conversations.ts`** — the R42 harness.
- **Tests:** `tests/assistant-content.test.ts`, `tests/assistant-handoff.test.ts`,
  `tests/assistant-actions.test.ts`, `tests/help-assistant-panel.test.tsx`.
- **Issues filed:** `#1041` (privacy page omits the search-query log — named in `plan.md`),
  `#1042` (grounded free-text follow-up), `#1043` (`/orders/lookup` placeholder shows Aheed's
  `AHE-` prefix on every vendor). All `Backlog`/`P10`.

## Decisions taken during the build

- **The panel is mounted only while open** (`FloatingContact` renders `HelpAssistant` only when
  `assistantOpen`). The first draft reset per-conversation state in an effect on close; lint's
  `react-hooks/set-state-in-effect` rejected it, and mounting per open makes "closing ends the
  conversation" true by construction. Cost: content is re-fetched on each open (one server-action
  round trip), which also means newly added FAQ answers appear on the next open.
- **Escape is a `document` keydown listener**, not `onKeyDown` on the dialog element
  (`jsx-a11y/no-noninteractive-element-interactions`). The backdrop is an `aria-hidden` `div` with
  a click handler, so it is not a second "Close help assistant" control in the accessibility tree.
- **`recordOutcome` is a lookup then a guarded singular `update`** whose `where` repeats
  `{ id, vendorId, outcome: { in: allowedPrevious } }` (Prisma's extended unique `where`). A lost
  race (the row moved between the two) throws inside the update and is returned as `false`. Proven
  over the **HTTP adapter** by the R42 harness; no `updateMany`, so no websocket client.
- **The topic type in the feature layer is `AssistantTopicName`** (a string union in
  `lib/assistant-content.ts`), because lint forbids importing `@prisma/client/wasm` outside
  `lib/repositories/*` (ADR-004 slice 2). It mirrors the enum exactly.
- **`openingQuestion` for a store question** is `getVendorFaqRepository().listActive()` then a match
  on `id`. `listActive()` is already this vendor's active rows only (`listActiveFaqs` filters
  `vendorId` and `isActive`), so the vendor and active filters live in the repository and the id
  match in the action. `Object.hasOwn` guards the fixed-topic lookup so `toString` and other
  prototype keys are refused (tested).
- **Copy choices not fixed by the spec:** dialog name `Help from <vendorName>`; section headings
  `Common questions`, `Answers from <vendorName>`, `About an order`, `Anything else`; zero-fee
  delivery reads `Standard delivery is free (£0.00).` (R15 requires the fee stated via
  `formatPrice`); the R15 sentence's link text is `Open the Help Centre`; non-handoff-only answers
  show `Still need help? Message the store.` above the handoff link. The staff page's outcome
  labels are `Answered`, `Handed off to WhatsApp`, `Left without an answer`.
- **Rate limit: 20 conversations per vendor and hashed IP in 10 minutes.** A refusal returns `null`
  and the panel carries on with no log row (R30).
- **`loadAssistantContent` catches everything and returns `null`**; the panel then says the
  assistant is unavailable and links `/help`.
- **`data-help-assistant`** on the dialog, so the mobile script's wait has an exact selector.

## Deviations from the spec

- **R5 / R11 — extra exports.** The repository file also exports the `AssistantReport` interface
  and three constants (`ASSISTANT_RETENTION_DAYS`, `ASSISTANT_MAX_CONVERSATIONS_PER_WINDOW`,
  `ASSISTANT_WINDOW_MS`), used by the harness. R5 names the three functions; nothing in it forbids
  more, and the purity and client-injection tests pass. Recorded so a `grep '^export'` showing more
  than three lines is not read as a failure.
- **R19 — the order number is capped at 40 characters** inside `buildHandoffText`, so the
  300-character ceiling holds for **any** input, as R19's first sentence requires. Real order
  numbers are about 19 characters (`AHE-20261005-268NMC`), so R19's "always present in full" holds
  for every real one; only an absurd 40-plus character input is shortened.
- **R36 was proved on Aheed, not SriMart.** Locally `demo-srimart-admin@example.com` gets **403** at
  sign-in (the local demo-password drift `docs/developer-portal/env-setup.md` 1.17.0 documents).
  Aheed's `whatsappNumber` was set to `null` on dev, `/staff/assistant` read as Aheed's admin, then
  the number restored exactly (checked by equality in the same script, never printed).
- **R43 — SriMart's three actions were not invoked directly.** What was proved live: SriMart's HTML
  has no `Open help assistant`, and SriMart has 0 `AssistantConversation` rows after the journeys.
  That the actions themselves write nothing when the switch is off is R22's unit test. A validator
  wanting it live can POST an action with a `Next-Action` header against `srimart.localhost:8787`.

## Known-shaky areas

- **The live proof ran in this context, so it is evidence, not validation.** Results, all against
  dev under `npm run preview` (2026-10-11), browser journeys driven by headless Chrome over CDP
  (the Claude-in-Chrome extension was not connected), Aheed at `localhost:8787`:
  - R42 harness: every R6/R7/R8/R9/R11 line PASS, cleanup "0 left behind".
  - R43: Delivery → `ANSWERED`; Swap + handoff → `HANDED_OFF`, decoded text
    `Hi Aheed Food Centre, I have a question about: Swap an item in my order.` (72 chars), no
    picker for a guest; Something else, closed → `ABANDONED`. Signed in as
    `demo-customer@example.com`, the picker listed exactly that shopper's five newest Aheed order
    numbers (checked against the database).
  - R27: both vendors off → neither page has `Open help assistant`; Aheed on → Aheed has it,
    SriMart does not. Aheed on but no number → no control.
  - R28 live: Escape closed the dialog and focus landed on `Open help assistant`.
  - R32: `--open-help-assistant` at 360 and 390 → `documentScrollWidth` equals the viewport.
  - R35: replaying the switch form's hidden fields as `demo-staff@example.com` left
    `assistantEnabled` **true**; the identical replay as `demo-store-admin@example.com` set it
    **false**, so the replay genuinely writes and the STAFF refusal is real.
  - R37: tiles read 4 / 1 / 1 / 2, matching the database; topic table and top-handed-off correct.
  - **Dev state afterwards:** both vendors `assistantEnabled = false` (Aheed restored by the admin
    replay), Aheed's number unchanged, and **four journey rows remain** for Aheed (harmless; a
    re-run adds more, and the R11 harness measures deltas).
- **Hydration.** A click on `Open help assistant` before React hydrates does nothing (server-rendered
  button). The CDP driver needed a retry loop for that, which is what a validator scripting clicks
  will hit too. Not a defect: every client control on the storefront behaves the same.
- **No focus trap.** The dialog is `aria-modal` with initial focus on its heading and Escape and
  return focus, but Tab can move out of it. R28 does not require a trap. Worth a look at
  accessibility review.
- **Driving the switch over curl.** It is a `useActionState` form, so it posts `$ACTION_REF_1`,
  `$ACTION_1:0`, `$ACTION_1:1` and `$ACTION_KEY`, not a single `$ACTION_ID_<hash>` — exactly as
  `docs/developer-portal/local-dev-playbook.md`'s "Live-testing staff panel server actions" section
  already documents, including reusing the fields from a page the caller is refused. Read them from
  the admin page's `<form>`, re-read `$ACTION_KEY` per submission, replay with `curl -F`. **Node's
  `fetch` cannot set `Host`**, so locally it never reaches a chosen vendor; use
  `curl -H "Host: …"`. That trap is the one new playbook entry (1.25.0).
- **The migration reached dev by hand** (the `#895` route): `prisma migrate diff
  --from-schema-datasource --to-schema-datamodel --script`, read in full, `prisma db execute`, then
  `prisma migrate resolve --applied 20261011120000_p1015_1014_help_assistant`. `migrate status`
  reports dev up to date. **A validator does not need to apply anything.** Staging and production
  get it from CI.
- **Local full suite:** the first full `npx vitest run` after the build timed out one whole-tree
  scan (`motion-reduce-coverage`, passes alone); the next default run was clean, **232/232 files,
  2988 tests**. The `#1037` class.
- **`tests/storefront-chrome-rewards-gate.test.tsx`** passes unchanged; its profile fixture has no
  `assistantEnabled`, so the new prop evaluates false there.
