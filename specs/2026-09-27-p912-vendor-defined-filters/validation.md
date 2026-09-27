# #912 — Vendor-defined product filters, with #601 and #916 (validation)

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
- Run `npx vitest run` **alone**, never beside or straight after a build.
- After stopping `npm run preview`, kill the leftover `node`/`workerd` processes before building
  again.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | Read `prisma/schema.prisma`. Confirm each field, unique key, index and relation of the three models exactly as R1 lists them, including both composite relations (`[attributeId, vendorId]` to `[id, vendorId]`, and `[optionId, attributeId]` to `[id, attributeId]`) and all three `onDelete: Cascade` relations. `git diff staging -- prisma/schema.prisma` shows no change to any existing scalar field of `Vendor` or `Product`: only the added relation list fields. The comment above the models mentions the six label booleans. |
| R2  | Unit | `git diff --name-only staging -- prisma/migrations` lists exactly one new `migration.sql`. Grep it: `DROP`, `ALTER TABLE "Product"` and `_trgm` each return no match. Every statement is one of `CREATE TABLE`, `CREATE UNIQUE INDEX`, `CREATE INDEX`, or `ALTER TABLE "VendorAttribute"`/`"VendorAttributeOption"`/`"ProductAttributeValue"` with `ADD CONSTRAINT ... FOREIGN KEY`. |
| R3  | Integration | `npx prisma migrate status` against dev (`DIRECT_URL` from `.env`) reports no pending migration, and the new migration's name appears in `_prisma_migrations`. |
| R4  | Unit | Read `components/product/filter-params.ts`. It exports the four named symbols. `FIXED_FILTER_KEYS` equals the 15 keys in `requirements.md`'s order. The file has no `"use server"` and imports nothing from `lib/db` or Prisma. |
| R5  | Unit | Grep `filter-chips.ts` and `search-href.ts`: neither declares its own array literal of filter key names, and both import from `./filter-params`. `components/product/category-href.ts` exists and exports both functions. Grep `app/(storefront)/categories/[slug]/page.tsx` for `qs.set(`: no match. Grep it for `category-href`: at least one import. |
| R6  | Unit | `npx vitest run tests/filter-params.test.ts tests/filter-chips.test.ts` exits 0. Read `filter-params.test.ts` and confirm that cases (a) to (d) each exist and name all four builders from (a). |
| R7  | Integration | Read `lib/repositories/attributes.ts`. Every export's parameter list begins `(prisma…, vendorId…)` or `(prismaWs…, vendorId…)`, and every write's `where` includes `vendorId`, either directly or through the attribute for options. `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts` exits 0, and `git diff staging -- tests/repository-purity.test.ts tests/repository-client-injection.test.ts` is empty. |
| R8  | Unit | `npx vitest run tests/attribute-form.test.ts` exits 0 and covers (a), (b), (c) and (h) with the exact messages. For (d) to (g), read the repository: each message string appears verbatim, (d) and (e) come from an `isUniqueViolation` branch, and (f) and (g) are count checks made before the create. (d) is also exercised live in R24(a): add `Test Colour` a second time and see the (d) message. |
| R9  | Unit | Read `features/admin/attributes.ts`: line 1 is `"use server"`, and every top-level `export` is an `export async function` (grep `^export (const|let|type|interface|class)`: no match). Each of the six functions calls `requireVendorRole("STAFF", "ADMIN")`, and none reads `vendorId` from `FormData`. |
| R10 | E2E | Covered live by R24(c). Also read the delete form component: the checkbox `name="confirmDelete"` is `required`, and the label text follows the R10 pattern, including singular `1 product`. |
| R11 | E2E | Signed in as the Aheed admin: `curl` `/staff/attributes` returns 200, and the HTML contains `<h1` … `Product filters` and the empty-state text. Signed out, it redirects to `/login`. `tests/panel-refusal-coverage.test.ts` passes, and grepping the page for `PanelRefusal` finds a match. |
| R12 | Unit | `npx vitest run tests/staff-nav-parity.test.ts tests/panel-refusal-coverage.test.ts tests/operator-doc-coverage.test.ts` exits 0. Grep `PanelNav.tsx` for `/staff/attributes`: the count equals the count for `/staff/brands`. Read the guide section and, for each "What you can do" sentence, name the R9–R11 control it describes. A sentence with no control is a failure. |
| R13 | Unit | `npx vitest run tests/product-attribute-form.test.ts` exits 0, and it contains each of the five named cases. |
| R14 | Integration | Read `createProductForVendor` and `updateProductForVendor`: an ownership check for every attribute and option id runs before any write and returns the exact R14 error and field. In R24, submit `attribute_<real id>=<an option id from a different attribute>` with `curl`: the response shows `Choose a value from this store's list.` and no row is written. |
| R15 | Integration | Read the code: `createProductForVendor`'s `product.create` data contains `attributeValues: { create:`. `lib/products-service.ts` still passes `getPrismaWs()` to create and update. `updateProductForVendor` handles attribute values inside `$transaction` with upsert and delete, and skips absent attributes. `npx vitest run tests/repository-transaction-safety.test.ts` exits 0. The live behaviour is proven by R24(b). |
| R16 | E2E | With `Test Colour` present during R24, `/staff/products/new` HTML contains the heading `Product filters` and `<select name="attribute_<id>"` with first option `Not set` and `value=""`. With no attributes (after R24(d)), the page contains no `Product filters` heading. |
| R17 | Unit | Run the R17 test (named in the Build notes, or `tests/search-repository.test.ts`) and confirm it exits 0 and asserts both bullets of R17. Read `buildFilterWhere`: attribute clauses and the `onOffer` clause share one `AND` array. |
| R18 | Integration | Read `getAvailableFacets`: one `Promise.all`, with the attribute query inside it. `FacetContext` has no attribute field (grep `attributeOptionIds` in the interface: no match). Live check through R26(a). |
| R19 | Unit | `npx vitest run tests/attribute-filters.test.ts` exits 0 and covers each case named in R19. |
| R20 | E2E | Covered live by R26(b) (a chip for a resolved param) and R26(c) (no chip for an unresolved one), on `/search`. For the category page, `/categories/sri-electronics?attr_colour=black` on the SriMart host shows the chip `Colour: Black` and only Black products. |
| R21 | E2E | On the SriMart host, `curl /categories/sri-electronics`. The HTML contains `<select name="attr_colour"` and `<select name="attr_connectivity"`, each with a first option `Any Colour` or `Any Connectivity` and `value=""`. Neither select carries an `id=`. |
| R22 | E2E | Covered by R26(d). Also `git diff staging -- components/product/ProductCard.tsx` is empty. |
| R23 | Integration | Run the seed against dev with the SriMart and Aheed host variables set, as the seed's own header describes. Query: SriMart has exactly 2 attributes and 4 options, 6 `ProductAttributeValue` rows on exactly the six named slugs, with the named values. Aheed has 0 attributes. Run the seed again: the counts are unchanged. |
| R24 | E2E | Run (a) to (d) as the Aheed admin on the Aheed host (`curl` or browser). After each step, confirm the stated database state with a query against dev. At the end: 0 `VendorAttribute` rows for Aheed, and every product created in this row has `isActive = false`. |
| R25 | E2E | Run (a) to (c) as written. Record both new product ids with the `isOrganic` value read from the database. Confirm every `/staff/storefront` label setting matches its value before the row began. **This row closes `#916`.** |
| R26 | E2E | Signed out, on the SriMart host, fetch each URL in (a) to (d) and check the stated content. For (c), compare the product slugs in both result grids: they must be identical. |
| R27 | E2E | On the Aheed host, fetch `/search?attr_zz=1`, and find an Aheed category whose page renders `Next page`. In each page's HTML, the `Next page` link's `href` contains `attr_zz=1`. |
| R28 | E2E | After merge and a successful `deploy-staging`, run R28 on `srimart-staging.nocaped.com` with the SriMart demo admin. The credential is in `secrets/staging.vars` (`DEMO_SRIMART_ADMIN_PASSWORD`). Record each step's result in `build-notes.md`. Run at Ship. |
| R29 | Unit | Read `specs/architecture.md`: the new subsection states all three points, and its front-matter `version` and `updated` changed (`git diff staging -- specs/architecture.md`). |
| R30 | Unit | `git log --reverse staging..HEAD --format=%h` shows `ddf3f60` first. `npm run sdd:audit` ends with `All slices and promotions under the loop are documented.` |
| R31 | Unit | Run the four commands in R31 and read each exit status directly. Do not pipe through `tail`, which reports the pipe's status instead. |
| R32 | Unit | `git diff staging -- CHANGELOG.md` shows a new entry containing `#912`, `#601` and `#916`. |
| R33 | Unit | `gh pr view <n> --json baseRefName,body`: `baseRefName` is `staging`. In the body, every issue number directly after a GitHub closing keyword (close, closes, closed, fix, fixes, fixed, resolve, resolves, resolved; any case) is 912, 601 or 916, and `#398` and `#697` both appear. |
| R34 | Regression | `npm run lint`, `npm run typecheck` and `npm run format:check` each exit 0. `npx vitest run`, run alone, exits 0, and its summary shows no "failed to start" file and a file count no lower than `staging`'s. `gh pr checks <n>` shows `quality` green. |
