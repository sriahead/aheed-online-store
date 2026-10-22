# Colourful, vendor-themed, provider-agnostic icon system (build notes)

**This is the build of PR 1 only (Phase 1, the foundation).** The spec covers five PRs
(`plan.md`, "Scope"); P2a, P2b, P3 and P4a are not built. A validator should check every requirement
tagged **P1** or **all**, and treat P2a, P2b, P3 and P4a rows as not applicable to this PR.

Built in the main checkout on `feature/icon-system` (no sub-agent worktree), on Sonnet 5.5; `CLAUDE.md`
assigns Build to Opus 5 and the owner started the stage without switching. Two spec-correction commits
precede the implementation commit, each explained in its own message: `97273997` (R37's Worker metric)
and `fe360784` (the icon count and R11, R26 to R28, R31, R33 to R36).

## What changed and why

**New: `components/icons/`**
- `types.ts`: the tier and provider types, the size scale (xs 12, sm 16, md 20, lg 24, xl 32, 2xl 48,
  default 24), the tone tables. `RegistryEntry` is a discriminated union so a `functional` entry with
  provider `ph` is a compile error (R16), proved by an `@ts-expect-error` line in
  `tests/icon-registry.test.ts`.
- `registry.ts`: `ICON_REGISTRY`, 99 keys covering the 102 `lucide-react` exports the app imported at BASE
  (several exports are one icon: `CheckCircle2` and `CircleCheck`). Every entry is provider `lucide` in
  this PR; Phosphor appears from P3. Tiers were judged once: 34 functional (controls, navigation), 6
  status (alerts, confirmations), 59 decorative.
- `Icon.tsx`: a plain function (no client directive, no hooks). `IconSvg` is the presentational half,
  exported so tests can render fixture data (a Phosphor duotone body) through the production path.
  Root attributes come from the data and are placed on the `<svg>`; `dangerouslySetInnerHTML` injects
  the body, which only ever comes from the generator.
- `generated/icon-data.ts`: generated, committed, excluded from Prettier and ESLint (`.prettierignore`,
  `eslint.config.mjs`) so the generator owns its bytes.

**New: the generator.** `scripts/lib/icon-build.ts` (pure, testable) and `scripts/build-icons.ts` (thin
CLI: `icons:build`, `icons:check`, `--registry <json>` to validate a fixture). It resolves ids through
`@iconify/utils`' `getIconData` (which handles aliases), hoists the Lucide root attributes onto the
`<svg>`, rewrites a Phosphor duotone icon's `opacity=".2"` layer to read `--icon-secondary`, and rejects
unsafe markup. It also emits `public/third-party-icon-licenses.txt` from `scripts/icon-licences/<SPDX>.txt`
(upstream `LICENSE` text fetched verbatim from `raw.githubusercontent.com`; `ISC.txt` and `MIT.txt`
exist, `Apache-2.0.txt` is for P4a).

**New tools.** `scripts/verify-icon-markup.ts` (inventory a server's `<svg>` elements; `--compare` two
inventories), `scripts/list-lucide-imports.ts` (the TypeScript-AST list of Lucide exports at a checkout),
`scripts/codemod-lucide-to-icon.ts` (the mechanical migration P2a and P2b will use; it refuses
anything that is a design edit and removes dead imports), `scripts/lib/svg-geometry.ts` (the shared
geometry normaliser).

**Migrated in this PR** (the minimum R29 and R30 need, plus the files whose tests selected Lucide's
generated classes): `Header`, `FilterPanel`, `CollapsibleSidebar`, `DepartmentHero`, `DepartmentScroller`,
`PanelNav`, `app/(admin)/staff/page.tsx`, with `category-icon.ts` and `nav-items.ts` now carrying icon
**names**. Every file's classes were carried over verbatim and no `size` prop was set.

**Docs and wiring:** the `design-system.md` Icons section rewritten (R2), `tech-stack.md` (R3), the
`CLAUDE.md` bullet (R4), four exact pins in `tests/dependency-pins.test.ts` (R5), `icons:check` in
`quality.yml` (R9), CHANGELOG (R52).

## Decisions taken during the build

- **`@iconify-json/lucide` is pinned to 1.2.122, not the newest.** The newest (1.2.147) redraws
  `circle-check`, `cookie`, `trash` and others against the installed `lucide-react` 1.30.0 (published
  2026-08-07); 1.2.122 was published the same day and all 102 icons match. The pin is explained in
  `tests/dependency-pins.test.ts`, `specs/tech-stack.md` and the CHANGELOG. **Bumping `lucide-react`
  means re-running the parity test and probably moving this pin with it.**
- **Lockfile edited surgically.** `npm install` in this container (npm 10.9.4) removed `libc` markers
  from 68 platform packages and rewrote unrelated entries, so the original `package-lock.json` was
  restored and only the eight new packages plus a `tinyexec` 1.3.0 to 1.3.1 patch bump were grafted in
  (the new `@antfu/install-pkg` requires `tinyexec` 1.3.1 or later, so leaving it would have left the lock out
  of sync). `npm ci` exits 0 against it. **If CI's `npm ci` objects, regenerate with the repository's own
  npm version.**
- **Registry keys.** The Lucide canonical id (after alias resolution) with a trailing numeric suffix
  dropped (`share-2` to `share`, `trash-2` to `trash`, `building-2` to `building`), and `grid-3x3` to
  `grid` because a segment may not start with a digit. `circle-question-mark` kept its Lucide spelling
  rather than inventing `help`; renaming a key is cheap now and expensive after P2.
- **Geometry comparison is normalised, within 0.06 units.** See the deviations.
- **`Icon` always emits `aria-hidden` without a `label` and `role="img"` with one.** `lucide-react` emits
  `aria-hidden="true"` by default, so the codemod drops explicit `aria-hidden`; with an `aria-label` it
  emits that attribute alone (no `role`), which differs from `Icon`, but no existing call site passes one.
- **The codemod refuses rather than guesses.** A name used as a value, a spread, or any prop `Icon` does
  not take leaves that name's import and tags untouched. `Header.tsx` lost four dead imports (`Search`,
  `UserCheck`, `LogOut`, `Clock`), which R32 will need gone anyway.
