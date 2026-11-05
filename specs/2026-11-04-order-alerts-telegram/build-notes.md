# Telegram alerts for order-related inquiries (build notes)

Written at the end of Build, **before** the Clear. This is the one artifact the Clear bets on:
the validating context is fresh and has only the spec, the artifact, and this file.

## What changed and why

**WHERE THIS WAS BUILT: a separate git worktree, not the main checkout.** The worktree is
`E:\GitRepositories\aheed-online-store-alerts`, on branch `feature/order-alerts-telegram`.
- Another Claude session was working in the main folder `E:\GitRepositories\aheed-online-store` at
  the same time. Mid-Spec it switched that folder to `feature/product-filtering-cro`, first stashing
  this slice's staged spec (`stash@{0}`, "wip: order alerts telegram"). Nothing was lost.
- The owner chose to build in the worktree. Run every validation command **from the worktree**:
  `sdd:preclear` derives the slice from the current branch, and the main folder is on a different
  one.
- The worktree has its own `node_modules` (`npm ci`, then `npm run db:generate`). It also has
  copies of the main folder's `.env` and `.dev.vars`. Both are gitignored and copied as they were,
  not re-checked against `secrets/*.vars`; diff them before any database work (CLAUDE.md).

**Commits:** `ed692b8c` (spec), `9c9e2a83` (R8 spec amendment, see Deviations), `ae8d067f`
(implementation), then this build-notes commit.

**Files, by requirement:**
- R1, R2: `prisma/schema.prisma` and `prisma/migrations/20261104160000_order_alert_recipient/`.
  The migration body is Prisma's `migrate diff` output, byte for byte, checked with `diff` at
  Build. It has **not been applied to any database**.
- R3: `getTelegramBotToken` in `lib/config.ts`.
- R4:
  - `scripts/configure-env.mjs`: `TELEGRAM_BOT_TOKEN` added to `OPTIONAL_WORKER_SECRETS`.
  - `docs/developer-portal/env-setup.md`: two rows.
  - `secrets/example.vars`: one optional line.
- R5–R7: `lib/order-alert/brief.ts`, `lib/order-alert/channels.ts`, `lib/order-alert/send.ts`, and
  the request-scoped facade `lib/order-alert-service.ts`.
- R8: `lib/repositories/order-alert.ts`.
- R9, R10: `workers/inbound-email/src/index.ts` (`requestOrderAlert`, `parseFromDisplayName`,
  `ALERT_PATH`). The file's header comment was updated: it used to say `#1390` would attach a
  WhatsApp alert.
- R11:
  - `app/api/inbound-email/alert/route.ts`, a thin guard.
  - The logic is `alertForInboundEmailWith(prisma, input, deps)` plus the live wrapper
    `alertForInboundEmail`, both in `lib/inbound-email-service.ts`. That module is used because
    `app/` may not import `@/lib/db`.
- R12: `lib/contact/submit.ts` (the `alert` dependency) and `lib/contact-service.ts` (live wiring).
- R13–R15:
  - `lib/client-setup/form-state.ts`: `CHAT_ID_MESSAGE` and two schemas.
  - Three actions in `app/(admin)/staff/platform/client-setup/actions.ts`.
  - `components/staff/client-setup/OrderAlertForms.tsx`.
  - The "Order alerts" card in `app/(admin)/staff/platform/client-setup/page.tsx`, placed after the
    "Test email" card inside the Email section.
  - `FormMessage` in `EmailSetupForms.tsx` is now exported, so it is reused rather than copied.
- R16: `docs/platform-admin-guide/platform-admin-guide.md`, Client Setup section.
- R17: `specs/tech-stack.md`, "Staff alerts". Written at Spec, in commit `ed692b8c`.
- R18: `app/(storefront)/privacy/page.tsx`. The sentence is a JS string expression (`{"…"}`) in both
  branches, so it sits on one physical line with a real apostrophe and R18's
  `grep -c` gives `2`. Wrapped JSX text with `&apos;` gave `0`.
- R20: `CHANGELOG.md`.

**Tests added or extended:**
- `tests/order-alert.test.ts` (R5–R7, 20 tests).
- `tests/config-telegram-bot-token.test.ts` (R3).
- `tests/inbound-email-alert-route.test.ts` (R11: route branches plus `alertForInboundEmailWith`).
- `tests/inbound-email-worker.test.ts` (R9, R10 cases appended).
- `tests/contact-form.test.ts` (R12 block appended; `alert` added to the `deps()` double).
- `tests/client-setup-order-alerts.test.ts` (R14 schema).

At Build, the full suite (`--maxWorkers=4`) had one failing file, `tests/neon-migration-plan.test.ts`.
It requires every model to be classified. That is fixed (see Decisions). Lint, typecheck and
format:check were green.

## Decisions taken during the build

- **The Worker awaits the alert call after `forward()`** rather than using `ctx.waitUntil`.
  Forwarding has already completed by then, so the extra wait cannot affect delivery, and the
  handler stays a plain awaited function that the existing tests drive.
