---
id: kms-search-index
title: "KMS internal docs site — build the Pagefind search index (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-22
visibility: internal
summary: "Generate Nextra's Pagefind search index during the internal KMS site build and fail the build when it is missing, replacing a search box that has thrown on every query since the site went live."
tags: [kms, search, pagefind, nextra, build, cloudflare]
related: [kms-strategy-evaluation, kms-enforcement-foundation-plan, adr-001-hosting]
---

# KMS internal docs site — build the Pagefind search index (plan)

**Goal:** make search on `docs.internal.aheedfoodcentre.nocaped.com` return results instead of
throwing, by producing Nextra's Pagefind index as part of the deployed build — and make a missing
index a **build failure** rather than a runtime error only a reader discovers.

Closes **`#871`** (search) and **`#857`** (the `.gitignore` rule that stopped matching assembled
content after `#853`), the second folded in at the owner's direction because it lives in the same
two lines of the same file this slice already edits.

## What is actually broken

Nextra 4 loads its index at runtime as a dynamic import:

```js
// nextra@4.6.1 — dist/client/components/search.js:13
window.pagefind = await import(addBasePath("/_pagefind/pagefind.js"))
```

Nothing in this repository has ever produced that file. `pagefind` is not a dependency of
`kms/site-internal` (absent from `package.json`, 0 matches in `package-lock.json`, not installed);
there is no `public/` directory in that project at all; the string `pagefind` appears nowhere in
the repository outside `node_modules/`; and `.github/workflows/deploy-docs-internal.yml:34` runs
`npx opennextjs-cloudflare build && npx wrangler deploy` with no index step.

So the asset 404s and the client throws `TypeError: Failed to fetch dynamically imported module`.
**This is not a regression — search has never worked**, and the box has been rendering and failing
for every reader since the site went live.

The failure is invisible locally by design: Pagefind indexes built `.html`, so Nextra's own
in-product notice says search is unavailable under `next dev`. A developer doing UI-only work sees
the expected dev notice, not the broken production path.

## What this slice proves, measured rather than assumed

Every load-bearing claim below was executed against this repository on 2026-09-22 before this plan
was written, because the whole character of this defect is that plausible-looking checks stayed
green while the feature was dead.

- `npm run build` in `kms/site-internal` prerenders **199** HTML files to `.next/server/app`
  (`generateStaticParams` at `app/[[...mdxPath]]/page.tsx:4`).
- `pagefind --site .next/server/app` indexes **197** of them — 199 minus `_not-found.html` and
  `_global-error.html`, the only two lacking Nextra's `data-pagefind-body` marker. The two
  exclusions are correct, not a coverage gap.
- The generated index is **244 files, 3.3 MB**, largest single file 182 KB.
- Under `opennextjs-cloudflare build` — which sets `NEXT_PRIVATE_STANDALONE=true` — the prerendered
  HTML **still lands at `.next/server/app`** (199 files, confirmed under that build, not just a
  plain `next build`).
- A `public/_pagefind` directory staged before that build arrives intact at
  **`.open-next/assets/_pagefind/pagefind.js`**, all 244 files.

The ordering that makes a `postbuild` hook viable is a property of the toolchain, not a hope:
`opennextjs-cloudflare build` shells out to `npm run build` (`@opennextjs/aws/dist/build/buildNextApp.js:10-17`),
so `postbuild` fires *inside* the OpenNext sequence; `createStaticAssets()` collects `public/`
*after* `buildNextjsApp()` (`@opennextjs/cloudflare/dist/cli/build/build.js:63` vs `:80`).

## Scope (this slice)

- **`kms/site-internal/package.json`** — add `pagefind` as a `devDependency` at an **exact** pin,
  and a `postbuild` script running it over `.next/server/app` into `public/_pagefind`. Exact rather
  than caret because the binary generates the index *and* the `pagefind.js` that reads it; a
  floating minor silently changes a build artifact. This sits alongside the existing caret ranges
  deliberately — it is a generator of committed-shaped output, not an ordinary library.
