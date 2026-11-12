---
id: 2026-11-12-bundle-promotion-images-plan
title: "Bundle and promotion images: AI generate, fill missing, remove, review flag (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-11-12
visibility: internal
summary: "Gives bundles and promotions the products' image options: AI generation flagged for review, a capped fill-missing run for bundles, Remove and Replace, and an imageNeedsReview column on both."
tags: [staff-panel, bundles, promotions, ai, images]
related: [2026-11-12-promotion-form-current-target-plan]
---

# Bundle and promotion images (plan)

Issue #1535. Owner request, 2026-11-12: give bundles and promotions the same image options as
products, with AI generation and an automatic fill for missing bundle photos. The owner approved the
scope below (the questions and answers are recorded in the issue). Filling is button-only; there is no
nightly job.

## Before

| Option | Products | Promotions | Bundles |
| --- | --- | --- | --- |
| Upload | yes (gallery) | yes | yes |
| AI generate | yes | only with new copy | no |
| Fill all missing | yes (10 per click) | no | no |
| Remove | yes | yes (form) | no |
| Needs-review flag | yes | no | no |

## Change

- **Schema** (hand-authored migration, #895): `Bundle.imageNeedsReview` and
  `Promotion.imageNeedsReview` (boolean, default false), and `AiFeature.BUNDLE_IMAGE`.
- **Prompts** (`lib/ai-image-prompts.ts`, pure): the bundle prompt lists its contents, largest
  quantity first. Every prompt carries `IMAGE_PROMPT_GUARDRAILS` (no live animals, no people, no
  text), because the #1521 run produced both problems. The banner prompt asks for empty space for the
  overlay and never draws the headline.
- **One generate-and-store helper** (`lib/ai-image-store.ts`): it checks the budget first, records the
  image as soon as the bytes exist, and stores PNG under a caller-built key.
- **Bundles:**
  - `POST /api/admin/bundle-images/generate` (admin only, `BUNDLE_IMAGE` meter) saves the photo
    flagged for review. If the admin already wrote alt text, it is kept.
  - `POST /api/admin/bundle-images/backfill` takes 10 bundles per click, live ones first. It stops at
    a budget refusal and still answers 200 with `budgetRefused`, as the product backfill does.
  - The `removeBundleImage` and `approveBundleImage` server actions are open to staff and admins.
  - Generated keys are `bundles/{id}/{uuid}.png`. The upload check, `isBundleImageKey`, still accepts
    only WebP.
- **Promotions:** `POST /api/admin/promotions/banner-generate` (admin only, `CAMPAIGN_IMAGE` meter)
  builds the subject from the promotion's own target, scoped to the vendor. Like an upload, it does
  not save: the form shows the banner flagged, and Save writes `imageNeedsReview`. The form parser
  keeps the flag only alongside an image.
- **UI:**
  - The bundle photo box gets Auto-Generate (admins only), Remove, and a review banner with Approve.
  - The Bundles list gets the fill button (admins only) and "No photo" and "Photo needs review"
    labels.
  - The promotion section 4 gets Generate banner only, an upload that is always visible (Replace), and
    a review banner with Approve.
- **Single image kept** for bundles and promotions. The shop shows only one, so a gallery would need
  new tables for no visible gain.

## Not changed

- The storefront: a flagged image still shows, as it does for products.
- The department campaign route.
- The product pipeline.
