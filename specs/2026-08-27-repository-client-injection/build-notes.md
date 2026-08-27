# Repository client injection — slice 1 of 3 (build notes)

Slice 1 of **#409**, tracked as **#410**. Branch `feature/409a-repository-client-injection`, cut from
`origin/staging`. **Built in the main checkout, not a sub-agent worktree** — `git worktree list`
shows only `E:/GitRepositories/aheed-online-store`.

## What changed and why

The slice exists because `CLAUDE.md`'s repository-layer rule and its named enforcement contradicted
each other, and the rule was losing. `CLAUDE.md` requires every `lib/repositories/*` export to take
its Prisma client as an explicit parameter; `tests/repository-purity.test.ts`'s docstring declared
that calling `getPrisma()` internally was "compliant". **32 of 109 exports across 8 files** had taken
the docstring's word for it.

**The contradiction was settled by measurement, and the result is the load-bearing fact of this
slice.** `lib/db.ts` builds its client from `@prisma/client/wasm` — mandatory on Workers, per
CLAUDE.md's Database section — and **Node cannot load that build's WASM query compiler**. Probed
against the dev Neon branch (`ep-sparkling-paper`, checked against `secrets/staging.vars` and
`secrets/production.vars` first; read-only):

```
getAvailableSpecialities(prisma, vendorId)   PASS   client injected by the script
getVendorConfig(vendorId)                    FAIL   ERR_UNKNOWN_FILE_EXTENSION
                                                    query_compiler_bg.wasm
vendorConfig.findUnique via script's client  PASS   same query, same database
```

So a self-resolving export is not merely awkward to test from a script — it **cannot run in one at
all**. "Compliant" was describing 32 functions that were unreachable by construction. That is why the
fix is real work rather than a documentation correction.

**Changed:**

- `tests/repository-client-injection.test.ts` (new) — the enforcement that never existed. AST
  call-expression check over `lib/repositories/*.ts`.
- `lib/repositories/customers.ts`, `reports.ts`, `order-lookup-rate-limit.ts` — the four exports now
  take `prisma` as their first parameter; their `@/lib/db` imports became `import type`.
- `lib/repositories/discounts.ts` — `createCodeForVendor`/`deactivateCodeForVendor` **removed**
  (relocated, see Deviations); `@/lib/db` import became `import type`.
- `lib/customers-service.ts`, `lib/reports-service.ts`, `lib/order-lookup-rate-limit-service.ts`
  (new) and `lib/discounts-service.ts` (extended) — where the resolution went.
- Six call sites repointed at the services.
- `scripts/verify-repository-injection.ts` (new) — the live proof.
- `tests/repository-purity.test.ts` docstring, `CLAUDE.md`, `specs/roadmap.md`, `CHANGELOG.md`.

**Three docstrings in the tree asserted the property while their own file violated it** —
`customers.ts` ("a plain `tsx` script can exercise it directly"), `reports.ts` (the same claim), and
`lib/discounts-service.ts` ("every export there takes `prisma` and `vendorId` explicitly"). Each was
corrected in place, and each correction says what was previously false rather than quietly restating
the rule. That is deliberate: the same sentence being confidently wrong in three places is the
evidence that the claim was never checked.

## Decisions taken during the build

- **Resolution goes in the service layer, not inline at the call site.** This is not a style
  preference — `eslint.config.mjs`'s ADR-004 slice-2 `no-restricted-imports` rule forbids `@/lib/db`
  in `app/`, `features/` and `components/`, so a caller in those layers *physically cannot* accept a
  client. `lib/` is outside that scope, which makes the sibling service the only legal home. Verified
  by reading the rule, not assumed.
- **The new services take `vendorId` as a parameter rather than resolving it** via
  `getCurrentVendorId()`, which is a deliberate departure from `lib/categories-service.ts`'s and
  `getDiscountRepository()`'s shape. Every one of these six call sites already holds an authoritative
  `vendorId` from `requireVendorRole`, derived from the request host; re-resolving it inside the
  facade would create a second source of truth for something the caller established more strongly.
  Same posture as `lib/roles-service.ts`, which passes its resolved actor down as data.
- **The scoping constant is a list of FILES, never of functions.** A function-level allowlist is what
  `tests/repository-purity.test.ts`'s docstring correctly refuses ("would only ever be used to
  readmit the defect"). A file list can only say "this file isn't under the check yet" — it cannot
  exempt a function inside a file that *is* covered. The constant's own comment names #411 and #412
  and says #412 deletes it.
- **An extra guard test — "every file in scope still exists".** Without it, renaming or deleting a
  scoped file would drop it out of the check silently and the suite would stay green.
- **The check fires on `getPrisma`/`getPrismaWs` calls anywhere in the file, not only inside exported
  functions.** A module-scope client would be a worse defect (it caches across requests, which throws
  on Workers), so there is no reason to exempt it.
- **The live proof is a committed script, not a unit test.** It needs a real database and a real
  Node-native Prisma client, neither of which belongs in the vitest suite. It mirrors
  `prisma/seed.ts`'s bare-specifier client, which is the whole point.

## Deviations from the spec

**One, and it changed a requirement.** `requirements.md`'s R8 originally required
`createCodeForVendor` and `deactivateCodeForVendor` to *declare a Prisma client as a parameter*, like
the other four conversions. During Build it became clear that is the wrong shape: both are thin
facades over `createCode`/`deactivateCode`, which **already** take a client explicitly. Adding a
parameter would have produced two identical entry points to the same function and left the facade in
the repository, which is precisely what #252 established should not happen.

They were **relocated to `lib/discounts-service.ts`** instead. R8 was rewritten on the branch to
require exactly that, and the requirement text names the correction. R14 was also widened to record
that the ESLint rule already enforces it — discovered while checking the old docstring's claim, and
stronger than the grep the spec originally proposed.

No scope was added. `categories.ts`, `loyalty.ts`, `vendor.ts` and `products.ts` were left untouched
for #411 and #412, and `campaigns.ts`'s cosmetic `import type` nit was left in #409's body rather
than fixed here.

## Known-shaky areas

- **The file scoping is the real weakness of this slice, and it is deliberate.** A *new* repository
  file added before #412 lands is not covered by the check at all. Nothing catches that, and it is
  the argument for not letting #411/#412 drift. Named in the constant's comment so a reader hits it.
- **`checkOrderLookupRateLimit` has three call sites and is a security control.** It was converted
  correctly and `verify-repository-injection.ts` now demonstrates it refusing past its 5-per-minute
  threshold — the first time that has ever been shown outside a live request. But the three callers
  (`/orders/lookup` page, its export route, `features/orders/guest-data-rights.ts`) were changed by a
  scripted find-and-replace; `git diff --numstat` shows exactly 2 changed lines per file, which is
  the expected import + call, and `typecheck` passes. Worth a reviewer's eye anyway.
- **`/staff/reports` and `/staff/customers` were not exercised in a browser.** `typecheck` and
  `build` prove the call sites resolve, and the underlying repository functions are proven live by
  the script, but the rendered pages were not opened under `npm run preview`. `validation.md` says
  what to click if a reviewer wants that.
- **`verify-repository-injection.ts` writes rows.** The rate-limit check inserts up to six
  `OrderLookupAttempt` rows under a unique synthetic IP per run. They age out of the 60-second window
  on their own and are never read by a real lookup, but the script is not strictly read-only despite
  reading that way at a glance — the header says so.
- The script targets whatever `.env` points at. It prints the host on every run for exactly that
  reason; on this machine that is the dev branch, not staging or production.
