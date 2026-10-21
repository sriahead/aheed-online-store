# P11 onboarding foundation — host guard, route verification, vendor manifest (build notes)

Closes `#490`, `#1198`, `#1197`. Implementation commit `099ad05`; spec commit `ce9ff81`.
Branch `feature/p11-onboarding-foundation`, based on `origin/staging` at `6e8bad1`.

## What changed and why

**`scripts/lib/protected-hosts.ts` (new) — `#490`.** The guard already existed in
`scripts/verify-repository-injection.ts:88-137` and was the strong version of the control: it
refuses before a Prisma client is constructed, and it refuses when it **cannot prove** safety rather
than only when it can prove danger. Moving it was the whole of `#490`; what is worth knowing from
outside the diff is why two details were preserved exactly rather than tidied:

- `normalizeHost` strips Neon's `-pooler` segment. Every Neon project has a pooled and a direct host
  differing only by that segment, so a guard that kept them distinct would be bypassed by whichever
  spelling a caller happened to use. This is not cosmetic normalisation.
- Parsing is delegated to `scripts/lib/env-file.ts`'s existing `parseEnvFile` **instead of** the
  inline regex the old copy used. That is a deliberate upgrade, not a transcription: `parseEnvFile`
  tolerates the spaced-equals form `#505` found in two reference-database keys, quoted values, and
  trailing `#` comments. A line this module fails to parse is a protected host it fails to protect,
  and that failure is silent — so the tolerant parser is the correct dependency here.

Applied to `prisma/seed.ts`'s generated-catalogue path, which is `#490`'s actual ask: that path
printed the resolved host and trusted a human to read it. The refusal sits **inside**
`maybeSeedGeneratedCatalogue` and **after** its early return, so a plain `npm run db:seed` never
reaches it and no generated row or storage object can be written on the far side of it.

**`scripts/verify-worker-routes.ts` (new) — `#1198`.** The hazard is not obvious from the code it
guards: every vendor host is its own `custom_domain = true` route in `wrangler.toml`, and a
`wrangler deploy` that omits a host which already has a custom domain **tears that domain down**.
So a hand edit that drops a line takes a live storefront offline, silently. The script reads
`VendorDomain` for the environment being deployed, parses that `--env`'s route patterns, and fails
the deploy when a routable host has no route. `--write` emits the whole block rather than just the
new line, which is what stops a paste from dropping an existing host.

Four pure functions (`parseRoutePatterns`, `isRoutableHost`, `compareRoutes`, `renderRoutesBlock`)
are exported specifically so `tests/worker-routes.test.ts` can exercise the comparison without a
database — the spec's R15 is only checkable because the work does not live inside `main()`.

**`prisma/provision-vendor.ts` (new) + `scripts/provision-vendor.ts` (new) — `#1197`.** The
extraction was forced, not chosen: `upsertVendorSatellites`, `upsertVendorDomain` and
`seedFulfilmentSchedule` were module-private and closed over `seed.ts`'s module-scoped client, so a
manifest in front of them was impossible without exporting them first. Each now takes a
`PrismaClient` as its first parameter — the signature `prisma/seed-footer.ts` already used for
`seedFooterDefaults`, so this follows a precedent in the same directory rather than inventing a
convention.

