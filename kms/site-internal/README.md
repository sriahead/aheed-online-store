# Aheed KMS — internal site

Nextra 4 docs site (App Router). Independent Next.js app — own `package.json`, own dependency
tree, own Cloudflare Worker — deliberately isolated from the main storefront app.

## Local dev

```bash
cd kms/site-internal
npm install
npm run dev
```

`content/<track>/<type>/*.mdx` is generated — run `npm run kms:assemble:internal` from the **repo
root** first to populate it (see `kms/scripts/assemble.ts`). Edit the source doc (`specs/`,
`docs/`, `CLAUDE.md`) and its front-matter, never a file under `content/dev/` or `content/staff/`
directly — it's overwritten on the next assemble run. `content/index.mdx`,
`content/dev/index.mdx` and `content/staff/index.mdx` are hand-authored and tracked in git; the
assemble script never touches them.

### Search does not work under `npm run dev`

That is expected, not a bug. Nextra 4 searches with **Pagefind**, which indexes built `.html`
files, so there is nothing to search until a build has run — Nextra shows its own notice saying so.

The index is produced by the `postbuild` script (`pagefind --site .next/server/app --output-path
public/_pagefind`) and checked by `scripts/verify-search-index.mjs`, which **fails the build** if
the index is missing or contains zero pages. `public/_pagefind/` is generated and git-ignored;
`opennextjs-cloudflare build` copies it into the Worker's assets, where Nextra fetches it at
runtime as `/_pagefind/pagefind.js`.

To exercise search locally, run `npm run build` and then `npm run dev` (per Nextra's own notice),
or `npm run preview` to serve the real Worker bundle. Before `#871` there was no index step at
all, so search threw `Failed to load search index` on every query on the deployed site while every
local check stayed green.

## Deploying

**Live** at `https://docs.internal.aheedfoodcentre.nocaped.com` (since 2026-08-08), gated by a
Cloudflare Access self-hosted application (One-time PIN, email allow-list). The site has no
application-level auth of its own — **Access is the auth** — so the ordering matters: the Access
application was created **before** the custom-domain route was deployed, so the hostname was gated
from the moment it resolved.

`wrangler.toml`'s custom-domain route is now uncommented; `workers_dev` stays `false` (never flip it
— that would publish an ungated `*.workers.dev` URL). `.github/workflows/deploy-docs-internal.yml`
deploys on every push to `staging`/`main`, same pattern as the main app's `deploy-staging.yml`.

**If you ever remove the Access application, re-comment the route in the same change** — an
uncommented route with no Access policy would serve the internal docs (ADRs, CLAUDE.md) to the public
internet.

## Known gotcha: `zod` is pinned via `overrides`

`package.json` pins `"overrides": { "zod": "4.3.6" }`. Without it, every route 500s with
`Invalid input: expected nonoptional, received undefined → at children` — a real upstream bug in
`nextra-theme-docs@4.6.1` ([nextra#5008](https://github.com/shuding/nextra/issues/5008)):
`Layout` destructures `children` out of its props *before* Zod-validating the rest
(`LayoutPropsSchema.safeParse(themeConfig)`, not `{ children, ...themeConfig }`), and zod 4.4.x
started throwing on a missing required key before any custom validation runs. Confirmed via a
trivial non-MDX test route — the bug is in `Layout` itself, unrelated to the MDX/catch-all pipeline.
Unresolved upstream as of this writing; re-check when bumping `nextra`/`nextra-theme-docs` whether
the override can be dropped.
