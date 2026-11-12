# Copy the Aheed catalogue from staging to production (validation)

The decisions are pure functions, unit-tested. The read path is proven by a dry run from AFC staging
to the dev database (read only). The write path is unit-tested with a fake client. No disposable
production-like database is available (no Neon API access, `secrets/scratch-target.vars` credentials
expired), so **the first real apply is production's**. It is preceded by a backup branch and the
owner's dry run, whose printed plan is the check.

| Req | How to verify |
| --- | --- |
| R1 | `npx tsx scripts/catalogue-copy-staging-to-production.ts --from secrets/afc-staging.vars --to .env --vendor-slug aheed-food-centre --activation copy --skip-images` prints the hosts, the per-table counts and "nothing written". |
| R2 | Without `--activation`, or with `--activation maybe`, it exits non-zero. |
| R3 | The same command with `--apply` and no `--confirm-host` exits non-zero. With `--to secrets/afc-production.vars --skip-images` it exits "REFUSED: --skip-images is for test targets only". The same-host and vendor-id refusals are read in the source. |
| R4 | Against dev (independently seeded ids) the dry run reports slug/PLU clashes and "nothing written". Unit test: `uniqueClashes`. |
| R5–R8, R10 | `tests/catalogue-copy-staging-to-production.test.ts`: `diffRows`, `withActivationPolicy`, `parentsFirst`, `writePlan` with a fake client. |
| R9 | `imageKeys` unit test. The production dry run prints "image objects referenced 125: to copy 11, missing in both buckets 4" (counts as of 2026-11-12). |
| R10 (live) | After the owner's apply, the same dry run reports create 0 / update 0 for every table. |
