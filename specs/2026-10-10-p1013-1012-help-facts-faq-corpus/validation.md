# Help Centre exact facts + per-vendor approved-answer corpus (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Every feature should have appropriate **Unit** and **Integration** testing, followed by relevant validation testing. Broader testing mainly happens before release. However, testing is risk-based: features involving auth, payments, UI changes, performance-sensitive APIs, databases, or external dependencies require additional relevant testing earlier.

1. **Unit Testing** — *When needed:* Every feature. *Purpose:* Test isolated business logic, utilities, and components.
2. **Integration Testing** — *When needed:* Every feature. (Includes Contract testing). *Purpose:* Verify the component works with its immediate dependencies.
3. **System / End-to-End Testing** — *When needed:* For critical user journeys and validation testing.
4. **Regression & Acceptance Testing** — *When needed:* Mainly before release, or when changing core flows.
5. **Performance & Resilience Testing** — *When needed:* Mainly before release, or for performance-sensitive APIs.
6. **Security & Accessibility Testing** — *When needed:* Mainly before release, or earlier for auth, payments or UI changes.

---

## How to run the two vendors locally

Every DB-touching row below runs under **`npm run preview`**, never `npm run dev` — `next dev`
cannot load the WASM Prisma engine and silently renders an error state (`CLAUDE.md`). Start it once
and leave it up; when finished, kill the whole `node`/`workerd` chain or the next build fails with
`EBUSY`.

- **Aheed** (`loyaltyEnabled: true` in `prisma/seed.ts`): `http://localhost:8787`
- **SriMart** (`loyaltyEnabled: false`): `curl` to `http://127.0.0.1:8787` with
  `-H "Host: srimart.localhost:8787"` — **the port must be in the header**, matching the seeded
  `VendorDomain` row. `srimart.localhost` resolves in Chrome but not reliably for `curl`/Node on
  Windows, and a header without the port falls through to no vendor
  (`docs/developer-portal/local-dev-playbook.md`).

