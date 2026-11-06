# iPhone 6s / Safari 15 compatibility (validation)

The guard is a unit-tested pure function plus a real build. The end-to-end proof is the staging chunks passing the same checker, plus a manual device check. No real iOS 15 device is available to the assistant, so that row is the owner's.

On Windows Git Bash, prefix `curl` with `MSYS_NO_PATHCONV=1` (CLAUDE.md, "Windows shell").

## Validation Steps

| Req | How to verify |
| --- | --- |
| R1 | `node -e "console.log(JSON.stringify(require('./package.json').browserslist))"` prints exactly `["chrome >= 111","edge >= 111","firefox >= 111","safari >= 15.4","ios_saf >= 15.4"]`. |
| R2 | `npx vitest run tests/browser-support.test.ts` passes. Then temporarily change `safari >= 15.4` to `safari >= 16.4` in `package.json` and re-run: it fails. Revert, and `git diff package.json` is empty. |
| R3 | Clean case: after R5's build, `npx tsx scripts/check-client-syntax.ts` exits 0 and prints a file count > 0. Failing case: `mkdir -p "$TMP/cs" && printf 'class A{static{}}' > "$TMP/cs/a.js" && npx tsx scripts/check-client-syntax.ts "$TMP/cs"` exits 1 and names `a.js:1:` and "static block". Empty case: `mkdir -p "$TMP/empty" && npx tsx scripts/check-client-syntax.ts "$TMP/empty"` exits 1. |
| R4 | `npx vitest run tests/browser-support.test.ts` passes, and the file contains one test per bullet of R4 (read it). |
| R5 | `npm run build` exits 0, and its tail shows the checker's success line with a file count > 0. Run this alone: CLAUDE.md says not to run vitest beside a build. |
| R6 | After R5: `grep -rlF 'static{' .next/static --include=*.js` prints nothing. |
| R7 | `node -e "console.log(require('./package.json').devDependencies.acorn)"` prints `8.18.0`. The R2 test file asserts it (read it). |
| R8 | Read the four named passages: `grep -n "15.4" specs/tech-stack.md CLAUDE.md docs/developer-portal/runtime-pitfalls.md` hits all three files. |
| R9 | After the staging deploy: fetch `https://aheed-staging.merqify.com/`, download every `/_next/static/**.js` it references into a new directory, then run `npx tsx scripts/check-client-syntax.ts <dir>`. It exits 0. Also confirm the downloaded set contains no `static{`. |
| R10 | `git diff origin/staging -- CHANGELOG.md` shows an entry naming `#1445`. |
| R11 | `npm run lint`, `npm run typecheck`, `npm run format:check`, `npx vitest run --maxWorkers=4` all exit 0. CI `gates` green on the PR. |
| V-manual (owner, not gating merge) | On an iPhone on iOS 15.4–15.8 in Safari, on staging: (1) "Continue with Google" on `/login` reaches Google's account chooser; (2) "Add" on a product card updates the basket count; (3) email sign-in works; (4) icons are visible. Also check (1), (2) and (3) in desktop Chrome and current Safari. Record the result in `#1445`. |
