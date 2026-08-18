# P7b — UK GDPR data-subject rights (build notes)

Written at the end of Build, before the Clear. Issue **#216**, branch `feature/p7b-data-rights`.

Nothing here has touched a real database. Everything below is static analysis, `npm run build`, and
unit tests over the pure module. **Every write-path requirement (R7–R23) is unproven** — see
"Known-shaky areas".

## What changed and why

**`lib/repositories/data-rights.ts`** — the whole domain surface. `exportPersonalData`,
`eraseVendorData`, `countOtherVendorData`, plus three small readers (`updateDisplayName`,
`hasVendorMembership`, `getAccountProviders`) and a request-scoped facade
`getDataRightsRepository()`.

The one thing you cannot reconstruct from the code: **the `@/lib/db` import is `import type`, and
the facade reaches it through a dynamic `import()`, because `@prisma/client/wasm` does not resolve
in Node at all.** Verified rather than assumed —
`npx tsx -e "import('@prisma/client/wasm')"` fails with `Cannot find module …@prisma\client\wasm.mjs`.
A normal top-level import would therefore make this module unloadable by
`scripts/verify-data-rights.ts`, and that script is the only way the erasure's atomicity and
cross-vendor isolation ever get proven. The dynamic import is confirmed to survive bundling:
`npm run build` compiles and lists `/account/data` and `/account/data/export` as dynamic routes.

**The erasure shape** is dictated by the schema's existing referential actions, not chosen:

- `Order` — `userId`/`guestEmail` nulled, everything else untouched. The financial record survives.
- `Address` — redacted in place, because `Order.addressId` is **not** nullable so the row cannot go.
  This is a deliberate exception to that model's "written once and never updated" snapshot rule.
- `Review`, `Cart`/`CartItem`, `LoyaltyAccount` — deleted. No retention interest.
- `LoyaltyLedgerEntry`, `DiscountRedemption` — rows kept, `userId` nulled. Audit trails survive.
- `OrderStatusEvent.createdByUserId` — nulled (already `SetNull` by design).
- `OrderLookupAttempt` — **untouched, deliberately.** It stores a SHA-256 of the caller's IP, never
  the IP, and carries no `userId`, so there is nothing in it to erase. Listed so a reviewer can see
  it was considered rather than missed.

**`prisma/migrations/20260818021500_p7b_loyalty_ledger_user_nullable`** — `LoyaltyLedgerEntry.userId`
becomes nullable with `onDelete: SetNull`. It was non-null with `Cascade`, so deleting a `User`
deleted the ledger rows that are the *only* explanation of a surviving order's `discountPence` —
destroying a financial audit trail the order itself must retain, and violating that model's own
documented "nothing here is ever updated or deleted" invariant. Purely additive; no existing row
changes.

**`app/(storefront)/account/data/export/route.ts`** is a route handler, not a Server Action,
because an action cannot cleanly hand the browser a file. It uses `next/navigation`'s `redirect()`
rather than `NextResponse.redirect()`, which needs an absolute URL built from an `origin` header
that is absent on a plain GET navigation.

**`app/(storefront)/privacy/page.tsx`** — §5 previously promised access, rectification and deletion
"contact our privacy compliance team", a team that exists nowhere in this repo. Replaced with a
retention section (six years for transaction records) and a rights section that links to
`/account/data` and states plainly that orders are retained-but-anonymised rather than deleted.

**Doc carry-forwards on this branch:** `specs/roadmap.md`'s P7/P8 backups+monitoring overlap
resolved in P8's favour (decided at `/propose`); `docs/gap-register.md` GAP-007 → `Fixed` after
#180's production CORS was applied out of band; `specs/decisions/ADR-004-multi-tenancy.md` gains an
implementation note recording `countOtherVendorData` as the one permitted cross-vendor query.

## Decisions taken during the build

**The facade exists at all, and is async.** The spec had the app layer calling `getPrismaWs()`
directly (R9), which collides with the ADR-004 slice-2 lint rule forbidding `@/lib/db` imports in
`features/` and `app/` (R3). Something in `lib/` had to resolve the client. Putting the facade in
`lib/repositories/data-rights.ts` alongside the pure functions keeps the "repositories are the only
DB-access path" story intact; the alternative — a separate `lib/data-rights-service.ts` following
the `lib/auth-rbac.ts` precedent — was rejected because it moves client resolution out of the
repositories directory for no gain. The facade is `async` (unlike every other repository factory)
purely because of the dynamic import.

**Password verification uses Better Auth's `signInEmail` as the checker.** Better Auth exposes no
bare "is this password correct" call. `asResponse` is deliberately not passed, so no `Set-Cookie` is
emitted — the caller is already signed in and a confirmation step has no business rotating their
session. Rejected: Better Auth's built-in `deleteUser`, which verifies a password for you but
deletes the whole user, which is precisely the behaviour this slice must *not* have.

