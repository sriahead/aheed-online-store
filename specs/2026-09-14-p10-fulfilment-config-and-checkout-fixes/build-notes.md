# P10 — Fulfilment configuration and checkout fixes (build notes)

Written at the end of Build, before the Clear. The validating context is fresh and has only the
spec, the artifact, and this file.

**Read `## Known-shaky areas` first — R15 cannot pass in this environment, for a reason that is not
a defect in this slice.**

## What changed and why

### Part A — `/staff/fulfilment` (#750)

`#401` and `#402` shipped `VendorFulfilmentSlot`, `VendorExpressSchedule` and four `VendorConfig`
columns with no writer anywhere in the repository. This slice adds the writer, deliberately as a
structural copy of `/staff/delivery-areas` (#612), which solved the identical defect shape for
`VendorDeliveryArea`.

- **`lib/fulfilment-form.ts`** (new) — the pure parsers. `TIME_OF_DAY` is deliberately strict about
  zero-padding (`"9:00"` is rejected) because both consumers compare these columns **as text**:
  `listFulfilmentSlotsForVendor` orders by `startTime` and `SlotPicker` compares an express window
  against the wall clock as a string. `"9:00"` sorts *after* `"10:00"`, so an unpadded value does
  not error — it silently mis-orders. Same reasoning for rejecting `endTime <= startTime`: a
  zero-length window renders in the picker and can never be booked.
- **`lib/repositories/fulfilment-slots.ts`** (+236 lines) — eight pure write/read functions, each
  taking `prisma` and `vendorId` explicitly. The file's existing header already documented that
  contract for its one read function; the new block extends it rather than restating it.
- **`lib/fulfilment-slots-service.ts`** (+65) — `getFulfilmentAdminRepository()`, matching
  `getDeliveryAreaRepository()`'s shape, including the memoised lazy `vendorId()` so a page
  rendering three lists issues one host lookup rather than three.
- **`features/admin/fulfilment.ts`** (new) — five actions, each running its own
  `requireVendorRole("ADMIN")`. `revalidateFulfilmentSurfaces()` revalidates **`/checkout` as well
  as `/staff/fulfilment`**: without it an admin could add a Saturday slot and no shopper's checkout
  would offer it. That second path is the one a reader would most plausibly omit.
- **`components/staff/FulfilmentManager.tsx`** (new) and **`app/(admin)/staff/fulfilment/page.tsx`**
  (new) — progressive-enhancement forms bound with `useActionState`, refusal branch renders
  `<PanelRefusal>`.
- **`components/staff/PanelNav.tsx`**, **`app/(admin)/staff/page.tsx`**,
  **`docs/store-admin-guide/admin-tabs-guide.md`** — the three surfaces a new `/staff/*` page must
  reach. Every capability sentence in the guide section was traced to a real control on the page
  before being written (the `#629`/`#634` lesson).
- **`prisma/seed.ts`** (+101) — `seedFulfilmentSchedule()`, called from `upsertVendorSatellites`.

### Part B — the checkout postcode lookup (#749, #751)

- **`features/checkout/postcode-lookup.ts`** (new) — the lookup now runs server-side. Returns a
  discriminated `PostcodeLookupOutcome` rather than throwing, because a production throw crossing a
  server-action boundary reaches the client as an opaque digest: the previous
  `err.name === "PostcodeNotFoundError"` branch could not have worked on a deployed environment even
  with the network available.
- **`components/checkout/CheckoutForm.tsx`** — calls the action, and resolves every element from a
  `formRef` instead of `document.querySelector("form")`.

### Part C — the vendor logo upload (#749) and what it actually was

- **`components/staff/VendorLogoUploader.tsx`** — the corrupted template literal at line 74 now
  reports `HTTP ${put.status}`, and the `fetch` is wrapped in `try`/`catch` so a network throw sets
  a message instead of rejecting unhandled inside `startTransition`.
- **`scripts/verify-storage-credentials.ts`** (new) — read-only per-environment credential probe.

**The root cause is `#755`, filed during this slice: the R2 S3 credential pair is rejected in all
three environments.** Established in plain Node (no browser needed — `lib/storage.ts` imports only
`aws4fetch` and `lib/config`). Every presign variant, a header-signed `putObject`, a presigned GET
and a read-only `HEAD` all return `403`, against dev, staging *and* production, which share one key
pair. Shopper-facing image display is unaffected because `publicUrl()` is pure string composition
over `CDN_BASE_URL`, which is why nothing looked broken.

## Decisions taken during the build

- **The four config fields live on the new page, not on `/staff/storefront`.** `#750`'s own issue
  body proposed extending `updateDeliveryRules`. Rejected at `/propose` and confirmed here:
  `bookingWindowDays` is meaningless without the slots it governs, and `StorefrontConfigForm.tsx` is
  already 702 lines. Recorded because the issue body still says otherwise.
- **No `getPrismaWs()` anywhere in this slice.** Checked deliberately rather than copied: the
  settings write is a singular `update` (`VendorConfig.vendorId` is `@unique`), creates are singular
  `create`s, and removals are `deleteMany` — none of which hit the `updateMany`/`createMany` HTTP
  adapter crash (#382), and none of which need an interactive transaction. R9 is therefore satisfied
  **vacuously**; a validator should expect the grep to print nothing rather than reading that as a
  missed requirement.
- **No last-row guard, unlike `delivery-areas`.** `removeDeliveryAreaForVendor` refuses to remove a
  vendor's final area because an empty prefix list breaks checkout for every shopper. Removing the
  final *slot* only disables a feature the vendor opted into, so the same guard would be cargo-culted
  rather than reasoned. The Serializable transaction that guard needs is also what would force
  `getPrismaWs()` into this file.
- **`offerCollection` is read from the database by the seed, never written by it.** It is absent
  from `prisma/seed.ts` entirely — both vendors take Prisma's `false` default there, and the live
  value is whatever an admin later set (`true` for Aheed on staging, `false` for SriMart). Seeding
  collection slots or express windows for a vendor that does not offer collection would write rows
  nothing can render.
- **Seed idempotence is by natural-tuple lookup, not upsert.** Neither model carries a unique
  constraint, so there is no key to upsert on. Each row is matched on (method, day, start time) and
  created only when absent, so a re-run adds nothing and leaves a capacity an admin has since tuned
  exactly as they left it.
- **Both lint rules on the checkout effect are silenced by name, not by changing the effect.**
  `react-hooks/set-state-in-effect` (which the pre-existing bare `// eslint-disable-next-line` had
  been covering) and `react-hooks/exhaustive-deps`. Adding `handleLookup` to the dependency array
  would re-run the effect on every render — one server round-trip per render for as long as the page
  is open. This is the resolution CLAUDE.md's Hooks section already prescribes.
- **The three-file diagnostic script used to root-cause `#755` was deleted, not committed.** Its
  findings are in `#755` and in `plan.md`; the committed artefact is the read-only
  `scripts/verify-storage-credentials.ts`, which is a different and safer thing.

## Deviations from the spec

- **R15 is implemented but cannot execute in any current environment.** This is a blocked
  requirement, not a skipped one — see Known-shaky areas below for the evidence and the reason.
  `plan.md`'s open-items section states that a *from-scratch* seed is blocked by `#755` and that
  "re-seeding an already-seeded database is unaffected". **That second half is wrong**, discovered
  by actually running the seed at Build. Corrected here rather than silently in the spec, since the
  spec is what `/validate` reads.
- Nothing else. R1–R14, R15a and R16–R27 are built as specified.

## Known-shaky areas

- **R15 cannot pass, and the reason is `#755`, not this slice.** `npm run db:seed` exits 1 against
  the already-seeded dev database:

  ```
  marked 6 products featured for a4ed0000-…
  Error: storage putObject failed: 403
      at async refreshProductImages (prisma/seed.ts:901:5)
      at async main (prisma/seed.ts:75:3)
  ```

  `refreshProductImages` is **line 75** and `upsertVendorSatellites` — which calls the new
  `seedFulfilmentSchedule` — is **line 76**. The seed dies one line before the new code runs, so the
  slot and express rows are never written and the flags are never set. **Do not record R15 as a
  failure of this slice's code**, and do not work around it: making `putTracked` non-fatal would
  write rows whose objects do not exist, which is exactly the row-versus-object divergence CLAUDE.md
  records from `#502`; reordering the call so the new function runs first would satisfy the check
  while leaving the seed still exiting 1. R15 becomes verifiable the moment `#755`'s rotation lands
  — tracked as `#756`.

- **R16 depends on R15's data, so it is blocked the same way.** Without seeded slots the checkout
  picker has nothing to render. It can still be exercised by inserting a slot through the new page
  itself (which is the real writer and needs no storage), and that is the better test anyway —
  prefer it to waiting on the seed.

- **The settings write assumes a `VendorConfig` row already exists.** `updateFulfilmentSettingsForVendor`
  uses `update`, not `upsert`, so a vendor with no config row would throw rather than return a field
  error. Every seeded vendor has one and `upsertVendorSatellites` creates it, so this is unreachable
  today — but it is the one path in the new repository code with no graceful failure.

- **Nothing in this slice has been exercised against a live database or a real browser.** Build ran
  `lint`, `typecheck`, `format:check`, `next build` and the full suite, none of which execute a
  query. The parsers have 43 unit tests; the repository functions have none. Every DB-touching row
  in `validation.md` is genuinely first-run at `/validate`, under `npm run preview` — not `npm run
  dev`, which cannot load the WASM query engine.

- **Two vendors matter here and their local hostnames are not what a spec might assume.** Query
  `VendorDomain` in the connected database before trusting any `Host` header; on 2026-09-14 the dev
  database held `localhost:8787` (Aheed) and `srimart.localhost` (SriMart). The multi-label host also
  breaks `curl -b`/`-c` cookie jars silently — extract `Set-Cookie` by hand for SriMart.

- **`tests/repository-transaction-safety.test.ts` (`#538`) parses every file in
  `lib/repositories/`,** and this slice added 236 lines to one of them. It did not reproduce on this
  Build's full-suite run, but it is a load-dependent 5000ms timeout and a green run is not evidence
  it is fixed. If it fails at `/validate`, re-run that file alone before treating it as real.

## Fix (post-Validate)

`/validate` (2026-09-15) confirmed all 27 requirements — R15 correctly blocked by `#755`, R1-R14/
R15a/R16-R27 confirmed live under `npm run preview` against the real dev database (settings/slot/
express-window writes and their six-plus-two invalid-input rejections driven via curl against the
real `useActionState` forms; cross-vendor slot and express-window removal both proven to leave the
other vendor's row untouched; the postcode lookup driven live end-to-end for both a real and an
unrecognised UK postcode; `scripts/verify-storage-credentials.ts` run for real, independently
reconfirming `#755`). One finding, not a code defect: R27's own validation row asks to "update
`CLAUDE.md`" with the clean-run baseline, and `CLAUDE.md`'s **anchor** sentence ("currently 117
files / 1557 tests, measured 2026-09-09") had gone stale — the paragraph's own trailing historical
log already correctly tracked the count to `129/1687` as of this slice's Build (line ~698, "Then
`128/1632` moved to `129/1687` at the fulfilment-config-and-checkout-fixes Build"), but nobody had
synced the anchor to match. Fixed by updating the anchor to `129 files / 1687 tests, measured
2026-09-15`, which is exactly what a clean `npx vitest run` reports on this branch. Ran
`npm run kms:build-index` afterward (`CLAUDE.md` carries no front-matter, so only `docs.ts`'s
embedded body and `ARTIFACT_INDEX.md`'s regeneration footer moved) and re-ran the full local suite,
the KMS docs-site build, and `next build` — all green. `tests/motion-reduce-coverage.test.ts` timed
out once on a full-suite run taken immediately after the `kms/site-internal` build (the documented
`#538`-class load flake, not `#538` itself); it passed in 302ms alone and on a subsequent clean full
run. No observable application behaviour changed, so no new `CHANGELOG.md` entry.
