# P9.2 — Admin panel operability, category hierarchy and report drill-down (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
>
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Preconditions for the live rows

- **Use `npm run preview`, never `npm run dev`** — every live row below touches Prisma, and plain
  `next dev` cannot load `@prisma/client/wasm`, so a DB-touching route silently renders an error
  state with no crash (`CLAUDE.md`, Database).
- Before starting, kill any orphaned preview processes:
  `Get-CimInstance Win32_Process -Filter "Name='node.exe' or Name='workerd.exe'"` and `taskkill /F
  /PID <id>` for any matching this repo path plus `wrangler dev`. A leftover `workerd.exe` fails the
  next build with `EBUSY ... rmdir '.open-next\assets'`.
- **Confirm which database you are pointed at before any live write.** Diff `.env` and `.dev.vars`
  against `secrets/staging.vars` and `secrets/production.vars`; both local files agreeing is not
  evidence they are right (`CLAUDE.md`, Config). These rows expect the **dev** Neon branch.
- Sign-in accounts come from `scripts/demo-accounts.ts`: `demo-store-admin@example.com` (vendor
  ADMIN on Aheed), `demo-staff@example.com` (vendor STAFF), `demo-customer@example.com` (no panel
  access), `demo-srimart-admin@example.com` (vendor ADMIN on **SriMart**). The password is whatever
  `DEMO_ACCOUNT_PASSWORD` was set to when they were created — read it from your own environment; do
  not record it here.
- **When grepping rendered HTML for a literal containing `&`, `<`, `>`, `"` or `'`, grep the
  HTML-escaped form.** `#633`'s validation lost time to exactly this: the spec's own example command
  printed `0` for both the positive and negative case because React renders `&` as `&amp;`.
- **Restore any row you change.** Rows R25–R28 write real `VendorConfig` values; record the
  originals first (`deliveryFeePence`, `freeDeliveryThresholdPence`, `minimumOrderPence`) and put
  them back afterwards.

---

## Validation Steps

