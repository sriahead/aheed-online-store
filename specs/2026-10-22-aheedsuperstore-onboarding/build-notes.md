# Aheed Super Store test vendor — placeholders, importer, runbook (build notes)

Written at the end of Build, **before** the Clear. This is the one artifact the Clear bets on:
the validating context is fresh and has only the spec, the artifact, and this file.

Issue `#1216`. Branch `feature/client-onboarding-process`, cut from `docs/1211-document-pass` (which is
`staging` at `af67cfd` plus the #1211 post-merge documentation commit). **Nothing is pushed.** No PR
exists. Commits on top of that base, oldest first: the spec (`9a2a69b0`, amended for verbatim
categories), the spec amendment for build findings (`97fbd5a5`), the implementation (`ae557aef`), and
this notes commit. No staging or production command ran. No dev-database command ran either (see
the first shaky area).

**State at Clear.**
- Local gates, run after the implementation commit: `npm run lint`, `npm run typecheck`,
  `npm run format:check` clean; `npx vitest run --maxWorkers=4` **299 files passed, 3 skipped (the
  existing live-DB guards); 3973 tests passed**; `npm run build` green; `kms:assemble:internal` and a
  real `next build` in `kms/site-internal` green; `kms:validate` 0 failing, `kms:coverage` "baseline
  matches", `kms:check-generated` current after the commit.
- `npm audit` reports 26 advisories repo-wide, **none against `@e965/xlsx`**. They are pre-existing
  (next, wrangler, prisma, undici and others); do not `npm audit fix --force`.
- Six issues are involved: `#1216` (this), `#1217` (provider-agnostic outgoing email, own spec, not started),
  and the deferred items filed at this stage: `#1218` category standardisation + versioned template,
  `#1219` deployed isolated dev environment, `#1220` imported-product enrichment before activation
  (unit label, description, images, VAT), `#1221` slug identity and the operator-run placeholder gate.
  Board Status/Phase could not be set from the cloud session (GraphQL is blocked): `#1216` should be
  **In Progress**, the rest Backlog with Phase P11. Verify live.
- A throwaway local Postgres was used for a smoke test and stopped; nothing persists.

## What changed and why

**Manifest placeholders (`scripts/provision-vendor.ts`, `scripts/lib/manifest-readiness.ts`).**
- `manifestSchema` is now exported and gains an optional top-level `placeholders` array of dotted
  field paths, validated to resolve to a real field (a `superRefine`, so the error names the path).
  The schema stays strict.
- `checkReadyCommand` / `emitRouteCommand` are exported pure functions returning
  `{ code, stdout, stderr }`; `main()` prints them and exits. That is why the CLI behaviour is unit
  tested without spawning a process.
- `--emit-route` reuses `renderRoutesBlock` and `isRoutableHost` from `scripts/verify-worker-routes.ts`
  unchanged (that file, `protected-hosts.ts`, `wrangler.toml` and `.github/` are untouched).
- After a normal dev provision the command prints `placeholder value(s) still to confirm:` and the
  paths. Placeholders are real values in the database; nothing stores the list.

**Importer core (`lib/catalogue-import/`, pure; no Prisma, no spreadsheet package).**
- `profile.ts` (strict zod import profile), `price.ts` (integer-pence parser, no floats),
  `rows.ts` (grid to data rows: header found by content in the first 20 rows, footer rows discarded,
  blank-PLU rows kept for rejection), `plan.ts` (rejects, slug identity, categories, restriction
  classification, unit label, VAT summary, department listing), `apply.ts` (the write path against an
  injected client), `report.ts` (report, `exitCodeFor`, per-vendor isolation counts), `errors.ts`
  (`isUniqueViolation`), `snapshot.ts` (per-vendor snapshot diff).
- **Everything the policy decides comes from the existing `lib/catalogue-import-policy.ts`**
  (`classifyImportRow`, `newImportedProductState`, `reimportedProductState`); the importer adds no
  restriction logic of its own.
- **Categories are the client's own** (owner decision after the spec was first drafted): names are the
  source values, trimmed only. Slug `slugify(department)` and `slugify(department)-slugify(sub)`.
  A sub-department equal to its department makes no child and is reported. Names differing only by
  case/punctuation collapse into the first-seen name and are listed under `categoryNameVariants`
  (reported for review, not silently merged, and the exit code becomes 2).
- **Restriction class comes from the SOURCE department**, not the category a product is filed under.
- `apply.ts`: one interactive `$transaction` per top-level department, `createMany` in batches of 500
  for products, inventory and audit rows, parents before children. A department with nothing to write
  opens no transaction (`UNCHANGED`). Transaction options raise Prisma's 5 s default to a 120 s timeout.
  Ids are generated client-side (`crypto.randomUUID`) because `createMany` returns none.

**Scripts (Node only).**
- `scripts/import-catalogue.ts`: dry-run by default and database-free; `--apply` runs
  `assertNotDeployedDatabase` first, resolves the vendor by slug, snapshots every other vendor's counts,
  applies, re-counts, and exits 1 if any other vendor changed. Also `--list-departments`,
  `--validate-profile`. Report goes to `.import-reports/` (gitignored) or `--report`.
- `scripts/lib/read-spreadsheet.ts` is the **only** importer of `@e965/xlsx` (guard test). CSV is read
  as text with `raw: true`; xlsx/xls as a buffer, `raw: false`. `XLSX.writeFile` needs `set_fs` in ESM,
  so the tests write buffers with `XLSX.write` instead.
- `scripts/lib/dev-client.ts` (`connectDev`) = guard first, then the client; used by the two verifiers.
- `scripts/verify-onboarding.ts` and `scripts/verify-catalogue-import.ts` (`--snapshot`, `--diff`,
  `--counts`, `--audit [--exact]`, `--unique-probe`).

**Dependency.** `@e965/xlsx` 0.20.3, exact, `devDependencies`. Evaluated against the spec's four
conditions on this machine: reads `.xls`, `.xlsx` and `.csv` (the supplied client `.xls` read cleanly,
6,172 rows x 14 columns); Apache-2.0; exact-pinnable from the registry; zero dependencies and zero
advisories. It is a community republication of SheetJS (npm's `xlsx` is stuck at 0.18.5 with known
advisories). `package-lock.json` was edited **by hand** (15 added lines) because this container's npm
10.9.4 rewrote ~250 unrelated lines (`devOptional` to `dev`, dropped `libc` fields); the real lockfile
diff is only the new package.

**Docs.** `docs/developer-portal/client-onboarding-prerequisites.md` 0.2.0 gained Procedure, Testing and
validation and Rollback (the old numbered rollback section was folded into it);
`prisma/manifests/README.md`; `prisma/manifests/example-import-profile.json` (neutral names);
`specs/tech-stack.md` 1.6.0 records the dependency and its provenance caveat; `.gitignore` gains
`.import-reports/`; `tests/dependency-pins.test.ts` gains the pin.

**Tests (new, about 150).** `vendor-manifest-placeholders`, `catalogue-import-parse` (three formats from one
set of cells, BOM, CRLF, quoted comma, header cases), `catalogue-import-plan` (83 tests: prices,
rejects, slugs, categories, restrictions, VAT, unique predicate, exit code, isolation, and the write path
against a stub that models transactions), `catalogue-import-guards` (structure). Two mutations were
tried to confirm the tests bite: `quantity: 1` in `apply.ts` and `slice(0, 79)` in `plan.ts` each failed
exactly one test; both were reverted.

## Decisions taken during the build

- **Excel dependency: `@e965/xlsx`**, not `xlsx` (stale, advisories), `read-excel-file` or `exceljs`
  (no legacy `.xls`), nor a CDN tarball (not exactly pinnable from the registry).
- **Dry-run default.** `--apply` is the only way to write; the spec asked for this.
- **`description` blank, `unitLabel` the verbatim unit token else `each`**, per the owner. The unit
  token is a bare `500G`, not a price-per-unit label: recorded in `#1220`.
- **Unreviewed departments import `NEEDS_REVIEW`** via an effective policy (profile policy plus every
  department in none of its three lists). With a profile that lists only the restricted departments,
  almost every product is `NEEDS_REVIEW`; the real-file dry run showed 6,104 of 6,154 planned.
- **A rejected row leaves no category behind** (both conflict checks run before either category is
  recorded). Found while reading my own first draft, not by a test, then covered by one.
- **`CATEGORY_CONFLICT` reject code** (not in the spec): a slug that would be a top-level category for
  one row and a child for another (`"A B"` versus `"A"` + `"B"`) is rejected rather than merged.
- **`BAD_SLUG` reject code** (not in the spec): a name, PLU, department or sub-department with no
  letters or digits would produce an empty slug segment.
- **A unique violation inside a department** is `ALREADY_EXISTS` for that department but counts as a
  failed department (exit 1): the safe reading is that a concurrent run or a stale lookup happened.
- **`takeSnapshot` uses `count` per vendor per table, not `groupBy`.** `groupBy` failed type-checking
  under this Prisma version in a way adding `orderBy` did not fix. `report.ts`'s `countByVendor` does
  use `groupBy` through a structural interface (the importer's isolation check); it type-checks only
  because the client is cast, and it was **not run against a real database** here.
- **`verify-catalogue-import --audit` checks shape, not equality, by default**; `--exact` adds the
  equality the spec's R24 row describes. A smoke test showed why: an admin clear or a tightened
  re-import legitimately adds audit rows.
- **`example-import-profile.json` uses invented department names** (`EXAMPLE ...`) so no client name
  appears in the repository.

## Deviations from the spec

All four are recorded in the amended `requirements.md`/`validation.md` (commit `97fbd5a5`), except where
noted.

1. **R3 — bracket placeholders.** `--check-ready` also treats a string written entirely as
   `[CAPS WORDS]` as unconfirmed. The committed `example.json` already uses `[PHONE]`, `[EMAIL]`,
   `[NUMBER]`; without this the example's own footer would have passed as "ready".
2. **R20 — exit code 2 also covers category spelling variants**, so a person sees them. (Owner's
   instruction: report category conflicts for manual review, do not merge silently.)
3. **R24 / R37 — `--audit` semantics** as above (`--exact`).
4. **R14 mechanics are stricter than the spec's text in one place:** variants of the same slug are
   merged into the first-seen name (as R14 says) **and** reported; they are not kept as separate
   categories because slugs are unique per vendor. The owner's wording ("do not silently merge") is
   satisfied by the report and the non-zero exit, not by keeping two rows.
5. **Not a deviation but a gap in the spec text:** the `vat.zeroRatedRestricted` list is "rows whose
   normalised rate is 0 and whose restriction is non-null". Because unreviewed departments are
   `NEEDS_REVIEW`, that list was 5,056 rows in the real-file dry run, which is noise. It obeys the
   spec; consider narrowing it to non-`NEEDS_REVIEW` classes in a later change.

## Known-shaky areas

- **No dev-database run happened.** This cloud session has no `.env`, no `secrets/*.vars`, and no
  `DIRECT_URL`/`DATABASE_URL`, so `assertNotDeployedDatabase` correctly cannot be satisfied here and
  every DB row in `validation.md` (R4, R19-R25, R27, R29, R33, R34, R37) is **UNVERIFIED**. Run them on
  the owner's machine, after the per-variable environment check and `prisma migrate status` reading
  the datasource host. Never accept `migrate reset`.
- **What the smoke test did and did not prove.** Against a scratch local Postgres (migrations applied,
  plain `pg` adapter, the real `applyPlan` and the real 6,160-row `.xls` through a test profile):
  6,154 products and 132 categories written in one pass in ~2.9 s; a second run created 0 and left 6,154
  unchanged; hidden/UNKNOWN/quantity-0 held for every row; 1,135 restricted products each audited
  `RESTRICTION_SET` / null actor / `IMPORT`; a bystander vendor's row counts unchanged; a restriction
  loosened behind the importer's back was tightened again with a new audit row and `isActive` false;
  the Postgres `CHECK` refused an active restricted product; typo'd category names survived verbatim.
  It did **not** exercise the Neon WebSocket adapter, `countByVendor`'s `groupBy`, the host guard, the
  `verify-*` scripts end to end (their queries were run by hand through the same adapter), or
  `npm run preview`.
- **`isUniqueViolation` against the real adapters is unproven.** It accepts `"23505"` and `"P2002"`
  per CLAUDE.md. The scratch `pg` adapter raised `P2002`. R25's probe on the dev database must print
  what `PrismaNeon` (WebSocket) and `PrismaNeonHttp` actually raise. #1211 measured that a CHECK
  violation has **no `.code`** through the WebSocket adapter; if a unique violation behaves the same,
  `isUniqueViolation` returns false and the department is reported `FAILED` (still exit 1, still safe),
  but R25 fails and the predicate must change.
- **Interactive-transaction size.** The largest department in the supplied file is GROCERIES (about
  3,200 products). Locally a whole import took ~3 s; over Neon's WebSocket it is slower, and the 120 s
  timeout is a guess. Watch for `Transaction already closed`.
- **The real-file dry run** (`~/onboarding` in the scratchpad, gone after the session): 6,160 data rows,
  3 rows above the header, 8 footer rows; restriction counts AGE_RESTRICTED 27, PROHIBITED 1,
  NOT_DELIVERABLE 22 (matching the independent count and ADR-007's table); 6 rows rejected, all
  `DUPLICATE_ROW` (rows 504, 996, 1090, 1562, 1563, 3963); 27 top-level categories and 132 in total;
  7 sub-departments equal to their department (DEFAULT, E-PAY, FOOD TO GO, FRUIT & VEG, MISC,
  PHONE CARDS, STAMPS); no category variants; 19 unreviewed departments with an all-restricted profile.
  The scratchpad copy of the stock file and profile will not survive; the validator needs the owner to
  supply the file again (it is not and must not be in the repository).
- **Hand-edited `package-lock.json`.** Verified only with `npm ls @e965/xlsx`; **no full `npm ci`
  was run**. If CI's `npm ci` complains, regenerate with the repository's
  own npm version, not this container's.
- **Report/`trace` size.** The apply report includes one trace entry per product (~6k rows) and the
  rejected list; fine at this size, untested at 100k.
- **`first 20 rows` header search**, **first sheet only**: a workbook whose data is on a later sheet is
  not supported (the spec is silent; no `--sheet` flag exists).
- **The unit pattern in a real profile is the owner's to tune.** The one used for the real-file dry run
  (`\d+(?:\.\d+)?\s?(?:kg|g|ml|cl|l)\b`, case-insensitive) searches the product **name**; the source
  has no unit column. Only about a third of the names carry a parseable unit token, so most products fall
  back to `each` (`#1220`).
- **`tests/catalogue-import-guards.test.ts` strips comments with regexes**, which is good enough for
  this repo's comment style but is not a parser; a `//` inside a string literal containing a URL is
  handled by a `:` exemption.
- **Not run: `npm run preview`.** Nothing here changes a request path, so it was not needed to build,
  but R34's storefront check (no products, no categories under the new `Host:`) needs it.
- **Email, the deployed dev environment, category standardisation** are not in this slice; their
  issues are `#1217`, `#1219`, `#1218`.

## Validation run 1 (2026-10-22) — NOT independent, and what /fix changed

Run in the same conversation that built the slice (so not a fresh-context validation), on Sonnet 5.5.
Pre-flight green; one requirement failed and one was met only loosely. **Both were corrections, not
redesigns, and both are fixed.**

- **R5 (a real defect).** `main()` in `scripts/provision-vendor.ts` printed `manifest … is valid (vendor
  …)` to **stdout** before running `--check-ready` / `--emit-route`, so a refused `--emit-route` printed
  ~160 bytes instead of nothing, and a successful one printed that line before the route block. The unit
  tests passed because they call `checkReadyCommand` / `emitRouteCommand`, which return `{stdout,
  stderr}` and never see `main()`'s own output. Fix: that line goes to stderr when either flag is given
  (an ordinary provision still prints it to stdout). `tests/vendor-manifest-placeholders.test.ts` now also
  runs the **real script** (`npx tsx`, DB variables removed) and asserts stdout for every R5 branch;
  reverting the fix makes all four of those tests fail.
- **R30 (met loosely).** `tx.product.update` in `lib/catalogue-import/apply.ts` used `where: { id }`. The
  id came from a vendor-scoped lookup, so it was safe, but the spec says every write carries the target
  `vendorId`. It now uses `where: { id, vendorId }`, `ImportTx` types it, and the stub-based test asserts
  the scope.
- **Not changed:** the noisy `vat.zeroRatedRestricted` list (a spec-text observation, see above) and
  every database row, which remains **unverified** for want of `.env`/`secrets` in the cloud session.
- **Checked independently of the unit tests during validation** (so the next validator can skip
  re-deriving them): the real `.xls` dry run reproduces an independent Python count exactly (data rows
  6,160; AGE_RESTRICTED 27, PROHIBITED 1, NOT_DELIVERABLE 22; NEEDS_REVIEW 1,085 = 1,089 DEFAULT rows − 5
  duplicates + 1 zero-priced row; 6 rejected duplicates, 5 of them in DEFAULT); the guard refuses a host
  named in `secrets/staging.vars` (shown with a temporary fake file, removed) and when the secrets files
  are unreadable; no output of the importer or either verifier contained a connection string.
