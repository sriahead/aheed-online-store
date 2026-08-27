---
id: repository-client-injection-plan
title: "Repository client injection — slice 1 of 3 (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-27
visibility: internal
summary: "Slice 1 of #409 — add the missing enforcement for CLAUDE.md's repository-client rule, reconcile the rule with the test that contradicted it, and convert the six self-resolving exports in customers, order-lookup-rate-limit, reports and discounts."
tags: [repositories, testing, architecture, prisma]
---

# Repository client injection — slice 1 of 3 (plan)

**Goal:** make CLAUDE.md's repository-layer rule true, checked, and stated once. This slice adds the
enforcement that never existed, corrects the two documents that contradict each other, and clears the
four smallest affected files — including the guest order-lookup rate limiter, a security control that
currently cannot be exercised outside a live Workers request.

## Why this slice exists

`CLAUDE.md` says every function exported from `lib/repositories/<name>.ts` takes its Prisma client and
`vendorId`/`userId` as explicit parameters, so a plain `tsx` script can import the module in real Node
and exercise it directly. **32 of 109 exported functions do not.** They call `getPrisma()` or
`getPrismaWs()` internally.

`tests/repository-purity.test.ts` is the test `CLAUDE.md` names as the enforcement. It covers only the
*request-context* half of the rule, and its docstring explicitly blesses the other half:

> `@/lib/db` is deliberately NOT here: resolving a client is not reading request context, and several
> compliant repository functions call `getPrisma()` internally while still taking `vendorId`
> explicitly.

So the rule says one thing and its named enforcement says the opposite. A reader gets whichever
document they open first. This is the **third** time this rule has claimed an enforcement it did not
have — `CLAUDE.md` already records the first two, where it twice pointed at
`tests/repository-vendor-scoping.test.ts`, a test that asks about *scoping*, not *location*.

### Which document is right was settled empirically, not by argument

Probed 2026-08-27 with a real `tsx` script against the dev Neon branch (`ep-sparkling-paper`,
confirmed distinct from staging and production before running; read-only):

| Probe | Result |
|---|---|
| `getAvailableSpecialities(prisma, vendorId)`, `listProducts(prisma, vendorId, opts)` — take a client; the script injects a Node-native one built exactly as `prisma/seed.ts` does | **PASS** |
| `getVendorConfig(vendorId)`, `getVendorBranding(vendorId)` — resolve their own client | **FAIL** — `PrismaClientKnownRequestError (ERR_UNKNOWN_FILE_EXTENSION): Unknown file extension ".wasm" for node_modules/.prisma/client/query_compiler_bg.wasm` |
| the identical query (`vendorConfig.findUnique`) through the script's own Node client | **PASS** |

The middle row fails while the last row succeeds **on the same query against the same database**. The
cause is structural and unreachable from the call site: `lib/db.ts` imports `PrismaClient` from
`@prisma/client/wasm`, which is mandatory on Workers, and Node cannot load that build's `.wasm` query
compiler. Any repository export routed through `lib/db` is therefore permanently unreachable from a
Node script.

The docstring's word "compliant" is wrong. Those 32 functions are the exact defect the rule exists to
prevent, and they skew heavily toward write and admin paths.

## Scope (this slice)

**1. Reconcile the two documents.** Rewrite `CLAUDE.md`'s repository-layer section and
`tests/repository-purity.test.ts`'s docstring so the rule is stated once, names its real enforcement,
and records the empirical finding above. `CLAUDE.md` already carries the lesson that "a rule that
names its own enforcement must be checked against that enforcement" — this slice is that lesson
firing a third time, and it should say so.