Run `npx vitest run` **alone** — beside or straight after a build its forks pool silently fails to
start workers and whole files never execute, sometimes still exiting 0.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1 | E2E | `npm run preview`, then `curl -s -m 25 -H "Host: srimart.localhost:8787" http://127.0.0.1:8787/help > srimart-help.html`. Confirm `grep -ciE "loyalty\|points can be redeemed\|earns you points" srimart-help.html` returns `0`. SriMart is the `loyaltyEnabled: false` vendor, so any hit is a failure. **R10 is a prerequisite for this row:** the page also renders `docs/shopper-help/shopping-guide.md` through `DocumentSectionRenderer`, so that document's "Loyalty Program (If Enabled)" block counts toward this grep and must be removed or gated too. |
| R2 | E2E | `curl -s -m 25 http://localhost:8787/help > aheed-help.html` (Aheed, loyalty on). Read Aheed's `pointsPerPoundEarned`, `pencePerPointRedeemed` and `minRedeemPoints` off `/staff/loyalty` (the `LoyaltyConfigForm` fields) and confirm each appears in `aheed-help.html` as rendered. Then change one of them on `/staff/loyalty`, reload `/help`, and confirm the page follows — a figure that does not move is a literal, which fails this row. |
| R3 | Integration | In `aheed-help.html` confirm the exact minimum appears as `formatPrice` renders it (Aheed seeds `1500` → `£15.00`). Then set that vendor's minimum order to `0` on `/staff/storefront`, reload `/help`, and confirm it states no minimum. Confirm `grep -c "minimum order value is required" "app/(storefront)/help/page.tsx"` returns `0`. Restore the seeded value. |
| R4 | Unit | `grep -nE "profile\.(deliveryFeePence\|minimumOrderPence\|freeDeliveryThresholdPence)" "app/(storefront)/help/page.tsx"` — every hit must be inside the argument list of a `resolveDeliveryRules(...)` call; any other read fails this row. Confirm `grep -c "resolveDeliveryRules" "app/(storefront)/help/page.tsx"` is at least `1`. |
| R5 | E2E | On `/staff/delivery-areas`, give one of Aheed's areas a `deliveryFeePence` override different from the vendor default. Reload `http://localhost:8787/help` and confirm the page now shows that area's `prefix` with its own figure **and** no longer presents a single fee as universal. Remove the override, reload, and confirm it returns to one figure. |
| R6 | E2E | Clear the free-delivery threshold on `/staff/storefront` (the `freeDeliveryThreshold` field, left empty = null), reload `/help`, and confirm the page says free delivery is not offered — and that `grep -ciE "free delivery on every order\|all orders qualify\|£0\.00" aheed-help.html` returns `0`. Then set it to `30.00` and confirm `£30.00` renders. Restore the seeded value. |
| R7 | E2E | With collection off for SriMart (seed default — confirm the `offerCollection` control on `/staff/storefront`), confirm `grep -ci "collect" srimart-help.html` returns `0`. Switch it on, reload, and confirm collection content appears. Switch it back off. |
| R8 | E2E | Confirm `aheed-help.html` lists Aheed's seeded `MK` prefix. Then, for a vendor with no `VendorDeliveryArea` rows (delete Aheed's temporarily on `/staff/delivery-areas`, or use a third vendor), confirm no area-list element renders at all — not an empty list and not a placeholder. Restore the rows. |
| R9 | Unit | `npx vitest run tests/<new-help-loyalty-gate>.test.*` exits 0. Then delete the `loyaltyEnabled` condition in the help page, re-run, and confirm the test **fails**; restore it and confirm it passes. A test that cannot fail does not satisfy this row. |
| R10 | Regression | `grep -nE "some stores\|may apply\|a certain amount\|If Enabled" docs/shopper-help/shopping-guide.md` returns no line that the page now answers exactly. Read the remaining document and confirm no sentence contradicts `/help` as rendered for Aheed or SriMart. |
| R11 | Unit | `grep -n "model VendorFaq" -A 20 prisma/schema.prisma` shows every field, both attributes and no `Json` column. `npm run db:generate` then `npm run typecheck` exits 0. |
| R12 | Integration | The new `prisma/migrations/<timestamp>_*/migration.sql` is committed, and `grep -n "DROP INDEX" prisma/migrations/<timestamp>_*/migration.sql` returns nothing (any trigram-index drop fails this row outright). Read the whole file before applying it, then `npx prisma migrate status` against `DIRECT_URL` reports no drift. |
| R13 | Unit | `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts` exits 0. Confirm `grep -n "^import type" lib/repositories/vendor-faqs.ts` shows the `@/lib/db` import is type-only. |
| R14 | Unit | `grep -nE "createMany\|updateMany\|items:\s*\{\s*create" lib/repositories/vendor-faqs.ts` returns nothing. Confirm every write is a singular `create`/`update` or a `deleteMany`. |
| R15 | Integration | Under `npm run preview` with both vendors seeded, call the update and delete paths with an `id` belonging to the other vendor (edit a hidden form field, or call the repository from `npx tsx` with the wrong `vendorId`). Both must affect **0** rows and neither may throw. Confirm the row still exists afterwards. |
| R16 | Unit | `grep -rn "lib/repositories/vendor-faqs" --include=*.ts --include=*.tsx app components features lib` shows imports only from `lib/vendor-faqs-service.ts`; no staff page, component or action imports the repository directly. |
| R17 | Unit | `head -1 features/admin/faqs.ts` is the `"use server"` directive, and `grep -nE "^export (const\|let\|var\|type\|interface\|function [^(]*[^)]\s*\{)" features/admin/faqs.ts` shows only `export async function` declarations. Confirm the form-state type and parsers are in `lib/faq-form.ts`. Then load `/staff/faqs` under `npm run preview` and submit the form once — a non-async export 500s at runtime while every static check stays green, so this row requires the real request. |
| R18 | Security | `npx vitest run tests/panel-refusal-coverage.test.ts` exits 0. Then sign in as a signed-in non-staff shopper (a seeded demo shopper account) and request `/staff/faqs`: confirm the `PanelRefusal` message renders, not a blank panel shell. |
| R19 | Unit | `npx vitest run tests/staff-nav-parity.test.ts tests/operator-doc-coverage.test.ts` exits 0, and `grep -rn "staff/faqs" components/staff/PanelNav.tsx "app/(admin)/staff/page.tsx" docs/store-admin-guide/admin-tabs-guide.md` returns a hit in all three files. |
| R20 | E2E | Under `npm run preview` as an Aheed admin: create two rows, edit one, reorder them via `sortOrder`, deactivate one, delete one — confirming each result on reload. Then repeat as SriMart (`Host: srimart.localhost:8787`) and confirm its editor lists only SriMart's rows and none of Aheed's. |
| R21 | E2E | With two active Aheed rows at `sortOrder` 0 and 1, confirm `http://localhost:8787/help` renders both in that order, and that deactivating both removes the whole FAQ section rather than leaving an empty heading. Confirm `grep -rniE "faq" prisma/seed.ts` returns nothing, and that no answer or question string appears as a default parameter anywhere in the diff. |
| R22 | Unit | `npx vitest run tests/vendor-neutral-copy.test.ts` exits 0. Separately, review the diff for any new default parameter carrying vendor copy — the test is a denylist of known strings and will not catch a new one. |
| R23 | Regression | `npm run kms:validate` exits 0; `npm run kms:build-index` followed by `npm run kms:check-generated` exits 0; `npm run kms:assemble:internal`, then `npx next build --webpack` in `kms/site-internal`, exits 0. `gates` never builds the docs site, so this cannot be inferred from CI. |
| R24 | Acceptance | `git diff origin/staging...HEAD -- CHANGELOG.md` shows an entry for this slice naming `#1013` and `#1012` (Gate 4). |
| R25 | Regression | `npm run lint`, `npm run typecheck`, `npx vitest run` (run alone), `npm run format:check` and `npm run build` all exit 0 after this slice. CI on the PR is ground truth, not local output. |
