# P2.6 slice 6 — catalogue filter facets (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Every feature should have appropriate **Unit** and **Integration** testing, followed by relevant validation testing. Broader testing mainly happens before release. However, testing is risk-based: features involving auth, payments, UI changes, performance-sensitive APIs, databases, or external dependencies require additional relevant testing earlier.

1. **Unit Testing** — isolated business logic, utilities, components. Every feature.
2. **Integration Testing** — the component against its immediate dependencies (database, services). Every feature.
3. **System / End-to-End Testing** — critical journeys in the real system.
4. **Regression & Acceptance Testing** — existing behaviour unbroken, acceptance criteria met.
5. **Performance & Resilience Testing** — throughput and latency targets, graceful degradation.
6. **Security & Accessibility Testing** — safe and usable for everyone.

---

## Before you start

Four things this slice's rows depend on. Read them first — several rows are meaningless without.

1. **Use `npm run preview`, never `npm run dev`,** for every live row. Plain `next dev` runs in real
   Node, which cannot load `@prisma/client/wasm`'s query engine, so a DB-touching route silently
   renders an error state with no crash and no obvious signal.
2. **Confirm which database you are pointed at before any live row.** Diff `.env` and `.dev.vars`
   against `secrets/staging.vars` and `secrets/production.vars` and confirm the host is **neither**
   staging's nor production's. Two files drifting into agreement on the wrong target is a documented
   incident here, not a hypothetical.
3. **A `grep` in this table is a locator, not the evidence.** This repo's comments routinely quote
   the exact strings a check looks for — five rows in `#568` passed or failed on a comment rather
   than on real code. For every row marked **(read it)**, open the reported line and confirm the
   mechanism; do not accept the exit code alone.
4. **Write scratch scripts to a file under `scripts/` and run `npx tsx scripts/<name>.ts`.**
   `npx tsx -e` fails silently on this Windows setup once a script imports a package — no stdout, no
   stderr, exit 0. Delete the scratch file when the row is done, and never pipe a script that
   creates and cleans up rows through `head`.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `npx prisma validate` exits 0, then confirm in `prisma/schema.prisma`'s `Product` model that `isVegetarian`, `isGlutenFree` and `isHmcCertified` are each declared `Boolean @default(false)`. **(read it)** |