- **The registry holds 99 keys because it mirrors the manifest, not the live call sites.** A few (for
  example the dead imports above) have no JSX use yet; they cost a few hundred bytes of generated data
  and keep P2 mechanical. Pruning is a P2b candidate.
- **`DepartmentHero`'s corner glyph stays an inline `Icon` in this PR** (`strokeWidth={1.25}` preserved).
  R46's shared `DepartmentGlyph` component belongs to P4a.

## Deviations from the spec

All were found by running the real tools, are recorded in the two spec-correction commits, and change
neither scope nor acceptance intent:

1. **Icon count is 102, not 141.** The first audit globbed the whole repository and so counted the
   `docs/ui-ref` and `docs/ui-ref-revised` mockups. The spec, ADR-008 and the CHANGELOG are corrected.
   **GitHub issue `#1223`'s body still says 141 and was not edited.**
2. **R37's Worker metric** is `wrangler deploy --dry-run`'s `gzip:` figure; `.open-next/worker.js` is a 2,278
   byte shim (745 gzipped).
3. **R11** uses `check-circle-2` (an alias in the pinned release); `trash-2` is a real icon there.
4. **R26** compares normalised geometry within 0.06 units, not literal attribute strings (Iconify merges
   an icon's paths, converts lines to paths, closes subpaths differently and rounds some coordinates:
   `10.747` is stored as `10.8`). Result: zero divergences, `LUCIDE_PARITY_EXCEPTIONS` is empty.
5. **R27/R28:** only Lucide is in the registry in P1, so Phosphor is not named in the licence file yet.
6. **R33 to R35:** `geometry` is the normalised list rather than a hash, and `--compare` decides
   equivalence. The script is exercised against a local HTTP server in `tests/verify-icon-markup.test.tsx`.
7. **R36's absence grep** excludes the generated `docs.ts` (it embeds this slice's plan text).
8. **R13's wording** ("no more own-paint attributes on children than `lucide-react`") is implemented as a
   count comparison per icon, not a per-element match. The list of tolerated exceptions is empty.

## Known-shaky areas

- **Nothing was run against a live server.** This cloud session has no `.env`, `.dev.vars` or `secrets/`,
  so `npm run preview`, sign-in and every database-backed route were unavailable. **R28 (the licence file
  served on both hosts), R34 and R35 (BASE against HEAD markup equivalence on both vendors, including
  signed-in and staff pages) are therefore unverified.** The pieces are proved separately: the file is in
  `.open-next/assets/`; the script and `--compare` pass their local-server tests, including a
  `lucide-react` page against the same page through `Icon`; and every Lucide icon's geometry matches.
- **`--sign-in` against real Better Auth is untested.** It follows `local-dev-playbook.md` (POST to
  `/api/auth/sign-in/email` with `origin` and `x-forwarded-proto: http`, then the cookie), and the local
  server test asserts those headers, but not a real session. The 30 second retry on 429 is unexercised.
