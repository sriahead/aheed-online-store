# Reference coverage reconciliation — decommission, observability and production bootstrap (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Every feature should have appropriate **Unit** and **Integration** testing, followed by relevant validation testing. Broader testing mainly happens before release. However, testing is risk-based: features involving auth, payments, UI changes, performance-sensitive APIs, databases, or external dependencies require additional relevant testing earlier.

1. **Unit Testing** — isolated logic: the decommission ordering, the refusals, the drift arithmetic.
2. **Integration Testing** — the script and the health route against a real reference database.
3. **System / End-to-End Testing** — deployed staging answering real postcodes.
4. **Regression & Acceptance Testing** — `MK`/`RG` untouched by the `LU` removal; health still 200.
5. **Performance & Resilience Testing** — not applicable: no new request-path query on any hot path; `/api/health` is already dynamic and uncached.
6. **Security & Accessibility Testing** — `/api/health` is public and unauthenticated, so R20 (no credential material in the body) and R21 (service boundary) are security rows, not hygiene.

---

## Before you start

This slice touches a live database in three environments and performs the only deliberate deletion
in the project's history. Read this section before running anything.

- **This is a DESTRUCTIVE slice, once.** The decommission step deletes 6,464 `PostcodeReference`
  rows and one `ReferenceAreaCoverage` row from the **dev/staging** reference branch
  (`ep-wild-violet-zaa9udu5`, shared by both). Production has nothing to delete. Run the `--dry-run`
  form first, every time, and read its output before running without it.
- **Order matters.** Run the steps in this order or several rows cannot pass: (1) unit/local rows,
  (2) `--dry-run` then real decommission against dev/staging, (3) staging redeploy, (4) staging
  live rows, (5) production migrate + sync, (6) production rows. R25 in particular can only pass
  after (2) **and** (3).
- **Use `npm run preview`, never `npm run dev`, for anything that touches Prisma.** Plain `next dev`
  runs in real Node and cannot load `@prisma/client/wasm`; a DB-touching route silently renders an
  error state with no crash and no signal (CLAUDE.md, Database).
- **Stopping `npm run preview` does not stop it.** Kill the whole `node.exe`/`workerd.exe` chain
  (`Get-CimInstance Win32_Process -Filter "Name='node.exe' or Name='workerd.exe'"`, match on the
  repo path) before the next build, or it fails with `EBUSY … rmdir '.open-next\assets'`.
- **`curl` to `staging.aheedfoodcentre.nocaped.com` failed from Git Bash on this machine**
  (`curl: (35) Recv failure` / `curl: (43) bad argument`) while the same URL succeeded from
  PowerShell. Use `Invoke-WebRequest -UseBasicParsing` for every deployed-staging row below. If
  `curl` works for you, it is equally valid — the assertion is about the response, not the client.
- **Use the postcodes named here, not plausible-looking ones.** `MK9 2NW` and `RG1 1LA` are
  **absent** from Code-Point `2026-08` and correctly return `INVALID_POSTCODE`; treating either as a
  "known good" postcode produces a false failure. `MK10 0AA`, `RG10 0AA` and `LU1 1AA` are real rows
  in this dataset, confirmed by direct query.
- **Two vendors do NOT matter here, deliberately.** Reference data is platform-level and carries no
  vendor relation, so the `valid`/`status` assertions below are identical on every host. Only
  `deliverable` is vendor-specific, and no row asserts it.
- **Never run `npx vitest run` while a build is running or has just finished** — whole files
  silently fail to start and are counted as errors rather than failures. Check the file/test totals
  against `CLAUDE.md`'s recorded baseline, not the exit code.
