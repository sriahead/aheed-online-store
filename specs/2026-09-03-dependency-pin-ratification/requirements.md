# Dependency pin ratification (requirements / acceptance criteria)

Closes **`#491`**. `CLAUDE.md`'s dependency-discipline paragraph describes a dependency state that
stopped existing on 2026-08-14, when commit `ac3f0d6` deliberately raised `@neondatabase/serverless`
and `@prisma/adapter-neon` as part of the Cloudflare connection-exhaustion fix and updated only the
hybrid-driver section of the doc. This slice ratifies the running versions, re-pins them exactly so
`npm install` cannot move them, corrects the paragraph, and adds the machine check that keeps it
true. No runtime code changes. The adapter/client major straddle is **`#560`** and is out of scope.

Throughout, "the three pinned packages" means `@neondatabase/serverless`, `@prisma/adapter-neon`
and `@prisma/client`.

R1. `package.json` declares `"@neondatabase/serverless": "1.1.0"` — the exact string, with no `^`,
    `~`, `>`, `<`, `*` or `x` range operator.

R2. `package.json` declares `"@prisma/adapter-neon": "7.9.1"` — the exact string, with no range
    operator.

R2a. `package.json` declares `"@prisma/client": "6.19.3"` — exact, no range operator. (Discovered
     at Build: R6 asserts the no-range property for all **three** pinned packages, and
     `@prisma/client` was still `^6.19.3`. Pinning it is also what keeps the `#560` straddle from
     moving silently, and it keeps `allowScripts`'s exact `@prisma/client@6.19.3` key matching what
     resolves.)

R3. `node_modules/@neondatabase/serverless/package.json`, `node_modules/@prisma/adapter-neon/
    package.json` and `node_modules/@prisma/client/package.json` report versions `1.1.0`, `7.9.1`
    and `6.19.3` respectively — unchanged from before this slice.

R4. `package-lock.json` is re-synchronised with `package.json`, and **no package's resolved
    `"version"` changes anywhere in the tree** — the pins are ratifications of what is already
    installed, so nothing may move. Purely **additive** entries that npm materialises for
    already-present optional/bundled dependencies are permitted and must be enumerated in the build
    notes.

    **This requirement replaces an earlier draft that demanded an EMPTY `package-lock.json` diff.
    That draft was wrong and would have broken CI on every workflow.** `package-lock.json` mirrors
    the declared specifiers in its root `packages[""]` entry, so editing `package.json` without
    re-syncing leaves the two out of step, and **all eight workflows run `npm ci`**, which refuses
    to install when they disagree. Re-syncing is mandatory, not optional.

R4a. `npm ci` exits 0 from the committed `package.json` + `package-lock.json`, and the three pinned
     packages resolve to their documented versions after that clean install.

R5. A new file `tests/dependency-pins.test.ts` exists and, when run, asserts that the **installed**
    version of each of the three pinned packages equals a version literal declared in that test
    file.

R6. `tests/dependency-pins.test.ts` additionally asserts that `package.json`'s declared specifier
    for each of the three pinned packages contains no range operator.

R7. `tests/dependency-pins.test.ts` genuinely fails when a pin drifts: temporarily changing
    `package.json`'s `@prisma/adapter-neon` specifier from `7.9.1` to `^7.9.1` makes the test file
    fail, and restoring it makes the file pass again. (Proves the check is not vacuously green.)

R8. `CLAUDE.md`'s "Dependency & version discipline" section no longer contains the string
    `1.x is allowed by the range but must not be used`, no longer presents `0.10.4` as a **current**
    pin, and its first bullet names `1.1.0`, `7.9.1` and `6.19.3` as the locked versions.
    A **historical** reference to `0.10.4` as the pre-`ac3f0d6` value is expected and permitted —
    R9 requires that history, and an earlier draft of this requirement banned the string outright,
    which would have forced the correction to drop the very fact that explains it.

R9. `CLAUDE.md`'s "Dependency & version discipline" section cites commit `ac3f0d6` and states that
    the raise was a deliberate part of the Cloudflare connection-exhaustion fix.

R10. `CLAUDE.md`'s "Dependency & version discipline" section states that `@prisma/adapter-neon` is a
     major ahead of `@prisma/client`, that this is deliberate and known, and cites `#560`.

R11. `CLAUDE.md`'s "Dependency & version discipline" section no longer asserts that
     `@cloudflare/workers-types` matches wrangler's major, and instead records the observed pairing
     (`@cloudflare/workers-types` 5.x with `wrangler` 4.x).

R12. `CLAUDE.md`'s "Dependency & version discipline" section names
     `tests/dependency-pins.test.ts` as the enforcement of the exact-pin rule, and does not claim
     enforcement by any test that does not check pins.

R12a. `CLAUDE.md`'s Windows-shell section records the current suite size as **77 test files** (the
     pre-slice 76 plus this slice's new file), replacing the stale `74/874`. This matters because
     that section teaches the file count as *the tell* for the silent worker-startup failure — a
     wrong recorded count disables the detection it exists to provide.

R13. This slice changes no runtime code: `git diff --name-only origin/staging` lists no file under
     `app/`, `lib/`, `features/`, `components/`, `prisma/` or `scripts/`, with the single exception
     of the generated `app/(admin)/staff/runbook/docs.ts` (build output, not runtime code).

R14. `npm run kms:validate` exits 0, and `npm run kms:check-generated` exits 0 (or the regenerated
     artefacts are committed, leaving it exiting 0).

R15. The internal docs site builds with this slice's `plan.md` present: `npm run
     kms:assemble:internal` followed by a webpack `next build` in `kms/site-internal` exits 0.

R16. `CHANGELOG.md` updated (Gate 4).

R17. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
