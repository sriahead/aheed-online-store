# #955, #996, #994 — Crawlability (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Every feature should have appropriate **Unit** and **Integration** testing, followed by relevant validation testing. Broader testing mainly happens before release. However, testing is risk-based: features involving auth, payments, UI changes, performance-sensitive APIs, databases, or external dependencies require additional relevant testing earlier.

1. **Unit Testing**
   - *When needed:* Every feature.
   - *Purpose:* Test isolated business logic, utilities, and components.
2. **Integration Testing**
   - *When needed:* Every feature. (Includes Contract testing).
   - *Purpose:* Verify the component works with its immediate dependencies (e.g., database, external services).
3. **System / End-to-End Testing**
   - *When needed:* For critical user journeys and validation testing.
   - *Purpose:* Validate that the feature works correctly in the real system.
4. **Regression & Acceptance Testing**
   - *When needed:* Mainly before release, or when changing core flows. (Includes Smoke and Sanity testing).
   - *Purpose:* Ensure existing functionality remains unbroken and acceptance criteria are met.
5. **Performance & Resilience Testing**
   - *When needed:* Mainly before release, or for performance-sensitive APIs. (Includes Load, Stress, and Spike testing).
   - *Purpose:* Ensure the system meets throughput/latency targets and degrades gracefully.
6. **Security & Accessibility Testing**
   - *When needed:* Mainly before release, or earlier for features involving auth, payments, or UI changes.
   - *Purpose:* Ensure the system is safe and accessible to all users.

---

## Before you start — read this, it decides whether these rows mean anything

**Every row below marked `preview` needs `npm run preview`, never `npm run dev`.** `next dev`
cannot load `@prisma/client/wasm` and renders an error state instead of a page, so a DB-touching
row run under `dev` produces a confident wrong answer.

**Stopping `npm run preview` does not stop it.** Kill the whole `node`/`workerd` chain before
rebuilding, or the next build fails with `EBUSY`:

```powershell
Get-Process node, workerd -ErrorAction SilentlyContinue | Stop-Process -Force
```

**The two hosts.** Aheed is `http://localhost:8787`, SriMart is `http://srimart.localhost:8787`
(the port-carrying `VendorDomain` row from `#514`). Rows that say *both vendors* are not satisfied
by checking one — `#955`'s robots defect is invisible on Aheed's host by construction.

**Toggling `SEO_INDEXABLE` means editing BOTH files.** Config precedence is Cloudflare request
context first, then `process.env`, and it is **per key**: `.dev.vars` wins under `npm run preview`.
To simulate the variable being unset you must remove it from **both** `.dev.vars` and `.env`, then
restart preview. Setting it in one file and reading the other's value is the standard way to get a
false pass here.

**Run `npx vitest run` on its own.** Beside or straight after a heavy build its forks pool silently
fails to start workers, whole files never execute, and it sometimes still exits 0.