- **`npx wrangler tail --env staging` is the way to prove the absence of an error**, since the
  reference service degrades silently by design. `"logs": []` with `"exceptions": []` across a
  request means the guard returned before any query — which is a different failure from a query that
  threw.

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `grep -n "decommissionAreas" lib/reference-data/source.ts lib/reference-data/sources/code-point.ts lib/reference-data/sources/open-names.ts` shows the interface member and one implementation in each source file. `npm run typecheck` exits 0, which is what proves both sources satisfy the widened interface. |
| R2  | Unit | `npx vitest run tests/reference-decommission.test.ts` — a case asserts `codePointSource.decommissionAreas(stub, ["LU"])` issues exactly one `postcodeReference.deleteMany` with `where: { postcodeArea: { in: ["LU"] } }`, and the equivalent for `openNamesSource`/`placeReference`. A second case asserts no delete is issued with a `where` lacking `postcodeArea`. |
| R3  | Unit | `grep -n "export async function removeAreaCoverage" -A 8 lib/repositories/reference-coverage.ts` shows the export taking `prisma` first and deleting by `sourceKey_postcodeArea`. `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts` exits 0 — the new export resolves no client of its own. |
| R4  | Unit | `grep -n "export async function decommissionUnsupportedAreas" -A 12 lib/reference-data/sync-service.ts` shows the signature and returned summary shape. |
| R5  | Unit | `npx vitest run tests/reference-decommission.test.ts` — a case with covered `["MK","RG","LU"]` and required `["MK","RG"]` removes only `LU`. `grep -nE "\"(LU|MK|RG)\"" lib/reference-data/sync-service.ts lib/reference-data/source.ts lib/repositories/reference-coverage.ts` returns nothing: no area literal in the pipeline. |
| R6  | Unit | `npx vitest run tests/reference-decommission.test.ts` — the ordering case records every call against a stubbed client into an array and asserts the index of `referenceAreaCoverage.delete` for an area is lower than the index of that area's data `deleteMany`. Confirm the test fails when the two statements are swapped (swap locally, re-run, restore). |
| R7  | Unit | `npx vitest run tests/reference-decommission.test.ts` — a case with `areas: []` asserts zero delete calls of any kind and a summary whose `error` mentions the empty configuration. |
| R8  | Unit | `npx vitest run tests/reference-decommission.test.ts` — a case where coverage and required both contain `MK` asserts no delete touches `MK`. |
| R9  | Integration | After the real dev/staging run (R14), `npx tsx scripts/verify-reference-coverage.ts --env-file .env` prints the newest `ReferenceDataSyncRun` row: status `SUCCEEDED`, `requestedAreas=LU`, `retired=6464`, non-null `finishedAt`. |
| R10 | Integration | Same command, `ReferenceDataset` section: `code-point-open` `recordCount` is `40031` (46,495 − 6,464) and its `cacheVersion` is exactly one higher than the value recorded in this slice's `build-notes.md` before the run. |
| R11 | Integration | `npx tsx scripts/sync-reference-data.ts --env-file .env --decommission --dry-run` prints the `LU` areas and counts it would remove; immediately afterwards `npx tsx scripts/verify-reference-coverage.ts --env-file .env` still shows 6,464 `LU` postcodes, the `LU` coverage row present, and **no new** `ReferenceDataSyncRun` row. Run this before R14. |
| R12 | Unit | `npx tsx scripts/sync-reference-data.ts --help` lists `--decommission` and `--dry-run`. `npx vitest run tests/reference-decommission.test.ts` — a case asserts that a decommission run never calls `discoverLatest`, `download`, `parse`, `validate` or `apply` on a stubbed source. |
| R13 | Security | `npx vitest run tests/reference-decommission-safety.test.ts` — it parses every file under `lib/reference-data/` plus `lib/repositories/reference-coverage.ts` on the TypeScript AST (not by substring, because these files discuss deletion in prose) and fails if a `delete`/`deleteMany` call appears outside `decommissionAreas` or `removeAreaCoverage`. |
| R14 | Integration | `npx tsx scripts/sync-reference-data.ts --env-file .env --decommission`, then `npx tsx scripts/verify-reference-coverage.ts --env-file .env`: `LU` absent from both the per-area counts and the coverage rows; `MK` 16,215 postcodes / 9,989 places and `RG` 23,816 / 13,483, unchanged. Redirect script output to a file and `Read` it — never pipe a live-writing script through `head`. |
| R15 | Integration | `npx tsx scripts/verify-reference-coverage.ts --env-file .env; echo "exit=$?"` prints `exit=0` after R14. Before R14 (or against any drifted database) the same command exits non-zero and names `LU` as unsupported coverage. `git diff --stat` after a run shows nothing — the script writes nothing. |
| R16 | Unit | `npx vitest run tests/reference-status-service.test.ts` — cases assert `missingAreas` for required-not-covered, `unsupportedAreas` for covered-not-required, and the top-level drift boolean true only when one of those is non-empty. |
| R17 | Unit | `npx vitest run tests/reference-status-service.test.ts` — a case with `isReferenceDatabaseConfigured()` stubbed false resolves to `configured: false` and does not throw; a case whose client rejects with a thrown error also resolves rather than rejects. |
| R18 | E2E | `npm run preview`, then `Invoke-WebRequest http://127.0.0.1:8787/api/health` — the body contains a `reference` object carrying `requiredAreas: ["MK","RG"]` and one entry per source with `coveredAreas`. |
| R19 | E2E | With `UK_LOCATION_REF_DATABASE_URL` commented out of **both** `.dev.vars` and `.env` (a single-file edit proves nothing — `next build` bakes `.env` into the Worker's `process.env`), restart `npm run preview` and confirm `/api/health` returns HTTP **200** with `"status":"ok"` and `reference.configured: false`. Restore both files and restart afterwards. |
| R20 | Security | Save the `/api/health` body to a file and run `grep -iE "postgres://|postgresql://|neon\.tech|password|ep-[a-z-]+-[a-z0-9]+" health.json` — no match. Inspect the `reference` block by eye to confirm it carries only area codes, source keys, versions, counts, timestamps and status strings. |
| R21 | Security | `grep -rn "reference-client\|lib/reference-db\|prisma/reference" app components features --include=*.ts --include=*.tsx` returns nothing. (This is `#764`'s own R1a check, re-run because this slice adds a reference read to `app/api/health/route.ts`.) |
| R22 | Integration | `gh api repos/sriahead/aheed-online-store/environments/staging/variables --jq '.variables[] \| "\(.name)=\(.value)"'` prints `UK_LOCATION_REF_POSTCODE_AREAS=MK,RG`, and `… /environments/staging/secrets --jq '.secrets[].name'` includes `UK_LOCATION_REF_DIRECT_URL`. Repeat for `production`. |
| R23 | Integration | After redeploying staging, read the deployed version's bindings from the Cloudflare API: `GET /accounts/$ACC/workers/scripts/aheed-store-staging/deployments` → take `result.deployments[0].versions[0].version_id` → `GET …/versions/<id>` and confirm `UK_LOCATION_REF_DATABASE_URL` and `UK_LOCATION_REF_POSTCODE_AREAS` appear in `result.resources.bindings`. **`wrangler secret list` is not acceptable evidence for this row** — it reports the script's secrets, not the running version's bindings, which is the exact confusion that hid this failure. |
| R24 | E2E | `Invoke-WebRequest "https://staging.aheedfoodcentre.nocaped.com/api/address/lookup?postcode=MK100AA"` → `"valid":true`, `"town":"Milton Keynes"`, non-null `latitude`/`longitude`. Same for `RG100AA` → `"valid":true`, `"town":"Twyford"`. |
| R25 | E2E | Same endpoint, `?postcode=LU11AA` → `"status":"UNVERIFIED"` and `"valid":false`. A response of `INVALID_POSTCODE` is a **failure** and means the data rows were removed before the coverage row. Run only after R14 and R23. |
| R26 | E2E | `?postcode=MK999ZZ` → `"status":"INVALID_POSTCODE"` (covered area, no such postcode); `?postcode=ZZ11ZZ` → `"status":"UNVERIFIED"` (uncovered area). Both `"valid":false`, and both carry `"manualEntryAvailable":true`. |
| R27 | Integration | After dispatching `sync-reference-data.yml` with `environment: production`: `npx tsx scripts/verify-reference-coverage.ts --env-file secrets/production.vars` lists the six model tables plus `_prisma_migrations`. Independently, `UK_LOCATION_REF_DIRECT_URL="<production's>" npx prisma migrate status --schema prisma/reference/schema.prisma` reports no pending migration. Confirm the host printed is `ep-summer-boat`, not `ep-wild-violet`. |
| R28 | Integration | Same verify command: `ReferenceDataset` shows `code-point-open` and `os-open-names`, both `SUCCEEDED` with non-null `lastSyncedAt`; `ReferenceAreaCoverage` shows exactly four rows, `MK` and `RG` for each source. |
| R29 | Integration | Same verify command: per-area counts list `MK` and `RG` only, for both `PostcodeReference` and `PlaceReference`; no `LU` row in either. `echo "exit=$?"` prints `exit=0`. |
| R30 | Integration | `git diff --stat origin/staging -- .github/workflows/sync-reference-data.yml` shows no change, and the dispatched run for R27 completed successfully — `gh run view <id>` shows the `Apply reference-database migrations` and `Synchronise reference data` steps green. |
| R31 | Regression | `grep -n "LU" docs/model-handoff.md` returns no sentence claiming `LU` is materialised, and the file's production-reference paragraph matches what R27–R29 actually found. |
| R32 | Regression | `grep -n "767" docs/developer-portal/env-setup.md` — the "Production's reference branch had exactly this status" sentence is replaced by the post-slice state. |
| R33 | Regression | `grep -n "wrangler secret list" CLAUDE.md` and `grep -n "vars\." CLAUDE.md` each return a passage stating the trap, in the Config & secrets and Branch strategy & CI/CD sections respectively. |
| R34 | Regression | `grep -n "decommission\|verify-reference-coverage" docs/developer-portal/env-setup.md` shows both flags and the script documented alongside the bootstrap commands. |
| R35 | Regression | `grep -n "Nothing is deleted at any point" -B 2 -A 6 lib/reference-data/sync-service.ts` shows the guarantee scoped to refresh runs and naming `decommissionUnsupportedAreas`. `grep -n "rather than deleting" -A 3 lib/reference-data/source.ts lib/reference-data/sources/code-point.ts` shows both comments scoped to `apply`. A reader who opens only these files must not come away believing the pipeline can never delete. |
| R36 | Regression | `sed -n '/Coverage is demand-driven, and absence of coverage/,/^$/p' specs/architecture.md` shows the reduction half of the rule, and still shows the covered-no-row → INVALID and never-imported → UNVERIFIED sentences unchanged. |
| R37 | Regression | `git diff origin/staging -- CHANGELOG.md` shows this slice's entry (Gate 4). |
| R38 | Regression | `npm run lint`, `npm run typecheck`, `npm run format:check` and `npx vitest run` each exit 0, the last run **alone** with no build running. Its `Test Files` / `Tests` totals match the figure recorded in `CLAUDE.md`; if they differ, update that line rather than accepting the mismatch. `npm run sdd:preclear` exits 0. Finally, `npm run kms:assemble:internal && (cd kms/site-internal && npx next build --webpack)` exits 0 — this slice adds spec files, and that pipeline is not covered by the root gates. |
