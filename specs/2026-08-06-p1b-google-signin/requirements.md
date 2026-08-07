# P1b — Google Sign-In (requirements / acceptance criteria)

Second and final P1 auth slice, adding Google as a Better Auth social provider on top of P1a's
email/password flow (issue #23, PR #24). Unblocked now that `GOOGLE_CLIENT_ID`/
`GOOGLE_CLIENT_SECRET` are confirmed set on both `staging` and `production` (issue #28). Builds
directly on `feature/p1-auth-foundation` — see `plan.md` for why.

R1. `lib/config.ts`'s zod `schema` gains `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, both
    optional — an environment missing either still parses successfully and runs email/password-only,
    matching the existing `RESEND_API_KEY` optional-credential pattern. `.env.example` and
    `.dev.vars.example` both document both vars.
R2. `lib/auth.ts` exports a pure `buildSocialProviders(env)` function: given both `GOOGLE_CLIENT_ID`
    and `GOOGLE_CLIENT_SECRET`, returns `{ google: { clientId, clientSecret } }`; given either
    missing, returns `undefined` (not `{ google: undefined }`) so Better Auth's own validation never
    sees a half-configured provider. `getAuth()` passes its result as `socialProviders` to
    `betterAuth()`. The existing `emailAndPassword` block is unchanged.
R3. `features/auth/components/GoogleSignInButton.tsx` is a new client component that calls
    `signIn.social({ provider: "google", callbackURL: "/account" })` from the existing `authClient`
    export (`features/auth/api-client.ts`) — no new Better Auth client instance created. On error,
    shows the same inline `role="alert"` error pattern `LoginForm`/`RegisterForm` already use, not a
    silent failure.
R4. `app/(storefront)/login/page.tsx` and `app/(storefront)/register/page.tsx` each read
    `lib/config`'s `getEnv()` server-side and render `<GoogleSignInButton googleEnabled={...} />`
    (or omit it) based on whether both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are present.
    Neither page's existing form (`LoginForm`/`RegisterForm`) changes.
R5. A Google sign-in that creates a new user gets `role: CUSTOMER` via the same Prisma
    `@default(CUSTOMER)` P1a's email/password sign-up relies on — no separate role-assignment path
    for the social provider.
R6. No new Prisma migration exists under `prisma/migrations/` for this slice — `prisma validate`
    confirms the schema is unchanged from what P1a shipped.
R7. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
R8. `CHANGELOG.md` updated (Gate 4), noting the OAuth client is already provisioned (issue #28) —
    no further human action needed for this slice to be live end-to-end, unlike P1a's still-pending
    `RESEND_API_KEY` note.
