# #917/#918 — Brand deletion and vendor-filter follow-ups (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Every feature should have appropriate **Unit** and **Integration** testing, followed by relevant validation testing. Broader testing mainly happens before release. However, testing is risk-based: features involving auth, payments, UI changes, performance-sensitive APIs, databases, or external dependencies require additional relevant testing earlier.

1. **Unit Testing**: every feature. Tests isolated logic.
2. **Integration Testing**: every feature. Tests a component with its immediate dependencies.
3. **System / End-to-End Testing**: critical journeys, in the real system.
4. **Regression & Acceptance Testing**: before release, or when changing core flows.
5. **Performance & Resilience Testing**: before release, or for performance-sensitive APIs.
6. **Security & Accessibility Testing**: before release, or earlier for auth, payments or UI.

---

## Before you start (read once)

- **Every DB-touching row uses `npm run preview`, never `npm run dev`.** The dev server cannot load
  `@prisma/client/wasm` and silently renders an error state.
- Aheed host is `http://localhost:8787`. SriMart host is `http://srimart.localhost:8787`, and **the
  port is required**: without it the request silently falls through to Aheed.
- **You cannot sign in on the SriMart host locally.** Better Auth refuses that origin, so the
  signed-in rows use the Aheed host. Driving staff pages and server actions with `curl` is
  documented in `docs/developer-portal/local-dev-playbook.md`.
- For database reads, use a `tsx` script or `psql` against `DIRECT_URL` from `.env`. First confirm
  that `.env` names the dev endpoint (`ep-dry-morning-zab7dx08`).
- **Never accept a `prisma migrate dev` reset offer on dev** (`#895`). The migration was generated
  with `prisma migrate diff`. Apply it with `npx prisma migrate deploy`.
- To run the seed (R33), set `SEED_AHEED_HOST=localhost:8787` and
  `SEED_SRIMART_HOST=srimart.localhost:8787` on the command line, then run `npm run db:seed`. It also
  refreshes product images in the dev bucket (existing behaviour), so expect `putObject` lines.
- Run `npx vitest run` **alone**, never beside or straight after a build.
- After stopping `npm run preview`, kill the leftover `node`/`workerd` processes before building
  again.
- **`staging` in every row below means `origin/staging`** (run `git fetch` first). The branch was cut
  from `origin/staging` at `a090b30`. The local `staging` branch in this checkout is stale (it predates
  `#912`), so `git diff staging` against it shows `#912`'s whole diff as if it were this slice's.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `git log --reverse staging..HEAD --format="%h %s"`: the first commit touches `specs/roadmap.md` and `docs/model-handoff.md` only (`git show --stat <sha>`), and the spec commit comes after it. `specs/roadmap.md` has a row citing `PR #921` and `646f14d`. `docs/model-handoff.md` contains no `main` is still at `f53913e` claim, and no `In Review` claim for `#912`. `npm run sdd:audit` output has no line containing `PR #921` together with `pending carry-forward`. |
