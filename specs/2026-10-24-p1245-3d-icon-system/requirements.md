# Production-ready 3D Icon Studio API and modern 3D icon suite integration (requirements)

Issue `#1245`.

## Functional Requirements

- **R1 (3D Icon Core Engine & Catalog):** A modular, type-safe 3D icon engine (`lib/icons-3d/`) defines the catalog of modern 3D vector icons across commerce, trust, department, and navigation categories. Each icon definition generates multi-layer SVG artwork with layered gradients (`body`, `metal`, `glass`), ambient drop shadow filters (`feDropShadow`), material highlight cues, and subtle CSS animations.
- **R2 (Production API — Manifest Endpoint):** `GET /api/icons` returns an HTTP 200 JSON catalog detailing all available 3D icons, their categories, purposes, default animation styles, and available query parameters. Header carries `Cache-Control: public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400`.
- **R3 (Production API — Dynamic SVG Endpoint):** `GET /api/icons/[id]` serves standalone, theme-aware SVGs with `Content-Type: image/svg+xml; charset=utf-8`.
  - Accepts validated query parameters:
    - `theme`: `light` | `dark` | `auto` (defaults to `auto` or vendor theme).
    - `primaryColor`: Hex color code (e.g. `059669` or `#059669`) for custom/vendor brand color override.
    - `animated`: `true` | `false` (defaults to `true`).
    - `animSpeed`: numeric float between `0.5` and `3.0` (defaults to `1.0`).
    - `style`: `3d` | `outline` (defaults to `3d`).
  - Unknown icon IDs return HTTP 404 with JSON error details. Invalid parameter formats return HTTP 400.
  - Responses include `X-Content-Type-Options: nosniff` and Cloudflare edge cache headers.
- **R4 (Input Validation & XSS Defense):** All endpoint inputs are strictly validated with Zod schemas. SVG generation rejects `<script>`, `<foreignObject>`, and event handlers (`onload`, `onerror`). Dynamic labels and IDs in SVG are XML-escaped to prevent injection.
- **R5 (Storefront 3D Icon Integration):** Polished 3D icons replace flat/placeholder icons across core customer surfaces:
  - **Delivery:** Trust strip delivery tile (`trust-delivery` in `app/(landing)/page.tsx`) and header location trigger (`components/layout/LocationControl.tsx`).
  - **Halal:** Halal trust claim / badge on hero section and halal department tiles.
  - **Postcode Search:** Search cue inside postcode check modal.
  - **Cart / Shopping:** Floating cart trigger in `components/cart/CartDrawerShell.tsx` and empty basket state in `components/cart/CartContents.tsx`.
  - **Secure Checkout:** Trust strip payment tile (`trust-payment` in `app/(landing)/page.tsx`) and checkout security indicator.
- **R6 (Department Illustrations):** Department illustrations in `components/icons/illustrations.ts` are supplemented or upgraded with matching 3D food and grocery vector illustrations (`fruit-veg`, `bakery`, `dairy-eggs`, `halal-meat`, `groceries`, `beverages`, `snacks`, `household`, `frozen-foods`).
- **R7 (Multi-Tenancy & Theming):** SVGs support dynamic color injection using vendor branding CSS custom properties (`--color-primary`, `--color-accent`) to comply with ADR-004, rendering Aheed emerald (`#059669`) or SriMart royal blue/amber automatically.
- **R8 (Accessibility & Reduced Motion):** All SVGs embed `@media (prefers-reduced-motion: reduce)` to disable floating/popping animations automatically when requested by the OS. Each icon carries semantic `role="img"` and accessible title/description tags.
- **R9 (Studio Upgrade & Documentation):** `scripts/aheed-3d-animated-icon-studio-upgraded.html` is upgraded into a complete developer studio with live preview, parameter controls, API test harness, and one-click manifest export. Complete API documentation is provided in `docs/developer-portal/3d-icon-api.md`.
- **R10 (Validation & Verification):** Automated tests in `tests/api-icons.test.ts` verify all endpoints, caching headers, input validation, and SVG generation. Deployment instructions are documented, and live verification on `https://aheedfoodcentre.nocaped.com/` is required before closing.
