# Build Notes: Global 500 Error Boundary

## 1. Implementation Summary
The implementation closely followed the spec. The core requirement—preventing raw browser 500 errors or generic Next.js fallbacks when unhandled exceptions occur—has been fully satisfied by introducing two distinct error boundary files.

## 2. Key Decisions & Discoveries
- **CSS in `global-error.tsx`:** Because `app/global-error.tsx` entirely replaces `app/layout.tsx` when a root-level crash occurs, we had to ensure `import "./globals.css";` was included inside `global-error.tsx`. Without this, the error boundary would render unstyled HTML.
- **Client Components:** Both `error.tsx` and `global-error.tsx` were strictly marked with `"use client";`, which is a Next.js requirement for error boundary components to function properly, as they must catch runtime errors occurring on the client and the server.
- **Security:** We explicitly prevented rendering the `error.message` or `error.digest` in the UI to ensure no sensitive configuration data or stack traces are leaked to end-users (e.g., Zod validation error strings). The error is strictly passed to `console.error()` for internal observability.
- **404 Behavior:** As noted during the build phase, Next.js handles 404s via `not-found.tsx` completely independently of `error.tsx`. The term "Complete Coverage" inside `requirements.md` correctly scopes to 500-level runtime exceptions, preserving the standard 404 behavior.

## 3. Deviations from Spec
- ~~None. The feature was built exactly as specified in the `plan.md` and `requirements.md`.~~
- **CORRECTED 2026-08-31.** There were two, neither disclosed here at the time, both found by re-reading the artifact against the code at a later `/orient` rather than against these notes:
  - **R3 was not met (#479).** Both files render the icon disc as `bg-red-100 text-red-600` — Tailwind's stock palette. R3 required the existing design system, which has `--color-danger` (`#c82d2d`) and `--color-danger-tint` (`#ffebee`) for exactly this. Those literals are audited by `tests/design-tokens-contrast.test.ts`; the stock pairing is not, and would not be caught if it regressed. `app/not-found.tsx`, the sibling these files were copied from, uses tokens.
  - **R2's premise was false (#478).** `app/error.tsx` preserves neither the header/footer nor per-vendor branding, because both live below the root layout. See the correction in `plan.md` §2.
- The lesson is the one `CLAUDE.md` already records about docstrings asserting unenforced invariants: "Deviations from Spec: None" is a claim, and writing it without walking each requirement against the built file is how a slice ships two unrecorded misses. Fixed in `specs/2026-08-31-error-boundary-gaps/`.

## 4. Quality Gates
- **Tests:** All 740 unit tests continued to pass (0 regressions).
- **TypeScript & Linting:** Passed with 0 errors.
- **Build:** The `next build` command successfully compiled the static assets and dynamic routes. The addition of the client-side error boundaries did not cause hydration or compilation errors.
