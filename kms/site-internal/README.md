# Aheed KMS — internal site

Nextra 4 docs site (App Router). Independent Next.js app — own `package.json`, own dependency
tree, own Cloudflare Worker — deliberately isolated from the main storefront app.

## Local dev

```bash
cd kms/site-internal
npm install
npm run dev
```

`content/dev/*.mdx` is generated — run `npm run kms:assemble:internal` from the **repo root**
first to populate it (see `kms/scripts/assemble.ts`). Edit the source doc (`specs/`, `docs/`,
`CLAUDE.md`) and its front-matter, never a file under `content/dev/` directly — it's overwritten
on the next assemble run. `content/index.mdx` and `content/staff/index.mdx` are hand-authored and
tracked in git; the assemble script never touches them.

## Deploying

**Not live yet.** `wrangler.toml`'s custom-domain route is commented out and `workers_dev = false`
— both deliberately, until the Cloudflare-side prerequisites exist:

1. DNS/custom-domain for `docs.internal.aheedfoodcentre.nocaped.com` on the zone.
2. A Cloudflare Access application gating that route (zero-trust, email/SSO) — this site has no
   application-level auth of its own; Access **is** the auth.

Once both exist, uncomment the route in `wrangler.toml` and `.github/workflows/deploy-docs-internal.yml`
will deploy on push, same pattern as the main app's `deploy-staging.yml`.

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
