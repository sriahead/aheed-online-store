---
id: adr-002-auth-library
title: "ADR-002 — Authentication Library"
audience: [dev]
type: adr
status: approved
version: "1.0.0"
updated: 2026-08-06
visibility: internal
summary: Decision to use Better Auth (self-hosted, bearer tokens, RBAC) for email/password and Google Sign-In, rejecting hosted IdPs like Clerk/Auth0 for the MVP.
tags: [adr, auth, better-auth, rbac]
related: [architecture, adr-001-hosting]
---

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