- **The alert route re-resolves the address itself.** It runs `resolveInboundEmailWith` again
  rather than trusting a vendor id or `orderRelated` flag from the Worker. That is one extra indexed
  lookup per order-related email. The token already authenticates the caller; this also means a
  replayed call cannot target another store.
- **`sendOrderAlert` counts an unreadable recipient list as one `failed`** and logs
  `order alert vendorId=<id> status=failed reason=recipients unreadable`, with no `channel=` (there
  is no recipient). R7(d)'s line format covers per-attempt lines; this is the only other line.
- **Channel label map, `ORDER_ALERT_CHANNEL_LABEL`** (`lib/order-alert/channels.ts`). It is typed
  `Record<OrderAlertChannel, string>`, so `#1424` cannot add `WHATSAPP` without a label. It lives in
  `lib/`, not the page, so `app/` does not import a Prisma type.
- **The test alert uses `fetchVendorProfile` from `lib/repositories/vendor`**, through the explicit
  client. `alertForInboundEmail` gets the store name the same way.
- **The Telegram adapter treats an unreadable response body as `failed`** with reason
  `telegram <status>: no description`.
- **`VendorOrderAlertRecipient` is classified `skip` in `scripts/lib/neon-migration-plan.ts`.** It is
  per-environment, like `VendorInboundAddress`: a staging chat must not be copied into a new
  production database. This was forced by `tests/neon-migration-plan.test.ts`, which fails on any
  unclassified model.
- **`secrets/example.vars` gained `TELEGRAM_BOT_TOKEN=`.** Not a requirement, but it is how the
  owner's `secrets/<env>.vars` learns the key that `configure-env` now pushes.
- **No retry** for a failed alert. This was decided at Spec (`plan.md`), not deferred: no issue was
  filed.

## Deviations from the spec

- **R8 had three exports; there are four.** The test alert needs a vendor-scoped lookup,
  `findOrderAlertRecipient` (a `findFirst` filtered by `id` and `vendorId`), so that another store's
  id finds nothing (R15). The spec was amended in its own commit `9c9e2a83`, which also corrected the
  R13 validation row: Client Setup's `?vendor=` parameter is the store **slug**, not the id. The
  requirements are now accurate. This note records why they changed.
- **R14 and the Remove action.** The existing `removeInboundAddressAction` does not check that the
  vendor is known. The new `removeOrderAlertRecipientAction` does, because R14(b) requires it of all
  three new actions. This is consistent with the spec, not a deviation from it; noted so a validator
  is not surprised by the difference from its neighbour.

## Known-shaky areas

- **Nothing has run against a real database or a real Telegram yet.**
  - The migration is unapplied. Applying it to dev is an owner command per `validation.md`'s
    "Before you start". Check the database target one variable at a time first.
  - R13–R15's preview rows and R8's live duplicate check (which proves `isUniqueViolation` against
    the real `getPrisma()` HTTP adapter, raw `"23505"`) all need the migration on dev.
- **R19 needs the owner's bot token and a group with the bot in it.** Neither existed at Build.
  Without them R19 is BLOCKED, not passed.
- **`parseFromDisplayName` is a deliberately small parser, not RFC 5322.**
  - It takes the text before the **last** `<`. A display name that itself contains `<` would be cut
    at the wrong place.
  - Multiple encoded words, or a mix of encoded and plain text, are handled by a global replace but
    are only tested with a single word.
  - Wrong output here only makes the name in the alert wrong; it can never leak an address, because
    an address appears only inside the angle brackets that are discarded.
- **The Worker-to-route hop is only unit-tested.** The deployed path is: staging Worker, staging
  app, `/api/inbound-email/alert`, then Telegram. Its first real run is the post-ship sanity check.
  CI deploys the app before the inbound Worker (`deploy-staging.yml`, `deploy-production.yml`), so
  the route exists before the Worker calls it.
- **Contact-form latency.** The alert is awaited inside the Server Action, so a hanging Telegram adds
  up to the adapter's 5 s timeout before the shopper sees success. Unit tests cannot show this.
- **The privacy sentence (R18) is legal-facing copy.** The owner approved the spec with it but was
  told they could change it.
- **Deferred, tracked:**
  - `#1424`: WhatsApp channel.
  - `#1426`: per-vendor alert throttle.
  - `#1427`: self-service Telegram linking and store-admin access.
  - `#1428`: order numbers from the email body.

## Validation pass 1 — not independent (same session, owner's choice), 2026-11-05

Run in the session that built the slice, on Opus, from the worktree at `ed32014a`. **Result: FAIL.**
One finding needs `/fix`, and the live rows wait on the dev migration.

- **Pre-flight, all exit 0:** lint, typecheck, format:check, `vitest --maxWorkers=4` (392 files,
  5796 tests), kms:validate, kms:check-generated, `npm run build`, and the KMS internal site build.
  The worktree needed `npm ci` in `kms/site-internal` first.