`scripts/verify-crawlability.ts` (R36) automates most of the live rows. Where a row names both the
script and a manual command, the script is the primary evidence and the manual command is how to
read the raw document when the script reports `FAIL`.

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `npx vitest run tests/product-card-anchor.test.ts` — the rendered card's title is an `<a>` with `href="/products/<the fixture product's slug>"`, and `container.querySelector("h3 button")` is `null`. Exits 0. |
| R2  | Unit | Same file: firing a left-click on the title anchor calls the `preventDefault` spy once and calls the `openQuickView` spy once with `(slug, product)`. Assert the argument values, not just the call count. Exits 0. |
| R3  | E2E (preview) | With `npm run preview` up: `curl -s http://localhost:8787/categories/<a seeded category slug> \| grep -o 'href="/products/[^"]*"' \| sort -u \| wc -l` returns a number greater than 0 and equal to **`min(12, active products in that category)`** — the category page's `PAGE_SIZE` is 12, so a category with more products must show exactly 12 links on page 1, not all of them. `npx tsx scripts/verify-crawlability.ts` computes that expected number from the database and reports `PASS R3`. Repeat against `http://srimart.localhost:8787/categories/<a SriMart category slug>`. |
| R4  | E2E (preview) | `curl -s http://localhost:8787/categories/<slug> > $TEMP/cat.html`, then confirm no `after:inset-0` and no `after:absolute` appears on any `<a href="/products/…">` element: `grep -c 'after:inset-0' $TEMP/cat.html` returns 0. (A later `after:absolute` elsewhere on the card — the discount badge already uses positioning utilities — is fine; the check is that the title anchor carries neither.) |
| R5  | System (preview) | `npx tsx scripts/verify-mobile-layout.ts --base http://localhost:8787 --path /categories/<slug> --widths 360,390`, then the same with `--base http://srimart.localhost:8787` and a SriMart category. Every `tapTargets` entry whose `name` starts with `Quick view ` is at least 44×44 at both widths on both vendors. Compare the output against `specs/2026-10-04-p964-966-968-mobile-tap-targets/baseline/` so a regression reads as a difference from a known-good run rather than an absolute number you have to judge. |
| R6  | Unit | `grep -c 'the only `<Link>`' components/product/ProductCard.tsx` returns 0 and `grep -c 'no navigation to separate product detail page' components/product/ProductCard.tsx` returns 0. `grep -c 'HTML forbids' components/product/ProductCard.tsx` returns at least 1 (the still-true sibling lesson survived the edit). |
| R7  | E2E (preview) | `curl -si http://localhost:8787/sitemap.xml \| head -20` shows `HTTP/1.1 200`, a `content-type` containing `application/xml`, and a body opening with `<urlset`. Repeat on the SriMart host. |
| R8  | E2E (preview) | `npx tsx scripts/verify-crawlability.ts` prints `PASS R8` for both vendors: it counts `Product where { vendorId, isActive: true }` from the dev database and asserts that count equals the number of `<loc>` entries matching `^https://<host>/products/`, and that every active slug appears. Raw read: `curl -s http://localhost:8787/sitemap.xml \| grep -o '<loc>[^<]*/products/[^<]*</loc>' \| wc -l`. |
| R9  | E2E (preview) | Same script, `PASS R9`: `Category where { vendorId, isActive: true }` count equals the number of `<loc>` entries matching `^https://<host>/categories/.+`, with the bare `/categories` index excluded from that count. Both vendors. |
| R10 | E2E (preview) | Same script, `PASS R10`: the set of `<loc>` values that are neither `/products/…` nor `/categories/<slug>` is exactly `{/, /categories, /bundles, /help, /privacy, /terms}` on the request host. A seventh entry is a `FAIL`, as is a missing one. |
| R11 | E2E (preview) | Same script, `PASS R11`: no `<loc>` path begins with any of `/account`, `/cart`, `/checkout`, `/login`, `/register`, `/search`, `/dev`, `/orders`, `/feedback`, `/shop-your-list`, `/forgot-password`, `/reset-password`. Both vendors. |
| R12 | E2E (preview) | Same script, `PASS R12`: every `<loc>` starts with `https://localhost:8787` when fetched from Aheed's host and `https://srimart.localhost:8787` when fetched from SriMart's; the set of product slugs from the two documents is disjoint apart from any slug both vendors genuinely share, which the script reports explicitly rather than asserting emptiness. **This row is the one that proves the multi-tenancy fix** — do not accept a single-host run. |
| R13 | E2E (preview) | `curl -s http://localhost:8787/sitemap.xml \| grep -c '<lastmod>'` returns 0. Repeat on the SriMart host. |
| R14 | Unit | `grep -c 'nocaped\.com' app/sitemap.ts` returns 0 and `grep -c 'nocaped\.com' app/robots.ts` returns 0. |
| R15 | Unit | `grep -nE 'next/headers\|getCurrentVendorIdOrNull' app/sitemap.ts` prints at least one line. The behavioural proof is R12; this row only catches the header read being deleted in a later refactor, which would statically cache the route with one host baked in. |
| R16 | Integration (preview) | `curl -s -H 'Host: nosuchvendor.example' http://localhost:8787/sitemap.xml` returns 200 and a body containing `<urlset` with `grep -c '<url>'` equal to 0. |
| R17 | Unit | `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts` exits 0. Then confirm the two new exports' signatures by eye: first parameter the Prisma client, second `vendorId`, and no `headers()`/`cookies()`/`getCurrentVendorId` import in either repository file (`grep -c 'next/headers' lib/repositories/products.ts lib/repositories/categories.ts` returns 0 for both). |
| R18 | Unit | `grep -c 'process\.env' app/robots.ts` returns 0, `grep -c 'nocaped' app/robots.ts` returns 0, and `grep -c '@/lib/config' app/robots.ts` returns at least 1. |
| R19 | Unit | `npx vitest run tests/config-seo.test.ts` — the new getter returns `{ SEO_INDEXABLE: undefined }` (or equivalent) rather than throwing when `DATABASE_URL` and `BETTER_AUTH_SECRET` are both deleted from the environment under test. Exits 0. |
| R20 | E2E (preview) | Put `SEO_INDEXABLE="true"` in `.dev.vars`, kill the node/workerd chain, `npm run preview`. Then `curl -s http://localhost:8787/robots.txt` contains `Allow: /` and the exact line `Sitemap: https://localhost:8787/sitemap.xml`; `curl -s http://srimart.localhost:8787/robots.txt` contains `Allow: /` and `Sitemap: https://srimart.localhost:8787/sitemap.xml`. **SriMart returning `Allow` is the whole point of `#955`'s third defect** — today it returns `Disallow: /`. |
| R21 | E2E (preview) | Remove `SEO_INDEXABLE` from **both** `.dev.vars` and `.env` (per-key precedence — one file is not enough), kill the chain, `npm run preview`: both hosts' `/robots.txt` contain `Disallow: /` and `grep -c 'Sitemap:'` returns 0. Then set `SEO_INDEXABLE="false"` in `.dev.vars`, restart, and confirm the same two results. |
| R22 | E2E (preview) | With `SEO_INDEXABLE="true"`, `curl -s http://localhost:8787/robots.txt` contains a `Disallow:` line for each of `/account`, `/cart`, `/checkout`, `/orders/lookup`, `/dev` — five greps, each returning at least 1. |
| R23 | Unit | `grep -n 'SEO_INDEXABLE' wrangler.toml` shows exactly one occurrence, and reading the surrounding lines confirms it sits under `[env.production.vars]`. `sed -n '/\[env.staging.vars\]/,/^\[/p' wrangler.toml \| grep -c SEO_INDEXABLE` returns 0. |
| R24 | Unit | `grep -c 'robots.ts' tests/vendor-neutral-copy.test.ts` and `grep -c 'sitemap.ts' tests/vendor-neutral-copy.test.ts` each return at least 1, and `npx vitest run tests/vendor-neutral-copy.test.ts` exits 0 with its "scans a real set of files" case passing. |
| R25 | E2E (preview) | `curl -s http://localhost:8787/products/<a seeded product slug> \| grep -o '<title>[^<]*</title>'` contains that product's name, and differs from the output of the same grep against `curl -s http://localhost:8787/`. Also reported as `PASS R25`. |
| R26 | E2E (preview) | `curl -s http://localhost:8787/products/<slug> \| grep -o '<meta name="description" content="[^"]*"'` — the content is a prefix (or word-boundary truncation) of that product's `description` column, and its length is at most 160 characters. The script asserts both the derivation and the length. |
| R27 | E2E (preview) | `curl -s http://localhost:8787/products/<slug> \| grep -o '<link rel="canonical" href="[^"]*"'` returns exactly `https://localhost:8787/products/<slug>` — absolute, and on the request host. Repeat on the SriMart host with a SriMart slug and confirm the canonical carries `srimart.localhost:8787`. |
| R28 | E2E (preview) | Run the R25 grep against two different seeded product slugs on the same host; the two `<title>` strings differ. **This is the defect `#996` describes** — today both return the vendor-level title. |
| R29 | E2E (preview) | Repeat R25, R26 and R27 against `http://localhost:8787/categories/<slug>`: the `<title>` contains the category name and differs from `/`'s, the description names the category and the vendor and is at most 160 characters, and the canonical is `https://localhost:8787/categories/<slug>`. |
| R30 | Unit | `npx vitest run tests/page-metadata.test.ts` — with the product lookup (and separately the vendor-profile lookup) stubbed to reject, each `generateMetadata` resolves rather than rejecting, and the resolved value contains no title derived from the failed read. Exits 0. |
| R31 | Unit | `npx vitest run tests/vendor-neutral-copy.test.ts` exits 0, and `grep -niE 'aheed\|srimart\|grocer' app/\(storefront\)/products/\[slug\]/page.tsx app/\(storefront\)/categories/\[slug\]/page.tsx` returns no match in non-comment code. |
| R32 | Integration | On a scratch branch with no new spec: `npm run kms:build-index`, `git add ARTIFACT_INDEX.md "app/(admin)/staff/runbook/docs.ts"`, then `bash hooks/pre-commit; echo "exit=$?"` prints `exit=0`. Reset with `git reset` afterwards. |
| R33 | Integration | On the same scratch branch: `touch lib/__gate2-probe.ts`, `git add lib/__gate2-probe.ts`, then `bash hooks/pre-commit; echo "exit=$?"` prints a non-zero exit and the message `Gate 2 failed`. Then `git reset && rm lib/__gate2-probe.ts`. **Run this row — an exemption that swallows hand-authored source would pass R32 and silently disable Gate 2.** |
| R34 | Integration | `npm run kms:check-generated` exits 0 on the current tree. Then make the artefact stale on purpose — bump the `version:` value in any `docs/developer-portal/*.md` front-matter **without** re-running `kms:build-index` — re-run `npm run kms:check-generated` and confirm it exits non-zero. Revert the front-matter edit and confirm it exits 0 again. This proves the `#994` exemption loosened the git hook only, not CI's requirement that the artefact be committed. |
| R35 | Unit | The four new test files exist and each exits 0 when named individually: `npx vitest run tests/sitemap.test.ts tests/robots.test.ts tests/product-card-anchor.test.ts tests/page-metadata.test.ts`. |
| R36 | System (preview) | `npx tsx scripts/verify-crawlability.ts` with `npm run preview` up and `SEO_INDEXABLE="true"` in `.dev.vars`: every line reads `PASS`, the final line reports 0 failures, and the process exits 0. Then confirm the guard: point `DATABASE_URL` at a non-dev endpoint and check the script refuses to run instead of proceeding. |
| R37 | Regression | `grep -c 'SEO_INDEXABLE' docs/developer-portal/env-setup.md` returns at least 1, and the surrounding prose states all four facts: what it controls, that it is a committed `wrangler.toml` var and not a secret, production-only, and that absent or non-`"true"` means `Disallow: /`. |
| R38 | Regression | `grep -c 'Quick View' docs/developer-portal/app-conventions.md` returns at least 1 and the section states the card-title-anchor rule and the `vendor-neutral-copy` file-list reason. |
| R39 | Regression | `npm run kms:validate` exits 0; `npm run kms:build-index` then `git status --porcelain ARTIFACT_INDEX.md "app/(admin)/staff/runbook/docs.ts"` prints nothing (already committed and current) and `npm run kms:check-generated` exits 0; `npm run kms:assemble:internal` exits 0; then `cd kms/site-internal && npm run build` succeeds. **Run the site build** — `gates` does not, so a broken docs site ships green otherwise. |
| R40 | Regression | `grep -c 'p955-996-994-crawlability' ARTIFACT_INDEX.md` returns at least 1. |
| R41 | Regression | `git diff origin/staging -- CHANGELOG.md` is non-empty and its new entry names `#955`, `#996` and `#994` (Gate 4). |
| R42 | Regression | `npm run lint`, `npm run typecheck`, `npm run format:check` each exit 0. Then, **as its own command with no build running**, `npx vitest run` — it exits 0 and the summary line reports a file count no lower than the 209 files the previous slice recorded, plus this slice's new files. A lower file count means the forks pool failed to start workers, not that tests passed. |

## What this validation cannot prove

- **That a search engine actually indexes anything.** Every row above checks what the application
  emits. Real indexing is post-deploy evidence measured in weeks, and `#113` means there is no live
  traffic to learn from yet. Do not record a row as proving discoverability.
- **Production's `SEO_INDEXABLE` binding.** `wrangler deploy` rebuilds a Worker's `vars` from
  `wrangler.toml`, so the variable's presence on the deployed production Worker is only proven by a
  real `deploy-production` run followed by reading
  `https://srimart.nocaped.com/robots.txt` and seeing `Allow: /`. R20 proves the code; it does not
  prove the deployed binding. **Re-read both hosts' `/robots.txt` and `/sitemap.xml` after the
  promotion** and record the result — a local pass here is not evidence about production.
- **Real-device behaviour** of the title anchor (a long-press menu, an iOS tap that resolves to a
  link rather than the drawer). R1–R5 prove the markup and the handler; a phone is post-deploy
  evidence.
