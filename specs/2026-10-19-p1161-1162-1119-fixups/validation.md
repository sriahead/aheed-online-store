# AI budget save, unique note ids and honest reference drift (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Every feature should have appropriate **Unit** and **Integration** testing, followed by relevant validation testing. Broader testing mainly happens before release. However, testing is risk-based: features involving auth, payments, UI changes, performance-sensitive APIs, databases, or external dependencies require additional relevant testing earlier.

1. **Unit Testing**
   - *When needed:* Every feature.
   - *Purpose:* Test isolated business logic, utilities, and components.
2. **Integration Testing**
   - *When needed:* Every feature. (Includes Contract testing).
   - *Purpose:* Verify the component works with its immediate dependencies (e.g., database, external services).
3. **System / End-to-End Testing**
   - *When needed:* For critical user journeys and validation testing.
   - *Purpose:* Validate that the feature works correctly in the real system.
4. **Regression & Acceptance Testing**
   - *When needed:* Mainly before release, or when changing core flows. (Includes Smoke and Sanity testing).
   - *Purpose:* Ensure existing functionality remains unbroken and acceptance criteria are met.
5. **Performance & Resilience Testing**
   - *When needed:* Mainly before release, or for performance-sensitive APIs. (Includes Load, Stress, and Spike testing).
   - *Purpose:* Ensure the system meets throughput/latency targets and degrades gracefully.
6. **Security & Accessibility Testing**
   - *When needed:* Mainly before release, or earlier for features involving auth, payments, or UI changes.
   - *Purpose:* Ensure the system is safe and accessible to all users.

---

## Before the live rows (R5, R8)

- **Database target.** Run `printenv DIRECT_URL DATABASE_URL`. This session's environment has
  exported the **production** `DIRECT_URL` before (`#1134`, `#1135`, and again at this slice's
  Orient). If either is set, start preview as `env -u DIRECT_URL -u DATABASE_URL npm run preview`.
  `.dev.vars` must name dev (`ep-dry-morning-zab7dx08`). No Prisma CLI command is needed for this
  slice.
- **Preview.** `npm run build`, then `npm run preview`, served on `localhost:8787`. Kill every
  `node`/`workerd` process afterwards (CLAUDE.md, Windows shell).
- **R8 needs a product that takes notes on dev.** As `demo-admin@example.com`, open
  `/staff/categories`, edit one Aheed category, and tick its item-note checkbox
  (`allowsCustomNote`). Record the category's original state and restore it at the end. Use that
  category's storefront path as `--path` below, so the first card's product takes notes.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `npx vitest run` on the test file covering `setVendorAiDailyBudget` (Build names it in `build-notes.md`) passes. It contains one case where `findUnique` resolves `null`, asserting the result is `false` and `update` was never called. It contains one case where `findUnique` resolves a row, asserting the result is `true` and `update` was called once with `{ where: { vendorId }, data: { aiDailyNeuronBudget } }`. |
| R2  | Unit | `graft skeleton lib/repositories/ai-usage.ts` gives the span of `setVendorAiDailyBudget`. Read that span: it contains no `upsert`, `create`, `updateMany` or `createMany` call, and its first parameter is the client. `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts` passes. |
| R3  | Unit | Read `setAiDailyBudgetForVendor` in `lib/ai-usage-service.ts`: its return type is `Promise<boolean>`, it returns the repository call's result, and it passes `getPrisma()`. `npm run typecheck` exits 0 (R14). |
| R4  | Unit | `npx vitest run tests/ai-budget-and-note-actions.test.ts` passes, and contains two cases. When the service resolves `false`: the state is `{ saved: false }` with a non-empty `error`, and `revalidatePath` is not called. When it resolves `true`: the state is `{ error: null, saved: true }` and `revalidatePath` is called with `"/staff/ai-usage"`. Read the error string: it names no vendor, brand or product. `grep -n "^export" features/admin/ai-budget.ts \| grep -v ":export async function"` prints nothing. |
| R5  | E2E | Under preview, sign in as `demo-admin@example.com` (local sign-in recipe: `docs/developer-portal/local-dev-playbook.md`). On Aheed's `/staff/ai-usage`, note the current budget, save a different whole number, and reload: the budget line shows the new value and no error text is shown. Then save the original value back. |
| R6  | Unit | `grep -n 'cart-note-${line.productId}' components/cart/CartLineNote.tsx` prints nothing. Read the file: the input `id` is not computed from `line.productId` alone. |
| R7  | Unit | `npx vitest run tests/cart-line-note.test.tsx` passes, and contains a case rendering two `CartLineNote` elements for the same `acceptsNote: true` line into one document. That case asserts the two `input[name="note"]` ids differ, and that each `label`'s `htmlFor` equals the id of the input in the same `form`. |
| R8  | E2E | Under preview (see "Before the live rows"): `npx tsx scripts/verify-mobile-layout.ts --base http://localhost:8787 --path <note-taking category path> --widths 390 --add-first --then /cart --open-cart`. In the printed object's `formInputs`, exactly two entries have `name: "note"`, and their `id` values are both non-null and different. |
| R9  | Unit | `npx vitest run tests/reference-status-service.test.ts` passes. The cases for unconfigured, unreachable and schema-absent assert `drift` is `null` (`toBeNull()`), not `false`. A new case where the database is reachable and `listDatasetStatuses` resolves `[]` asserts `reachable: true`, `sources: []` and `drift: null`. The existing reachable cases with sources still assert `true`/`false`. Read the `drift` field's doc comment in `lib/reference/reference-status-service.ts`: it says `null` means nothing was compared. |
| R10 | Integration | `git diff origin/staging -- app/api/health/route.ts` prints nothing. The R9 test file's "resolves rather than rejects" cases pass. Under preview, `curl -s -o /dev/null -w "%{http_code}" localhost:8787/api/health` prints `200`, and the body's `status` is `"ok"`. |
| R11 | Unit | Read the Ship section of `specs/sdd-workflow.md` and step 7 of `.claude/commands/ship.md`. Each one, within the same bullet or numbered step, names `reference.reachable` being `true` and `reference.sources` being non-empty as the health assertion, and says `drift` being `false` is not evidence of health. (Same bullet, not the same physical line: both files hard-wrap.) |
| R12 | Unit | `grep -n "PR #1164" specs/roadmap.md` prints a change-log row naming merge `943efa0`. `npm run sdd:audit` output contains no line matching `PR #1164.*pending`. |
| R13 | Unit | `git diff origin/staging -- CHANGELOG.md` shows an entry citing `#1161`, `#1162` and `#1119`. |
| R14 | Regression | `npm run lint`, `npm run typecheck`, `npm run format:check` and `npm run kms:validate` each exit 0. `npx vitest run`, run on its own, exits 0 with no file reported as failing to start. Then run `npm run kms:assemble:internal && (cd kms/site-internal && npx next build --webpack)` and check its real exit status, not piped through `tail`: it is 0. CI's `gates` run on the PR is green. |
