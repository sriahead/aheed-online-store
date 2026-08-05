# ADR-002 — Authentication Library

- **Status:** Accepted (unchanged by the Cloudflare/Neon pivot).

## Decision
Use **Better Auth** (MIT, self-hosted, free): framework-agnostic, API-first, issues bearer tokens
natively — fits the headless design, the Workers Node.js runtime, and the future mobile client.
Methods: Google Sign-In (OIDC) + email/password. Model: OIDC → short-lived JWT access token →
rotating server-tracked refresh token → RBAC on every route. Roles: Customer, Staff, Admin.

## Consequences
Runs on the Workers runtime (Web Crypto compatible). Rejected hosted IdPs (Clerk/Auth0) for the
MVP. Implemented in P1 behind `lib/auth` + `features/auth`.
