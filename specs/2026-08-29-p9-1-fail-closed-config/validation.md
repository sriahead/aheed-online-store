# P9.1: Fail Closed on Missing Production Config (validation)

| Req | How to verify |
|-----|---------------|
| R1  | `npx vitest run lib/config.test.ts` exits 0 (verifies production rejection for STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET). |
| R2  | `npx vitest run lib/config.test.ts` exits 0 (verifies production rejection for RESEND_API_KEY/RESEND_FROM_EMAIL). |
| R3  | `npx vitest run lib/config.test.ts` exits 0 (verifies dev allowance). |
| R4  | `ls lib/config.test.ts` exits 0. |
| R5  | `git diff origin/staging CHANGELOG.md` shows the P9.1 entry. |
| R6  | `npm run lint && npm run typecheck && npm run test && npm run format:check` all exit 0. |
