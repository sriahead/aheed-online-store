# AI budget save, unique note ids and honest reference drift (requirements / acceptance criteria)

This slice closes `#1161`, `#1162` and the repository half of `#1119`. It builds on
`specs/2026-10-19-p1135-custom-notes-ai-allowance/`, where the first two were found. In one line:
the AI budget save refuses cleanly instead of throwing when a vendor has no `VendorConfig` row; each
basket note input gets a document-unique id; and `/api/health` reports `reference.drift` as `null`,
not `false`, whenever no source was compared. The Ship checklist reads `reachable` and `sources`
instead. `plan.md` explains why `#1161` does **not** use `upsert`, although the Gate 1 proposal
said it would. No migration, no new secret, no owner action.

**#1161: AI budget save**

R1. `setVendorAiDailyBudget(prisma, vendorId, budgetNeurons)` in `lib/repositories/ai-usage.ts`
    returns `Promise<boolean>`. When `prisma.vendorConfig.findUnique({ where: { vendorId } })`
    returns `null`, it makes no write call and returns `false`. Otherwise it calls
    `prisma.vendorConfig.update` exactly once, with `where: { vendorId }` and
    `data: { aiDailyNeuronBudget: budgetNeurons }`, and returns `true`.
R2. The function body of `setVendorAiDailyBudget` contains no call to `upsert`, `create`,
    `updateMany` or `createMany`, and the function still takes its client as a parameter.
    (`tests/repository-purity.test.ts` and `tests/repository-client-injection.test.ts` stay green
    under R14.)
R3. `setAiDailyBudgetForVendor` in `lib/ai-usage-service.ts` returns the repository's boolean
    (`Promise<boolean>`) and still uses `getPrisma()`, not `getPrismaWs()`.
R4. `saveAiBudget` in `features/admin/ai-budget.ts` behaves as follows. When the write returns
    `false`, it returns `{ error: <non-empty string>, saved: false }` and does not call
    `revalidatePath`. When the write returns `true`, it returns `{ error: null, saved: true }` and
    calls `revalidatePath("/staff/ai-usage")`, unchanged from today. The error string names no
    vendor, store brand or product. The file still exports only async functions.
R5. Under `npm run preview` against the dev database, a platform admin (`demo-admin@example.com`)
    saving a new budget on `/staff/ai-usage` for a vendor that has a `VendorConfig` row still saves.
    The page then shows the new budget, and the form shows no error.

**#1162: unique note-input ids**

R6. `components/cart/CartLineNote.tsx` no longer builds the input id from the product id alone: the
    file contains no template literal or string that evaluates to `cart-note-` followed only by
    `line.productId`.
R7. When two `CartLineNote` elements for the same editable line (`acceptsNote: true`) are rendered
    into one document, the two `input[name="note"]` elements have different `id` values. Each
    `<label>`'s `htmlFor` equals the `id` of the input inside that same `<form>`.
R8. Under `npm run preview`, with one basket line whose product takes notes, opening the header
    basket drawer on `/cart` leaves the document with exactly two `input[name="note"]` elements, and
    their two `id` values differ. Label pairing is R7's, proven in the component test, because the
    browser verifier reports input ids but not labels.

**#1119: honest reference drift**

R9. In `lib/reference/reference-status-service.ts`, `ReferenceStatus.drift` is typed
    `boolean | null`, and `getReferenceStatus()` returns `drift: null` whenever `sources` is empty.
    That covers four cases: unconfigured, unreachable, schema absent, and reachable with zero
    datasets. When `sources` is non-empty, `drift` is the same boolean as today: `true` if any
    source has a missing or unsupported area, otherwise `false`. The `drift` field's doc comment
    states that `null` means nothing was compared.
R10. `getReferenceStatus()` still resolves rather than rejects in every failure mode, and
    `app/api/health/route.ts` still returns HTTP 200 with `status: "ok"` when the reference
    database is unreachable. The route's reference handling is unchanged by this slice.
R11. The Ship stage states the post-deploy health assertion in both `specs/sdd-workflow.md` (Ship
    section) and `.claude/commands/ship.md` (step 7). The assertion is: `reference.reachable` is
    `true` and `reference.sources` is non-empty. Each file says, in the same bullet or numbered step
    as that assertion, that `drift` being `false` is not evidence of health.

**Carry-forward**

R12. `specs/roadmap.md`'s change log has a row citing PR #1164 (merge `943efa0`), and
    `npm run sdd:audit` no longer prints `PR #1164` with `row pending carry-forward`.

**Gates**

R13. `CHANGELOG.md` updated (Gate 4).
R14. `lint`, `typecheck`, `test` (`npx vitest run`, run alone), `format:check` and `kms:validate` all
    exit 0 after this slice. `npm run kms:assemble:internal` followed by a real Next build in
    `kms/site-internal` also exits 0, because this slice edits `specs/`.
