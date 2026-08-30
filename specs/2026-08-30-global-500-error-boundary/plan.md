---
id: global-500-error-boundary-plan
title: "Global 500 Error Boundary (Plan)"
audience: [frontend]
type: plan
status: active
version: "1.0.0"
updated: 2026-08-30
---

# Plan: Global 500 Error Boundary

## 1. Overview
The goal is to implement global error handling across the entire Next.js application. Whenever an unhandled runtime error occurs (e.g., missing configuration, unhandled exceptions in components), the application will safely degrade to a branded "Something went wrong" UI instead of crashing with a raw browser 500 error or showing Next.js's unbranded fallback.

## 2. Approach
Next.js App Router utilizes two distinct boundary files for global error handling:
1. **`app/global-error.tsx`**: This acts as the absolute outermost boundary. It wraps the entire application and is the only file capable of catching errors thrown inside the root `app/layout.tsx` (such as missing `STRIPE_SECRET_KEY` config validations triggered during initial layout rendering). Because it replaces the root layout when an error occurs, it must define its own `<html>` and `<body>` tags.
2. **`app/error.tsx`**: This catches errors in any nested route or page. It is rendered *inside* the existing root layout, meaning the site navigation, header, and footer will still be visible to the user, providing a less jarring experience.

Together, these two files ensure **100% coverage** of all unhandled runtime exceptions.

## 3. Implementation Steps
1. Create `app/global-error.tsx` with a branded UI, `<html>`/`<body>` tags, and a "Try Again" recovery button.
2. Create `app/error.tsx` with the same branded UI (omitting the HTML tags) to preserve the root layout.
3. Remove any stated exclusions from the requirements—this feature serves as the universal catch-all for all application crashes.
4. Verify by running the Next.js production build (`npm run build`).
