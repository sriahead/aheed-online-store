# P9.1: Production Authentication Rate Limiting (requirements)

Closes #431. Better Auth's built-in rate limiter is incompatible with Cloudflare Workers due to its memory store and `$transaction` usage. This slice reuses the Postgres-backed fixed-window rate-limiting pattern from order lookups to bound credential stuffing and password-reset abuse across isolates.

R1. `prisma/schema.prisma` contains an `AuthenticationAttempt` model matching the `vendorId` / `ipHash` / `createdAt` structure of `OrderLookupAttempt`, and `npx prisma format` exits 0.
R2. `lib/repositories/auth-rate-limit.ts` exports `checkAuthRateLimit(prisma, vendorId, ip)`, which permits at most 5 attempts per IP hash per 1-minute window, inserting a new record on each allowed attempt.
R3. The function in R2 takes `prisma` as an explicit parameter and does not resolve its own client (compliant with `tests/repository-client-injection.test.ts`).
R4. `lib/auth.ts` intercepts requests using an `onRequest` hook in the Better Auth configuration.
R5. The hook applies the rate limit only to the sensitive paths: `sign-in`, `sign-up`, `forget-password`, `reset-password`, and `send-verification-email`.
R6. When the rate limit is exceeded, the hook short-circuits the request and returns a `429 Too Many Requests` HTTP response.
R7. `CHANGELOG.md` is updated (Gate 4).
R8. `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run format:check` all remain green after this slice.
