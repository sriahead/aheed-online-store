# Guided help assistant with WhatsApp handoff and conversation logging (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Risk-based for this slice: a **public, unauthenticated write path** (rate limit, forged ids,
server-derived text), a **privacy property** (nothing shopper-written or identifying in the log or
the URL), a **database** change (migration, adapter rules), and a **UI** change (dialog
accessibility, mobile overflow). The pure modules carry the logic and get unit tests; the
repository is proved against a real database by a script, because a hand-built Prisma double only
reproduces its author's guess (`CLAUDE.md`); the journey is proved under `npm run preview`.

Files the build creates for this validation (their absence is itself a failure):

- `tests/assistant-content.test.ts` — R12–R17
- `tests/assistant-handoff.test.ts` — R18–R20
- `tests/assistant-actions.test.ts` — R22, R24, R25 (repository and services mocked at the module
  boundary; asserts what reaches the repository)
- `tests/help-assistant-panel.test.tsx` — R28–R31 (actions mocked)
- `scripts/verify-assistant-conversations.ts` — R42, against the dev database

**In the table below, `\|` inside a command is an escaped table pipe — type a plain `|`.**

**`npm run dev` cannot load `@prisma/client/wasm`** — every DB-touching row below says `npm run
preview` or a `tsx` script explicitly. **Run `npx vitest run` alone**, never beside or straight
after a build (`CLAUDE.md`).

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `grep -n 'assistantEnabled' prisma/schema.prisma` shows `assistantEnabled Boolean @default(false)` inside `model VendorConfig { … }`. |
| R2  | Unit | Read `enum AssistantTopic` and `enum AssistantOutcome` in `prisma/schema.prisma`; the value lists match R2 exactly, no more, no fewer. |
| R3  | Unit | Read `model AssistantConversation`; fields and the two `@@index` lines match R3; no field typed `User`, `Order`, `VendorFaq` or `Json`, and no `userId`/`orderId`/`faqId` field. |
| R4  | Integration | `git diff --name-only origin/staging...HEAD -- prisma/migrations/` lists exactly one new `migration.sql` whose directory name contains `p1015_1014`; `grep -ci '\bDROP\b' <that file>` prints `0`. |
| R5  | Unit | `grep -n '^export' lib/repositories/assistant-conversations.ts` shows the three functions, each with a `prisma` and `vendorId` parameter; `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts` exits 0. |
| R6  | Integration | `npx tsx scripts/verify-assistant-conversations.ts` prints a passing R6 line: the created row's `ipHash` matches `^[0-9a-f]{64}$` and equals the SHA-256 of the IP the script passed; no column of the row equals that IP; a 300-character `openingQuestion` is stored at length 200. |
| R7  | Integration | The same script prints a passing R7 line: after 20 rows for (vendor A, IP 1), call 21 returns `null` and the count stays 20; the same call with IP 2, and with vendor B and IP 1, each returns an `id`. |
| R8  | Integration | The same script prints a passing R8 line: with `Math.random` forced to `0.005`, a row back-dated 91 days is deleted and a row back-dated 89 days survives; with it forced to `0.5`, a 91-day row survives. |
| R9  | Integration | The same script prints a passing R9 line covering: the three allowed transitions return `true` and change the row; `HANDED_OFF → ANSWERED`, `ANSWERED → ABANDONED` and `HANDED_OFF → ABANDONED` return `false` and leave it unchanged; an unknown uuid returns `false`; vendor B calling with vendor A's `conversationId` returns `false` and vendor A's row is unchanged; none of these throws. |
| R10 | Unit | `grep -nE 'updateMany\|createMany\|\$transaction\|\$queryRaw\|\$executeRaw\|getPrismaWs' lib/repositories/assistant-conversations.ts features/assistant/assistant.ts lib/assistant-conversations-service.ts` returns only comment lines, or nothing. (The service file name is the build's choice; include whichever `lib/*-service.ts` wraps the repository.) |
| R11 | Integration | The same script prints a passing R11 line: with known rows for vendors A and B (including one 91 days old), `assistantReport(A)` returns exactly the expected total, per-outcome counts, per-pair counts and top questions, and none of vendor B's rows or the 91-day row is counted. |
| R12 | Unit | `grep -nE "from ['\"]@/lib/(db\|repositories/)\|-service['\"]" lib/assistant-content.ts` returns nothing; `npx vitest run tests/assistant-content.test.ts` exits 0. |
| R13 | Unit | `tests/assistant-content.test.ts` asserts the topic set for: collection off/on, loyalty off/on, zero FAQs (no `STORE_QUESTION`), and three FAQs (three entries, same order). Passes. |
| R14 | Unit | The test asserts every fixed label equals the `plan.md` §3 table text character for character, and a FAQ entry's label/answer equal the input row's `question`/`answer`. Passes. |
| R15 | Unit | The test covers: minimum 0 (no minimum stated); threshold `null` and `0` (no free delivery stated); threshold 4000 (`£40.00` stated); an area override making `varies.fee` true (the exact R15 sentence and a `/help` link present); none varying (sentence absent). Passes. |
| R16 | Unit | The test covers `pointsExpiryMonths` null vs 12, the `/account/loyalty` link, collection minimum 0 vs greater than 0, and `ORDER_STATUS` link for signed-in vs guest. Passes. |
| R17 | Unit | The test asserts the three handoff-only entries have no answer, the handoff-only marker, and the exact R17 strings. Passes. |
| R18 | Unit | Read `buildHandoffText`'s parameter type: exactly `vendorName`, `subject`, optional `orderNumber`. `tests/assistant-handoff.test.ts` asserts the exact output for a short input with and without an order number. Passes. |
| R19 | Unit | The test feeds 1,000-character `vendorName` and `subject`, with and without an order number, and asserts length at most 300, vendor name cut to at most 60, `subject` ending in `…`, and the full order-number sentence present. Passes. |
| R20 | Unit | The test asserts `buildHandoffUrl("447700900000", "a b&c")` equals `https://wa.me/447700900000?text=a%20b%26c`. Passes. |
| R21 | Unit | `head -1 features/assistant/assistant.ts` is `"use server";`. `grep -nE '^export (const\|let\|type\|interface\|enum\|class\|\{)' features/assistant/assistant.ts` returns nothing; `grep -n '^export async function' features/assistant/assistant.ts` lists the three actions (and nothing else is exported). |
| R22 | Unit | `tests/assistant-actions.test.ts` asserts that with `assistantEnabled: false`, and separately with `whatsappNumber: null`, each action returns `null` and the mocked repository's `startConversation`/`recordOutcome` are never called. Passes. Proved live by R43. |
| R23 | Integration | Read `loadAssistantContent`: it builds from the four named sources and calls `listOrdersForUser` with `take` at most 5 only when a session user exists. Proved live by R43 (signed-in shopper sees their own order numbers; a guest sees none). |
| R24 | Unit | `tests/assistant-actions.test.ts` asserts: `{ topic: "DELIVERY", question: "x" }` stores the R14 label, not `"x"`; a `STORE_QUESTION` with an active own `faqId` stores that FAQ's question; with an inactive, unknown, or other-vendor `faqId` and with `topic: "NOPE"` no repository call is made and the result is `null`. Read the action: the FAQ lookup filters on `id`, current `vendorId` and `isActive`. Passes. |
| R25 | Unit | `tests/assistant-actions.test.ts` makes the mocked repository throw; both actions resolve to `null`/`false`. Passes. |
| R26 | Unit | `grep -n 'assistantEnabled' lib/repositories/vendor.ts components/layout/StorefrontChrome.tsx` shows the field in the existing profile select and the prop expression `profile.assistantEnabled && profile.whatsappNumber !== null`. |
| R27 | E2E | Under `npm run preview`, `curl -s <vendor-with-assistant-on>/` contains `Open help assistant`; `curl -s <vendor-with-it-off>/` does not. `git diff origin/staging...HEAD -- components/layout/StorefrontChrome.tsx` adds no new `await` and no new service import. |
| R28 | Unit | `tests/help-assistant-panel.test.tsx` asserts the dialog role, `aria-modal="true"`, an accessible name, Escape closing it with focus back on `Open help assistant`, and the back control returning to the topic list. Passes. |
| R29 | Unit | The panel test asserts call counts: two topic choices in one session make one `startAssistantConversation` call; showing an answer makes one `ANSWERED` call; activating the handoff makes one `HANDED_OFF` call; closing then choosing again makes a second start call. Passes. Proved live by R43. |
| R30 | Unit | The panel test with `startAssistantConversation` resolving `null` asserts answers and the handoff link still render and `recordAssistantOutcome` is never called. Passes. |
| R31 | Unit | The panel test asserts the handoff `href` equals `buildHandoffUrl(...)` for a topic with and without a picked order, the exact R31 sentence is present, and the link has `target="_blank"` and `rel="noopener noreferrer"`. Passes. |
| R32 | E2E | Under `npm run preview` with the assistant on for one vendor: `npx tsx scripts/verify-mobile-layout.ts --base <that vendor's local URL> --path / --widths 360,390 --open-help-assistant` reports no overflow at either width. |
| R33 | Unit | `npx vitest run tests/vendor-neutral-copy.test.ts` exits 0. Run `git diff origin/staging...HEAD -- components features/assistant app` and search its added lines for `Aheed` and `SriMart`; read each hit — a hit inside a comment passes, a hit inside a string or JSX text fails. |
| R34 | Unit | Read the page: `requireVendorRole("ADMIN")`, `redirect("/login")` on 401, `PanelRefusal` on 403. `npx vitest run tests/panel-refusal-coverage.test.ts` exits 0. |
| R35 | Integration | Read the save action: `"use server"` file, `requireVendorRole("ADMIN")` before any write, write scoped to the current vendor. Under `npm run preview`, as a STAFF (non-admin) session, POST the action with `curl` (see `docs/developer-portal/local-dev-playbook.md`, curl-driven server actions) and confirm `assistantEnabled` is unchanged in the database. |
| R36 | E2E | Under `npm run preview`, as an admin of a vendor whose `whatsappNumber` is temporarily null, `/staff/assistant` contains the exact R36 sentence and an `href="/staff/storefront"` link. Restore the number afterwards. |
| R37 | E2E | Under `npm run preview`, after R43's rows exist, `/staff/assistant` shows figures matching a direct database count for that vendor; for a vendor with no rows it shows `No conversations in the last 90 days.` |
| R38 | Unit | `grep -n '/staff/assistant' components/staff/PanelNav.tsx 'app/(admin)/staff/page.tsx' docs/store-admin-guide/admin-tabs-guide.md` shows all three; `npx vitest run tests/staff-nav-parity.test.ts tests/panel-refusal-coverage.test.ts tests/operator-doc-coverage.test.ts` exits 0. Read the guide section and match each named capability to a control or figure on the page. |
| R39 | Unit | Read `app/(admin)/staff/faqs/page.tsx`'s intro and the guide's `/staff/faqs` section; each states active answers also appear in the help assistant when it is on. |
| R40 | Unit | Read `app/(storefront)/privacy/page.tsx` section 5; the paragraph states the four facts in R40 (topic and outcome; hashed network address; not linked to name or account; deleted after 90 days). |
| R41 | Unit | `git diff --stat origin/staging...HEAD -- lib/repositories/data-rights.ts` prints nothing. |
| R42 | Integration | `npx tsx scripts/verify-assistant-conversations.ts` exits 0, prints a passing line for each of R6, R7, R8, R9 and R11, and a final line reporting zero rows left behind (it deletes every row it created by id). |
| R43 | E2E | Under `npm run preview` against the dev database: set `assistantEnabled` true for vendor A (which has a `whatsappNumber`), leave vendor B false. In a browser on vendor A, do the three journeys in R43 and read the rows back from the database (newest rows for vendor A): `ANSWERED`, `HANDED_OFF`, `ABANDONED`. Decode the handoff `text` and confirm length at most 300 and no shopper name, email, phone or address. Signed in as a demo shopper, confirm the order picker lists only that shopper's order numbers. On vendor B, `curl -s` the home page (no `Open help assistant`) and confirm vendor B's row count is unchanged. Restore vendor A's `assistantEnabled`. |
| R44 | Unit | `git diff origin/staging...HEAD -- CHANGELOG.md` shows an entry naming `#1015` and `#1014`. |
| R45 | Regression | Each command exits 0, run in this order with `npx vitest run` on its own: `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run kms:validate`, `npm run kms:check-generated`, then `npx vitest run` alone, then `npm run kms:assemble:internal && (cd kms/site-internal && npx next build --webpack)` reading the build's own exit status, not a pipe's. CI on the PR is the authority. |
