---
id: 2026-11-13-abandoned-checkouts-plan
title: "Abandoned checkouts with an admin recovery email, and the notification matrix (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-11-13
visibility: internal
summary: "Lists checkouts that expired before payment and lets a store admin send one consent-gated, honestly persuasive recovery email (optional discount code). Adds a which-message-when matrix to every operator guide. One new table."
tags: [abandoned-checkout, marketing, email, notifications, docs]
related: [2026-11-13-notification-gaps-plan]
---

# Abandoned checkouts and the notification matrix (plan)

Issue #1554. The owner asked (2026-11-13) to log abandoned checkouts with an option for an admin to
send a recovery email whose message draws on consumer psychology, behavioural economics, cognitive
biases, pricing psychology and neuromarketing, and for a "when is which email sent" matrix in every
appropriate guide.

Owner decisions (AskUserQuestion, 2026-11-13): **opted-in only** (signed-in customers whose newest
marketing choice is yes, PECR) and **reminder + optional discount code**. The plan was approved
("yes go ahead, include 1552 promotion too").

- **No new tracking.** An abandoned checkout is an existing CANCELLED order whose status event note
  begins `Checkout session expired` (written by the webhook and the payment sweep).
- **One table**, `AbandonedCheckoutReminder` (unique `orderId`): claimed before the send, so one
  reminder per checkout ever, with who sent it and the code text.
- **Page** `/staff/abandoned-checkouts`, admin tier, last 30 days; send within 7 days.
- **Email**: endowment, goal-gradient, cognitive ease, reciprocity, truthful loss framing and real
  anchoring; never false urgency or scarcity (CPRs, DMCC Act 2024); always an opt-out.
- **Matrix**: `docs/developer-portal/notification-matrix.md`, plus sections in the store admin
  guide, staff playbook, platform admin guide, shopper guide and the onboarding guide.