**2. Add the enforcement check.** A `getPrisma()`/`getPrismaWs()` **call expression** inside
`lib/repositories/*.ts` fails a test. Whole-file AST, no allowlist, error message naming the sibling
service to move the resolution into — the same posture as
`tests/repository-transaction-safety.test.ts` (#382), which is the closest precedent to copy.

Because slices 2 and 3 (#411, #412) are outstanding when this lands, the check is **scoped to the
files this slice has actually cleared**, by an explicit file list carrying a comment that names #409,
#411 and #412. This is a deliberate, temporary, tracked exception — not an allowlist of *functions*,
which the existing purity test's docstring correctly refuses ("would only ever be used to readmit the
defect"). #412 deletes the scoping.

**3. Convert six exports** to take their client explicitly:

| File | Function | Line | Resolves |
|---|---|---|---|
| `customers.ts` | `listCustomersForAdmin` | 75 | `getPrisma()` |
| `order-lookup-rate-limit.ts` | `checkOrderLookupRateLimit` | 29 | `getPrisma()` |
| `reports.ts` | `getCatalogueHealth` | 43 | `getPrisma()` |
| `reports.ts` | `getLoyaltyLiability` | 95 | `getPrisma()` |
| `discounts.ts` | `createCodeForVendor` | 343 | `getPrisma()` |
| `discounts.ts` | `deactivateCodeForVendor` | 350 | `getPrismaWs()` |

**4. Put the resolution in the service layer**, matching the established convention. Only
`app/api/health/route.ts` imports `@/lib/db` outside `lib/` today — pages, routes and server actions
reach the database through a repository or a service, never by resolving a client themselves. So the
six call sites move to service facades rather than calling `getPrisma()` inline.

`lib/discounts-service.ts` already exists. Three new siblings are needed: `lib/customers-service.ts`,
`lib/reports-service.ts`, `lib/order-lookup-rate-limit-service.ts`.

**5. Prove the restored property rather than asserting it.** A committed script exercises at least one
converted function against a real database with a Node-native client. #409's probe is the argument for
this: a hand-written assertion about this property was wrong for two years and nothing noticed.

### One deliberate departure from the existing service pattern

`lib/categories-service.ts` and `lib/discounts-service.ts` resolve **both** the client and the vendor
(`getCurrentVendorId()`). The new facades here resolve **only the client** and take `vendorId` as a
parameter, because every one of these six call sites already holds an authoritative `vendorId` —
`auth.vendorId` from `requireVendorRole` on the admin paths, and an already-resolved vendor on the
guest-lookup paths. Re-resolving it inside the facade would introduce a second source of truth for
something the caller established more strongly. This mirrors `lib/roles-service.ts`, which performs
the session check and passes the resulting actor down as data.

## Deliberately excluded

- **`categories.ts`, `loyalty.ts`, `vendor.ts`** — slice 2, #411 (12 functions).
- **`products.ts`** — slice 3, #412 (14 functions, four of which need both clients).
- **Removing the enforcement check's file scoping** — that is #412's completion criterion, and doing
  it here would ship a red test.
- **Changing `lib/db.ts`'s `@prisma/client/wasm` import.** Mandatory on Workers; it is the mechanism
  that makes the defect observable, not the defect.
- **Which client each function uses.** `deactivateCodeForVendor` keeps `getPrismaWs()` — its
  `updateMany` needs a transaction-capable adapter (#382). This slice moves *where* the client is
  resolved, never *which* one is chosen.
- **#390** (nominal/branded `getPrisma()` vs `getPrismaWs()` types) — complementary, separately
  tracked, and would make this class of bug type-checkable rather than AST-checkable.
- **`campaigns.ts`'s value import of `getPrisma`**, used only in `ReturnType<typeof getPrisma>` type
  positions. It is compliant; converting it to `import type` is cosmetic and is noted in #409 rather
  than done here.

## Open items carried forward

- **PR #393's promotion row.** `npm run sdd:audit` reports the `staging → main` promotion of the #382
  fix (merge `2baaaea`, 2026-08-27) as pending carry-forward. Under the carry-forward rule its
  roadmap row can only land on the next slice's branch — this one. Tracked as a requirement here so
  it is not lost again.
- Slices 2 and 3 remain open (#411, #412); the rule is not fully enforced until #412 lands.
