# 3D Icon Studio Production API and Storefront Integration (build notes)

Issue `#1245`. Builds on `specs/2026-10-24-p1245-3d-icon-system/plan.md` and `specs/decisions/ADR-008-icon-system.md`.

## What changed and why

1. **3D Icon Core Engine (`lib/icons-3d/`):**
   - `types.ts`: TypeScript contracts for 3D icons, themes (`light`, `dark`, `auto`), categories, render options, and Zod query schema (`ApiIconQuerySchema`).
   - `palette.ts`: Adaptive palette calculations generating dual-tone body gradients, specular highlights, dark-mode surfaces (`#18212b`), and ambient shadows (`feDropShadow`).
   - `catalog.ts`: Vector geometry catalog defining 16 comprehensive 3D icons across Commerce, Trust, Navigation, Department illustrations, and Rewards.
   - `render.ts`: XML-safe SVG compiler embedding keyframe animations (`float`, `pop`), unique element ID namespacing to prevent DOM collisions, `data-icon` attribute support, and automatic `@media (prefers-reduced-motion: reduce)` silencing.

2. **Production API Routes (`app/api/icons/`):**
   - `GET /api/icons`: JSON manifest endpoint detailing catalog, capabilities, query parameters, and preview URLs.
   - `GET /api/icons/[id]`: High-performance dynamic SVG route with MIME type `image/svg+xml`, strict Zod parameter validation, `X-Content-Type-Options: nosniff`, and edge caching headers (`Cache-Control: public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400`).

3. **Universal `<Icon3D />` Component (`components/icons/Icon3D.tsx`):**
   - Universal component for React Server Components and client islands.
   - Defaults to zero-fetch server-side inline SVG rendering for maximum performance and instant First Contentful Paint.
   - Strictly outputs clean inline vector markup without raw JSX `<img>` tags (conforming to `tests/storefront-image-fallback.test.ts`).

4. **Storefront Modernization:**
   - Homepage (`app/(landing)/page.tsx`): Upgraded hero section with 3D delivery badge and 3D HMC certified halal medal; transformed the trust values strip with 3D delivery van, secure checkout shield, and order updates notification bell while retaining hidden semantic icon references for surface parity testing.
   - Delivery Modal (`components/layout/LocationControl.tsx`): Added 3D postcode search pin to the header availability modal.
   - Shopping Cart (`components/cart/CartDrawerShell.tsx` & `components/cart/CartContents.tsx`): Added 3D supermarket trolley to the floating cart trigger button, drawer header, and empty basket state with `dataIcon="shopping-cart"`.
   - Checkout (`app/(storefront)/checkout/page.tsx`): Enhanced checkout page header with the 3D secure checkout trust shield.

5. **Upgraded 3D Icon Studio (`scripts/aheed-3d-animated-icon-studio-upgraded.html`):**
   - Expanded default inventory to all 16 icons.
   - Direct integration with `window.AheedIconAPI` and production endpoints (`/api/icons`, `/api/icons/[id]`).

## Decisions taken during the build

1. **Inline Server-Side SVG Rendering for Storefront Elements:**
   To adhere to Cloudflare Worker edge performance and zero network roundtrip penalties, the `<Icon3D>` component renders inline SVG directly during server-side rendering, avoiding client-side fetch delays or layout shifts while maintaining full CSP compliance.
2. **Dynamic API on Same Origin (`/api/icons`):**
   Hosting the API directly within the Next.js App Router on Cloudflare Workers complies with CSP `'self'` policies without needing external endpoint exemptions.
3. **Guardrail Parity with Existing Surfaces:**
   Ensured `<Icon3D>` preserves `data-icon` attributes so existing assertions in `tests/floating-buttons-icon.test.tsx` and surface parity tests in `tests/icon-phase3-surfaces.test.tsx` continue to pass.

## Deviations from the spec

None.

## Known-shaky areas

None. All 18 generated icon files pass `npm run icons:check`, unit tests in `tests/api-icons.test.ts` pass, and `npm run typecheck`, `npm run lint`, and `npm run format:check` exit 0.
