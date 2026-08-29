---
id: p9-2-production-deployment-safety-validation
title: "P9.2: Production deployment safety (Validation)"
audience: [devops]
type: validation
status: active
version: "1.0.0"
updated: 2026-08-29
---

# Validation: Production deployment safety

## 1. Automated Checks (CI/CD)

- [ ] **Lint & Format**: `npm run lint` and `npm run format:check` pass.
- [ ] **Typecheck**: `npm run typecheck` passes.
- [ ] **Tests**: `npm test` passes.
- [ ] **Gates Workflow**: The PR gates workflow passes.

## 2. Review & Manual Checks

- [ ] **R1 (Migration Ordering)**: Review `.github/workflows/deploy-production.yml` and `.github/workflows/deploy-staging.yml`. Verify `npx prisma migrate deploy` executes *after* `npx opennextjs-cloudflare build`.
- [ ] **R2 (Release Quality Gates)**: Review the workflows to ensure `npm run db:generate`, `npm run lint`, `npm run format:check`, `npm run typecheck`, and `npm test` run *before* the OpenNext build.

## 3. Live Walkthrough (Local verification)

Since we cannot safely simulate a failing deployment in production, we verify the YAML configuration structurally:
1. Examine `deploy-production.yml` and `deploy-staging.yml`.
2. Confirm the step sequence:
   - Checkout
   - Setup Node
   - `npm ci`
   - Quality Gates (`db:generate`, `lint`, `format:check`, `typecheck`, `test`)
   - Build (`npx opennextjs-cloudflare build`)
   - Apply migrations (`npx prisma migrate deploy`)
   - Deploy (`npx wrangler deploy`)

If the structural sequence is correct, the validation passes.