| Req  | Testing Area | How to verify |
|------|--------------|---------------|
| R1   | Integration  | `git diff --stat $(git merge-base origin/staging HEAD)..HEAD -- docs/research/discovery-log.md` shows at least 300 added lines, and `grep -c '^### 2026-09-06' docs/research/discovery-log.md` returns a non-zero count. |
| R2   | Regression   | For each of `#625 #626 #629`, `grep -n "625\|626\|629" docs/research/discovery-log.md` shows a resolution line citing `#633`; for each of `#627 #628 #630 #631`, a resolution line citing this slice. Read the 2026-09-06 section top to bottom and confirm no finding still reads as open when its issue is closed (`gh issue view <n> --json state`). |
| R3   | Unit         | `npm run kms:check-generated` exits 0. `npm run kms:validate` exits 0 and reports `invalid front-matter (failing): 0`. |
| R4   | Unit         | `npx vitest run tests/category-ordering.test.ts` passes the contiguity assertion — for every returned parent row, the rows immediately following it are exactly its own children. |
| R5   | Unit         | Same test file: assertions that top-level rows ascend by `(sortOrder, name)` and each parent's children ascend by `(sortOrder, name)`. |
| R6   | Unit         | Same test file: a fixture row whose `parentId` names an id absent from the input still appears exactly once in the output; input length equals output length. |
| R7   | Unit         | `npx vitest run tests/category-ordering.test.ts` exits 0, and the fixture in that file has every top-level row at `sortOrder: 0`, at least one childless department, and at least one child at `sortOrder: 0`. Confirm by reading the fixture. |
| R8   | E2E          | Under `npm run preview`, signed in as `demo-store-admin@example.com`, fetch `/staff/products/new` and confirm the saved HTML contains one `<optgroup` per top-level category, each with a `label` attribute carrying that category's name. |
| R9   | E2E          | In the same HTML, for one known department confirm the first `<option` inside its `optgroup` carries that department's own id as `value`, followed by its children's options. Cross-check the ids against `/staff/categories`. |
| R10  | E2E          | Count distinct `option value="..."` entries in the `categoryId` select and confirm the count equals the number of rows `/staff/categories` lists. No category is missing. |
| R11  | E2E          | Pick a product the seed assigned directly to a top-level category (`seedGeneratedCatalogue` uses subcategories, so use a hand-curated one), open `/staff/products/<id>`, and confirm the department's own option carries `selected`. |
| R12  | Unit         | `grep -n 'revenue' lib/staff-orders-query.ts` shows an exported sentinel constant whose value is the string `revenue`. |
| R13  | Unit         | `npx vitest run tests/staff-orders-query.test.ts` includes a passing case asserting `parseStaffOrdersQuery({ status: "revenue" })` returns `statuses` equal to `REVENUE_STATUSES` and `status === "revenue"`. |
| R14  | Regression   | Same test file: the pre-existing cases for absent, blank, unrecognised and `all` statuses still pass unmodified. `git diff origin/staging -- tests/staff-orders-query.test.ts` shows additions only, no changed assertions. |
| R15  | E2E          | Under `npm run preview` as `demo-store-admin@example.com`, fetch `/staff/reports` and confirm the HTML contains one breakdown row per member of `REVENUE_STATUSES` (`CONFIRMED`, `OUT_FOR_DELIVERY`, `DELIVERED`), each with a count. |
| R16  | E2E          | From the same fetched HTML, add the three breakdown counts and confirm the sum equals the Total Orders tile value on that same page. This is the row `#628` exists for — a mismatch is a fail, not a rounding note. |
| R17  | E2E          | In the same HTML, confirm the Total Orders tile is wrapped in an anchor whose `href` is exactly `/staff/orders?status=revenue`. |
| R18  | E2E          | In the same HTML, confirm each breakdown row links to `/staff/orders?status=CONFIRMED`, `...=OUT_FOR_DELIVERY` and `...=DELIVERED` respectively. |
| R19  | E2E          | `curl` `/staff/orders?status=revenue` with the store-admin cookie: HTTP 200, and every order status rendered is one of the three revenue statuses. Cross-check the row count against R16's Total Orders figure. |
| R20  | Integration  | Read the new repository function in `lib/repositories/orders.ts`: it issues exactly one `prisma.order.groupBy` with `where: { vendorId, status: { in: [...REVENUE_STATUSES] } }`. Confirm no loop of `count` calls and no widened status set. |
| R21  | Unit         | `grep -rnE '\[#[0-9a-fA-F]{3,8}\]' --include=*.tsx "app/(admin)/" components/staff/` returns no matches (exit 1). This covers all four named files at once; a non-empty result names the offender. |
| R22  | Integration  | Confirm the replacement classes are `text-action`, `bg-action-tint`, `bg-surface-muted` and `text-danger`, and that `grep -n 'color-action\|color-surface-muted\|color-danger' lib/vendor-theme.ts` shows all four in `brandStyle()`'s returned object. |
| R22b | E2E          | Under `npm run preview` as `demo-store-admin@example.com`, save `/staff/inventory`'s HTML. `grep -E '#(2e7d32\|e8f5e9\|c8e6c9\|f5f5f0)' inventory.html` returns no matches. In the same file, confirm the wrapper `div` carries an inline `style` declaring `--color-action` and `--color-surface-muted` — that is `brandStyle()` supplying them, which is what makes the page follow whichever vendor resolved. |
| R22c | E2E          | Attempt the second-vendor render: sign in as `demo-srimart-admin@example.com` and fetch `/staff/inventory` under SriMart's host, confirming SriMart's primitives (blue/purple/red) appear in the wrapper's inline style. **If Better Auth refuses the origin** — replaying an Aheed session under a spoofed `Host` is rejected, and a fresh sign-in under a local alias is refused by `trustedOrigins` (both confirmed at `#454`) — record R22c as **not exercised** with that reason in `build-notes.md`. Do **not** mark it passed from R22b's evidence, and do not spoof around it. |
| R23  | Unit         | `npx vitest run tests/panel-token-purity.test.ts` exits 0. Then verify it actually bites: temporarily add `className="bg-[#123456]"` to a file under `components/staff/`, re-run, watch it fail, and revert. A guard test never seen failing is not a verified guard. |
| R24  | E2E          | Under `npm run preview` as `demo-store-admin@example.com`, fetch `/staff/storefront` and confirm three inputs are present for delivery fee, free-delivery threshold and minimum order, each `value`/`defaultValue` matching the current `VendorConfig` row converted to pounds. |
| R25  | E2E          | Submit the form with new valid values (the form is a client component calling a bound server action, so drive it with the `Next-Action` header technique in `CLAUDE.md`, or a browser). Then query the dev DB and confirm all three columns hold the expected integer pence. |
| R26  | E2E          | Submit `-1`, then `abc`, then `1.234` for the delivery fee. Each returns HTTP 200 with a visible error message in the response, and a follow-up DB query shows all three columns unchanged from before the submission. |
| R27  | E2E          | Submit a blank free-delivery threshold; confirm `freeDeliveryThresholdPence IS NULL` in the DB. Then submit `0`; confirm it stores integer `0`, not NULL. The two must be distinguishable. |
| R28  | Security     | Signed in as `demo-store-admin@example.com` (Aheed), submit the action with a forged vendor identifier if the payload carries one; confirm SriMart's `VendorConfig` row is unchanged. If the payload carries no vendor field, record that the action resolves the vendor from the session only and that this is structural — quote the line from `features/admin/storefront.ts`. |
| R29  | Unit         | `npx vitest run tests/operator-doc-coverage.test.ts` exits 0, and `docs/store-admin-guide/admin-tabs-guide.md`'s Storefront section's "What you can do" names delivery fee, free-delivery threshold and minimum order. |
| R30  | Security     | Signed in as `demo-customer@example.com`, fetch `/staff/storefront`: the response body contains the `PanelRefusal` copy (a "Store admins only"-style title), not an empty content area. Signed out entirely, confirm it redirects to `/login`. |
| R31  | Regression   | `git diff origin/staging -- CHANGELOG.md` is non-empty and describes this slice under `[Unreleased]`. |
| R32  | Release      | Run each alone, not concurrently with a build: `npm run lint`, `npm run typecheck`, `npm run format:check`, `npx vitest run` — all exit 0. **Read vitest's file/test totals**, not just the exit code: at least 102 files, and treat any shortfall against the `CLAUDE.md` baseline as a non-result to re-run (the forks-pool trap reports missing files as errors while still exiting 0). Record the new totals for `CLAUDE.md`. |

<!--
  R16 is the load-bearing row for #628 and R23 for #631 — both are the specific checks that
  distinguish "the code looks right" from "the defect is actually gone." Do not mark either as
  passed on the strength of reading the source.
-->
