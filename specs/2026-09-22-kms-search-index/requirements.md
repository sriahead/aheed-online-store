# KMS internal docs site — build the Pagefind search index (requirements / acceptance criteria)

Closes `#871` and `#857`. Search on the internal KMS site (`docs.internal.aheedfoodcentre.nocaped.com`)
fails on every query with `TypeError: Failed to fetch dynamically imported module: .../_pagefind/pagefind.js`,
because nothing in this repository has ever generated Nextra's Pagefind index. This slice generates
it during the build, ships it as a deployed asset, and makes its absence fail the build. It also
repairs the root `.gitignore` rule for assembled KMS content, which stopped matching when `#853`
moved that content a directory deeper — folded in at the owner's direction because it is the same
two lines of the same file. This slice changes no document body, no front-matter, no navigation
structure and no schema. All numbers below were measured against this repository on 2026-09-22;
see `plan.md`.

R1. `kms/site-internal/package.json` declares `pagefind` in `devDependencies` at an **exact**
    version (no `^` or `~`), and `kms/site-internal/package-lock.json` is updated in the same
    commit.

R2. `kms/site-internal/package.json` declares a `postbuild` script that runs Pagefind with
    `--site .next/server/app` and `--output-path public/_pagefind`.

R3. Running `npm run build` in `kms/site-internal` produces the file
    `kms/site-internal/public/_pagefind/pagefind.js`, non-empty.

R4. That same run indexes **every prerendered content page**: the reported page count equals the
    number of `*.html` files under `kms/site-internal/.next/server/app` minus exactly those
    carrying no `data-pagefind-body` element. Measured 2026-09-22 at **197 = 199 − 2**
    (`_not-found.html`, `_global-error.html`). The **formula** is the requirement; the literals are
    the value at spec time and will move if the corpus changes. A shortfall beyond those two error
    pages is a failure.

R5. A guard fails the build with a **non-zero exit code** when the index is absent or reports zero
    indexed pages. Proven by deliberate break: with the index step prevented from producing output,
    `npm run build` in `kms/site-internal` exits non-zero and prints a message naming the missing
    index; reverting restores exit 0.

R6. The repository-root `.gitignore` ignores `kms/site-internal/public/_pagefind` (or a
    `kms/site-*` equivalent). `kms/site-internal/.gitignore` is **not** created — every KMS
    build-artifact rule stays in the root file.

R7. After a full build, `git status --porcelain` lists no file under `kms/site-internal/public/`.

R8. **(`#857`)** After running `npm run kms:assemble:internal` from a clean tree,
    `git status --porcelain` lists **no** file or directory under `kms/site-internal/content/`.
    Verified at the rule level, not just by absence: `git check-ignore -v` reports a matching
    ignore rule for a generated file at the post-`#853` depth
    (e.g. `kms/site-internal/content/dev/adr/adr-001-hosting.mdx`).

R9. **(`#857`)** The three hand-authored, currently-tracked content pages remain **not** ignored:
    `git check-ignore` exits non-zero (no match) for `kms/site-internal/content/index.mdx`,
    `kms/site-internal/content/dev/index.mdx` and `kms/site-internal/content/staff/index.mdx`, and
    `git ls-files kms/site-internal/content` still lists exactly those three files.

R10. **(`#857`)** The explanatory comment above the rule in `.gitignore` describes the actual
     post-`#853` layout — it no longer claims content is one level under `content/`.

R11. Running `npx opennextjs-cloudflare build` in `kms/site-internal` places the index in the
     deployable assets — `kms/site-internal/.open-next/assets/_pagefind/pagefind.js` exists and is
     non-empty.

R12. On the deployed Worker, an **authenticated** `GET https://docs.internal.aheedfoodcentre.nocaped.com/_pagefind/pagefind.js`
     returns HTTP **200** with a JavaScript content type — not 404.

R13. On the deployed site, typing a term that occurs in both tracks (e.g. `fulfilment`) into the
     search box returns at least one result whose URL is under `/dev/` and at least one under
     `/staff/`, and surfaces no error banner.

R14. The `deploy-docs-internal` workflow run for the merge commit completes with conclusion
     **success**.

R15. `kms/site-internal/README.md` states that search requires the build-time index step and does
     not work under `next dev`.

R16. No file under `docs/`, `specs/` (other than this slice's own directory), `kms/scripts/`,
     `kms/schema/`, or `kms/site-public/` is modified by this slice, and `ARTIFACT_INDEX.md`
     changes only by this slice's own `plan.md` entry.

R17. `CHANGELOG.md` updated (Gate 4), naming both `#871` and `#857`.

R18. `npm run lint`, `npm run typecheck`, `npx vitest run` and `npm run format:check` all remain
     green after this slice, and `npm run kms:validate`, `npm run kms:coverage` and
     `npm run kms:check-generated` all exit 0.
