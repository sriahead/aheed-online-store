# P9.1: Production Authentication Rate Limiting (build notes)

## What changed and why
- Modified `prisma/schema.prisma` to add an `AuthenticationAttempt` model mirroring `OrderLookupAttempt`.
- Created `lib/repositories/auth-rate-limit.ts` providing `checkAuthRateLimit(prisma, vendorId, ip)`.
- Modified `lib/auth.ts` to implement Better Auth's `onRequest` hook. It detects sensitive requests (`sign-in`, `sign-up`, `forget-password`, `reset-password`, `send-verification-email`), reads the current `vendorId` and client IP address, checks the rate limit against Postgres, and short-circuits with a `429 Too Many Requests` HTTP response if the limit is exceeded. 
- Wrote `tests/repository-auth-rate-limit.test.ts` to verify the fixed-window rate limiter limits requests appropriately.

## Decisions taken during the build
- Used Better Auth's `onRequest` hook rather than wrapping Next.js API Routes manually. The request context from Next.js is naturally available when `getAuth()` runs, allowing us to safely `await import("@/lib/tenant")` and read `getCurrentVendorIdOrNull()`.
- Used `cf-connecting-ip` and `x-forwarded-for` to derive the IP, falling back to `unknown`.
- Explicitly bypassed Better Auth's failing `$transaction` store pattern and opted for the Postgres-backed fixed-window counter to adhere to the Workers-compatible architecture of Aheed Online Store.

## Deviations from the spec
None.

## Known-shaky areas
- Determining the exact behavior of IP resolution in non-Cloudflare local dev vs. the edge Worker environment. We check `cf-connecting-ip` first, then `x-forwarded-for`. If local dev doesn't set these, the fallback `unknown` is used. This is safe, though it groups all local traffic together. In production (the Cloudflare environment), these headers will always accurately identify the user.