**`checkEmailConfirmation` is case-sensitive.** It trims outer whitespace (paste artefacts) but
does not lowercase. The control is deliberate friction on an irreversible action, so "close enough"
is not the standard. Worth knowing this is a decision, not an oversight — the opposite choice is
equally defensible.

**Erasure refuses for any `VendorMembership` holder.** A vendor ADMIN erasing themselves would
approach P6.7's self-lockout guards from an angle they do not cover and could leave a vendor with
zero admins. The refusal is enforced in the action *and* rendered as a disabled state on the page,
so the UI does not invite a refusal it already knows about — same posture as `CategoryForm`'s parent
picker.

**Form state shapes duplicate `CatalogueFormState`'s three fields rather than importing them.** A
three-field state object is not worth coupling an account-settings module to the catalogue admin's.

**Deliberately not built, though noticed:** `User.name` has no length bound, so a very long name is
accepted. `requirements.md` R23 covers empty/whitespace only, and adding a max is scope creep — but
it is a real (minor) hole and belongs in whatever slice next touches account settings.

## Deviations from the spec

**1. R11's address redaction — amended, and the amendment is in `requirements.md` with a note.**
The requirement said all seven address fields are "replaced by redaction placeholders". The code
sets the five non-nullable columns (`recipientName`, `phone`, `line1`, `city`, `postcode`) to the
`REDACTED` marker and the two nullable ones (`line2`, `notes`) to `NULL` — writing a marker string
into a column that can simply hold nothing stores a value where absence is the honest answer. The
property that actually matters, *no original personal value survives*, is unchanged and still
checked. **Scrutinise this at Validate rather than accepting it**: amending a requirement to match
the code you wrote is the exact move that needs a second pair of eyes, even when the reasoning
holds. `validation.md`'s R11 row was updated to match, and the fixture deliberately populates
`line2`/`notes` first so "set to null" is a proven change rather than a column that was already
empty.

**2. R9's "the client it is called with in application code is `getPrismaWs()`" is now indirect.**
It is `getDataRightsRepository()` that calls `getPrismaWs()`, not the Server Action, for the lint
reason above. The substance — the erasure transaction runs on the WebSocket client — is unchanged
and still checkable by reading the facade.

**3. `validation.md`'s R1 and R2a rows were rewritten during Build**, because the probe command I
originally specified is misleading: this repo has no `"type": "module"`, so `tsx` transpiles an
`--eval` to CJS and `import()` returns an interop wrapper whose only key is `default`. The original
row would have printed `default` and read as a failed module load when the module is fine. The row
now uses `m.default ?? m` and says why. This is the same inverted-diagnostic shape
`specs/sdd-workflow.md` records for #176 — a validator following the old text would have concluded
working code was broken.

## Known-shaky areas

**Nothing on the write path has run against Postgres.** `eraseVendorData` has never executed. The
transaction ordering, the `updateMany` filters, the `in: addressIds` clause and the last-vendor
branch are all unexercised. `scripts/verify-data-rights.ts` exists to prove them and **has never
been run** — it will also be the first thing to break if it has its own bugs, so a failure there is
as likely to be the harness as the code. That exact confusion cost the catalogue-debt slice a
`/validate` cycle: R2's "write-half unverified" turned out to be a fault in the validation session's
own hand-rolled HTTP harness, not the app.

**Check which database before running the harness.** It creates fixtures and then erases them.
`.env`'s `DIRECT_URL` decides where. Diff `.env` against `secrets/staging.vars` **and**
`secrets/production.vars` first — at P5a's validation both local files agreed perfectly and both
pointed at production.

**`reverseRedemption` changed, and it is P5a's code, not this slice's.** Making the ledger's
`userId` nullable broke it at typecheck; it now skips the `LoyaltyAccount` balance update when
`userId` is null (an erased user has no account left to credit) while still writing the `REVERSAL`
row so the trail balances and the idempotency guard holds. **This is a behaviour change in the
refund path reached sideways through a compliance slice** — the highest-risk edit in the diff, and
`tests/loyalty.test.ts` does not cover the null-owner case.

**The dynamic `import()` works in `next build`, but has not run on a real Worker.** Bundling is
proven; execution is not. If `/account/data` 500s under `npm run preview`, look there first.

**`signInEmail`-as-password-check may have side effects I have not observed.** It may create a
`Session` row, and it may be subject to Better Auth's own rate limiting — meaning several failed
erasure confirmations in a row could start failing for a reason the UI reports as "that password
isn't right". Worth firing R19 more than once consecutively.

**Every `"use server"` export must be exercised for real.** `build`, `typecheck` and `test` all stay
green with a violating file; only dispatching an action catches it (#159). R25's real check is
submitting one of these forms under `npm run preview`.
