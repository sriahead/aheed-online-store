# KMS — Index Generator, Assembly & Internal Site (validation)

| Req | How to verify |
|-----|---------------|
| R1  | `npx tsx kms/scripts/build-index.ts`, inspect `ARTIFACT_INDEX.md` — track-1 rows match the docs that actually carry front-matter (currently just `specs/2026-08-06-kms/plan.md`, until backfill). |
| R2  | Run the generator twice in a row; diff the output with the `Last build:` line stripped from both → no diff. |
| R3  | `npx tsx kms/scripts/assemble.ts --visibility internal`, inspect `kms/site-internal/content/` (gitignored build dir) — contains copies of `specs/`, `docs/`, `CLAUDE.md`. |
| R4  | `cd kms/site-internal && npm install && npm run dev`, visit `http://localhost:<port>/dev` in a browser → renders assembled docs; `/staff` shows the stub placeholder. |
| R5  | `kms/site-internal/wrangler.toml` has its own `name`, distinct from the root `wrangler.toml`'s Worker names. |
| R6  | `.github/workflows/deploy-docs-internal.yml` passes `actionlint`/YAML validity; a real run will fail until Cloudflare-side infra exists — documented as a known follow-up, not a defect in this slice. |
| R7  | `npm run lint && npx tsc --noEmit && npm test` (root) all exit 0, unaffected by `kms/site-internal/`'s own separate `package.json`. |
