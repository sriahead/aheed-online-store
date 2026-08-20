---
id: 2026-08-20-p8-smart-image-generation
title: "P8 — Smart Product Image Generation (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-08-20
visibility: internal
summary: A smart product image pipeline that fetches from Open Food Facts or falls back to Cloudflare Workers AI flux-1-schnell, with an interactive admin preview and a batch backfill job.
tags: [p8, image-generation, ai]
---

# P8 — Smart Product Image Generation (plan)

**Goal:** Automate product image creation for Aheed Food Centre to eliminate the manual bottleneck of photographing every new grocery item.

**Scope (this slice):**
- **Database Migration**: Add an `imageNeedsReview` boolean column to the `Product` model (default `false`) to flag AI-generated images that an admin must verify.
- **Service Layer (`lib/services`)**: 
  - `ProductMetadataService`: Queries the Open Food Facts API by product name or barcode.
  - `ImageGenerationService`: A port that uses Cloudflare Workers AI via REST `fetch` (flux-1-schnell) to generate an image from a prompt.
  - `ProductImagePipeline`: Orchestrates the fallback logic and uploads the resulting buffer to the existing `StorageService`.
- **Interactive Flow**: A new API route (`POST /api/admin/product-images/generate`) protected by `requireVendorRole("ADMIN")`. The admin panel's product form gains an "Auto-Generate" button to call this and preview the image.
- **Batch Backfill Flow**: A new API route (`POST /api/admin/jobs/backfill-images`) that selects up to 10 products with `imageKey = null` and processes them via the pipeline, setting `imageNeedsReview = true` if the AI fallback was used.

**Deliberately excluded:**
- Cloudflare Cron Triggers configuration (`wrangler.toml` changes). The backfill job is just an HTTP endpoint for now; scheduling it is a separate infra task.
- OpenAI or other paid APIs. We stick to Cloudflare REST for cost and Open Food Facts.

**Open items carried forward:** None.
