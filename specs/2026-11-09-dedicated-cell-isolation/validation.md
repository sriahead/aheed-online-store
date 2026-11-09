# Dedicated Cell Isolation: Aheed Food Centre Deployment Topology & CI (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide rigorous confidence that dedicated cell configuration, deployment manifests, bootstrap scripts, and CI workflows remain synchronized without regressions to the platform cell.
> 
> - **Build:** Are the wrangler environment configs, CI workflow steps, and bootstrap scripts syntactically and logically correct?
> - **Validate:** Does `verify-worker-routes.ts` and `bootstrap-dedicated-cell.ts` handle dedicated environments safely and deterministically?
> - **Release:** Is the lockstep CI workflow safe, ensuring zero schema or code drift across cells?

## Testing Areas

1. **Unit Testing**
   - Structural and config integrity for `wrangler.toml` files (`tests/dedicated-cell-topology.test.ts`).
   - Unit validation of bootstrap script logic and production safety guards (`tests/bootstrap-dedicated-cell.test.ts`).
2. **Integration Testing**
   - Route verification logic with `scripts/verify-worker-routes.ts` across both platform and dedicated environments.
3. **Workflow & Security Testing**
   - GitHub Actions workflow syntax and sequential execution graph validation in `.github/workflows/deploy-staging.yml` and `.github/workflows/deploy-production.yml`.
   - Production demo account exclusion enforcement.
4. **Governance & Documentation Testing**
   - KMS validation (`npm run kms:validate`, `npm run kms:check-generated`), ADR-009 check, and architecture documentation review.

---

## Validation Steps

| Req | Testing Area | How to verify |
|---|---|---|
| R1 | Config | `npx tsx -e "const fs = require('fs'); const toml = fs.readFileSync('wrangler.toml', 'utf8'); if (!toml.includes('[env.afc-staging]') \|\| !toml.includes('[env.afc-production]')) process.exit(1);"` exits 0. |
| R2 | Config | `npx tsx -e "const fs = require('fs'); const toml = fs.readFileSync('workers/scheduler/wrangler.toml', 'utf8'); if (!toml.includes('[env.afc-staging]') \|\| !toml.includes('[env.afc-production]')) process.exit(1);"` exits 0. |
| R3 | Config | `npx tsx -e "const fs = require('fs'); const toml = fs.readFileSync('workers/inbound-email/wrangler.toml', 'utf8'); if (!toml.includes('[env.afc-staging]') \|\| !toml.includes('[env.afc-production]')) process.exit(1);"` exits 0. |
| R4 | CI / Workflow | `npx tsx -e "const fs = require('fs'); const yml = fs.readFileSync('.github/workflows/deploy-staging.yml', 'utf8'); if (!yml.includes('AFC_DIRECT_URL') \|\| !yml.includes('--env afc-staging')) process.exit(1);"` exits 0. |
| R5 | CI / Workflow | `npx tsx -e "const fs = require('fs'); const yml = fs.readFileSync('.github/workflows/deploy-production.yml', 'utf8'); if (!yml.includes('AFC_DIRECT_URL') \|\| !yml.includes('--env afc-production')) process.exit(1);"` exits 0. |
| R6 | Tooling | `npx tsx -e "import { parseRoutePatterns } from './scripts/verify-worker-routes'; const fs = require('fs'); const toml = fs.readFileSync('wrangler.toml', 'utf8'); const routes = parseRoutePatterns(toml, 'afc-staging'); if (!routes.includes('staging.aheedfoodcentre.co.uk')) process.exit(1);"` exits 0. |
| R7 | Tooling | `npx tsx scripts/bootstrap-dedicated-cell.ts --help` prints usage with `--env <afc-staging|afc-production>` and exits 0. |
| R8 | Unit Test | `npx vitest run tests/dedicated-cell-topology.test.ts` passes with all tests green. |
| R9 | Unit Test | `npx vitest run tests/bootstrap-dedicated-cell.test.ts` passes with all tests green. |
| R10 | Documentation | `test -f specs/decisions/ADR-009-dedicated-client-cells.md` exits 0 and contains approved status. |
| R11 | Documentation | `npx tsx -e "const fs = require('fs'); const doc = fs.readFileSync('docs/developer-portal/env-setup.md', 'utf8'); if (!doc.includes('AFC_DIRECT_URL') \|\| !doc.includes('AFC_DATABASE_URL')) process.exit(1);"` exits 0. |
| R12 | Gate 4 | `git diff origin/staging...HEAD -- CHANGELOG.md` shows non-empty changes under `[Unreleased]` citing #1331. |
| R13 | Gate 3 Catch-All | `npm run lint && npm run typecheck && npm run format:check && npm run kms:validate && npm run kms:check-generated && npx vitest run --maxWorkers=4` exits 0. |