**`prisma/seed.ts` is a pure move plus wiring.** 237 lines out; the only additions are the
`provision-vendor` import, the `#490` guard import, four call sites gaining a `prisma` argument, and
the guard call. That shape is what makes R18 ("two consecutive seeds leave eight tables' counts
identical") a meaningful check rather than a formality — if the move had changed logic, R18 is where
it would show.

**Documentation that is part of the change, not a follow-up.** `specs/decisions/ADR-004-multi-tenancy.md`
1.14.0 corrects decisions 3 and 7; `docs/developer-portal/sdd/operator-runbook.md` 1.2.0 gains the
host-addition procedure; `docs/developer-portal/env-setup.md` 1.21.0 names
`scripts/provision-vendor.ts` as the route for a third vendor.

## Decisions taken during the build

**Reused `parseEnvFile` rather than copying the inline regex.** The spec (R4) only required both the
plain and spaced forms be handled. `parseEnvFile` does that plus quoted values and trailing
comments, and it is this directory's existing parser with a documented rationale for existing.
Rejected: copying the old regex, which would have satisfied R4 while leaving a second parser to
drift.

**The footer is modelled in full in the zod schema.** The first draft accepted it as
`z.custom<FooterDefaults>(v => typeof v === "object")`. That would have **violated R20**: a
wrong-typed footer field passes parsing, the vendor and its satellites get written, and only then
does `seedFooterDefaults` fail — leaving a half-provisioned vendor, which is exactly what R20's "no
database row is created or modified" forbids. `satisfies FooterDefaults` at the call site is what
keeps the schema in step with `prisma/seed-footer.ts`: if that type changes, this stops compiling.

**Both new scripts guard `main()` behind a direct-invocation check**
(`import.meta.url === pathToFileURL(process.argv[1]).href`). Without it, `tests/worker-routes.test.ts`
importing the pure functions would execute `main()`, connect to a database and call `process.exit`.
`pathToFileURL` rather than string comparison because of Windows drive letters and backslashes.
No other script in `scripts/` needed this, because none of them exports anything.

**Every zod object is `.strict()`.** A misspelled manifest key would otherwise be dropped silently
and the vendor provisioned on a default nobody chose. The invalid fixture exercises this as one of
its four defects.

**The route check went into the two deploy workflows, not `quality.yml`.** `CLAUDE.md` says to add a
check to `quality.yml` so deploy paths cannot run less than a PR does. This is a reasoned exception,
recorded in `plan.md` and in both workflow comments: the check needs the **target environment's**
`DIRECT_URL`, which a PR runner does not have, so in `quality.yml` it could only skip — and a skip
line is not a pass. It is a per-deploy-target precondition.

**`isRoutableHost` excludes ports and `localhost`, decided from real rows not a guess.** The dev
seed writes `localhost:8787` and `srimart.localhost:8787` as genuine `VendorDomain` hosts
(`docs/developer-portal/env-setup.md`). Without the exclusion the check fails on every developer
machine, and a safety check that always fails locally is one that gets removed.

**The stale direction warns rather than fails.** A host may legitimately be declared in
`wrangler.toml` ahead of its vendor row — that is the order SriMart's was populated in. Failing on
it would have made the check wrong for the one history we have.

## Deviations from the spec

**None** in behaviour. Two notes on how requirements were met, so a validator does not read either
as a deviation:

1. **R5 names three imports (`normalizeHost`, `protectedHosts`, `assertNotDeployedDatabase`) and the
   refactored script genuinely uses all three** — but `protectedHosts` is used only to report how
   many protected hosts were checked, in the confirmation log line. The refusal itself is entirely
   `assertNotDeployedDatabase`. The first draft of that line was contrived filler; it was rewritten
   so the count is actually informative. If a reviewer thinks that use is thin, the honest reading is
   that R5 was written slightly too prescriptively, not that the code is wrong.
2. **R4's spaced-equals handling is satisfied via `parseEnvFile`**, so there is no regex in
   `protected-hosts.ts` to inspect for it. `tests/protected-hosts.test.ts` proves the behaviour
   directly, which is what R4 actually asks for.

## Known-shaky areas

**Everything that touches a database is unexercised. Look here first.** R6, R7, R11, R12, R18, R19
and R21 were deliberately not run during Build — that is `/validate`'s job from a fresh context —
and they are also the requirements with no unit coverage standing behind them. In particular:

- **R18 is the one that would catch a bad extraction.** Two consecutive `npm run db:seed` runs must
  leave eight tables' counts identical. The diff looks like a pure move, but "looks like" is not the
  check.
- **R19's row list has not been confirmed against a real run.** `scripts/provision-vendor.ts` calls
  `upsertVendorSatellites` (which itself calls `seedFulfilmentSchedule`) and `seedFooterDefaults`, so
  the exact set of tables written is inferred from reading those functions, not observed.
  `VendorExpressSchedule` in particular is written **only** when the vendor's stored
  `offerCollection` is true, and the example manifest does not set `offerCollection` at all — so on a
  fresh provision it takes Prisma's `false` default and no express rows are written. That is correct
  but easy to misread as a missing write.
- **R11/R12 depend on what the dev database actually holds.** R12 expects a warning naming
  `staging.aheedfoodcentre.nocaped.com`, which only holds if the dev database was seeded with the
  `localhost` hosts from `env-setup.md`. A dev database seeded with deployed hostnames would
  legitimately produce different output.

**`parseRoutePatterns` is a purpose-built TOML reader, not a parser.** It handles exactly the shape
`wrangler.toml` uses. It is unit-tested against a fixture that includes the two decoy tables
(`[env.staging.vars]` carries a `pattern =` line on purpose), and the `--write` round trip is
asserted. But a genuinely different TOML spelling — an inline array of tables, a multi-line string —
would not be read. If `wrangler.toml`'s route syntax is ever restyled, this is the thing that breaks,
and it breaks by reporting **zero** patterns, which fails the deploy loudly rather than silently.
That failure direction was chosen deliberately.

**`scripts/verify-worker-routes.ts` deliberately does NOT refuse a deployed database.** It is
read-only and reading the live `VendorDomain` rows for the environment being deployed is its entire
purpose, so it does not use `#490`'s guard. Do not "fix" that by adding one — it would break both
deploy workflows.

**The guard was verified against the live `#1134` condition, and that is worth repeating.** During
this build `DIRECT_URL` was **exported in the session shell pointing at production** while `.env`
correctly named dev. The guard refused it by host before constructing a client. Anyone validating
this slice should run `printenv DIRECT_URL DATABASE_URL` **one variable at a time** before any
database step — a combined `printenv A B` returns non-zero when only the second is missing, which is
how a check of mine printed a false all-clear mid-build.
