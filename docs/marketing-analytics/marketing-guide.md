---
id: marketing-analytics-guide
title: "Marketing & Analytics Data Guide"
audience: [marketing]
type: guide
status: approved
version: "1.0.0"
visibility: internal
summary: "A guide for marketing analysts on how to track user behavior, promotions, and campaign performance."
tags: ["marketing", "analytics", "tracking", "promotions"]
---

# Marketing & Analytics Data Guide

Welcome to the **Marketing Analytics** documentation. This guide outlines how marketing campaigns, promotions, and conversion funnels are currently tracked and managed in the platform.

## Promotions & Campaigns
- **Homepage Banners:** Store managers can configure promotional banners and featured carousels. These are the primary vehicles for driving traffic to specific product categories or campaign pages (e.g., `/search?isOffer=true`).
- **Discount Codes:** The platform supports fixed-amount and percentage-based discount codes. Redemptions are tracked per order, allowing you to measure the ROI of specific campaigns (e.g., `SUMMER10`).

## Loyalty Program
- Customer retention can be measured through the Loyalty Program. 
- You can track how many points customers earn vs. redeem, and observe their progression through Loyalty Tiers (e.g., Silver, Gold).
- Tier multipliers act as an incentive mechanism that can be leveraged in email marketing campaigns.

## User Behavior & Conversion Funnels
- The critical conversion funnel is: **Homepage/Catalogue -> Add to Cart -> Checkout (Address/Payment) -> Order Confirmed**.
- Guest Checkouts vs. Registered Accounts: The platform supports both. Tracking the ratio of guest orders to registered orders is a key KPI for the growth team.
- **Cart Abandonment:** Carts are tied to either a user account or a temporary guest session.

## Data & Reporting
- At this time, basic sales aggregates and best-selling items can be viewed in the Admin Panel's **Reports** tab.
- For deeper analytics (e.g., Google Analytics, Meta Pixel), tracking scripts should be injected via the platform's frontend configuration (pending integration).
