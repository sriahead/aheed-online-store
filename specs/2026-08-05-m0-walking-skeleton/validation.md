# M0 — Walking Skeleton (validation)

| Req | How to verify |
|-----|---------------|
| R1  | CI `gates` job green; run the three commands locally. |
| R2  | Open a draft PR with a deliberately failing test → check is red and merge is blocked. |
| R3  | Push a branch without touching CHANGELOG → Gate 4 step fails. |
| R4  | Push to `staging`; visit `https://staging.aheedfoodcentre.nocaped.com` → page loads. |
| R5  | Merge to `main`; confirm the `deploy-production` run is "Waiting" until you approve. |
| R6  | `curl -s https://<domain>/api/health` → 200, JSON `db.ok=true`. |
| R7  | Load `/` in a browser on both domains → "connected ✓". |
| R8  | Check the Actions log: `prisma migrate deploy` ran before deploy; Neon shows the migration. |
| R9  | `git grep` finds no secret values; Cloudflare + GitHub hold them. |
