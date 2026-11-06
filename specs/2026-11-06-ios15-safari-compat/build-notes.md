# iPhone 6s / Safari 15 compatibility (build notes)

Worktree: `E:\GitRepositories\aheed-ios15`, branch `feature/ios15-safari-compat`, cut from `origin/staging` at `b079fa8a`. The main checkout was holding another session's uncommitted catalogue work, so the build happened in this worktree.

## What changed and why

- **`package.json`**:
  - adds `browserslist` (R1);
  - adds `scripts.postbuild` = `tsx scripts/check-client-syntax.ts` (R5);
  - adds `acorn` `8.18.0` exact as a devDependency (R7).
  - `package-lock.json` gains only that one line. acorn 8.18.0 was already installed via eslint → espree, so no new package was downloaded.
- **`scripts/lib/client-syntax.ts`** exports `findUnsupportedSyntax(source)`, a pure function (R4).
  - It parses as a script, then falls back to a module.
  - It walks every child object of the AST iteratively, with no visitor table, so a new acorn node type cannot be skipped silently.
  - It flags `StaticBlock` nodes and regex **literals** with `(?<=`/`(?<!` or the `v` flag.
- **`scripts/check-client-syntax.ts`** is the CLI (R3). It takes a directory argument, default `.next/static`, recursive. It exits 1 on a finding, on a parse failure, on zero files, or on an unreadable directory.
- **`tests/browser-support.test.ts`** has 11 tests:
  - targets equal the exact array;
  - safari and ios_saf minimum ≤ 15.4;
  - the postbuild hook;
  - the acorn pin;
  - six detector cases.
- **Docs:**
  - `specs/tech-stack.md` "Application" has a new browser-floor bullet (v1.8.0).
  - `docs/developer-portal/runtime-pitfalls.md` "Framework and dependency traps" has a new first entry (v1.5.0).
  - `CLAUDE.md` "Runtime & hosting" has one rule.
  - `CHANGELOG.md` has a "Fixed" entry.
  - `ARTIFACT_INDEX.md` and `app/(admin)/staff/runbook/docs.ts` were regenerated.

## Decisions taken during the build

- **Parse, don't grep.** A grep for `(?<=` would false-positive on string literals. acorn was chosen over esbuild (already a devDependency) because esbuild **lowers** a static block for an old target rather than reporting it, so it cannot act as a detector.
- **`postbuild`, not a `quality.yml` step.** `quality.yml` never builds, because a PR runner has no build secrets. OpenNext's `buildNextjsApp` runs `npm run build`, and npm runs `postbuild` automatically, so both deploy workflows run the guard between build and deploy without a workflow edit. The cheap half (R2) is in `npm test`, which `quality.yml` runs.
- **Floor is 15.4 in `browserslist` itself**, not 15.0. The probe used `>= 15`. The floor that the CSS (`@layer`) and Next (`structuredClone`) actually need is 15.4, and writing that into `browserslist` keeps the targets and the documented floor one fact.
- The detector does not flag `#x in obj` (ergonomic brand checks), static or private fields, or private methods. Safari 15 parses all of them, and Next's lowered output uses `static #e=…`.

## Deviations from the spec

None.

## Known-shaky areas

- **No real iOS device was used.** The proof is syntactic: the guard over the built output. The behaviour proof (Google sign-in reaching the chooser, add to basket working) is the owner's V-manual row in `validation.md`.
- **Icons are not claimed fixed.** Every inline SVG icon is already in the server HTML, so icons should not have depended on hydration. If they are still missing on a 15.4+ device, that is a new investigation and needs a device screenshot.
- **Runtime APIs are not checked.** A future dependency calling something newer than Safari 15.4, unguarded, would pass the guard.
- **Measured locally:**
  - `npm run build` exit 0, with `check-client-syntax: 158 client file(s) parse on Safari / iOS 15.4.`;
  - no `static{` in `.next/static`;
  - the built CSS has the same `@layer`/`@property`/`color-mix(`/`oklch(`/`@supports` counts as live production;
  - the checker run against the 19 production chunks downloaded before the fix exits 1, naming `3794-d7cddff008311ab3.js:1:93924 — class static block`.
- **`npm install` prunes `node_modules/@aheed/reference-client`** (a generated package). After any `npm install`, re-run `npm run db:generate` before building, or the build fails with `Can't resolve '@aheed/reference-client/wasm'`. That is what happened mid-build here. CI is unaffected (`npm ci`, then `db:generate`).
- **Validation was not independent**: same context, under the 60% rule, if validated in place.

## Validation pass 1 (2026-11-06, not independent)

This pass ran in the same session that built the slice, on Opus rather than Sonnet, at the owner's choice. There was no `/clear` and no model switch. It is **not** an independent validation.

- **Pre-flight:** lint, format, `tsc --noEmit` and `npm run build` all passed. The build ended with `check-client-syntax: 158 client file(s) parse on Safari / iOS 15.4.`. `npx vitest run --maxWorkers=4` ran 397 files and 5972 tests, with 0 failed.
- **R1:** `browserslist` prints the exact array.
- **R2:** `tests/browser-support.test.ts` passes. With `safari >= 16.4` substituted it fails (2 failed, 9 passed). After reverting, `git diff package.json` is empty.
- **R3:**
  - The clean `.next/static` exits 0 with 158 files.
  - `class A{static{}}` in a temp directory exits 1, naming `a.js:1:9 — class static block`.
  - An empty directory exits 1.
  - An unparseable file exits 1 ("does not parse"), which goes beyond the row.
- **R4:** the test file has one test per R4 bullet: static block, lookbehind `(?<=`/`(?<!`, `v` flag, lookbehind text in a string not flagged, static private and public fields not flagged, and clean script and module snippets. All pass.
- **R5:** `scripts.postbuild` is `tsx scripts/check-client-syntax.ts`, and the build printed its success line. Both deploy workflows run plain `npm ci`, which includes devDependencies, so `tsx` and `acorn` are present when OpenNext's `npm run build` triggers `postbuild`.
- **R6:** `grep -rlF 'static{' .next/static --include=*.js` matched 0 files.
- **R7:** `devDependencies.acorn` is `8.18.0`, and the test asserts it (line 52).
- **R8:** "15.4" appears in `specs/tech-stack.md` (5 times), `CLAUDE.md` (1) and `runtime-pitfalls.md` (1). Each passage was read.
- **R10:** the CHANGELOG diff against `origin/staging` names `#1445`.
- **R11:** passes locally. **CI `gates` is unverified until the PR runs.**
- **R9: unverified, and it can only be checked after the staging deploy.** It is to be run at Ship.
- **V-manual: unverified.** It needs the owner's iOS 15.4+ device and does not gate the merge.

**Result:** every row checkable before deploy passes. R9 and CI are pending Ship; V-manual is the owner's.
