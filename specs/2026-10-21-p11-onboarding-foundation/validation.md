# P11 onboarding foundation (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid
> testing the same behaviour multiple times at different levels unless doing so provides additional
> confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Before you start — read this, it affects three rows

**Use a dev database for every step here.** Nothing in this validation writes to staging or
production, and two rows deliberately *point* a command at a protected host to prove it refuses.
That is safe by construction: `assertNotDeployedDatabase` throws **before** a Prisma client is
constructed, so no connection is attempted and no credential is used. Commands `C1` and `C2` below
therefore use a **bogus password** with a real protected hostname — do not substitute real
credentials into them.

**Check the process environment first.** Per `CLAUDE.md`, an exported `DIRECT_URL` beats `.env`. Run
`printenv DIRECT_URL DATABASE_URL`; if either is set, prefix every command below with
`env -u DIRECT_URL -u DATABASE_URL` except where a row supplies its own value.

**Run the test suite alone and capped**: `npx vitest run --maxWorkers=4`, not beside a build. An
uncapped run on a loaded machine produces scattered, moving, plausible failures (`#1180`).

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1 | Unit | `npx tsx -e "import('./scripts/lib/protected-hosts.ts').then(m => console.log(['normalizeHost','protectedHosts','assertNotDeployedDatabase'].map(k => k + '=' + typeof m[k]).join(' ')))"` prints `normalizeHost=function protectedHosts=function assertNotDeployedDatabase=function`. |
| R2 | Unit | `npx vitest run --maxWorkers=4 tests/protected-hosts.test.ts` exits 0, and its output names a passing case for each of the three throw conditions (empty string, no secrets file readable, protected host matched). Then `grep -nE "process\.env\.[A-Z_]*(FORCE|OVERRIDE|ALLOW|SKIP)" scripts/lib/protected-hosts.ts` prints nothing. |
| R3 | Unit | Covered by `tests/protected-hosts.test.ts` (same command as R2): a case asserting `normalizeHost("postgres://u:p@ep-x-pooler.eu-west-2.aws.neon.tech/db") === normalizeHost("postgres://u:p@ep-x.eu-west-2.aws.neon.tech/db")`, and a case asserting `normalizeHost("not-a-url") === null`. |
| R4 | Unit | Covered by `tests/protected-hosts.test.ts`: a fixture var file containing both `DIRECT_URL=postgres://...` and `DATABASE_URL = "postgres://..."` yields both hosts. |
| R5 | Unit | `grep -c "scripts/lib/protected-hosts" scripts/verify-repository-injection.ts` prints `1` or more, **and** `grep -cE "^(async )?function (normalizeHost\|protectedHosts)" scripts/verify-repository-injection.ts` prints `0`. |
| R6 | Integration | Run `C1`. It must exit non-zero and print a refusal naming the host. Then run `C3` against the dev database and confirm the `Product` count is unchanged from before `C1`. |
| R7 | Integration | With a dev `DIRECT_URL` and no `SEED_SCALE_PRODUCTS` set, `npm run db:seed` exits 0 and its final line reports completion. |
| R8 | Unit | `npx tsx scripts/verify-worker-routes.ts` (no arguments) exits non-zero and prints a usage line naming `--env`. |
| R9 | Unit | `git diff origin/staging...HEAD -- package.json package-lock.json` prints nothing. (If it prints anything at all, read it — only a dependency addition fails this row.) |
| R10 | Integration | Run `C4` (adds a throwaway `VendorDomain` row for a host absent from `wrangler.toml`), then `npx tsx scripts/verify-worker-routes.ts --env staging` must exit non-zero and print `p11-validation.nocaped.com`. Run `C5` to delete the row afterwards. |
| R11 | Integration | Against a dev database seeded per `docs/developer-portal/env-setup.md` (`SEED_AHEED_HOST="localhost:8787" SEED_SRIMART_HOST="srimart.localhost:8787" npm run db:seed`), `npx tsx scripts/verify-worker-routes.ts --env staging` exits 0. |
| R12 | Integration | On that same dev database, the R11 command's output contains a warning line naming `staging.aheedfoodcentre.nocaped.com` (a pattern in `wrangler.toml` with no matching row), and the exit code is still 0. |
| R13 | Unit | `npx tsx scripts/verify-worker-routes.ts --env staging --write` exits 0, and its output contains `[[env.staging.routes]]`, at least one `pattern = ` line, and `custom_domain = true`. |
| R14 | Integration | For each of `.github/workflows/deploy-staging.yml` and `.github/workflows/deploy-production.yml`, run `grep -nE "opennextjs-cloudflare build|prisma migrate deploy|verify-worker-routes|wrangler deploy --env" <file>`. Exactly four lines must print, and their line numbers must ascend in this order: `opennextjs-cloudflare build`, `prisma migrate deploy`, `verify-worker-routes`, `wrangler deploy --env`. (The scheduler's deploy uses `wrangler deploy --config` and is correctly not matched.) |
| R15 | Unit | `npx vitest run --maxWorkers=4 tests/worker-routes.test.ts` exits 0 and reports at least four passing cases. |
| R16 | Unit | `npx tsx -e "import('./prisma/provision-vendor.ts').then(m => console.log(['upsertVendorSatellites','upsertVendorDomain','seedFulfilmentSchedule'].map(k => k + '=' + typeof m[k]).join(' ')))"` prints all three as `function`. |
| R17 | Unit | `grep -c "provision-vendor" prisma/seed.ts` prints `1` or more, and `grep -cE "^async function (upsertVendorSatellites\|upsertVendorDomain\|seedFulfilmentSchedule)" prisma/seed.ts` prints `0`. |
| R18 | Integration | Run `C3`, record the eight counts. Run `npm run db:seed`, then `C3` again, then `npm run db:seed` and `C3` a third time. The second and third count sets must be identical. |
| R19 | Integration | Run `C6` (provision from `prisma/manifests/example.json` against dev). Exits 0. Then `C7` prints a `Category` and `Product` count of `0` for that vendor, and non-zero counts for the seven row types in R19. |
| R20 | Unit | `npx tsx scripts/provision-vendor.ts tests/fixtures/vendor-manifest-invalid.json` exits non-zero and its output contains the failing field path. Then `C3` shows the `Vendor` count is unchanged. |
| R20a | Unit | `npx tsx scripts/provision-vendor.ts prisma/manifests/example.json --validate-only` exits 0 and prints a success line; running it with `DIRECT_URL` unset still exits 0, proving no client was constructed. |
| R20b | Unit | `npx tsx -e "import('node:fs').then(fs => console.log(Object.keys(JSON.parse(fs.readFileSync('prisma/manifests/example.json','utf8'))).sort().join(',')))"` prints exactly `branding,config,deliveryPrefixes,discountCodes,footer,host,id,loyaltyTiers,name,slug`. Then add an extra key to a copy of the file and confirm `--validate-only` on the copy exits non-zero. |
| R21 | Integration | Run `C6` again, then `C3`. The counts must equal the set recorded after the first `C6`. |
| R22 | Unit | `test -s prisma/manifests/example.json && echo ok` prints `ok`; R20a's command exits 0 (which is what proves it validates); and `grep -ci "not committed" prisma/manifests/README.md` prints `1` or more. |
| R23 | Acceptance | `grep -ciE "custom domain|wildcard|one (subdomain )?label|verify-worker-routes" specs/decisions/ADR-004-multi-tenancy.md` prints `4` or more, and the file contains a `2026-10-21` dated note referencing decisions 3 and 7. Read that note and confirm all four statements in R23 appear. |
| R24 | Acceptance | `grep -ciE "tear down|tears down|verify-worker-routes" docs/developer-portal/sdd/operator-runbook.md` prints `2` or more, and the named procedure section is present. |
| R25 | Acceptance | `grep -c "provision-vendor" docs/developer-portal/env-setup.md` prints `1` or more, and the per-vendor host-mapping section states the Aheed/SriMart fixtures stay in `prisma/seed.ts`. |
| R26 | Regression | `npm run kms:validate` exits 0 printing `invalid front-matter (failing): 0`; `npm run kms:build-index` then `grep -c "p11-onboarding-foundation" ARTIFACT_INDEX.md` prints `1` or more; `npm run kms:assemble:internal` then `cd kms/site-internal && npx next build` exits 0. |
| R27 | Acceptance | `git diff origin/staging...HEAD -- CHANGELOG.md` is non-empty, and the added text contains `#490`, `#1198`, `#1197` and `specs/2026-10-21-p11-onboarding-foundation/`. |
| R28 | Release | `npm run lint`, `npm run typecheck`, `npm run format:check` each exit 0; then, on its own, `npx vitest run --maxWorkers=4` exits 0. **CI is ground truth** — the same four must be green on the pull request. |

---

## Commands

Referenced by the table above. Run from the repository root.

**`C1` — prove the seed's generated path refuses a protected host (no connection is made).**

```bash
HOST=$(grep -hoE '@[^:/?]+' secrets/staging.vars | head -1 | tr -d '@')
SEED_SCALE_PRODUCTS=1 DIRECT_URL="postgres://u:not-a-real-password@${HOST}/neondb" npm run db:seed
echo "exit=$?"   # expect non-zero, and a refusal naming $HOST
```

**`C2` — same shape for `verify-repository-injection.ts` (R5's behaviour-unchanged check).**

```bash
HOST=$(grep -hoE '@[^:/?]+' secrets/production.vars | head -1 | tr -d '@')
DIRECT_URL="postgres://u:not-a-real-password@${HOST}/neondb" npx tsx scripts/verify-repository-injection.ts
echo "exit=$?"   # expect non-zero: REFUSING TO RUN
```

**`C3` — the eight row counts (dev database).**

```bash
npx tsx -e "import('@prisma/client').then(async ({PrismaClient}) => { const {PrismaNeon} = await import('@prisma/adapter-neon'); const p = new PrismaClient({adapter: new PrismaNeon({connectionString: process.env.DIRECT_URL})}); for (const m of ['vendor','vendorBranding','vendorConfig','vendorDeliveryArea','vendorFulfilmentSlot','vendorLoyaltyTier','discountCode','vendorDomain','category','product']) console.log(m, await p[m].count()); })"
```

**`C4` / `C5` — add and remove a throwaway unrouted host (dev database only).**

```bash
# C4
npx tsx -e "import('@prisma/client').then(async ({PrismaClient}) => { const {PrismaNeon} = await import('@prisma/adapter-neon'); const p = new PrismaClient({adapter: new PrismaNeon({connectionString: process.env.DIRECT_URL})}); const v = await p.vendor.findFirst(); await p.vendorDomain.create({data:{vendorId:v.id, host:'p11-validation.nocaped.com', isCanonical:false}}); console.log('added'); })"

# C5
npx tsx -e "import('@prisma/client').then(async ({PrismaClient}) => { const {PrismaNeon} = await import('@prisma/adapter-neon'); const p = new PrismaClient({adapter: new PrismaNeon({connectionString: process.env.DIRECT_URL})}); console.log(await p.vendorDomain.deleteMany({where:{host:'p11-validation.nocaped.com'}})); })"
```

**`C6` — provision the example manifest (dev database).**

```bash
npx tsx scripts/provision-vendor.ts prisma/manifests/example.json
echo "exit=$?"   # expect 0
```

**`C7` — per-vendor counts for the example manifest's vendor (dev database).** Reads the slug out of
the manifest, so there is nothing to substitute.

```bash
npx tsx -e "Promise.all([import('@prisma/client'), import('@prisma/adapter-neon'), import('node:fs')]).then(async ([{PrismaClient},{PrismaNeon},fs]) => { const slug = JSON.parse(fs.readFileSync('prisma/manifests/example.json','utf8')).slug; const p = new PrismaClient({adapter: new PrismaNeon({connectionString: process.env.DIRECT_URL})}); const v = await p.vendor.findUnique({where:{slug}}); if (!v) { console.log('NO VENDOR for', slug); return; } for (const m of ['vendorBranding','vendorConfig','vendorDeliveryArea','vendorFulfilmentSlot','vendorLoyaltyTier','vendorDomain','category','product']) console.log(m, await p[m].count({where:{vendorId:v.id}})); })"
```

---

## Not verified by this slice

These are deliberately out of scope (`plan.md`) and **must not** be treated as failures here:

- No `Category` or `Product` rows are created by manifest provisioning — `#1201`.
- Wildcard routing is not implemented; a new vendor host still needs a `wrangler.toml` change and a
  deploy. R23 requires the ADR say so.
- Backup, point-in-time-recovery and restore remain undocumented and unverified.
- VAT, cost price, supplier, barcode, case size, reorder levels and stock movements are untouched
  (`#1196`); restricted-category exclusions are untouched (`#1200`).
- `AHEED_VENDOR_ID` stays duplicated between `prisma/seed.ts` and `prisma/seed-footer.ts`.

## Known pre-existing failure — do NOT attribute it to this slice

`npm run kms:coverage` fails locally with:

```
kms:coverage — 16 uncovered file(s) across 9 director(ies)
  ✘ misc: baseline 0, measured 1 (increased)
```

**This is not caused by this slice, and `kms:coverage` is deliberately not one of the requirements
above.** The uncovered file is `misc/issue-club-a.md`, and `/misc/` is **gitignored**
(`.gitignore:62`, added by `#1077` as a per-developer scratch area). The ratchet walks it anyway.
Measured 2026-10-21: the failure reproduces identically with
`specs/2026-10-21-p11-onboarding-foundation/` moved out of the tree, so it predates this work. CI is
unaffected because the directory does not exist in a fresh checkout.

**Do not "fix" it by running `npm run kms:coverage -- --update`** — that would commit a baseline
derived from one developer's local scratch files, which is wrong for every other checkout and for
CI.
