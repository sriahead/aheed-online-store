# Credential verification closeout (build notes)

## What changed and why

Three independent parts, all found while resolving the R2 credential outage (`#755`) on
2026-09-16. Nothing here is speculative — each was observed live that night.

### Part 1 — `scripts/verify-storage-credentials.ts` (`#780`)

Two gaps, one root cause: the script reported on **files** and the credential lives in **two
stores**.

- **`.dev.vars` added as a fourth target**, labelled `dev.vars`. It was absent from `TARGETS`, and
  per `CLAUDE.md`'s config-precedence rule it is the file that *wins* under `npm run preview`.
- **A deployed-version report for staging and production.** `Target` gained an optional `worker`
  field naming the Worker script; only the two `secrets/*.vars` targets carry one, because `.env`
  has no `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN` at all and neither local file has a deployed
  Worker to compare against. The check reads `/deployments` for the live version id and
  `/versions?per_page=1` for the newest, then compares.
- **`workerVersionState(deployedId, newestId, lookupOk)`** is exported and pure. It returns
  `in-sync`, `stale` or `unknown`, and `lookupOk` is tested **first** so a failed lookup can never
  present as a mismatch.
- **`main()` is now guarded** by an `invokedDirectly` check comparing `import.meta.url` against
  `basename(process.argv[1])`, so `tests/worker-version-state.test.ts` can import the pure function
  without the whole script executing (and hitting the network) on import.
- **The script's own docstring was corrected.** It carried the identical overreach to the
  `CLAUDE.md` sentence this slice fixes — "This script is the one command that answers…" — and
  listed only three files under its rotation instructions.

### Part 2 — `CLAUDE.md` (`#781`)

Two edits, both additive to existing sections rather than restructuring.

- The Storage section's **"one command that answers"** claim is corrected, and a new bullet states
  exactly which stores the script covers, that `.dev.vars` was missing until `#780`, and — the part
  that matters most — that **a Worker reported `IN SYNC` proves the newest version is live, not that
  it carries the key you think it does.** No tool can read a deployed secret's value; a real upload
  through the deployed environment remains the only complete proof.
- The deployed-version section gains the **loud** half of the trap: `Secret edit failed`, that both
  deploy workflows open their deploy step with `wrangler secret put`, that this therefore fails
  every future deploy on that environment, the `wrangler versions deploy` recovery, and
  `configure-env.mjs` as the way to avoid it entirely.
- The **vitest baseline was updated to 141 files / 1886 tests**, measured on this Build. `CLAUDE.md`
  requires this at Build rather than at `/document` precisely because a Clear sits between them.

### Part 3 — `saveStorefrontTheme` (`#782`)

- **`parseBrandPrimitives`** added to `lib/brand-colour-form.ts` — `#713`'s module, extended rather
  than duplicated. `PRIMITIVE_LABELS` reuses the same eight labels the branding form shows, so a
  rejection reads identically whichever writer produced it.
- **`saveStorefrontTheme` now validates before writing**, and passes `parsed.value` (the trimmed
  values) to `saveVendorTheme` rather than the raw input.
- **`isUniqueViolation` replaces the direct `P2002` comparison.** That write runs through
  `getPrisma()` — the HTTP adapter — which throws the raw SQLSTATE `23505`, so the duplicate-name
  branch could never fire and a duplicate name produced the generic fallback message.

## Decisions taken during the build

**The pure function stayed in the script rather than moving to a sibling module.** Putting
`workerVersionState` in `scripts/worker-version-state.ts` would have avoided needing an
`invokedDirectly` guard, but `validation.md`'s R4 row names
`scripts/verify-storage-credentials.ts` explicitly. Moving it would have meant editing an approved
spec mid-build to accommodate an implementation convenience. The guard is four lines and standard.

**Every primitive is REQUIRED in `parseBrandPrimitives`, unlike the form parser.** `parseHex` treats
an absent or empty form field as "not submitted, leave alone" — correct for a partial form post. A
`VendorTheme` row stores all eight columns as non-null, so "absent" is not a meaningful state there;
an empty string is a defect, not an omission. This is the one place the two validators deliberately
disagree, and the tests pin both behaviours.

**The validator reports the FIRST invalid field rather than collecting all of them.** Matches
`parseBrandColourForm` and every other parser in this repo, and `saveStorefrontTheme` returns a
single `error` string with no field slot to render into.

**An `unknown` version state does not affect the exit code.** Deliberate, and the most consequential
judgement in Part 1. This dev machine produced transient `fetch failed` errors repeatedly during
`#755`'s investigation — the errors moved between environments on consecutive runs of the very same
command. A check that turns a flaky network into "your credentials are not live" gets ignored within
a week, and then a genuinely stale Worker slips past it.

**A `stale` state DOES set a non-zero exit code**, and prints the recovery command inline rather
than pointing at documentation. When this fires, the reader is mid-rotation and wants the command.

## Deviations from the spec

**None.** All nineteen requirements were built as written.

One change was made to the spec *before* it was approved and is recorded here because the
reasoning matters: `validation.md`'s R11 row originally checked
`grep -c 'wrangler secret put' CLAUDE.md`, which already printed `6` before this slice and so could
not discriminate a pass from a fail. It was replaced with an `awk` window anchored on the new
`Secret edit failed` text, which printed `0` beforehand. Caught during the spec's own adversarial
pass, not during build.

## Known-shaky areas

**R14 is the row that can fail for an interesting reason, and it is the only part of this slice not
yet exercised against a real database.** The `isUniqueViolation` fix and the primitives validation
are both covered by unit tests, but a unit test constructing a Prisma error by hand reproduces
whichever shape its author assumed — which is exactly how the `P2002`/`23505` divergence survived
three separate times in this repo. **Drive `saveStorefrontTheme` through `npm run preview` with an
invalid primitive and confirm no `VendorTheme` row was written**, then separately with a duplicate
name and confirm the message is "You already have a saved theme with that name." rather than the
generic fallback. Confirming the *absence of a row* matters as much as the error text.

**The `invokedDirectly` guard is the most fragile thing added here.** It compares `import.meta.url`
against `basename(process.argv[1])`. It works under `npx tsx` (verified — the script runs normally,
and the test imports it without any probe output leaking into the test run), but it is heuristic. If
the script ever silently stops doing anything when run, this is the first place to look.

**The deployed-version check has only ever been observed in its `in-sync` state.** Both Workers were
already healthy by the time this was written, so the `stale` path's *live* behaviour is proven only
by unit test, not by a real stale Worker. The state was observed live on 2026-09-16 — that is what
prompted the issue — but not through this code. If a future rotation makes a Worker genuinely stale,
that run is the free observation; note what it did.

**The version check adds a network call to a script that was previously offline-capable per
environment.** It degrades to `unknown` rather than failing, but a reader running this on a plane
will now see two lines they did not see before.

**Not verified: whether `lookupWorkerVersions` handles a Cloudflare API token lacking Workers
read permission.** It would return a non-`ok` status and therefore `unknown`, which is the right
direction, but the specific 403 shape was not exercised.
