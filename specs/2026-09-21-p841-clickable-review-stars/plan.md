---
id: p841-clickable-review-stars
title: "P841 — Clickable Star Ratings for Product Reviews (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-21
visibility: internal
summary: Replace rating select dropdowns with an accessible, interactive clickable star rating component across Quick View and product detail reviews.
tags: [reviews, ratings, stars, accessibility, quick-view]
---

# P841 — Clickable Star Ratings for Product Reviews (plan)

## Goal

Provide shoppers with a quicker, more intuitive rating experience when leaving or updating product reviews by replacing the `<select>` dropdown with interactive, clickable 1–5 stars with hover previews and accessibility support.

## Scope (this slice)

- **Star Rating Input (`components/product/StarRatingInput.tsx`)**:
  - Reusable client component backed by semantic `<fieldset>` and `<input type="radio">`.
  - Supports 1–5 star selection, hover previews, active rating status labels, and keyboard navigation.
  - Supports `defaultValue`, `onChange`, `disabled`, and `required`.
  - Respects reduced motion preferences with `motion-reduce:hover:scale-100 motion-reduce:active:scale-100`.
- **Quick View Drawer (`components/product/QuickViewDrawer.tsx`)**:
  - Replaces the `<select name="rating">` control with `StarRatingInput`.
  - Adds client-side validation in `handleReviewSubmit` to guard against empty ratings.
- **Product Page Review Form (`features/reviews/components/ReviewForm.tsx`)**:
  - Replaces the `<select name="rating">` control with `StarRatingInput` for site-wide consistency.
- **Automated Tests**:
  - `tests/star-rating-input.test.tsx`: Comprehensive unit tests for StarRatingInput.
  - `tests/quick-view.test.tsx`: Updated with star selection interaction test.
  - `tests/review-form.test.tsx`: Unit test for ReviewForm with StarRatingInput.

## Deliberately Excluded

- Half-star ratings (schema and backend repositories store integer ratings 1–5).
- Review moderation workflows (#819).
