# iPhone 6s / Safari 15 compatibility (requirements / acceptance criteria)

Closes the JavaScript half of issue `#1445`.

- Next.js 16 compiled for Safari 16.4+ by default, so iOS 15 Safari failed to parse a framework chunk and React never hydrated.
- This slice sets the browser targets to Safari/iOS 15.4 and adds a post-build guard that fails the build if client JavaScript contains syntax Safari 15.4 cannot parse.
- The HTTPS redirect is a Cloudflare zone setting and out of scope. See `plan.md`.

R1. `package.json` has a top-level `browserslist` array equal to exactly
    `["chrome >= 111", "edge >= 111", "firefox >= 111", "safari >= 15.4", "ios_saf >= 15.4"]`.

R2. `tests/browser-support.test.ts` exists, runs under `npx vitest run`, and fails when any of these is true:
    - `browserslist` is missing.
    - It lacks a `safari` entry or an `ios_saf` entry.
    - Either entry's minimum version is greater than 15.4.
    - `package.json` has no `postbuild` script that runs `scripts/check-client-syntax.ts`.

R3. `scripts/check-client-syntax.ts` parses each `.js` file under a directory with `acorn`.
    - The directory is the first CLI argument, default `.next/static`. Files are found recursively.
    - Parsing uses `ecmaVersion: "latest"`, trying `sourceType: "script"` first and then `"module"`.
    - It reports every occurrence of each of the following, as `file:line:column — construct`:
      (a) a class static block;
      (b) a regular-expression **literal** whose pattern contains `(?<=` or `(?<!`;
      (c) a regular-expression literal with the `v` flag.
    - It exits 1 when it reports at least one occurrence.
    - It exits 1 when a file fails to parse.
    - It exits 1 when the directory contains zero `.js` files.
    - Otherwise it prints the number of files checked and exits 0.

R4. The detection logic is an exported pure function (source text in, findings out). Unit tests in `tests/browser-support.test.ts` show it:
    - flags a static block;
    - flags a lookbehind regex literal;
    - flags a `v`-flag regex literal;
    - does **not** flag the string `"(?<="` inside an ordinary string literal;
    - does **not** flag a static private field (`static #e = 1`) or a public static field;
    - returns no findings for a clean snippet.

R5. `package.json` `scripts.postbuild` is `tsx scripts/check-client-syntax.ts`. `npm run build` on this branch exits 0 and its output includes the checker's success line with a file count greater than 0.

R6. Against this branch's `npm run build` output, `.next/static` contains no file matching the literal text `static{`.

R7. `acorn` is in `devDependencies` at exactly `8.18.0` (no caret, no tilde), and `tests/browser-support.test.ts` asserts that literal.

R8. `specs/tech-stack.md` states:
    - the Safari/iOS 15.4 floor and why it is 15.4 (cascade layers, unguarded `structuredClone`);
    - the `browserslist` entry;
    - the `postbuild` guard;
    - the `acorn` pin.
    `CLAUDE.md` carries a one-line rule that `browserslist` must not be removed. `docs/developer-portal/runtime-pitfalls.md` has an entry describing the failure signature (green build, dead page on old Safari).

R9. After the staging deploy, the chunks referenced by `https://aheed-staging.merqify.com/` pass `scripts/check-client-syntax.ts` when downloaded to a directory and passed as its argument.

R10. `CHANGELOG.md` updated (Gate 4).

R11. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
