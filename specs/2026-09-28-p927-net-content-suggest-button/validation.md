# #927 — Staff button to run net-content suggestions (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests.
>
> - **Build:** did we build the component correctly? Unit tests cover the service wiring, the
>   message table and the action's guard.
> - **Validate:** does it work in the real system? The live rows below run under `npm run preview`
>   against **dev**, never `npm run dev`, which cannot load the WASM engine.

Live rows need:
- `npm run preview` running;
- the `.env`/`.dev.vars` database host checked to be `ep-dry-morning-zab7dx08` (dev) **before**
  starting;
- the Cloudflare AI credentials present in `.dev.vars`.

Sign in and invoke the server action with curl, using the `useActionState` / `$ACTION_*`
progressive-enhancement protocol described in `docs/developer-portal/local-dev-playbook.md`. The
same protocol is used for `#900`'s review actions. Read the database with a short `npx tsx` script
against dev's `DIRECT_URL`, or with Prisma Studio. Record every count before and after each live
row.

`demo-store-admin@example.com` (vendor ADMIN) and `demo-staff@example.com` (vendor STAFF) are the
roster in `scripts/demo-accounts.ts` (see `docs/developer-portal/env-setup.md`). If either is missing
on dev, create it with that script against dev only. Do not substitute a platform-admin account for
R13: that proves the platform-admin path, not the vendor-ADMIN one.

R13 and R14 spend real Workers AI neurons (≈50 per click, 150 at most), and their rows stay on dev.
Do not delete them afterwards: they are the evidence.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | A unit test imports both constants and asserts `10` and `150`. `grep -n '"use server"' lib/net-content-suggestions-service.ts` prints nothing. |
| R2  | Unit | Read the function's declared return type: exactly the four kinds named. `npm run typecheck` exits 0. |
| R3  | Unit | Test with `vi.mock`ed `getAiEnv` returning a model absent from `NET_CONTENT_MODEL_RATES`: the result is `unpriced-model` with that model, and the mocked `listEligibleProductsForNetContent` and suggester were called 0 times. |
| R4  | Unit | Test with the eligibility list mocked to `[]`: the result is `nothing-eligible`, and the mocked suggester was never called. Assert the list mock was called with `(anything, vendorId, { includeAttempted: false }, 10)`. |
| R5  | Unit | Test with one mocked product and the run loop mocked: assert it received `neuronBudget: 150`, the Gemma rate object, and the mocked vendor config's `storeDescription` (and `null` when config is `null`). Calling the passed `saveSuggestion` hits the mocked `createNetContentSuggestion` with the same `vendorId`. A loop returning `outcome: "not-configured"` yields `{ kind: "not-configured" }`, and `"budget-reached"` yields `{ kind: "ran", … }`. |
| R6  | Unit | One test per table row asserting the **exact** string and that the other field is `null`. Use `neurons: 49.9` to prove `Math.round` gives `about 50 neurons`. |
| R7  | Unit | The existing "valid `use server` module" pattern (as in `tests/product-image.test.ts`): import `features/admin/net-content-suggestions.ts` and assert every export is an `AsyncFunction`. `suggestNetContent` is among them. |
| R8  | Unit | Mock `requireVendorRole` to return `{ ok: false, status: 401 }`, then `403`: assert each exact error string, and that the mocked `runNetContentSuggestionsForVendor` was called 0 times. Assert `requireVendorRole` was called with exactly `("ADMIN")`. |
| R9  | Unit | Mock auth `{ ok: true, vendorId: "v1", … }` and a `FormData` carrying `vendorId=other`: assert the service was called with `"v1"`. `revalidatePath("/staff/net-content")` is called for a `ran` result and not for `nothing-eligible`. |
| R10 | Unit / Read | `grep -n 'alert(' components/staff/SuggestNetContentForm.tsx` prints nothing. Read the file: one form, `useActionState(suggestNetContent, …)`, both labels exact, `disabled={pending}`, `role="alert"` / `role="status"`. |
| R11 | E2E | `grep -c "after the suggestion script is run" "app/(admin)/staff/net-content/page.tsx"` prints `0`. Under preview, `curl` the page signed in as `demo-store-admin@example.com`: the HTML contains `Suggest net content`, and it appears **before** `Pilot summary` in the document. Staff-only view: see R15. |
| R12 | Read | Run the exact `git diff origin/staging -- …` command in R12. Output is empty. |
| R13 | E2E (dev) | Before: count Aheed `NetContentSuggestion` rows, and count Aheed products with `netContentAmount` not null. Invoke `suggestNetContent` once as `demo-store-admin@example.com` on `localhost:8787` (Aheed). After: the row count grows by `N` from the returned notice (1–10), and every new row's `vendorId` is Aheed's. The not-null product count is unchanged. |
| R14 | E2E (dev) | Record the set of productIds that had any row before this step. Invoke again. Every new row's `productId` is outside that set, and no `productId` has more than one row created by these two invocations. |
| R15 | E2E (dev) | Signed in as `demo-staff@example.com`, invoke `suggestNetContent`: the response carries `Only a store admin can ask the AI for suggestions.`, and the Aheed row count is unchanged. `curl` `/staff/net-content` as the same user: the HTML contains `A store admin can ask the AI for more suggestions.` and does not contain `Suggest net content`. |
| R16 | Read | `grep -c "this page has no button that asks the AI" docs/staff-playbook/staff-tabs-guide.md` prints `0`. Read the section for the three facts (button name, store admins only, at most 10). Front-matter `version` > `2.7.0`, and `updated` ≥ `2026-09-28`. |
| R17 | Read | `grep -n "suggestNetContent" specs/architecture.md` prints a line in the `#900` paragraph that also says `ADMIN`. `grep -n "CLOUDFLARE_API_TOKEN" docs/developer-portal/env-setup.md` shows a line in the net-content section mentioning the Worker. Both versions are bumped against `git show origin/staging:<file>`. |
| R18 | Gate | `npm run kms:validate` exits 0 with `invalid front-matter (failing): 0`. `npm run kms:build-index`, then `grep -c "p927-net-content-suggest-button/plan.md" ARTIFACT_INDEX.md` prints `1`. `npm run kms:check-generated` exits 0. `npm run kms:assemble:internal`, then `npx next build --webpack` inside `kms/site-internal` exits 0. |
| R19 | Gate | `grep -n "#927" CHANGELOG.md` shows an entry under `## [Unreleased]`. |
| R20 | Gate | `npm run lint`, `npm run typecheck` and `npm run format:check` each exit 0. Then, alone, with no build running: `npx vitest run` exits 0, and the file count matches the listed test files, so no file silently failed to start. **CI on the PR is ground truth.** |