- **Client bundle shape.** `Icon` imports the whole `ICON_DATA` (about 33 KB raw), so any client component
  that renders an `Icon` puts every icon body in its chunk. It will grow as P2 moves more client files; if
  P2b nears the budget the fix is splitting the data by tier, not removing icons. **R37, corrected by
  validation run 1 (fresh builds of both commits with the commands in `validation.md`):** BASE client
  `.next/static/**/*.js` gzip sum **546,214** bytes over 124 files, Worker `gzip:` **5,014.91 KiB**; HEAD
  **546,895** over 123 files (**+681**, budget 15,360) and **5,019.49 KiB** (**+4.58 KiB**, budget 100). The
  baseline this Build first recorded (546,053 and 5,026.59 KiB) was off by 11.7 KiB on the Worker figure, and
  the "-9.86 KiB" it produced was not real; wrangler's gzip figure varies between builds by about that much,
  so compare a fresh BASE and HEAD built back to back and treat differences under about 15 KiB on the
  Worker figure as noise.
- **`app/(admin)/staff/runbook/docs.ts` is generated and now holds this slice's plan text.** Run
  `npm run kms:build-index` after the last doc edit, not before (the #232 shape).
- **The licence text is the upstream `main` branch's `LICENSE` at build time** (Lucide's currently reads
  2026), not necessarily the text at the pinned package version. `info.json` for Noto points at a
  `svg/LICENSE` path that returned 404 on 2026-10-22; P4a must find the real file before it can add
  `Apache-2.0.txt`.
- **`tests/icon-generator.test.ts` briefly appends a byte to the real generated file** (then restores it
  in a `finally`) to prove `--check` fails. Under heavy parallel load another worker importing that file in
  that instant would still see valid TypeScript, so it cannot produce a spurious failure, but it is the
  one test that writes to a tracked file.
- **Registry tiers are a judgement.** Nothing enforces which of the 99 names are `functional`, `status`
  or `decorative` beyond the Lucide-only rule for the first. Phase 3 depends on the `decorative` ones.
- **Unknown at build time:** whether the real two-hue duotone rendering looks right inside the app (only
  fixture markup and a static preview sheet exist), and whether `fill-current` on the favourite heart
  visibly fills in a browser. The markup contract is tested (`fill="none"` on the root, no child override);
  the pixels are not.

## Validation run 1 (PR 1, Phase 1)

Run on commit `8a0685d3`. **Not independent:** the same Sonnet 5.5 context that built the slice ran it,
after no `/clear`; rows were checked against the files on disk, not against memory, but treat the result as
a self-check and re-run after a real Clear if independence matters. P2a, P2b, P3 and P4a rows are not
applicable to this PR. The result is **FAIL**: two findings below are real, and several rows are unverified.

**Pre-flight, each alone, all exit 0:** `lint`, `format:check`, `icons:check`, `kms:validate`,
`kms:check-generated`, `npx tsc --noEmit` (no output), `npm run build`. `npx vitest run --maxWorkers=4`:
**306 files passed, 4540 tests passed, 3 skipped**; the known flake did not fire. The docs-site build
(`kms:assemble:internal` then `next build --webpack` in `kms/site-internal`) exits 0.