| R2  | Unit | In the same model, confirm `hmcReference String?` and `hmcVerifiedAt DateTime?` are declared. **(read it)** |
| R3  | Unit | Confirm `prisma/schema.prisma` declares `model Brand` with a `vendorId` field, a `Vendor` relation, `name`, `slug`, `imageKey String?`, and a literal `@@unique([vendorId, slug])` line. **(read it)** |
| R4  | Unit | Confirm `Product` declares `brandId String?` and an optional `brand` relation, then `npx prisma validate` exits 0, proving the relation resolves. |
| R5  | Integration | `git diff --name-only origin/staging...HEAD -- prisma/migrations/` lists files under exactly one new migration directory. Then `grep -c "DROP INDEX" prisma/migrations/<new-dir>/migration.sql` returns 0. |
| R6  | Integration | Against the dev database, run a scratch script listing indexes on `"Order"` and confirm the three `pg_trgm` indexes named in `prisma/migrations/20260820143949_p7_5de_order_search_trigram/migration.sql` are all present. |
| R7  | Unit | Confirm the `ProductFilters` interface in `lib/repositories/products.ts` declares all six new optional fields. **(read it)** |
| R8  | Unit | `npx vitest run tests/search-repository.test.ts` — a test asserts `buildFilterWhere({ isVegetarian: true })` yields `isVegetarian: true` and that `buildFilterWhere({})` yields no such key. |
| R9  | Unit | Same file — a test asserts `buildFilterWhere({ origin: "Morocco" })` produces an exact-match `origin` predicate and `buildFilterWhere({ origin: "" })` produces no `origin` key. |
| R10 | Unit | Same file — a test asserts `buildFilterWhere({ brandId: "abc" })` produces a `brandId` predicate and `buildFilterWhere({ brandId: "" })` produces none. |
| R11 | Unit | Same file — a test asserts `Object.keys(buildFilterWhere({ onOffer: true }))` does **not** include `"OR"`, and that the returned object's `AND` array contains a clause whose `OR` names both `originalPrice` and `priceTier`. This is the row that catches the collision; a bare-`OR` implementation fails here. |
| R12 | Unit | Same file — with a mocked Prisma client capturing every `findMany` call, run a search whose direct predicate returns zero rows so the identity and broad rungs both fire, with `onOffer: true`. Assert that for **all three** captured `where` objects, the offers clause and that rung's own `OR` are both present. |
| R13 | Regression | Same file — a test asserts `buildFilterWhere({})` deep-equals an empty object, so an unfiltered catalogue query is unchanged by this slice. |
| R14 | Regression | `npm run typecheck` exits 0 — with the old names gone from the repository, any call site still referencing one fails to compile, so a green typecheck **is** the proof that every site moved rather than being deleted. Then run `grep -rn "getAvailableSpecialities\|AvailableSpecialities\|SpecialityContext\|availableSpecialities" lib/ app/ components/ scripts/ tests/` and confirm every hit is inside a comment documenting the rename — **(read it)**. Hits in code are a failure; hits in prose are expected. Exclude `app/(admin)/staff/runbook/docs.ts`, which embeds whole documents verbatim. |
| R15 | Unit | Add a temporary line passing `origin: "x"` into a `FacetContext` literal and confirm `npm run typecheck` **fails**; repeat for `brandId`. Remove both lines and confirm it exits 0. Record both outcomes — a row that only reports the final 0 has proved nothing. |
| R16 | Integration | Under `npm run preview` against the dev database, load `/search` and confirm the rendered filter panel contains controls sourced from each part of the returned shape: six dietary/speciality checkboxes, an offers checkbox, an origin `select` with real values, and a brand `select` with real values. |
| R17 | Unit | `npx vitest run tests/search-repository.test.ts` — a test captures each boolean probe's `where` and asserts none of the nine facet fields from R15 appears in any of them. |
| R18 | Unit | Same file — a test asserts the origin probe's `where` has no `origin` key and the brand probe's `where` has no `brandId` key. |
| R19 | Unit | Confirm the probes are awaited through a single `Promise.all` in `getAvailableFacets`. **(read it)** |
| R20 | E2E | Under `npm run preview` with seed data present, load `/search` and confirm checkboxes named `isVegetarian`, `isGlutenFree` and `isHmcCertified` are in the rendered HTML. Then load `/search?q=<a term matching only products carrying none of those flags>` and confirm all three are absent. |
| R21 | E2E | On `/search`, confirm a `select name="origin"` exists whose first option carries an empty value, with at least one seeded origin among its options. |
| R22 | E2E | On `/search`, confirm a `select name="brand"` exists whose first option carries an empty value, and that an option's label is a brand **name** while its value is that brand's **slug**. |
| R23 | E2E | On `/search`, confirm a checkbox named `onOffer` is present. Then narrow to a context holding no discounted or tiered product (e.g. `?category=<a department with none>`) and confirm it is absent. |
| R24 | Unit | `npx vitest run tests/filter-chips.test.ts` — tests assert a chip is produced for each of the six new keys and that each chip's href preserves `q` and the other active filters while dropping `cursor` and `back`. |
| R25 | E2E | Under `npm run preview`, load `/search?brand=<a real seeded brand slug>` and confirm a chip labelled with that brand's **name** renders. Then load `/search?brand=not-a-real-brand`: the page returns 200, renders **no** brand chip, and shows the same product count as `/search` with no `brand` parameter at all. |
| R26 | E2E | Load `/search?origin=Atlantis` and confirm the page returns 200, renders an `Atlantis` chip, and that following that chip's href removes the filter and restores results. |
| R27 | Unit | `npx vitest run tests/filter-chips.test.ts` — a test asserts the four labels exactly: `Vegetarian`, `Gluten free`, `HMC certified`, `On offer`. |
| R28 | Unit | `npx vitest run tests/search-href.test.ts` — tests assert `searchPageHref` carries all six new keys into the next page's URL, and that `categoryFilterHref` preserves them while replacing `category`. |
| R29 | E2E | Under `npm run preview`, load a category listing with at least two pages and a new facet active — e.g. `/categories/<slug>?isVegetarian=1` — click through to page 2, and confirm `isVegetarian=1` is still present in the resulting URL **and** that the product count is still filtered. Repeat for `origin`. |
| R30 | Regression | `npx vitest run` — the test pinning `filter-chips.ts`'s removable list against `search-href.ts`'s carried list passes. Confirm it genuinely fails when broken: temporarily remove one key from one list, re-run, see it fail, restore it. |
| R31 | Regression | `grep -L "use client" components/product/ProductFilterForm.tsx components/product/FilterPanel.tsx` lists **both** files. Then `curl` a plain GET of `/search?isVegetarian=1` under `npm run preview` and confirm the returned HTML is a filtered result set, proving the path works with no JavaScript at all. |
| R32 | E2E | Under `npm run preview`, signed in as an admin, load `/staff/products/new` and confirm the three dietary checkboxes are present in the HTML. |
| R33 | E2E | On the same page, confirm `name="hmcReference"` is a text input and `name="hmcVerifiedAt"` carries `type="date"`. |
| R34 | Unit | `npx vitest run tests/catalogue-form.test.ts` — tests assert that ticking `isHmcCertified` with a blank `hmcReference`, and separately with a blank `hmcVerifiedAt`, each returns `ok: false` with `field` naming the missing input. |
| R35 | Unit | Same file — a test asserts that with `isHmcCertified` unticked but both provenance fields filled, the parsed value carries `hmcReference: null` and `hmcVerifiedAt: null`. |
| R36 | E2E | On `/staff/products/new`, confirm a `select name="brandId"` whose first option has an empty value, listing the seeded brands. |
| R37 | Security | Under `npm run preview`, load `/staff/brands` signed in as a **non-staff** user and confirm the response body contains the `PanelRefusal` copy — not a blank content column inside the portal shell. Then confirm `app/(admin)/staff/brands/page.tsx` calls `requireVendorRole("ADMIN")`. **(read it)** |
| R38 | E2E | Signed in as an admin under `npm run preview`, drive all three actions and confirm each against the database: create a brand, rename it, set its image key. Server-action forms are curl-drivable — fetch the page, read the `$ACTION_ID_` (plain form) or `$ACTION_REF_`/`$ACTION_N:0`/`$ACTION_N:1`/`$ACTION_KEY` (`useActionState` form) hidden fields, and POST them back with `curl -F`. Re-read `$ACTION_KEY` from a fresh page fetch before each submission. |
| R39 | Unit | `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts` — both pass. Then confirm via `git diff` that neither test file gained an allowlist entry for `brands.ts`; the client-injection test walks `lib/repositories/` from the filesystem, so the new file must pass on its merits. |
| R40 | Integration | Confirm `lib/brands-service.ts` exists and that its factory calls `getPrisma()` inside the factory body per invocation rather than at module scope. **(read it)** |
| R41 | E2E | Load `/staff` as an admin under `npm run preview` and confirm an anchor whose href is `/staff/brands` is present. |
| R42 | Integration | Against a freshly seeded dev database, run a scratch script counting: `Brand` rows, and products with each of `isVegetarian`, `isGlutenFree`, `isHmcCertified`, a non-null `brandId` and a non-null `origin`. Every count must be at least 1. |
| R43 | Integration | The same script asserts every product with `isHmcCertified` true has a non-null `hmcReference` and `hmcVerifiedAt`. Violations must be 0. |
| R44 | Performance | `npx tsx scripts/measure-catalogue-queries.ts --samples 25 > facet-timings.txt`, then read the file. It reports the facet probe timings, and `docs/developer-portal/nfr-baseline.md` gains a row recording the p95 for `searchProducts` and for the facet probes at the current catalogue size, naming the host measured against. |
| R45 | Performance | The p95 recorded for R44 is under 400 ms. If it is not, that is a real failure of this row, not a measurement caveat — the facet probe count roughly tripled in this slice, which is exactly what this row exists to catch. |
| R46 | Regression | `specs/architecture.md` contains a passage stating a filter predicate must not emit a top-level `OR`, because the search ladder's rung predicates do and the later spread silently wins. Confirm its `version` and `updated` front-matter fields were both bumped. **(read it)** |
| R47 | Acceptance | `git diff origin/staging...HEAD -- CHANGELOG.md` is non-empty and describes this slice's observable behaviour changes. |
| R48 | Acceptance | `npm run kms:validate` exits 0 and `npm run kms:check-generated` exits 0. Run both after writing `plan.md`'s front-matter — the `id` regex forbids a literal dot and `summary` is capped at 300 characters, and neither is caught by lint, typecheck, test or build. |
| R49 | Acceptance | `npm run lint`, `npm run typecheck`, `npx vitest run` and `npm run format:check` all exit 0. **Check vitest's file and test totals, not just the exit code** — the pre-slice baseline is 94 files / 1126 tests, so a run reporting fewer files is a non-result to re-run, not a pass. Record the new totals and update `CLAUDE.md`'s baseline line to match. |
| R48, R49 | Acceptance | Because this slice edits `specs/` and `docs/`, also run `npm run kms:assemble:internal`, then `cd kms/site-internal && npx next build --webpack`, and read its **real exit status** — a bare `<` before a digit, or an unbackticked brace expression, breaks that build while every root gate stays green. |
