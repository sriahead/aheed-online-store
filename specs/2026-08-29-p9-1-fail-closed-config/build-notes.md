# P9.1: Fail Closed on Missing Production Config (build notes)

- Added `superRefine` to `schema` and `emailSchema` in `lib/config.ts`.
- Enforces presence of `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, and `RESEND_FROM_EMAIL` exclusively when `process.env.NODE_ENV === "production"`.
- Wrote `lib/config.test.ts` to assert that production behavior rejects missing keys while development (`NODE_ENV="development"`) allows them, safely preserving the local/CI mock functionality without risking silent failures in live.
- Used `vi.stubEnv` in Vitest to isolate `NODE_ENV` tests safely without mutating a read-only property in newer Node/Typescript environments.
- Formatted with Prettier and ran `npm run lint`, `npm run typecheck` to verify code health.
