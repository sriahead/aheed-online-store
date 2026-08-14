## Overview
We observed recurring `ERROR 2745569299` (500 Server Errors) occurring in the Admin/Staff portal during client-side transitions, particularly when toggling the Staff/Admin view or navigating between certain pages. These crashes were caused by Next.js 15 breaking changes relating to asynchronous request APIs and React Suspense boundaries.

## Issues Addressed
1. **Next.js 15 Missing `<Suspense>` Boundary around `useSearchParams()`**
   - **Bug:** `app/(admin)/staff/inventory/InventoryTable.tsx` used `useSearchParams()` but was not wrapped in a `<Suspense>` boundary in `page.tsx`. In Next.js 15, missing this boundary causes a hard Server Error when the app attempts to perform an RSC fetch or client transition.
   - **Fix:** Wrapped `<InventoryTable>` in `<Suspense fallback={...}>` within `app/(admin)/staff/inventory/page.tsx`.

2. **Next.js 15 Unawaited `params`/`searchParams` Promises on Early Return**
   - **Bug:** Next.js 15 turned `params` and `searchParams` into asynchronous Promises. If a Server Component receives them as props but returns early (e.g., returning a `<PanelRefusal>` due to a 403 Forbidden check) without `await`ing them first, the Next.js router throws a server error during serialization/RSC payload generation.
   - **Fix:** Systematically moved `await params` and `await searchParams` to the top of the function body for all pages in `app/(admin)/staff/...` (Products, Categories, Orders) so that they are strictly awaited prior to the `requireVendorRole` authorization checks.

3. **Systematic Null-Safety (Earlier Fix)**
   - **Bug:** Intermittent 500 errors occurring due to undefined relational properties when rendering products.
   - **Fix:** Applied optional chaining and fallbacks to `listInventoryForStaff` and `listProductsForAdmin` in `lib/repositories/products.ts` (e.g., `row.category?.name ?? "Unknown"`).

## Resolution
- Fixes applied in commit `2ba798a`.
- The staging environment has been automatically redeployed via Cloudflare Pages CI.
