---
id: p1245-3d-icon-system-plan
title: "Production-ready 3D Icon Studio API and modern 3D icon suite integration (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-24
visibility: internal
summary: Upgrade 3D Icon Studio into a production-ready API and generate modern 3D-styled icons across the website. Issue 1245.
tags: [icons, 3d-icons, api, design-system, storefront, cloudflare-workers]
related: [adr-008-icon-system, p1239-noto-emoji-icons-plan, p1242-trolley-group-icons-plan]
---

# Production-ready 3D Icon Studio API and modern 3D icon suite integration (plan)

Issue `#1245`. Approved by owner on 2026-10-24. Extends `specs/decisions/ADR-008-icon-system.md` and upgrades the prototype in `scripts/aheed-3d-animated-icon-studio-upgraded.html` to a production-ready system.

## Context

The user provided `scripts/aheed-3d-animated-icon-studio-upgraded.html` as a working prototype demonstrating layered, theme-aware 3D vector icons with depth gradients, specular highlights, and ambient drop shadows. The user requested:
1. Transforming this prototype into a production-ready API hosted directly on `https://aheedfoodcentre.nocaped.com/`.
2. Expanding the icon set to generate all core website icons (replacing flat/dated icons with a modern 3D pop aesthetic across delivery, halal certification, postcode search, shopping cart, checkout, trust badges, and grocery departments).
3. Ensuring compatibility with Next.js on Cloudflare Workers, strict CSP adherence, edge caching, full accessibility, and multi-tenancy.

## Architecture & Implementation Plan

### 1. 3D Icon Engine (`lib/icons-3d/`)
- Create `lib/icons-3d/catalog.ts`: Central registry of 3D icon definitions containing vector paths, lighting models, material tiers, and category metadata.
- Create `lib/icons-3d/render.ts`: SVG generation engine that builds layered gradients, drop shadow filters, animations, and theme-aware colors with strict XML escaping.
- Create `lib/icons-3d/types.ts`: TypeScript contracts for icon items, themes, rendering options, and API schemas.

### 2. Production API Endpoints (`app/api/icons/`)
- `app/api/icons/route.ts`:
  - Handles `GET /api/icons` returning JSON manifest of all available 3D icons, capabilities, and options.
  - Implements Cloudflare edge caching headers (`Cache-Control: public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400`).
- `app/api/icons/[id]/route.ts`:
  - Handles `GET /api/icons/[id]` delivering dynamic, theme-aware SVGs.
  - Parses and validates query parameters (`theme`, `primaryColor`, `animated`, `animSpeed`, `style`) using Zod.
  - Returns `404` for unknown icons and `400` for invalid parameters.
  - Emits `image/svg+xml; charset=utf-8` with security header `X-Content-Type-Options: nosniff`.

### 3. Modern 3D Storefront Integration
- Create `components/icons/Icon3D.tsx`: Server component that renders 3D vector icons inline (zero client fetch latency, zero CSP friction) while matching the API rendering engine.
- Integrate into core surfaces:
  - `app/(landing)/page.tsx`: Trust strip tiles (`trust-delivery` delivery van, `trust-payment` secure checkout shield, halal badge).
  - `components/layout/LocationControl.tsx`: Postcode checker modal.
  - `components/cart/CartDrawerShell.tsx` & `components/cart/CartContents.tsx`: 3D shopping cart/trolley.
  - Department tiles: Provide high-quality 3D vector department illustrations.

### 4. Studio Upgrade & Documentation
- Upgrade `scripts/aheed-3d-animated-icon-studio-upgraded.html` into a full-featured visual studio tool with live interactive controls, API testing, and manifest generation.
- Document the API endpoints, parameters, caching, and embedding guidelines in `docs/developer-portal/3d-icon-api.md`.

### 5. Automated Testing & Verification
- Unit & integration tests in `tests/api-icons.test.ts`.
- Quality gates: `npm run lint`, `npm run typecheck`, `npm run format:check`, `npx vitest run --maxWorkers=4`, `npm run icons:check`.
- Preview verification with `npm run preview` on local Cloudflare Worker environment.
- Live staging and production verification on `https://aheedfoodcentre.nocaped.com/`.
