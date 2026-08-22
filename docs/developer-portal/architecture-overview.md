---
id: architecture-overview
title: "Architecture & System Design Overview"
audience: [dev, architect]
type: guide
status: approved
version: "1.0.0"
updated: 2026-08-22
visibility: internal
summary: "A high-level map of the platform's architecture, system design, and database design, acting as a directory to the deeper technical specifications."
tags: ["architecture", "system-design", "database", "specs"]
---

# Architecture & System Design Overview

Welcome to the **Developer Portal**. This document serves as your high-level map of the Aheed Online Store's technical architecture. It bridges the gap between high-level business requirements and the deep technical specifications found in the `specs/` directory.

## 1. System Architecture
The platform is built on a modern, serverless edge architecture designed for high performance and strict multi-tenancy.

- **Frontend & API:** Built with **Next.js** and deployed to **Cloudflare Workers** (via OpenNext). This ensures sub-millisecond routing and edge-level performance for shoppers.
- **Database:** Powered by **Neon Serverless Postgres** via the Prisma ORM.
- **Multi-Tenancy:** The entire architecture is built around a row-level multi-tenant model. A single codebase and database serve multiple vendors (tenants), isolated at runtime via Host-Resolver middleware and Prisma client extensions.

> 📚 **Deep Dive:** Read the full architectural constraints and decisions in `specs/architecture.md` and the technology breakdown in `specs/tech-stack.md`.

## 2. Database Design
Our database design prioritizes auditability, structural idempotency, and financial accuracy.

- **Schema as Documentation:** The single source of truth for our database design is `prisma/schema.prisma`. It is heavily annotated with architectural decisions (ADRs) and business logic.
- **Financial Accuracy:** All monetary values are stored as **integer pence** (e.g., `totalPence`). We strictly avoid floating-point math for money.
- **Append-Only Auditing:** Financial and operational logs (like the `LoyaltyLedgerEntry` or `OrderStatusEvent`) are append-only. They are never updated or deleted, preserving a perfect audit trail.
- **Concurrency Anchors:** We use strict database constraints (e.g., counting down remaining discount redemptions or locking inventory rows) to prevent race conditions during checkout, rather than relying on application-level locks.

> 📚 **Deep Dive:** Read the inline comments in `prisma/schema.prisma` for field-level design rationale.

## 3. System Design Documents (SDDs)
Every major feature in this platform was built following a strict System Design Document (SDD) workflow. Rather than a single monolithic design file, the system design is modularized by feature.

When working on or debugging a specific domain, refer to its corresponding SDD in the `specs/` folder:
- **Multi-Tenancy:** See `specs/2026-08-08-multitenancy-slice1-vendor-schema` and its related slices.
- **Cart & Checkout:** See `specs/2026-08-10-p3b-checkout-order-core` and `2026-08-09-p3a-cart-foundation`.
- **Loyalty & Discounts:** See `specs/2026-08-11-p5a-loyalty-points` and `2026-08-11-p5b-discount-codes`.

## 4. Development & CI/CD Workflows
- **Environment Setup:** Secrets and variables are split between GitHub Actions (for deployment) and Cloudflare Workers (for runtime). See `docs/developer-portal/env-setup.md`.
- **Quality Gates:** Every PR is gated by Vitest, ESLint, TypeScript compilation, and KMS artifact staleness checks before merging to `staging` or `main`.

> 💡 **Next Steps:** If you are a new developer, start by reading `docs/developer-portal/onboarding.md` and `docs/developer-portal/repo-structure.md`.