| R2  | Unit | Read `lib/repositories/brands.ts`: `deleteBrandForVendor` has the R2 signature (first parameter typed as the HTTP client), both messages verbatim, and `deleteMany({ where: { id…, vendorId } })`. `lib/brands-service.ts` passes `getPrisma()` (not `getPrismaWs()`) to it. `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts` exits 0, and `git diff staging -- tests/repository-purity.test.ts tests/repository-client-injection.test.ts` is empty. |
| R3  | Unit | `npx vitest run tests/brands-delete.test.ts` exits 0. Read the file: cases (a) to (d) exist, and (a) and (b) assert that `deleteMany` was not called. |
| R4  | Unit | Read `features/admin/brands.ts`: line 1 is `"use server"`, and grep `^export (const\|let\|type\|interface\|class)` finds no match. `deleteBrand` calls `requireVendorRole("STAFF", "ADMIN")`, reads `brandId` and compares `confirmDelete` to `"on"`, and reads no vendor id from the form. The revalidation helper includes `revalidatePath("/products", "layout")`. |
| R5  | Unit | Read `components/staff/BrandManager.tsx`: a delete form with hidden `brandId`, a `required` checkbox `name="confirmDelete"` rendered only when `productCount > 0` with label `confirmDeleteLabel(...)`, and the button text `Delete brand`. Grep the file for `confirm(`: no match (the word appears only in `confirmDelete`/`confirmDeleteLabel`). |
| R6  | Unit | Read the `## Brands — /staff/brands` section: it still says brands can be removed, and it states both R6 points. `npx vitest run tests/operator-doc-coverage.test.ts` exits 0. |
| R7  | Unit | Read `prisma/schema.prisma`: the enum, the three `VendorAttribute` fields with their defaults, `optionId String?`, the optional `option` relation (still composite, still `Cascade`), `numericValue Decimal? @db.Decimal(10, 2)` and the new index. `git diff staging -- prisma/schema.prisma` changes no other model, apart from whitespace realignment by `npx prisma format`. |
| R8  | Unit | `git diff --name-only staging -- prisma/migrations` lists exactly one new `migration.sql`. Read it: every R8 statement is present, including the `CHECK` text. Grep: `_trgm` gives no match, `"Product"` appears in no `ALTER`/`DROP`/`CREATE` statement, and every `DROP` is either `DROP NOT NULL` or the `ProductAttributeValue` option foreign key (`DROP CONSTRAINT "ProductAttributeValue_optionId_attributeId_fkey"`, re-added later in the same file). |
| R9  | Integration | `npx prisma migrate status` against dev (`DIRECT_URL` from `.env`) reports the database schema is up to date. Then, in a transaction you roll back, insert a `"ProductAttributeValue"` row with `optionId` and `numericValue` both null, for a real SriMart product and a real SriMart attribute that have **no** row together yet (so the unique key cannot fire first). Use `psql` or a `tsx` script's `$executeRawUnsafe`; this is a verification script, not application code. The error names `ProductAttributeValue_one_value_check`. No row is left behind. |
| R10 | Unit | `npx vitest run tests/attribute-form.test.ts` exits 0. Read the file: `parseAttributeKind` covers `LIST`, `NUMBER`, blank and an unknown value. `parseAttributeUnit` covers blank, a 10-character unit and an 11-character unit, with the exact messages. |
| R11 | Unit | Read `features/admin/attributes.ts` `createAttribute`: it parses `kind` and `unit`, and passes `unit` as `null` for `LIST`. Read `lib/repositories/attributes.ts`: `kind` appears in a `data` object only in `createAttributeForVendor`. Live, R35(a) creates a `NUMBER` filter. |
| R12 | Integration | Read `renameAttribute` and the repository rename: `showOnCard` is `field === "on"`, and `unit` is written only for `NUMBER` (by a `kind` condition in the `where`, or a read before the write). Live: in R35(c), after ticking, `VendorAttribute.showOnCard` is `true` in the database. Submit the rename once more without `showOnCard` using `curl`: it becomes `false`. Re-tick before R35(d). |
| R13 | E2E | Covered live by R35(a). The message appears verbatim, and the database has 0 `VendorAttributeOption` rows for `Test Size`. |
| R14 | E2E | Signed in as the Aheed admin, `curl /staff/attributes`. The HTML contains `<select name="kind"` with `Pick from a list` and `Number`, and an input `name="unit"` with the R14 label. With `Test Size` present (R35), its card contains `Number filter`, `name="showOnCard"` and `Show on product cards`, a `name="unit"` input with value `in`, and no `Add value` button inside that card. |
| R15 | Unit | `npx vitest run tests/operator-doc-coverage.test.ts tests/staff-nav-parity.test.ts tests/panel-refusal-coverage.test.ts` exits 0. Read the section: the four R15 points are present. For each capability sentence, name the R11–R14 or R17 control it describes. A sentence with no control is a failure. |
| R16 | Unit | `npx vitest run tests/product-attribute-form.test.ts` exits 0, and it contains the six named number cases with the exact R16 message for the refused ones. The existing list cases still pass. |
| R17 | Integration | Read `assertOwnAttributeValues` (or its successor): it compares each entry's `kind` to the stored kind, returns the exact message, and sets the field by kind. The create's nested `attributeValues: { create:` includes `numericValue`. The update's `$transaction` upserts `numericValue` and deletes on `null`. `npx vitest run tests/repository-transaction-safety.test.ts` exits 0. Live: during R35, `curl` a product save posting `attribute_<Test Size id>=<any real option id of another filter>`. The response shows `Choose a value from this store's list.` and no row changes. (If Aheed has no list filter at that moment, first create a throwaway list filter with one value, then delete it in R35(f).) |
| R18 | E2E | With `Test Size` present, `curl /staff/products/<id>` (the R35 product). The HTML contains `<input` with `name="attributeNumber_<id>"`, `type="number"`, `step="0.01"`, `min="0"`, the label `Test Size (in)`, and after R35(b) the value `13.3` or `13.30`. |
| R19 | Unit | `npx vitest run tests/attribute-number.test.ts` exits 0 and covers the three format examples, plus parse cases for a valid string, `abc`, an array and `-1`. Grep `lib/repositories/` for `numericValue`: every returned object converts it with `.toString()` (or an equivalent string conversion) before returning. `npm run typecheck` exits 0, and `ProductSummary`, `ProductDetail` and `AdminProductDetail` declare no `Decimal` type. |
| R20 | Unit | Read `components/product/filter-params.ts`: the three functions exist with the stated behaviour. `npx vitest run tests/filter-params.test.ts` exits 0, including a case asserting that `filterEntries({ attr_colour: ["black", "", "black", "white"] })` returns exactly `[["attr_colour","black"],["attr_colour","white"]]`, and that an array `minPrice` or `attr_power_min` yields no pair. |
| R21 | Unit | Grep `filter-chips.ts`, `search-href.ts` and `category-href.ts` for `.set(` applied to a filter entry: none (a `set` for `q`, `category`, `cursor` or `back` is fine). `npx vitest run tests/filter-params.test.ts` exits 0, and the R21 case names all five builders. |
| R22 | Unit | `npx vitest run tests/attribute-filters.test.ts` exits 0 and contains each case R22 lists, with the exact label strings. |
| R23 | Unit | Run the R23 test (named in the build notes, or `tests/search-repository.test.ts`), and confirm it exits 0 and asserts both bullets. Grep the repository for `attributeOptionIds`: no match. |
| R24 | Unit | Run the R24 test and confirm it asserts: two chips with keys `attr_colour=black` and `attr_colour=white`; the Black chip's href contains `attr_colour=white` and not `attr_colour=black`; and `clearAllHref` removes both. Live via R36(b). |
| R25 | E2E | Covered by R36(a) (HTML contains the named checkboxes and the two number inputs). Also grep `ProductFilterForm.tsx` for `<select` with `attr_`: no match. Grep the R36(a) HTML for `id="attr_`: no match. |
| R26 | Integration | Read `getAvailableFacets`: a single `Promise.all` with the list probe (now `optionId: { not: null }`) and the new number probe inside it. `FacetContext` has no attribute field. `npx vitest run tests/products-repository.test.ts` exits 0. Live via R36(a): `attr_power_min` appears on `sri-electronics` and not on `sri-home`. |
| R27 | E2E | Grep both page files for `attributeOptionGroups` and `attributeRanges`: one match each. Live via R36(b)–(d) (search) and R35(d) (category page). |
| R28 | Unit | Read `productSummarySelect` and `toProductSummary`: the `showOnCard` filter, the ordering and the two value sources. `npm run typecheck` exits 0. |
| R29 | Unit | Run the jsdom test named in the build notes (or `tests/product-card-specs.test.tsx`), and confirm both cases exist and it exits 0. Live via R35(c) and R36(e). |
| R30 | E2E | Covered by R35(b) and R36(f). |
| R31 | Unit | `npx vitest run tests/search-repository.test.ts` exits 0. Read `buildDirectSearchWhere` and `broadSearchPredicate`: the option-name clause is present in both. `identitySearchPredicate`: `git diff staging` shows no change to it. |
| R32 | Unit | Run the R32 test (named in the build notes) and confirm it exits 0 and asserts both the run and the no-run cases. Live via R36(g). |
| R33 | Integration | Run the seed as described above. Query dev for SriMart: 3 `VendorAttribute` rows (`Colour` with `showOnCard = true`, `Connectivity`, and `Power` with `kind = 'NUMBER'` and `unit = 'W'`), 4 options, and 15 `ProductAttributeValue` rows (12 with `optionId`, 3 with `numericValue`: 20, 65 and 10 on the three named slugs). Aheed has 0 attributes. Run the seed again: the counts are unchanged. |
| R34 | E2E | Run (a) to (e) as the Aheed admin on the Aheed host (`curl` or a browser). After each step, confirm the stated database state with a query. For (d), compare the product slugs in both grids: they must be identical. At the end, the product's `brandId` equals its value before the row began. |
| R35 | E2E | Run (a) to (f) as the Aheed admin on the Aheed host. After each step, check the stated page content and database state. At the end: 0 `VendorAttribute` rows for Aheed, and the product's other fields are unchanged from before the row began. |
| R36 | E2E | Signed out, on the SriMart host, fetch each URL in (a) to (g) and check the stated content. For (b) and (c), list the product slugs in the grid and compare them with a database query of which products carry those values. For (d), compare with `/search`'s slugs. For (g), query dev for SriMart products whose `name` or `description` contains `wired` (case-insensitive). |
| R37 | E2E | Fetch `/search?attr_zz=1&attr_zz=2` on the Aheed host, and read the `Next page` link's `href`. Then grep that page, `/search`, and one Aheed `/categories/<slug>` for `name="attr_` and `data-card-specs`: no match. |
| R38 | E2E | After merge and a successful `deploy-staging`, run R38 on `srimart-staging.nocaped.com` with the SriMart demo admin. The credential is in `secrets/staging.vars` (the shared `DEMO_ACCOUNT_PASSWORD`, per `docs/developer-portal/env-setup.md`). Record each step's result in `build-notes.md`. Run at Ship. |
| R39 | Unit | Read `specs/architecture.md`: the subsection states all five points, and the "This does not reopen `OFFSET`" paragraphs now sit under the search pagination section, before `### Composing where fragments`. `git diff staging -- specs/architecture.md` shows `version: "1.36.0"`, and `updated` is 2026-09-27 or later. |
| R40 | Unit | Run the four commands in R40 and read each exit status directly. Do not pipe through `tail`, which reports the pipe's status instead. |
| R41 | Unit | `git diff staging -- CHANGELOG.md` shows a new entry containing `#917` and `#918`. |
| R42 | Unit | `gh pr view <n> --json baseRefName,body`: `baseRefName` is `staging`. In the body, every issue number directly after a GitHub closing keyword (close, closes, closed, fix, fixes, fixed, resolve, resolves, resolved; any case) is 917, and `#918` and `#922` both appear. |
| R43 | Regression | `npm run lint`, `npm run typecheck` and `npm run format:check` each exit 0. `npx vitest run`, run alone, exits 0, and its summary shows no "failed to start" file and a file count no lower than `staging`'s. `gh pr checks <n>` shows `quality` green. |
