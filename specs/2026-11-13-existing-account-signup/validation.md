# Sign-up with an existing email (validation)

| Req | How to verify |
| --- | --- |
| R1 | `tests/existing-account-signup.test.ts`: `lib/auth.ts` wires `onExistingUserSignUp` to `notifyExistingAccountSignUp`; new sign-up hooks untouched (existing tests stay green). |
| R2, R3, R4 | `tests/existing-account-signup.test.ts`: subject, absolute `/login` link, forgot-password only with `credential`, Google line only with `google`, fallback with neither, escaped store name, no token-bearing link. |
| R5 | `tests/existing-account-signup.test.ts`: a throwing loader, sender or send resolves and logs without the address. |
| R6 | `tests/existing-account-signup.test.ts` reads `RegisterForm.tsx` for the neutral copy and the absence of "verification link". |
| R7 | `git diff --stat` shows no `prisma/` change; `SENSITIVE_AUTH_PATHS` still lists `/sign-up/email`. |
| R8 | AFC staging check after deploy, recorded in `build-notes.md`. |

Gates: `npm run lint`, `npm run typecheck`, `npx vitest run --maxWorkers=4`, `kms:validate`,
`kms:coverage`.
