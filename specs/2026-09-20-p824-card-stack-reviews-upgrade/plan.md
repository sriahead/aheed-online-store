---
id: p824-card-stack-reviews-upgrade
title: "P824 — Vibrant Card-Stack Review Slider (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-20
visibility: internal
summary: Upgrade the storefront customer feedback reviews section with vibrant, accessible pastel card themes and smooth 3D stacked-card interaction aligned with UIInitiative.
tags: [storefront, reviews, feedback, ui, animation, card-stack]
related: [p818-customer-feedback-reviews]
---

# P824 — Vibrant Card-Stack Review Slider (plan)

## Goal

Elevate the landing page "What our customers say" customer feedback section into a modern, lively, responsive card deck slider with distinct, tasteful pastel card background colors, 3D stacked perspective, and smooth peel transitions inspired by the UIInitiative Cards Stack Slider reference (`https://cards-stack-slider.uiinitiative.com/`), while maintaining full WCAG AA contrast and preserving all existing review content, badges, rating headers, and navigation controls.

## Scope (this slice)

- **Palette System (`components/storefront/CustomerFeedbackCards.tsx`)**:
  - Implement a rotation of 6 lively yet tasteful pastel color themes (soft green, warm yellow/amber, soft orange/peach, sky blue, rose/pink, lavender/purple) pairing gentle background tints with complementary borders.
  - Guarantee WCAG AA contrast for `text-primary` and `text-primary-muted` on every card background tint.
  - Preserve all existing review content: rating stars, verified customer badge, review comment, author name, relative submission date.
  - Preserve section header, aggregate rating score and count, "Share your experience" action, and outbound `ReviewLinkGroup` links.
- **Card Stack Interaction & Animation (`components/ui/CardStack.tsx`)**:
  - Align 3D perspective geometry and transitions with the reference interaction.
  - Arrange cards in a tiered vertical 3D deck where the active card sits front and center (`depth = 0`, `scale(1)`), while cards behind (`depth > 0`) peek out above the front card with -22px vertical offset per level, depth displacement (`translateZ`), and scale reduction.
  - Enable direct card interaction: clicking the front card advances to the next review; clicking a peeking background card immediately brings it to the front.
  - Implement smooth peel-out transitions with 3D rotation and translation.
  - Maintain interactive pointer/touch dragging with live tilt response and threshold-based navigation.
  - Retain the "X / total" slide counter, provide accessible pagination indicator pills, and keyboard navigation. Removed previous/next arrow buttons per user refinement.
- **Layout & Responsiveness (`app/globals.css`, `components/ui/CardStack.tsx`)**:
  - Ensure containment so the 3D perspective and offsets never cause horizontal scrolling or page overflow on mobile viewports down to 320px.
  - Maintain the existing `prefers-reduced-motion: reduce` fallback (horizontal scrollable row without 3D transforms).
- **Automated Testing**:
  - Automated tests validating palette rotation, element preservation, accessibility, and card stack navigation mechanics.

## Deliberately Excluded

- **Review Submission & Moderation**: The submission endpoint (`/feedback`), moderation queue (`/staff/feedback`), schema (`CustomerFeedback`), and rate-limiting services are unchanged.
- **Auto-Advance / Autoplay**: Automatic timer-based sliding is deliberately excluded to comply with WCAG 2.2.2 (Pause, Stop, Hide) and avoid disorienting users reading long reviews.
- **External Widget Embeds**: Live Google/Trustpilot widgets remain excluded per ADR-004 and the architectural findings in `#818`.
- **Unrelated Storefront Sections**: Product cards, category navigation, bundles, and checkout are unaffected.

## Open Items Carried Forward

- None for this slice.
