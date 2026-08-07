# Dev View — Admin diagnostics page (validation)

| Req | How to verify |
|-----|---------------|
| R1  | `npx tsc --noEmit` passes with `getDevDiagnostics()`'s return type; a scratch/log call shows `integrations` values are all `boolean`. |
| R2  | `npx vitest run tests/dev-diagnostics.test.ts` — green, including the "flag true when key set / false when unset" cases and the assertion that a sentinel secret value does not appear in `JSON.stringify(getDevDiagnostics())`. |
| R3  | `grep -n "requireRole(\"ADMIN\")\|force-dynamic\|redirect(\"/login\")" app/(storefront)/dev/page.tsx` shows all three. In `npm run preview` (or staging), hitting `/dev` while signed out redirects to `/login`; as a non-admin (demo-customer) shows the "administrators only" message; as an admin shows the diagnostics. |
| R4  | On staging, sign in as `demo-admin@example.com` and load `/dev`: the page shows Environment = Staging, the current commit, ✓/✗ integration rows, and the admin's id/email/role. |
| R5  | With `KMS_INTERNAL_URL` unset (current state) the page shows a "pending setup" note and no anchor to an empty href; setting the var (or a scratch check) would render a real link. |
| R6  | `grep -nE "S3_SECRET_KEY\|GOOGLE_CLIENT_SECRET\|BETTER_AUTH_SECRET\|RESEND_API_KEY\|DATABASE_URL" app/(storefront)/dev/page.tsx lib/dev-diagnostics.ts` returns only the *presence-check* usages inside `getDevDiagnostics()` (no value ever rendered). |
| R7  | `git diff origin/staging...HEAD --name-only` includes `CHANGELOG.md`. |
| R8  | `npm run lint && npm run format:check && npx tsc --noEmit && npx vitest run` all exit 0. |
