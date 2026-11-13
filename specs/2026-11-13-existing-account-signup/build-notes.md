# Sign-up with an existing email (build notes)

Issue #1558. Built 2026-11-13 in the worktree `E:\GitRepositories\aheed-wt-1558` (branch
`feature/1558-existing-account-signup`, from `origin/staging` at `44f88ec5`).

## What changed

- `lib/notifications/existing-account.ts` (pure): `existingAccountEmail` and the injectable
  `notifyExistingAccountSignUp`, which never rejects and logs only the user id.
- `lib/existing-account-signup-service.ts` binds it: `getAccountProviders` (reused from
  `lib/repositories/data-rights.ts`), `getCurrentVendorSender`, `getEmailService().send`.
- `lib/auth.ts`: `baseURL` hoisted to a local so the hook can build absolute links from the same
  per-request origin Better Auth uses; `onExistingUserSignUp` wired under `emailAndPassword`.
- `features/auth/components/RegisterForm.tsx`: neutral success copy.

## Decisions

- The builder lives in `lib/notifications/` beside the registration alert rather than a new
  `lib/auth/` folder, which would sit confusingly next to `lib/auth.ts` (plan updated).
- Sent through `getEmailService().send` directly, like the verification and reset emails, not the
  #1435 dispatcher: it is an auth email in the same family, and an outbox retry hours later for a
  "did you mean to sign in?" message has no value.
- Better Auth's hook fires before its own synthetic-user response and is awaited
  (`runInBackgroundOrAwait`, no background runner configured). A new sign-up also sends an email
  inside the request, so the timing difference is small; accepted in the plan.

## Not yet verified

- R8, live on AFC staging after deploy.
