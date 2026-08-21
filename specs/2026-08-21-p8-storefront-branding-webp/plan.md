---
id: 2026-08-21-p8-storefront-branding-webp
title: Storefront Branding & WebP Compression Plan
summary: Implementation plan for vendor branding admin UI and WebP compression.
audience: [dev]
type: plan
version: 1.0.0
updated: 2026-08-21
status: approved
visibility: internal
---

# Plan

1. **Vendor Admin Storefront UI**: Create \/staff/storefront/page.tsx\ to manage \VendorConfig\ and \VendorBranding\ (Logo, brand colors, banner note, hero subtitle).
2. **Client-Side WebP Compression (Manual Uploads)**: Create a helper using \HTMLCanvasElement\ to automatically resize (e.g., max width 1200px) and encode uploaded files (Vendor Logo) as \image/webp\ before uploading. Fixes #243 (1.9MB LCP logo).
3. **AI-Generated Images**: Adopt Option B. We will continue storing the raw PNG AI outputs directly in R2 to avoid injecting heavy and fragile WebAssembly (Wasm) encoders into the Cloudflare Worker Edge runtime. We rely entirely on Cloudflare Image Resizing CDN to format and serve the images as WebP on the fly to users, satisfying LCP performance requirements without destabilizing the AI backend.