**Pass (confirmed by running the row's command, or reading the file it names):** R1, R2, R3, R4, R5, R6,
R7, R8 (both files), R9, R10 (the three CLI cases and the by-hand bogus id), R11, R12, R13 (zero listed
exceptions), R14, R15, R16 (type error confirmed on a temporary line, then reverted), R17, R18, R19, R20,
R21 (type error confirmed, reverted), R23, R24, R25, R26 (pinned and installed both 1.2.122, zero parity
exceptions), R27 (ISC and MIT texts byte-identical to upstream `main`; missing `ISC.txt` fails the build and
names the file), R29, R30 (`tests/staff-nav-parity.test.ts` unchanged since BASE), R31 (re-derived from a real
BASE worktree with `scripts/list-lucide-imports.ts`: 102 names, no diff), R37, R50 (git half), R52, R53, R54.

**R37 numbers, fresh builds of both commits** (`npx opennextjs-cloudflare build`, then the two commands of
`validation.md`): BASE client **546,214** bytes over 124 files, Worker `gzip:` **5,014.91 KiB**; HEAD client
**546,895** over 123 files (**+681**, budget 15,360), Worker **5,019.49 KiB** (**+4.58 KiB**, budget 100).
**The Build's own baseline was wrong:** it recorded 546,053 and 5,026.59 KiB and so reported the Worker as
9.86 KiB smaller; the fresh BASE disagrees by 11.7 KiB, beyond the 2 KB tolerance, so the fresh run governs
and the "shrank" claim (also in commit `8a0685d3`'s message) is incorrect. Both budgets are met either way.

**FAIL 1: R22's third clause.** R22 requires that an existing client component (`DepartmentScroller`)
renders `Icon` in its own test. **No test renders `DepartmentScroller`** (`grep -rl DepartmentScroller
tests` is empty). The row points at `tests/department-illustrations.test.tsx`, a P4a file that does not exist,
so this is also a spec defect: the row should name a P1 file. Fix: add a test that renders
`DepartmentScroller` and asserts `svg[data-icon]`, and amend the row.

**FAIL 2: R10 is not met as written, and the build notes did not say so.** R10 requires the real script, run
as a child process, for each of: a missing id, a duotone icon without its layer, and unsafe markup. The first
two are. **The unsafe-markup case goes through the library with a poisoned in-memory set, not through the
process**, because the CLI reads real `node_modules` and offers no way to substitute a body. So the exit code
for unsafe markup is untested at process level. Fix: give the CLI a way to read icon sets from a fixture
directory and spawn it in that test.

**Spec wording defects (not build defects):** **R55** says `kms:build-index` leaves `git status` unchanged,
but `ARTIFACT_INDEX.md`'s footer embeds a timestamp and commit and always changes (`kms:check-generated`
normalises it and passes); the row should require `kms:check-generated` exit 0. **R22's row** names a P4a
file (above).

**Cosmetic:** a missing licence text prints a stack trace (a plain `Error`, not `IconBuildError`); the message
does name the file.

**Unverified, with the reason (no `.env`, `.dev.vars` or `secrets/` in a cloud session, so no
`npm run preview`):** **R28** (the licence file served on both hosts; it is present in `.open-next/assets/`),
the live half of **R33** (`verify-icon-markup.ts --base http://localhost:8787`; its stdout shape, failures,
sign-in headers and `--compare` are proved against a local server in `tests/verify-icon-markup.test.tsx`),
**R34** and **R35** (BASE against HEAD markup on both vendors, signed in and staff pages: nothing was
compared), and the HTML half of **R50**. **GitHub CI:** no run exists for this branch (the `gates` workflow
runs on pull requests and no PR is open), so CI is not confirmed either way.

**Call sites** (grep, since graft was unavailable): no remaining reference to the old `categoryIcon` outside
historical specs; `nav-items.ts` has exactly two consumers, both migrated; `ViewSwitcher` still reads
`view.icon` as a component, which is P2b work (R36).

## Fix 1 (after validation run 1)

Two findings were real and one row was wrong; none needed a redesign.

- **R10, the code was wrong.** The unsafe-markup case ran through the library with an in-memory set, not
  through the process, because the CLI could only read the real (safe) `node_modules` sets, so no test could
  hand the real script a poisoned body. Reshaped rather than loosened: `scripts/build-icons.ts` now takes
  `--sets-dir <dir>` (icon sets read from `<dir>/<set>/icons.json` and `info.json`), backed by
  `loadersFromDirectory` in `scripts/lib/icon-build.ts`. `tests/icon-generator.test.ts` now spawns the real
  script for the four unsafe bodies (script, foreignObject, `javascript:`, an `on*` handler), each exiting
  non-zero with the name and id in stderr, plus the same fixture with a safe body exiting 0 so the rule is
  proved to be what failed. R10's text and row now name `--sets-dir`. This was not in the Build's deviation
  list and should have been.
- **R22, both were wrong.** No test rendered `DepartmentScroller`; added
  `tests/department-scroller.test.tsx` (jsdom), which renders the `"use client"` component and asserts its
  `svg[data-icon]` names, that an unmapped slug gets the neutral `tag`, and that the tile keeps its
  pre-migration classes (`h-7 w-7 text-primary`) and `aria-hidden`. The row had pointed at a P4a test file
  that cannot exist in P1; it now names the new test.
- **R55, the row was wrong.** `ARTIFACT_INDEX.md`'s footer embeds a build timestamp and commit, so "git
  status unchanged" can never hold; the row and requirement now require `kms:check-generated` to exit 0,
  which normalises the footer.
- **Cosmetic:** a missing licence text now throws `IconLicenceError`, which the CLI prints as one line
  instead of a stack trace (unit-tested).
- **No observable behaviour changed** (the fixes are a CLI option, tests and docs), so there is no CHANGELOG
  entry, and the bundle is unaffected by construction (scripts and tests are not bundled).