- **A build-time guard** that exits non-zero when the index is absent or contains no indexed pages.
  This is the durable control and the reason the slice is worth more than a one-line script: the
  defect survived `lint`, `typecheck`, `test`, `build`, `gates`, `deploy-docs-internal` and
  `sdd:audit` all reporting green.
- **The root `.gitignore`** — two changes in the same `# KMS` block. `kms/site-internal/` has **no
  `.gitignore` of its own**, and every other KMS build-artifact rule already lives at the root.
  1. Ignore `public/_pagefind`: generated, 244 files, must never be committed.
  2. **Fix `#857`, folded in at the owner's direction.** The existing rule
     `kms/site-*/content/*/*.mdx` matches one level under `content/`, but `#853` moved assembled
     content a level deeper to `content/<track>/<type>/`, so ~194 generated `.mdx` files are no
     longer ignored — reproduced during this plan's own measurement pass as 9 untracked
     directories. The block's comment ("ignore all .mdx one level under content/") is wrong in the
     same way and is corrected with it. Folded in because it is a two-line fix inside the exact
     block this slice already edits, and leaving it would mean a validator running `git status`
     for R7 sees 9 untracked directories this slice's own commands created.
- **`kms/site-internal/README.md`** — record that search depends on a build step, so the next
  reader does not rediscover the dev-mode notice as a bug.

## Deliberately excluded

- **The navigation structure.** The `track × type` sidebar (`kms/scripts/assemble.ts:117`) is the
  KMS restructuring — strategy §24 step 5 — gated on `kms-strategy-evaluation.md` leaving
  `status: review` with **U8** and **G1** unresolved. Owner has explicitly deferred it. Untouched.
- **`kms/site-public`** — no app, no build, no deploy workflow (`#866`).
- **Search facets and synonyms** — strategy §14.2, still `Design`; `#869` tracks the synonym
  question. This slice builds the index Pagefind needs, nothing more. Note the trial run reports
  `Indexed 0 filters`, which is consistent with facets being unbuilt.
- **Correcting the strategy document.** §14.2 asserts *"the search feature itself is still `Design`
  in this section: there is nothing to wire the synonym data into yet."* A search **UI** is in fact
  deployed and broken — only the index is missing. That is a third class of error in a document
  `#862` has just corrected five facts in and `#869` two more. It belongs in one of those, not in a
  code slice editing a `status: review` document.
- **Adding a docs-site build to `quality.yml`.** See Open items — this is a real gap and a real
  cost, and it is a separate decision.
- **Adding `pagefind` to `tests/dependency-pins.test.ts`.** That test exists for the three
  *runtime infrastructure* packages `CLAUDE.md` names — a DB driver, a driver adapter and the
  Prisma client — whose semver ranges are looser than real compatibility and which fail silently at
  request time. `pagefind` is a build-time binary in a separate nested project; a wrong version
  fails the build loudly, which R5's guard already covers. R1's exact pin is therefore a
  reviewable convention here, not a mechanically enforced one. Recorded so a later reader sees a
  decision rather than an oversight.
- ~~Fixing `#857`~~ — **now in scope**, folded in at the owner's direction on 2026-09-22. See the
  Scope section. This slice therefore closes both `#871` and `#857`.
- **Dev-mode search.** Nextra does not support it; the in-product notice is correct behaviour.

## Open items carried forward

- **The build guard protects the deploy, not the pull request.** `gates` never builds the docs site
  (`CLAUDE.md`, Commands), so R4's guard fires in `deploy-docs-internal` — *after* merge to
  `staging`. That is the same exposure every docs-site defect already has, and it is strictly
  better than today, where nothing fails at all. Adding a ~4-minute Next build to every PR is a
  cost decision the owner should make explicitly, and per `CLAUDE.md` it would have to go in
  `.github/workflows/quality.yml`, never a caller. **Not resolved here** — flagged for its own
  issue if the owner wants PR-time coverage.
- **Live verification needs Cloudflare Access.** The site is Access-gated; an unauthenticated
  request cannot reach it. R7 and R8 require a browser session or a service token, so they are
  owner-executable steps, not CI assertions.
