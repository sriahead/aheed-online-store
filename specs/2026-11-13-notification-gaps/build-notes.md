# Notification gaps (build notes)

Issue #1552. Built 2026-11-13 in the worktree `E:\GitRepositories\aheed-wt-1552` (branch
`feature/1552-notification-gaps`, from `origin/staging` at `405a663a`).

## What changed

- `PAYMENT_FAILED` joins `ORDER_EVENTS` (`lib/order-notifications/next-step.ts`), with customer
  copy (`customer-email.ts`) and an owner title (`owner.ts`). Because the existing tests iterate
  `ORDER_EVENTS`, it inherits the link, escaping and no-marketing checks with no new test code.
  It is not an order status, so `notifyBulkStatusChange` can never produce it.
- `app/api/webhooks/stripe/route.ts` notifies it only for `async_payment_failed` with `ok: true`.
- `lib/order-notifications-service.ts` exports `sendVendorNotifications` and
  `loadVendorNotificationContext`, so the non-order messages reuse the #1435 dispatcher and outbox.
- Contact acknowledgement: `acknowledgementEmail` (`lib/contact/message.ts`), a new `acknowledge`
  dependency in `lib/contact/submit.ts`, bound in `lib/contact-service.ts`.
- Registration: `lib/notifications/registration.ts` (pure) and `lib/registration-alert-service.ts`,
  called from `lib/auth.ts`'s `user.create.after` hook after the marketing-consent record.
- Error rate: `getPlatformAlertChatId` (`lib/config.ts`), `claimErrorRateAlert` (`lib/job-signals.ts`),
  `lib/notifications/error-rate-alert.ts`, wired into `app/api/jobs/check-error-rate/route.ts`;
  `scripts/configure-env.mjs` pushes the new optional secret.

## Decisions

- The acknowledgement repeats no shopper text (name, subject, message): the form accepts any address.
- The registration alert fires at account creation, before email verification, and says "New account"
  rather than "New customer" because any account creation passes through the hook.
- The error-rate claim fails open (no KV or a KV error sends anyway): a missed alert is worse than a
  repeated one, and the job runs at most every 15 minutes.

## Checks

- Full suite: 453 files, 6510 tests passed (`--maxWorkers=4`). Lint clean on changed files.
- Typecheck: only the two known stale-Prisma-client errors from the shared `node_modules`
  (`lib/repositories/ai-usage.ts`, `lib/repositories/bundles.ts`), in files this slice does not touch.
- Not independent: validated in-session.
