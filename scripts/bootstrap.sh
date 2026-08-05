#!/usr/bin/env bash
set -euo pipefail
# Installs SDD git hooks and generates the Prisma client for a fresh clone.
git config core.hooksPath hooks || true
npm ci
npm run db:generate
echo "bootstrap complete — set .env / .dev.vars, then: npm run dev"