- **PASS:** R1, R2 (`diff` empty; no destructive statements; `#895` header), R3–R7, R8 (static and
  the repository tests), R9 (as tested), R10, R11, R12, R14 (static and schema tests), R16–R18
  (static), R20, R21.
- **FAIL, F1 (R9/R16/R18 privacy):** `parseFromDisplayName('"jane@customer.test" <jane@customer.test>')`
  returns `jane@customer.test`. Some mail clients send exactly this header when no name is set, so
  the customer's address reaches Telegram as `From: …`. That breaks R9 ("No sender address is in the
  body"), R16's "the customer's email address [is] never sent", and the privacy sentence. Fix
  direction: treat a display name containing `@` as no name (`null`) in the Worker, and make
  `formatOrderAlert` print `unknown` for an `@` name too, so the contact form's free-text name is
  covered as well. Add tests for both.
- **UNVERIFIED, needs the dev migration:** R8 live duplicate, R13, R14 preview, R15, R18 preview.
  Dev (`ep-dry-morning`) has three migrations unapplied: `20261104120000_promotions_overhaul` and
  `20261104140000_promotions_campaign_marketing` (both already on staging) and this slice's
  `20261104160000_order_alert_recipient`.
- **BLOCKED (owner resource missing):** R19. There is no `TELEGRAM_BOT_TOKEN` in `.dev.vars` or
  `.env`.
- **Ship note:** `origin/staging` moved to `869cec05`. A merge conflicts only in the generated
  `ARTIFACT_INDEX.md`. Regenerate it with `kms:build-index` when merging.

## Fix after validation pass 1, 2026-11-05

- **F1 fixed at both layers.** `parseFromDisplayName` returns `null` when the decoded name contains
  `@` (`workers/inbound-email/src/index.ts`). `formatOrderAlert` prints `From: unknown` for an
  `@` name (`lib/order-alert/brief.ts`), which also covers a shopper typing their email into the
  contact form's name field and anything else that reaches the brief.
- **Spec amended, not loosened.** R5 line 3 and R10 each gained the `@` case, marked "Amended at
  Fix". Their validation rows gained matching cases. R9, R16 and R18 already required this; R5 and
  R10 had not said how.
- **Tests:** three `parseFromDisplayName` cases (quoted, unquoted, B-encoded address-as-name) and
  one `formatOrderAlert` case. Before the fix, the parser returned the address (probe at pass 1).
- **CHANGELOG unchanged:** its "email address … never sent" claim is now true.
- **Next:** validation pass 2 from the top.

## Validation pass 2 — not independent (same session, owner's choice), 2026-11-05

Run from the top at `63bb9b5f`, after the owner applied the three pending migrations to dev
(`ep-dry-morning`). **Result: PASS, except R19, which is BLOCKED.**

- **Pre-flight, all exit 0:** lint, typecheck, format:check, `vitest --maxWorkers=4` (392 files,
  5800 tests), kms:validate, kms:check-generated, the preview build, and the KMS internal site
  build.
- **Live rows, driven with `curl` against `npm run preview`.** Server actions were posted with the
  `useActionState` form fields read from the rendered page. Signed in as
  `demo-platform-admin@example.com` and `demo-store-admin@example.com`; **dev's demo accounts are
  `@example.com`, not `@merqify.com`.**
  - **R13:** with no recipients, the card shows the empty line, a Telegram-only Channel select, the
    Chat ID input, Add recipient, and `Telegram bot token: Not set` with `role="alert"`. The token
    was absent from both `.env` and `.dev.vars`. After adding `-100123`, the list shows `Telegram`,
    `-100123`, Remove and Send test alert. After Remove, the empty state comes back.
  - **R8 live:** adding ` -100123 ` (with spaces) a second time returned "That chat is already an
    alert recipient for this store." So `isUniqueViolation` holds on the real `getPrisma()` HTTP
    adapter.
  - **R14:** `@group` returned the chat ID message. A test alert with no token returned
    `Skipped: TELEGRAM_BOT_TOKEN unset.`. The store admin got `Platform admin only.` from all three
    actions. An unknown vendor id got `That store no longer exists.` from all three.
  - **R15:** with SriMart's vendor id and Aheed's recipient id, Remove returned
    `That recipient was already removed.` and the test alert returned
    `That recipient no longer exists.`. Aheed's card still listed the recipient.
  - **R18:** `/privacy` contains the sentence twice.
- **Environment noise, not the slice:** some page loads returned 500 and two adds hit the action's
  catch branch. The preview's logs show `NeonDbError: … Network connection lost`, with Neon fetches
  taking 5–40 s from local workerd. Those cases were retried and passed.
- **BLOCKED (owner resource missing):** R19. There is no `TELEGRAM_BOT_TOKEN`, and R19(c) also needs
  `INBOUND_EMAIL_TOKEN`, which is absent from the worktree's `.dev.vars`.
- Dev was left with no alert recipients.
