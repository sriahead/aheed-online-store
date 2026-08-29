---
id: p9-2-production-deployment-safety
title: "P9.2: Production deployment safety (Migrations & Gates)"
audience: [devops]
type: requirements
status: active
version: "1.0.0"
updated: 2026-08-29
---

# Requirements: Production deployment safety

## 1. Context & Objective
Resolves #434 and #435. Currently, production deployments apply Prisma migrations *before* OpenNext builds the application. If the build fails, the production database is left with a new schema for the old code, breaking the application. Furthermore, the deployment workflow currently runs no quality gates (linting, formatting, typechecking, tests) meaning broken code could reach production if merged.

## 2. Scope
- Update `.github/workflows/deploy-production.yml`
- Update `.github/workflows/deploy-staging.yml` to maintain parity.

## 3. Requirements

### R1. Migration Ordering (#434)
- **Constraint**: `npx prisma migrate deploy` must run **after** `npx opennextjs-cloudflare build` completes successfully.
- **Constraint**: The workflow must fail before reaching `wrangler deploy` if the migration fails.

### R2. Release Quality Gates (#435)
- **Constraint**: The deployment workflows must run quality gates before attempting to build.
- **Tasks**: Include `npm run db:generate`, `npm run lint`, `npm run format:check`, `npm run typecheck`, and `npm test`.
- **Failure**: If any quality gate fails, the workflow must abort without mutating the database or building the application.

## 4. Exclusions
- Changes to PR gating (`gates.yml`) - this workflow already enforces quality correctly on PRs.
- Changes to database backup verification (#436), this will be handled in a separate slice.

## 5. Security & Trust
Ensures the production environment remains operational if a deployment is triggered with invalid code or an unbuildable state.
