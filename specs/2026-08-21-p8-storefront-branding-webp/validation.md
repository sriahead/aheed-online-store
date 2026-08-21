---
id: 2026-08-21-p8-storefront-branding-webp-validation
title: Storefront Branding & WebP Compression Validation
summary: Validation steps for the vendor branding admin UI and WebP compression.
audience: [dev]
type: spec
version: 1.0.0
updated: 2026-08-21
status: approved
visibility: internal
---

# Validation

| Step | Action | Expected Result |
|---|---|---|
| 1 | Navigate to \/staff/storefront\ | Page renders, showing current Vendor Config and Branding values. |
| 2 | Upload a large PNG (e.g., >2MB) as the Vendor Logo | The file is intercepted, compressed via Canvas to WebP on the client, and uploaded. |
| 3 | Inspect R2 Bucket / Network Tab | The uploaded logo file is \< 100KB\ and is served as \image/webp\. |
| 4 | Trigger an AI Image Generation | The resulting file stored in R2 is encoded as WebP (if Wasm solution succeeds). |

