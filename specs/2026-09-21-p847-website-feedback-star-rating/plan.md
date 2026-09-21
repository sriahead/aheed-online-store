---
id: p847-website-feedback-star-rating
title: "P847 — Website Feedback Clickable Star Rating (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-21
visibility: internal
summary: Update the Website Feedback rating UI to reuse the accessible, interactive StarRatingInput component from Product Feedback, maintaining visual and behavioral parity while keeping all existing submission, moderation, and data handling logic unchanged.
tags: [feedback, ratings, stars, accessibility, ui]
---

# P847 — Website Feedback Clickable Star Rating (plan)

## Goal

Provide shoppers with a visually consistent, intuitive star-rating experience when leaving or editing website feedback on `/feedback`, replacing the radio-button pills with the shared `StarRatingInput` component already used for product reviews.

## Scope (this slice)

- **Website Feedback Form (`components/storefront/FeedbackForm.tsx`)**:
  - Replace the 5-pill `<fieldset>` radio button group with `<StarRatingInput name="rating" defaultValue={existing?.rating ?? null} label="Your rating" labelClassName="text-sm font-semibold text-primary" required />`.
  - Pass the existing rating through `defaultValue` when a customer is editing an existing submission (`existing?.rating`).
  - Maintain all other form fields, server action wiring (`submitFeedback`), error and success message banners, and button states exactly as they are.
- **Automated Tests (`tests/feedback-form.test.tsx`)**:
  - Unit tests covering default unrated render (5 stars, "Select rating" text).
  - Pre-filled render when `existing.rating` is provided (e.g. 5 stars, "Excellent").
  - Click-to-rate interaction (1–5) and dynamic rating label updates.
  - Hover preview and mouse-leave reset.
  - Form submission passing selected rating in form data.

## Deliberately Excluded

- Changes to `submitFeedback` server action or `features/feedback/validate-feedback.ts`.
- Changes to database models, repositories, rate limiting, or moderation logic.
- Half-star ratings (integer ratings 1–5 stored in database).
- Relocating `StarRatingInput.tsx` (it already exists and is exported from `@/components/product/StarRatingInput`).
