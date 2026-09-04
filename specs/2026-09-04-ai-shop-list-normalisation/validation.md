# P2.6 slice 4 — AI Shop List normalisation over the existing matcher (validation)

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

## Before you start

**Credentials.** This slice's AI path needs `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in
`.dev.vars`. They were copied there from `secrets/staging.vars` at `/orient` on 2026-09-04. Confirm
with `grep -c '^CLOUDFLARE_' .dev.vars` — expect `2`. If it prints `0`, re-copy them with
`grep -E '^CLOUDFLARE_(ACCOUNT_ID|API_TOKEN)=' secrets/staging.vars >> .dev.vars`. `.dev.vars` is
gitignored and is read at Worker boot, so restart `npm run preview` after any edit to it.

**Runtime.** Live rows use `npm run preview`, never `npm run dev` — plain `next dev` cannot load
`@prisma/client/wasm` and silently renders an error state on every DB-touching route.

**Worker logs.** Several rows below read the local Worker's own log store rather than the preview
terminal, which interleaves dev-server noise and scrolls past what a submission just printed. Query
it with a POST to
`http://127.0.0.1:8787/cdn-cgi/local/explorer/api/local/observability/query` carrying a JSON body
whose `sql` key selects from the `logs` table.

**Stopping preview.** Killing the `npm run preview` task leaves orphaned `node.exe` and
`workerd.exe` children holding `.open-next/assets`; find them with
`Get-CimInstance Win32_Process -Filter "Name='node.exe' or Name='workerd.exe'"` and `taskkill /F`
each before the next build.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `npx tsc --noEmit` exits 0, and `grep -nE 'export (interface\|type) NormalisedItem\|export const MAX_AI_INPUT_CHARS\|export const NORMALISATION_MODEL\|export const NORMALISATION_TIMEOUT_MS' lib/list-normalisation.ts` prints four matches. Read the `NormalisedItem` declaration and confirm all five fields (`index`, `name`, `quantity`, `measure`, `brand`) are present with the stated types. |
| R2  | Unit | `npx vitest run tests/list-normalisation.test.ts` passes, including three named cases: a bare JSON array, an array wrapped in prose, and an array inside a fenced code block. |
| R3  | Unit | Same file: three named cases feeding invalid JSON, a JSON object, and an array of strings each assert a result deep-equal to `[]` and that the call does not throw. |
| R4  | Unit | Same file: cases asserting an item with `index` of `-1`, `99` against a 3-line list, `1.5`, and the string `"0"` are each dropped, and that two items both claiming `index` 0 yield one item equal to the first. |
| R5  | Unit | Same file: a case asserting an item whose `name` is three spaces is dropped, and a case asserting a 150-character `name` comes back with `length` 100. |
| R6  | Unit | `npx tsc --noEmit` exits 0 with no change to any existing `ParsedLine` construction site — confirm with `git diff origin/staging -- lib/shopping-list.ts` showing the two new optional fields added to the interface and no required field introduced. |
| R7  | Unit | Same test file: a case passing 4 parsed lines and items for indices 0 and 2 asserts the result has length 4 and that entries 1 and 3 are `toEqual` the input lines. |
| R8  | Unit | Same test file: cases asserting model quantities of `0`, `-3`, `NaN` and `1000` merge to `1`, `1`, `1` and `MAX_LINE_QUANTITY` respectively. |
| R9  | Unit | Same test file: a case merging an item with name `butter` and brand `Amul` asserts the resulting line's `terms` does not contain `amul`, and that `brand` is retained on the line. |
| R10 | Integration | `npx tsx scripts/verify-list-normalisation.ts` prints a parsed result and exits 0 in a shell with no `CLOUDFLARE_ACCOUNT_ID`, no `CLOUDFLARE_API_TOKEN` and no database reachable — proving the pure exports load in real Node. The script is committed under `scripts/`, matching `scripts/verify-repository-injection.ts`; do not place it at the repo root, where `next build` would type-check it and a scratch error would fail the whole build. |
| R11 | Unit | `grep -n 'export async function normaliseList' lib/list-normalisation.ts` prints one match; `npx tsc --noEmit` exits 0 with the call site in `features/cart/match-list.ts` passing `ParsedLine[]` and handling a `null` result. |
| R12 | Unit | Same test file: a case stubbing `globalThis.fetch` with a counter, calling `normaliseList` with 100 lines, and asserting the counter is exactly `1`. |
| R13 | Unit | Same test file: the stubbed `fetch` case asserts the request URL contains `/ai/run/@cf/meta/llama-3.1-8b-instruct` and that the `Authorization` header starts with `Bearer `. |
| R14 | Unit | Same test file: five cases — no account id, no api token, a stub returning `ok: false`, a stub returning unparseable text, and a stub that rejects — each assert `normaliseList` resolves to `null` and does not throw. |
| R15 | Performance & Resilience | Same test file: a case asserting `NORMALISATION_TIMEOUT_MS` is `6000`, and a case whose `fetch` stub returns a promise that never settles, asserting `normaliseList` resolves to `null` under vitest's default timeout rather than hanging. Confirm the stub received a `signal` property in its request init. |
| R16 | Integration | `git diff origin/staging -- wrangler.toml` prints nothing. |
| R17 | Unit | Same test file: a case asserting `MAX_AI_INPUT_CHARS` is `4000`, plus a case passing lines whose joined text exceeds 4000 characters asserting the `fetch` counter is `0` and the result is `null`. |
| R18 | Integration | `grep -n -A10 'model ListNormalisationAttempt' prisma/schema.prisma` shows all of `id`, `vendorId`, `vendor`, `ipHash`, `createdAt` and the `@@index([vendorId, ipHash, createdAt])` line. |
| R19 | Integration | Generate with `npx prisma migrate dev --create-only` and **read the generated SQL before applying it** — GAP-011 has proposed erroneous `DROP INDEX` against the three hand-authored `pg_trgm` indexes four times already, and the fourth executed against a dev database before being caught. Then `ls prisma/migrations/` shows the new directory and `grep -c 'DROP INDEX\|DROP TABLE' prisma/migrations/<dir>/migration.sql` prints `0`. |
| R20 | Integration | `npx vitest run tests/list-normalisation-rate-limit.test.ts` passes, asserting the exported signature takes `(prisma, vendorId, ip)`, that a 6th call inside the window is refused while the 5th is allowed, that the persisted `ipHash` is 64 hex characters and is not equal to the input IP, and that the window constant is `60000`. `grep -n 'deleteMany' lib/repositories/list-normalisation-rate-limit.ts` shows the retention sweep. |
| R21 | Unit | `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts` passes with the new repository file present, and `ls lib/list-normalisation-service.ts` exits 0. |
| R22 | Integration | Under `npm run preview` with `CLOUDFLARE_ACCOUNT_ID` commented out of `.dev.vars` and the Worker restarted, submit a list at `/shop-your-list`. Then count the table directly against the dev branch — a `tsx` script under `scripts/` running `prisma.listNormalisationAttempt.count()` — and confirm the count is unchanged from before the submission. Repeat with a submission whose text exceeds 4000 characters, credential restored, and confirm the count is again unchanged. |
| R23 | Integration | Query the Worker log store for `message like '%list-normalisation%'`. Confirm each deliberately-skipped submission above produced exactly one line carrying its reason, and that a normal submission with the credential present and a short list produced none. |
| R24 | E2E | Under `npm run preview`, submit the same list from one IP six times inside a minute. Confirm via the log store that the 6th logged the rate-limit skip reason, and confirm in the browser (or in the returned HTML) that the 6th submission still rendered a review step with matched lines rather than an error page. |
| R25 | Unit + E2E | `npx vitest run tests/shopping-list.test.ts` includes a case where a line carries `measure` `2kg` and every candidate name lacks `2kg`, asserting `resolution.kind` is `ambiguous`. Then live under `npm run preview`: paste `2kg atta` at `/shop-your-list`, submit, and confirm the rendered line offers a choice rather than a single resolved product. |
| R26 | Unit + E2E | Same test file: a case with `measure` `5kg` and a candidate named `Basmati Rice 5kg` asserts `resolution.kind` is `matched`. Live: paste `5kg basmati rice` at `/shop-your-list` and confirm it resolves to that product outright. |
| R27 | Security & Accessibility | `grep -n 'aria-label' components/cart/ShopYourList.tsx` shows an accessible name on the pack-size branch's `select`. Under `npm run preview`, fetch the review HTML for a `2kg atta` submission and confirm the pack-size wording differs from the ordinary `Which one did you mean?` string. Run `npx vitest run tests/a11y`. |
| R28 | Integration | Read `features/cart/match-list.ts` and `components/cart/ShopYourList.tsx`: confirm every value reaching a `ListCandidate` field comes from `repo.matchListTerms(...)`. `grep -n 'NormalisedItem' components/cart/ShopYourList.tsx` prints nothing — the component never sees model output as a product. |
| R29 | Integration | `grep -c 'matchListTerms' features/cart/match-list.ts` prints `1`, and `git diff origin/staging -- features/cart/add-list-to-cart.ts` prints nothing. |
| R30 | Regression | With `CLOUDFLARE_ACCOUNT_ID` commented out of `.dev.vars` and `npm run preview` restarted, paste the component's placeholder list at `/shop-your-list` and confirm the same resolutions as before this slice. `npx vitest run tests/shopping-list.test.ts` passes, and `git diff origin/staging -- tests/shopping-list.test.ts` shows additions only, with no pre-existing assertion modified. |
| R31 | Unit | `grep -nE '^export ' features/cart/match-list.ts` shows only `export async function` declarations. This is the `#159` trap — a same-file value export makes every action in the file 500 at runtime while build, typecheck and test all stay green — so also confirm a real submission succeeds under `npm run preview`. |
| R32 | Release | `git diff origin/staging -- CHANGELOG.md` shows this slice's entry under `[Unreleased]`. |
| R33 | Release | `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run kms:validate` and `npm run kms:check-generated` each exit 0. Run `npx vitest run` **alone**, with no build running and no orphaned `node.exe`/`workerd.exe` processes, and confirm the reported file and test totals exceed the pre-slice baseline rather than falling short of it — a shortfall, with or without `Failed to start forks worker` in the output, is a non-result to re-run, not a pass. Record the new totals for `CLAUDE.md` (`#584`). CI on Linux is the authority. |
