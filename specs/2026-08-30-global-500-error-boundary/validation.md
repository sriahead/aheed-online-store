# Validation: Global 500 Error Boundary

## 1. Automated Checks
- [ ] `npm run lint` and `npm run typecheck` pass.
- [ ] Next.js build succeeds (`npm run build`).

## 2. Live Validation (Local Preview)

### V1. Nested Error Boundary (`app/error.tsx`)
1. In development (`npm run dev`), temporarily throw an error inside a page component (e.g., `app/(storefront)/page.tsx`): `throw new Error("Test Nested Error");`.
2. Load the page.
3. Verify that the branded error UI appears *inside* the standard site layout (header and footer are still visible).
4. Verify no raw error details are shown on the screen (dev mode may show the Next.js overlay, close it to see the actual UI).
5. Remove the thrown error.

### V2. Global Error Boundary (`app/global-error.tsx`)
1. In development, temporarily throw an error inside the root layout (`app/layout.tsx`).
2. Load the site.
3. Verify the branded `global-error.tsx` UI renders correctly (without the standard site layout, since it failed to render).
4. Remove the thrown error.
