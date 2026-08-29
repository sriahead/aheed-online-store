# P9.1: Fail Closed on Missing Production Config

This closes #430. It enforces that production configurations explicitly reject missing critical secrets for Stripe and Resend, preventing the application from silently running a stub payment provider.

R1. The `schema` in `lib/config.ts` requires `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to be defined when `process.env.NODE_ENV === "production"`.
R2. The `emailSchema` in `lib/config.ts` requires `RESEND_API_KEY` and `RESEND_FROM_EMAIL` to be defined when `process.env.NODE_ENV === "production"`.
R3. The application still allows missing Stripe and Resend keys when `process.env.NODE_ENV !== "production"`.
R4. `lib/config.test.ts` exists and tests R1-R3.
R5. Running the system in production mode (`npm run preview`) without Stripe credentials causes `getEnv()` to throw a validation error when accessed, preventing the stub provider from being initialized.
R6. `CHANGELOG.md` updated with a P9.1 entry for this slice (Gate 4).
R7. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
