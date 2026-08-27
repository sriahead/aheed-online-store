---
id: repository-client-injection-completion-plan
title: "Repository client injection — completion, slices 2+3 (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-27
visibility: internal
summary: "Completes #409 by converting the remaining 26 self-resolving exports in categories, loyalty, vendor and products, then deleting the enforcement check's file scoping so the rule holds repo-wide. Also raises the Worker cpu_ms ceiling (#415)."
tags: [repositories, testing, architecture, prisma, workers]
---

# Repository client injection — completion, slices 2+3 (plan)

**Goal:** make `CLAUDE.md`'s repository-client rule true of **every** file in `lib/repositories/`,
not four of them. Slice 1 (#410) built the enforcement and cleared the four smallest files, but had to
scope the check to an explicit file list because the other four files were still non-compliant. This
slice clears those four and **deletes the scoping**, which is the moment the rule stops being partly
aspirational.

## Why slices 2 and 3 are one slice

#409 was split three ways so each piece would survive its own `/validate`. That split was decided
before anyone had measured the work. Slice 1 measured it, and the remainder is smaller and more
uniform than the split assumed:

| File | Exports to convert | Real call sites | Sibling service |
|---|---|---|---|
| `categories.ts` | 4 | 15 | `lib/categories-service.ts` exists |
| `loyalty.ts` | 3 | 6 | `lib/loyalty-service.ts` exists |
| `vendor.ts` | 5 | ~8 | `lib/vendor-service.ts` exists |
| `products.ts` | 14 | 29 | `lib/products-service.ts` exists |

Four files, no new architecture, one transformation repeated 26 times, and an enforcement test that
already exists and only needs its scoping constant removed. Every sibling service is already on disk,
so nothing here needs the design work slice 1 did.

The decisive argument is not convenience, it is that **the file scoping is slice 1's own declared
weakness**. Its build notes name it: a *new* repository file added before #412 lands is not covered by
the check at all, and nothing catches that. Running two more loops keeps that hole open for two more
loops. One larger slice closes it once.

**The honest cost:** 26 exports is roughly four times slice 1, and `/validate` is where that lands. If
the validation pass cannot cover it honestly, splitting at the `products.ts` boundary mid-loop is
still available — that is a better outcome than a thin validation, and it should be said out loud
rather than discovered.

## What "convert" means here

Each listed export gains its Prisma client as an explicit parameter and stops calling `getPrisma()` /
`getPrismaWs()` in its body. The resolution moves to the sibling `lib/<name>-service.ts`.

**Which client a function uses does not change.** This slice moves *where* a client is resolved, never
*which* one is chosen. `saveLoyaltySettings`, `updateVendorStorefrontConfig` and the five
transaction-bearing product writes keep a WebSocket client, because `PrismaNeonHttp` cannot execute an
interactive transaction at all (#382). `tests/repository-transaction-safety.test.ts` is the existing
guard on that and must stay green untouched.

Three `products.ts` functions need **both** clients — `updateProductForVendor`,
`setPrimaryProductImage` and `quickUpdateInventory` each read through the HTTP client and then open a
WebSocket transaction. They take both, in the shape `lib/repositories/roles.ts`'s `applyVendorRole`
already established. Four more (`addProductImage`, `promoteProductImage`, `removeProductImage`,
`reorderProductImages`) are transaction-only and take a WebSocket client alone.

> **A stale count, corrected here rather than inherited.** Slice 1's `plan.md` describes `products.ts`
> as "14 functions, four of which need both clients". The 14 is right; the four is not — measured
> against the file, exactly **three** functions call both. Recorded because the next reader would
> otherwise carry the wrong number forward, which is how the "32 of 109" figure went unchallenged for
> as long as it did.

## Where the resolution goes, and why not inline

`eslint.config.mjs`'s ADR-004 slice-2 `no-restricted-imports` rule forbids importing `@/lib/db` from
`app/`, `features/` and `components/`. A caller in those layers therefore *physically cannot* obtain a
client to pass in. `lib/` is outside that rule, which makes the sibling service the only legal home —
the same conclusion slice 1 reached by reading the rule rather than assuming it.

**The new admin entry points resolve only the client and take `vendorId` as a parameter**, following
slice 1's departure from the `getCategoryRepository()` / `getProductRepository()` factory shape. Every
one of these call sites already holds an authoritative `vendorId` — `auth.vendorId` from
`requireVendorRole` on the staff pages, `order.vendorId` on the two email paths. Re-resolving the
vendor from the request host inside the facade would create a second source of truth for something the
caller established more strongly. This mirrors `lib/roles-service.ts`, which performs the session check
and passes the resulting actor down as data.

The existing `getCategoryRepository()` / `getProductRepository()` / `getLoyaltyRepository()` factories
are **not** replaced. They serve storefront reads, where the vendor genuinely must be resolved from the
request host, and they already take their client correctly. The new admin entry points sit alongside
them in the same file.

**Moving the resolution does not change how many clients a request builds.** Both `getPrisma` and
`getPrismaWs` are `cache()`-wrapped in `lib/db.ts`, so React memoizes them per request regardless of
which layer calls them. #411 flags this as something to watch; it is worth stating that the wrapper's
memoization is per-request, which is exactly why it does not memoize in a plain `tsx` script — that is
a property of the script having no request, not a defect introduced by this change.

## Two hazards this build has to respect

**1. Aliased imports defeat a name-based sweep.** `features/admin/storefront.ts:14` imports
`updateVendorStorefrontConfig as updateConfigRepo` and calls it under the alias. A `grep` for the
function name finds zero call sites and makes it look like dead code. It has now been swept for:
that is the **only** aliased repository import in the tree. This matters because slice 1's build notes
disclose that one conversion was done by scripted find-and-replace, and that technique would have
silently missed this one.

**2. `app/(admin)/staff/runbook/docs.ts` is a generated file that embeds spec and doc prose**, so it
matches greps for every function name in this slice, for `getPrisma`, and for `@/lib/db`. Those are
references, not uses. `CLAUDE.md` and `specs/sdd-workflow.md` between them record six prior instances
of a check that matched an explanation instead of the construct it was written for; `validation.md`
excludes this file explicitly by name rather than leaving the next reader to rediscover it.

## Scope (this slice)

1. **Convert 26 exports** across `categories.ts` (4), `loyalty.ts` (3), `vendor.ts` (5) and
   `products.ts` (14), listed by name in `requirements.md`.
2. **Add the service entry points** the converted functions need, in the four existing sibling
   services. No new service files.
3. **Repoint every call site**, sweeping by symbol rather than by name so the aliased import is caught.
4. **Delete the enforcement check's file scoping** in `tests/repository-client-injection.test.ts`, so
   it covers all of `lib/repositories/*.ts`. This is #412's completion criterion. The guard test that
   asserts every scoped file still exists goes with it, having nothing left to guard.
5. **Type `updateVendorStorefrontConfig`'s `data: any`** properly. #411 calls for this while the
   signature is being changed anyway, and flags that it must be disclosed rather than pass as an
   unremarked extra — this is that disclosure.
6. **Convert `lib/repositories/campaigns.ts`'s value import of `getPrisma` to `import type`.** It is
   used only in `ReturnType<typeof getPrisma>` type positions and is already compliant, so the AST
   check would not fire on it either way. It is a one-line tidy noted in #409's body and left out of
   slice 1; doing it here is what lets #409 close with nothing outstanding.
7. **Extend `scripts/verify-repository-injection.ts`** to prove the property live for all four files.
8. **Raise `wrangler.toml`'s `cpu_ms`** from 50 to 300 (#415) and confirm on deployed staging.
9. **Correct `lib/products-service.ts`'s docstring**, which currently claims the repository module's
   admin write path takes its client explicitly "so a plain `tsx` script can exercise either without a
   live Workers request". That is false for all 14 write exports today. It is the **fourth** instance
   of a docstring asserting this property while its own file violates it — slice 1 found the same
   thing in `customers.ts`, `reports.ts` and `discounts-service.ts`. Each correction says what was
   previously false rather than quietly restating the rule, because the same sentence being
   confidently wrong in four places is the evidence that nobody ever checked it.

### Why the live proof writes real rows, and why it now has a guard

Slice 1 established that a hand-written assertion about this property was wrong for two years and
nothing noticed, so the property gets demonstrated rather than asserted. This slice's converted
functions are mostly **writes**, and a read-only script cannot demonstrate a write path. So the script
creates a real product, attaches a real image through the WebSocket transaction path, and removes what
it created.

That is a meaningful step up from slice 1, whose script only ever inserted throwaway
`OrderLookupAttempt` rows. Writing products to the wrong database would be a genuine mess, and
`CLAUDE.md` records that `.env` and `.dev.vars` have already drifted into agreement on **production**
once while every surrounding value looked like staging. Printing the host, as slice 1 did, relies on a
human reading it. **The script therefore refuses to run when its resolved host matches the host in
`secrets/staging.vars` or `secrets/production.vars`**, and exits non-zero. The guard is included
because the write scope is what makes it necessary, not as general-purpose hardening.

## Deliberately excluded

- **Changing which Prisma client any function uses.** #382's constraints are preserved exactly;
  `tests/repository-transaction-safety.test.ts` must pass unchanged and its diff must be empty.
- **Changing `lib/db.ts`'s `@prisma/client/wasm` import.** Mandatory on Workers. It is the mechanism
  that makes the defect observable, not the defect.
- **#390** — nominal/branded types distinguishing a `getPrisma()` client from a `getPrismaWs()` one.
  Complementary and separately tracked; it would make this class of bug type-checkable rather than
  AST-checkable, and it is a real design decision rather than a mechanical conversion.
- **Replacing the `getXRepository()` factories** with parameter-taking entry points. They are compliant
  and serve a different caller shape (storefront reads that must resolve the vendor from the host).
- **Any behavioural change to a query.** No `where` clause, `select`, ordering or return type changes.
  If a conversion appears to need one, that is a finding to report, not to implement.
- **Investigating *which routes* are disproportionately represented in the 1102s.** #415 proposes that
  as a possible follow-up; this slice does the config raise and confirms it, nothing more.
- **A database migration.** None ships here, so the "apply the pending migration to staging first"
  step that `specs/sdd-workflow.md` requires of migration-bearing slices does not apply.

## Open items carried forward

- **Promotion bundles four issues.** #410 is merged to `staging` and unpromoted by decision, so this
  slice's promotion PR carries #409, #410, #411 and #412 together. The closing keyword must be
  repeated per issue (`closes #409, closes #410, …`) — GitHub honours it only for the first entry in a
  comma-separated list (#112). Promotion PRs use a regular merge, never squash (#275).
- **#415's follow-up half.** Raising `cpu_ms` and confirming no 1102 in a bounded smoke check is what
  this slice claims. Whether 300ms is sufficient under sustained real traffic is an observation that
  outlives the slice; if 1102s recur after promotion, that reopens #415 rather than failing this slice
  retroactively.
- **No issue is opened for this slice.** #411 and #412 already exist, are on the board with Phase P8
  and milestone P8, and carry the scope. A third tracking issue for the same work would be noise; both
  are commented to record that they are delivered as one slice.
