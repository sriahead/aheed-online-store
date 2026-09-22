# KMS internal docs site — build the Pagefind search index (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

This slice is a **build-pipeline, deployed-asset and version-control-hygiene** change. It touches
no database, no auth, no payments and no application runtime code, so the weight sits on
Integration (does the index reach the deployable assets; does the ignore rule actually match) and
System/E2E (does the deployed site actually search). There is no unit surface worth inventing: the
logic is "run a binary, then assert its output exists", and the meaningful assertions are the
deliberate break in R5 and the rule-level `git check-ignore` checks in R8/R9.

**Read before running anything:**

- Every step below runs from the repository root **unless the row says `kms/site-internal`**.
- A full `kms/site-internal` build takes roughly **3–4 minutes**; the OpenNext build takes longer.
  Do not assume a hung terminal.
- Per `CLAUDE.md`, run `npx vitest run` **alone**, never beside or straight after a build.
- R8/R9 concern `#857`, folded into this slice. Before this slice, `npm run kms:assemble:internal`
  left ~9 untracked directories under `kms/site-internal/content/`; after it, that must be zero.
- **Start R8 from a genuinely clean tree.** If a previous run left generated content behind, remove
  it first (`git clean -nd kms/site-internal/content` to preview, then `-fd` to apply) — otherwise
  R8 can pass on files that were merely already there.

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `node -p "require('./kms/site-internal/package.json').devDependencies.pagefind"` prints a bare version with no `^`/`~` (e.g. `1.4.0`). Then `grep -c '"node_modules/pagefind"' kms/site-internal/package-lock.json` prints `1` or more. |
| R2  | Unit | `node -p "require('./kms/site-internal/package.json').scripts.postbuild"` prints a command containing both `--site .next/server/app` and `--output-path public/_pagefind`. |
| R3  | Integration | `cd kms/site-internal && npm run build`, then `test -s public/_pagefind/pagefind.js && echo PASS`. Prints `PASS`. |
| R4  | Integration | Derive the expected number, then compare — do not assume `197`. Run `cd kms/site-internal && find .next/server/app -name '*.html' \| wc -l` (call it **H**, was 199) and `cd kms/site-internal && for f in $(find .next/server/app -name '*.html'); do grep -L data-pagefind-body "$f"; done` (call it **E**, was exactly `_not-found.html` and `_global-error.html`). The R3 build's console line `Indexed N pages` must satisfy **N = H − count(E)**, and E must contain only error pages. At spec time that was 197 = 199 − 2. |
| R5  | Regression (deliberate break) | Temporarily point the `postbuild` `--site` flag at a directory containing no HTML (e.g. `--site .next/server/app-does-not-exist`). Run `cd kms/site-internal && npm run build; echo "exit=$?"`. Expect a **non-zero** `exit=` and a message naming the missing/empty index. **Revert the edit**, re-run `npm run build`, confirm `exit=0`. Both halves are required — a guard that never fires is not a guard. |
| R6  | Unit | `grep -n '_pagefind' .gitignore` matches. `test ! -e kms/site-internal/.gitignore && echo PASS` prints `PASS`. |
| R7  | Integration | After the reverted R5 build: `git status --porcelain kms/site-internal/public` prints **nothing**. |
| R8  | Integration | From a clean tree (see note above): `npm run kms:assemble:internal`, then `git status --porcelain kms/site-internal/content` prints **nothing**. Then prove the rule rather than the absence: `git check-ignore -v kms/site-internal/content/dev/adr/adr-001-hosting.mdx` prints the matching `.gitignore` line and exits 0. |
| R9  | Integration | `git check-ignore kms/site-internal/content/index.mdx kms/site-internal/content/dev/index.mdx kms/site-internal/content/staff/index.mdx; echo "exit=$?"` prints **`exit=1`** with no paths listed (exit 1 = nothing ignored, which is the pass). Then `git ls-files kms/site-internal/content` lists exactly those three files. |
| R10 | Unit | Read the `# KMS` comment block in `.gitignore`. It must describe the `content/<track>/<type>/` layout; it must no longer say generated content sits one level under `content/`. |
| R11 | Integration | `cd kms/site-internal && npx opennextjs-cloudflare build`, then `test -s .open-next/assets/_pagefind/pagefind.js && echo PASS`. Prints `PASS`. Expect 244 files: `find .open-next/assets/_pagefind -type f \| wc -l`. |
| R12 | System / E2E | **Requires Cloudflare Access — owner-executable, not CI.** In a browser already authenticated to `docs.internal.aheedfoodcentre.nocaped.com`, open `https://docs.internal.aheedfoodcentre.nocaped.com/_pagefind/pagefind.js` directly. Expect JavaScript source to render, not a 404 page. (An unauthenticated `curl` cannot reach this host and proves nothing either way.) |
| R13 | System / E2E | **Requires Cloudflare Access — owner-executable.** On the deployed site, type `fulfilment` into the search box. Expect results listed with no `Failed to load search index` banner, including at least one URL under `/dev/` and at least one under `/staff/`. Record both URLs in the build notes. |
| R14 | Release | `gh run list --workflow deploy-docs-internal --limit 3 --json headSha,conclusion` shows `success` for the merge commit's SHA. |
| R15 | Unit | `grep -i -n 'pagefind\|next dev' kms/site-internal/README.md` returns a line stating search needs the build-time index and is unavailable in dev. |
| R16 | Regression | `git diff --name-only origin/staging...HEAD` lists **only**: paths under `kms/site-internal/`, paths under `specs/2026-09-22-kms-search-index/`, `.gitignore`, `CHANGELOG.md`, `ARTIFACT_INDEX.md`, and the generated `app/(admin)/staff/runbook/docs.ts`. Read the **whole unfiltered list**, not a grep of expected prefixes — a path-prefix filter is exactly what let an out-of-scope file through on `#861`. |
| R17 | Release | `git diff origin/staging...HEAD -- CHANGELOG.md` is non-empty and its entry names both `#871` and `#857`. |
| R18 | Regression | Run each alone from the repository root: `npm run lint`; `npm run typecheck`; `npm run format:check`; `npx vitest run` (**alone** — see the forks-pool trap); `npm run kms:validate` (expect `invalid front-matter (failing): 0`); `npm run kms:coverage`; `npm run kms:check-generated`. All exit 0. |
