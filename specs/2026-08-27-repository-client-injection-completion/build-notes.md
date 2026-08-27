# Repository client injection — completion, slices 2+3 (build notes)

Delivers **#411** and **#412** as one slice, completing **#409**. Branch
`feature/409bc-repository-client-injection-completion`, cut from `origin/staging`. **Built in the
main checkout, not a sub-agent worktree** — `git worktree list` shows only
`E:/GitRepositories/aheed-online-store`.

Also carries **#415** (Worker `cpu_ms` raise), bundled by explicit decision at `/propose` rather than
run as its own loop.

## What changed and why

The enforcement that slice 1 (#410) built could only cover four of the eight non-compliant files,
because the other four were still broken. It shipped with a `FILES_IN_SCOPE` list and a tracked end
date. **That list is now deleted**: `tests/repository-client-injection.test.ts` enumerates
`lib/repositories/` from the filesystem and checks every `.ts` file it finds, so a newly added
repository file is covered the moment it exists. Closing that window is the reason the two remaining
slices were merged into one — it was slice 1's own declared weakness, and two more loops would have
kept it open for two more loops.

**26 exports converted**, each now taking its Prisma client as a parameter with the resolution moved
to the sibling service:

| File | Exports | Service |
|---|---|---|
| `categories.ts` | 4 | `lib/categories-service.ts` |
| `loyalty.ts` | 3 | `lib/loyalty-service.ts` |
| `vendor.ts` | 5 | `lib/vendor-service.ts` |
| `products.ts` | 14 | `lib/products-service.ts` |

No new service files — all four already existed. All four repository modules now import `@/lib/db`
with `import type`, so none of them pulls the WASM client into a Node process at all.

**Three dead Prisma clients were found and removed, and this is the finding most worth carrying
forward.** `updateProductForVendor`, `setPrimaryProductImage` and `quickUpdateInventory` each opened
with `const prisma = getPrisma();` and then **never read it** — every statement in each body runs on
the interactive-transaction client. So each admin product update, primary-image set and quick stock
change was constructing an HTTP-adapter `PrismaClient` and discarding it.

The waste is small; the diagnostic damage was not. Because those three *appeared* to reference both
clients, #409's plan recorded `products.ts` as "14 functions, four of which need both clients", and
that number was carried into #411's body, #412's body, and this slice's own `requirements.md` before
anyone read the function bodies. **No `products.ts` export needs two clients.** `eslint.config.mjs`
enables no `no-unused-vars` rule of any kind — verified empirically with a throwaway file, not by
reading the config — and `tsconfig.json` does not set `noUnusedLocals`, so nothing in
`lint`/`typecheck`/`test` reports an assigned-and-never-read variable. Filed as **#416**.

**Two test files got simpler rather than more complex**, which is the restored property demonstrating
itself:

- `tests/vendor-profile.test.ts` no longer needs `vi.mock("@/lib/db")` plus a dynamic
  `await import()` to sequence the mock. It passes a stub client in as an argument.
- `tests/order-confirmation-email.test.ts` and `tests/order-status-email.test.ts` still mock, but the
  target moved from `@/lib/repositories/vendor` to `@/lib/vendor-service` — mocking the repository no
  longer intercepts anything, because the repository no longer loads `lib/db`. Both suites had been
  *failing to load* before that change was made; the suite went 695 → 709 passing tests as a result,
  which is those two files' 14 tests, not new coverage.

`scripts/verify-repository-injection.ts` was extended from slice 1's five read-only checks to
**fourteen checks covering reads and writes across all four files**, including the WebSocket
`$transaction` path, with cleanup verified by re-count rather than assumed.

Persistent docs updated on this branch: `CLAUDE.md` (repository-layer section — unscoped
enforcement, the name-preserving conversion pattern, the aliased-import hazard, the fourth false
docstring, the dead-client/`no-unused-vars` finding) and `specs/architecture.md` 1.21.0 → 1.21.1 (the
`lib/repositories/vendor.ts` sentence now names the client half of the rule).

## Decisions taken during the build

- **Service entry points keep the repository functions' NAMES.** Each service imports the original
  under a `…Repo` alias and re-exports a same-named wrapper, so all 29 call sites changed only their
  import path. Slice 1 renamed instead (`listCustomersForAdmin` → `listCustomersForVendor`), which is
  fine for one function and wrong for 26: a rename is the mistake most likely to go unnoticed at this
  volume, and several call sites import a *type* from the repository alongside the value, so the two
  imports have to split cleanly. Rejected the alternative of renaming everything for consistency with
  slice 1 — consistency with a one-function precedent is not worth 26 opportunities to typo.
- **`vendorId` stays a parameter on every new entry point**, not resolved via `getCurrentVendorId()`.
  Every caller already holds an authoritative one from `requireVendorRole` (staff pages) or
  `order.vendorId` (the two email paths). The pre-existing `getXRepository()` factories and
  `getCurrentVendorProfile` keep resolving it, because their callers genuinely don't know it — that
  split is now explicit in `requirements.md` R16 so a validator doesn't read it as an inconsistency.
- **`DbWs` type aliases** were added to `products.ts` and `loyalty.ts` beside the existing `Db`, with
  a comment saying they are structurally identical today and that #390 tracks making them nominally
  distinct. The parameter NAME (`prismaWs` vs `prisma`) is currently the only signal a reader gets;
  the compiler will not stop you passing the wrong client.
- **`VendorStorefrontConfigInput` lives in `lib/repositories/vendor.ts`, not in the action.**
  `features/admin/storefront.ts` is a `"use server"` file and may export only async functions, so the
  type could not be defined there and exported. The action imports it with `import type`.
- **The eight `brand*` fields are now iterated from a `BRAND_FIELDS` tuple** rather than eight
  hand-written `if (data.brandX) updates.brandX = data.brandX;` lines. That was the concrete risk the
  `data: any` was hiding: a typo in one of those sixteen identifiers would have silently stopped
  writing that one colour, with nothing to catch it.
- **The live script now refuses to run against staging or production**, rather than printing the host
  and trusting a human to read it. Slice 1's script only ever read; this one creates a product, and
  `CLAUDE.md` records `.env` and `.dev.vars` agreeing on production once while every surrounding
  value looked like staging. The guard runs before any client is constructed, compares normalised
  hosts (stripping Neon's `-pooler` suffix so pooled and direct URLs for one project compare equal),
  and **refuses if neither `secrets/*.vars` file can be read** — "cannot verify" must not mean
  "proceed". There is deliberately no override flag.
- **`kms/site-internal/next-env.d.ts` was reverted, not committed.** Running `next build` in that
  directory rewrites it (`.next/dev/types/…` → `.next/types/…`) and running the dev server rewrites
  it back. It is a generated artifact unrelated to this slice.

## Deviations from the spec

**One, and it corrected a requirement rather than the code.**

`requirements.md` R12 originally required `updateProductForVendor`, `setPrimaryProductImage` and
`quickUpdateInventory` to declare **two** Prisma client parameters, "matching the shape
`applyVendorRole` uses". Measured against the file during Build, all three constructed an HTTP client
they never read (see *What changed and why*), so there was no dual-client function to preserve —
building to the requirement as written would have added a parameter that nothing uses.

R12 was rewritten to require the opposite — that **no** `products.ts` export declares two client
parameters — and R13 was rewritten to enumerate which seven take a WebSocket client and which seven
take an HTTP one. The requirement text names the correction, and `validation.md`'s R12 row tells a
fresh validator how to confirm it independently from `git show origin/staging:` rather than trusting
this file.

No scope was added. `campaigns.ts`'s `import type` narrowing and the `data: any` typing were both in
`plan.md`'s scope list before Build started. The `no-unused-vars` gap and the pointless
`try { … } catch (e) { throw e }` in `quickUpdateInventory` were both noticed and **not** fixed —
they are recorded on #416 instead.

## Known-shaky areas

- **`validation.md`'s R23 is the row most likely to surface a real defect, and the only one that
  looks past signatures.** Everything else checks shape; R23 asks whether any conversion changed a
  `where`, `select`, `orderBy` or return type. 26 functions were edited by hand. `typecheck` and 709
  tests pass, but neither would catch a subtly altered `where` clause on an admin read. Budget time
  for reading that diff.
- **No staff page was opened in a browser.** `typecheck` and `build` prove every call site resolves,
  and the live script proves the underlying functions run against real Postgres, but
  `/staff/products`, `/staff/inventory`, `/staff/categories`, `/staff/loyalty` and `/staff/storefront`
  were not rendered. `/staff/storefront` is the one to open if only one is: it is the sole caller of
  `getVendorConfig`, `getVendorBranding` and — through the alias that a name-based grep missed —
  `updateVendorStorefrontConfig`.
- **`updateVendorStorefrontConfig` has exactly one call site and it was found only by symbol sweep.**
  `features/admin/storefront.ts` imported it as `updateConfigRepo`. It is the single aliased
  repository import in the tree (swept, not assumed), but it is also the change least covered by
  tests — there is no unit test for the storefront config action.
- **The live script writes to whatever `.env` points at.** On this machine that is
  `ep-sparkling-paper` (the dev branch), confirmed by host against both `secrets/*.vars` files before
  running. The refusal guard was exercised deliberately — pointed at the staging host with a
  deliberately wrong password, it exited 1 before constructing a client — but the guard's *correct*
  path has only ever been exercised against one dev host.
- **#415's `cpu_ms = 300` is unverified in the only environment that matters.** `deploy-staging` runs
  on merge, so R33/R34 are marked deferred-to-Ship in `validation.md` rather than checkable at
  `/validate`. If 1102s recur after promotion, that reopens #415 — it does not retroactively fail
  this slice. The value is also a judgement call: 300 was picked from #415's suggested 200–300 band,
  and Workers bills CPU actually used rather than the ceiling, so the raise carries no cost on its
  own.
- **Two `as never` casts per call in the live script** (inherited from slice 1's shape). They exist
  because the script's Node-native client is not the same nominal type as `ReturnType<typeof
  getPrisma>`. They mean the script would still compile if a signature changed underneath it — the
  script's own PASS/FAIL output, not `typecheck`, is what proves it is calling these correctly.
