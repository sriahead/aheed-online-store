# Auth HTTP-mode transaction crash fix (validation)

| Req | How to verify |
|-----|---------------|
| R1  | Read `lib/auth.ts`'s wrapper; `npx vitest run tests/auth.test.ts` exits 0 asserting `wrapped.$transaction` is `undefined`. |
| R2  | `grep -n "getPrismaWs" lib/auth.ts` returns no match; `grep -n "getPrisma(" lib/auth.ts` still shows the call inside `getAuth()`. |
| R3  | `git diff origin/staging -- lib/repositories lib/*-service.ts` is empty (excluding `lib/auth.ts` and its test). |
| R4  | `npx vitest run tests/auth.test.ts` — read the test and confirm it exercises both the hidden `$transaction` and a real delegated call (not just a `typeof` check in isolation). |
| R5  | Live on a real deployed environment (staging first): sign in as `demo-admin@example.com`, open a bundle's edit page, run the upload flow (file select, alt text, Upload) **5 times in a row**, confirming each completes without the "This page couldn't load" error. Cross-check with `wrangler tail --env staging` that no `Transactions are not supported in HTTP mode` line appears during the run. |
| R6  | `git diff origin/staging -- CHANGELOG.md` is non-empty. |
| R7  | `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run format:check` each exit 0. |

## Note on validation context

This fix was built and validated in the same session/context (a same-session hotfix, not a
fresh-context `/validate` per the normal SDD loop) because the defect was found live while
shipping an unrelated slice (P8.5d) and the user asked for it to be fixed immediately. R5's live
check is the row that actually proves the fix — everything else is static/unit-level and does not
by itself prove the crash is gone.
