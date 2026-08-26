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
| R8  | `grep -n "rateLimit" lib/auth.ts` shows `rateLimit: { enabled: false }` unconditional (not behind an `if`/ternary keyed on `NODE_ENV` or similar). |
| R9  | **The row that actually matters.** Live on staging: sign in as `demo-admin@example.com`, run the bundle-photo upload flow (file select, alt text, Upload) **5 times in a row** against a deployment carrying both R1 and R8, confirming each completes without the "This page couldn't load" error. Do not stop at the first clean attempt — R5 alone passed on a single early attempt once before and the crash was still present; only a run of 5+ is informative given the bug's own intermittency. |

## Note on validation context

This fix was built and validated in the same session/context (a same-session hotfix, not a
fresh-context `/validate` per the normal SDD loop) because the defect was found live while
shipping an unrelated slice (P8.5d) and the user asked for it to be fixed immediately.

**R5 was run and appeared to pass, then was re-run and failed** — the first live attempt after
deploying R1-R4 alone happened to succeed (session hadn't triggered the rate-limiter's write path
yet), and was very nearly reported as confirming the fix before a second and third attempt crashed
with the identical error digest. That near-miss is the reason R9 requires 5+ consecutive attempts,
not "it worked once": this bug's intermittency makes a single clean run worthless as evidence.
