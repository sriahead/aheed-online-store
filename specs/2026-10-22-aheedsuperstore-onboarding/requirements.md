# Aheed Super Store test vendor — placeholders, importer, runbook (requirements / acceptance criteria)

Issue `#1216`; narrative in `plan.md`. Builds on `scripts/provision-vendor.ts`, `scripts/lib/protected-hosts.ts`,
`lib/catalogue-import-policy.ts` (`#1211`, ADR-007) and `scripts/verify-worker-routes.ts`. In one line: a manifest
may carry marked owner-to-confirm placeholders and cannot yield a deploy route while any remain, and a
spreadsheet catalogue is validated, then imported into the dev database hidden with stock `UNKNOWN`, without
fabricating a field or touching any other vendor.

Terms. **Dev database** = the database `DIRECT_URL` (else `DATABASE_URL`) names when `assertNotDeployedDatabase`
accepts it. **Profile** = the import profile JSON of R9. **Row** = a data row of the source sheet after the
header. **Source row number** = the 1-based row number in the original file, counting the scaffolding above the
header. **Target vendor** = the vendor the manifest id (or `--vendor-slug`) names. **Hidden** = `Product.isActive`
false and its `Category.isActive` false. Every command is run from the repository root.

## A. Placeholder-bearing manifests

R1. The manifest schema in `scripts/provision-vendor.ts` accepts an optional top-level `placeholders` array of dotted
    field paths (default empty), and a manifest whose `placeholders` names a path that does not resolve to a
    field of that manifest fails parsing with an error naming the path; `tests/vendor-manifest-placeholders.test.ts`
    asserts both.
R2. The manifest schema stays strict: a manifest with an unknown key at any level still fails parsing, and the
    committed `prisma/manifests/example.json` still passes `--validate-only`.
R3. `npx tsx scripts/provision-vendor.ts <manifest> --check-ready` needs no database, exits 0 only when
    `placeholders` is empty and no string field of the manifest contains the marker `OWNER TO CONFIRM`
    (case-insensitive) or an e-mail/host ending `.invalid`, and otherwise exits 1 printing every offending
    path, one per line.
R4. Running `scripts/provision-vendor.ts <manifest>` (no `--check-ready`) against a dev database with a non-empty
    `placeholders` list succeeds and prints `placeholder value(s) still to confirm:` followed by each path; the
    placeholder list is not written to any table.
R5. `npx tsx scripts/provision-vendor.ts <manifest> --emit-route --env <staging|production>` needs no database and
    prints on stdout exactly `renderRoutesBlock(<env>, [<manifest host>])` when the manifest passes R3 and the host
    satisfies `isRoutableHost`; otherwise it exits 1, prints nothing on stdout, and names the reason on stderr.
    An `--env` value other than `staging` or `production` exits 1. `tests/vendor-manifest-placeholders.test.ts`
    asserts each branch.

## B. Catalogue importer

R6. One spreadsheet-reading package is added to `package.json` with an exact version (no `^`, `~`, range or
    tarball URL), is listed in `tests/dependency-pins.test.ts` with that literal, has a permissive licence
    (MIT, Apache-2.0 or BSD) recorded in `specs/tech-stack.md`, and `npm audit` reports no high or critical
    advisory for it.
R7. The package of R6 is imported only from files under `scripts/`: no file under `app/`, `features/`,
    `components/`, `lib/` or `prisma/` imports it, and `tests/catalogue-import-guards.test.ts` fails if one does.
R8. `scripts/import-catalogue.ts` reads a source file by extension: `.csv`, `.xlsx` and `.xls` are accepted, any
    other extension exits 1 naming the accepted ones, and for equivalent synthetic content the three formats
    yield identical normalised row arrays (`tests/catalogue-import-parse.test.ts`, which also covers a CSV
    with a UTF-8 BOM, CRLF line ends and a quoted field containing a comma).
R9. The profile is a strict zod-validated JSON file with: `columns` (header names mapped to `plu`, `name`,
    `price`, `department`, and optional `subDepartment`, `description`, `vat`), `unit` (`pattern`, a regular
    expression string, and `defaultLabel`), and `policy` (`byDepartment`, `uncertainDepartments`,
    `unrestrictedDepartments`). A profile that is invalid, or maps a header name absent from the source,
    exits 1 before any database connection with nothing written.
R10. The header row is the first row among the first 20 that contains every mapped header name (compared after
     trimming, collapsing whitespace and upper-casing); rows above it are discarded and counted; a row below it
     with blank `plu` AND blank `department` is discarded as scaffolding and counted; a row with a blank `plu`
     but a non-blank `department` is rejected with code `BLANK_PLU`. A file with no header row, or no data row,
     exits 1.
R11. A price cell is parsed to integer pence: after trimming, an optional leading `£` and optional thousands
     commas, only digits with at most two decimals are accepted (`£4.00` gives 400, `4` gives 400, `£0.00` gives 0);
     anything else is rejected `BAD_PRICE` and a negative value `NEGATIVE_PRICE`; a price of 0 is accepted and
     classified `NEEDS_REVIEW`. No floating-point arithmetic is used to convert it.
R12. A row whose mapped `name` is blank is rejected `BLANK_NAME`; a row whose `department` is blank but whose
     `plu` is not is rejected `BLANK_DEPARTMENT`.
R13. A product slug is exactly `<slugify(name) truncated to 80 chars>-<slugify(plu)>-<slugify(department)>` using
     `slugify` from `lib/catalogue-form.ts`, depends on no other row, and is identical for the same row in a
     different file order; a second row producing a slug already produced in the same file is rejected
     `DUPLICATE_ROW` naming the first row's source row number.
R14. Categories keep the client's own names. Each distinct (department, sub-department) pair yields a top-level
     category whose `name` is the department value exactly as it appears in the source and, when the
     sub-department is non-blank and not equal to its department after `normaliseDepartment`, a child category
     whose `name` is the sub-department value exactly as it appears. Only leading and trailing whitespace is
     removed; case, spelling, punctuation and abbreviations are never changed, and no value is mapped to, matched
     against or renamed to anything in the platform's existing category structure. Slugs are `slugify(department)`
     and `slugify(department)-slugify(subDepartment)`. A sub-department equal to its department yields no child
     (its products sit in the department category) and is listed in the report under `flattenedSubDepartments`.
     Two departments that share a sub-department name yield two distinct children. Source values whose slugs
     collide (they differ only by case or punctuation) create one category named after the first occurrence in
     source row order, and every variant is listed under `categoryNameVariants`. Every category the importer
     creates has `isActive: false`; an existing category is never modified, including its name.
R15. A created product row contains exactly these columns and no others: `id`, `vendorId`, `slug`, `name`,
     `description`, `categoryId`, `basePrice`, `unitLabel`, `isActive` (false) and `restriction`; its `Inventory`
     row contains exactly `id`, `vendorId`, `productId`, `quantity` (0) and `stockMode` (`UNKNOWN`). A test builds
     the writes from a row that also carries barcode, supplier, cost, case size, reorder and stock values and
     asserts none of them appears anywhere in the write set, and that `isActive`, `restriction` and `stockMode`
     come from `newImportedProductState`.
R16. `description` is the profile-mapped description cell, or the empty string when the profile maps none or the
     cell is blank; `unitLabel` is the first match of the profile's `unit.pattern` in the `name` cell
     taken verbatim, or `unit.defaultLabel` when nothing matches; `netContentAmount`, `netContentUnit` and
     `unitPricePencePerBaseUnit` are never written.
R17. Restrictions come from `classifyImportRow` over an effective policy equal to the profile's policy with every
     department present in the file but absent from `byDepartment`, `uncertainDepartments` and
     `unrestrictedDepartments` added to the uncertain list; the report lists those departments under
     `unreviewedDepartments` with row counts, and their products are created `NEEDS_REVIEW`.
R18. Without `--apply` the importer opens no database connection (it runs with `DATABASE_URL` and `DIRECT_URL`
     unset) and writes nothing to any database; it prints the plan counts and writes the report. `--list-departments`
     prints each distinct department with its row count and its classification under the profile.
R19. With `--apply` the importer calls `assertNotDeployedDatabase` before constructing any Prisma client, prints
     only the database host, and exits 1 without writing when the guard refuses, when the target vendor does not
     exist, when the file or profile is fatal under R9/R10, or when the source contains no valid row.
R20. Rejected rows do not stop an apply: valid rows are written, every rejected row is reported, and the exit
     code is 0 with no rejects, 2 with rejects and nothing failed, and 1 when any write failed.
R21. Writes use the WebSocket client (`PrismaNeon`) and one interactive `$transaction` per top-level department
     containing that department's categories, products, inventory rows and audit rows; a failure in one
     department rolls back that department only, is reported with the department name, and does not stop the
     others.
R22. Idempotency: running `--apply` twice on the same file against the same dev database creates rows only the
     first time; the second run reports 0 created and 0 updated and the target vendor's row counts for
     `Product`, `Category`, `Inventory` and `ProductRestrictionAuditLog` are identical before and after it.
R23. For an existing slug the importer writes nothing except a tightened restriction computed by
     `reimportedProductState` (setting `restriction`, forcing `isActive` false, and one audit row); a changed
     source name or price is listed in the report under `drift` and not written; no existing product is ever
     activated, loosened or has its stock touched.
R24. Every created product with a non-null restriction has exactly one `ProductRestrictionAuditLog` row with
     `action RESTRICTION_SET`, `fromRestriction` null, `toRestriction` equal to the product's restriction,
     `source IMPORT`, `actorUserId` null; a product with no restriction has none.
R25. A pure `isUniqueViolation(error)` in `lib/catalogue-import/` returns true when `error.code` is `"23505"` or
     `"P2002"` and false for `"23514"`, any other code, no code, and non-objects; a unique violation raised
     inside a department transaction is reported as `ALREADY_EXISTS` for that department. `scripts/verify-catalogue-import.ts
     --unique-probe` (R37) provokes a real unique violation through each of `PrismaNeon` and `PrismaNeonHttp`,
     prints the observed `.code` of each, and asserts `isUniqueViolation` is true for the client the importer uses.
R26. The report file is JSON written to `--report <path>` or, by default, `.import-reports/<vendor-slug>-<UTC
     timestamp>.json`; `.gitignore` contains the line `.import-reports/`; the report contains `totals` (rows
     read, scaffolding discarded, rejected by code, created, existing unchanged, restriction tightened,
     failed), `rejected` (source row number, code, reason), `restrictionCounts` by class, `unreviewedDepartments`,
     `categoryPlan` (each category name, parent name and slug), `flattenedSubDepartments`, `categoryNameVariants`,
     `drift`, `vat` (count of rows per normalised rate, and the list of rows whose normalised rate is 0 and whose
     restriction is non-null), and `trace` (source row number, slug, and product id once written). VAT values are
     never altered and are not written to the database.
R27. Before and after `--apply` the importer counts `Product`, `Category`, `Inventory` and
     `ProductRestrictionAuditLog` rows per `vendorId` for every vendor other than the target, prints both, and
     exits 1 if any count differs.
R28. No output of the importer, provisioner or verifiers contains a database connection string, password or
     API key; `tests/catalogue-import-guards.test.ts` asserts the new scripts never log `process.env` values
     other than the guard's host.

## C. Verification, isolation and runbook

R29. `npx tsx scripts/verify-onboarding.ts <vendor-slug> --expect-hidden` is read-only, applies the same host
     guard, and exits 0 only when the vendor exists, has at least one `VendorDomain` row, and has zero active
     products, zero active categories, zero `Inventory` rows whose `stockMode` is not `UNKNOWN`, and zero
     `Inventory` rows with a non-zero `quantity`; otherwise it exits 1 naming each failed check with its count.
R30. The new scripts and `lib/catalogue-import/` contain no call to `.delete(` or `.deleteMany(`, no raw SQL
     (`$queryRaw`, `$executeRaw`), and write only through `create`, `createMany`, `update` and `upsert` scoped
     by the target `vendorId`.
R31. `docs/developer-portal/client-onboarding-prerequisites.md` contains the headings `## Procedure`,
     `## Testing and validation` and `## Rollback`, the Procedure lists the commands in the order
     validate-manifest, check-ready, provision, list-departments, dry-run, apply, verify-onboarding,
     emit-route, and Rollback states that no step deletes data and that removal needs explicit owner approval.
R32. `prisma/manifests/README.md` documents `placeholders`, `--check-ready` and `--emit-route`;
     `prisma/manifests/example-import-profile.json` exists, uses only neutral names, and passes the profile
     validation of R9 (`npx tsx scripts/import-catalogue.ts --validate-profile prisma/manifests/example-import-profile.json`
     exits 0).
R33. On the dev database, provisioning the test vendor (slug `aheedsuperstore`, display name `Aheed Super Store`,
     host `aheedsuperstore.localhost:8787`, Aheed Food Centre's seeded branding values, marked placeholders for
     delivery fee, free-delivery threshold, minimum order, postcode prefixes, sender e-mail and footer address)
     succeeds, and the `Vendor`, `VendorDomain`, `Product`, `Category` and `Inventory` row counts of Aheed Food
     Centre and SriMart are identical before and after.
R34. On the dev database, importing a synthetic file into the test vendor twice satisfies R22 and R24, and
     `verify-onboarding.ts aheedsuperstore --expect-hidden` exits 0 afterwards; under `npm run preview` a request
     with `Host: aheedsuperstore.localhost:8787` shows no products and no categories, and a request for Aheed
     Food Centre's host shows the same product count as before the import.
R35. A dry run (no `--apply`) of the supplied client stock export through a profile built from ADR-007's table
     discards the 3 rows above the header and the footer rows below the data, reports as data rows exactly the
     rows the validator counts independently as having a non-blank PLU or a non-blank Dept cell, and gives
     `restrictionCounts` equal to counts the validator computes independently from the same file (case- and
     whitespace-insensitive match on the Dept cell: TOBACCO and ALCOHOL for `AGE_RESTRICTED`; INSTANT LOTTERY for
     `PROHIBITED`; PHONE CARDS, NEWS, E-PAY and STAMPS for `NOT_DELIVERABLE`); every data row in the `DEFAULT`
     department and every row priced 0 that is not already in a stricter class is counted under `NEEDS_REVIEW`;
     and rejected plus plannable rows equals the data-row count. The file stays outside the repository.
     Planning-time measurement for orientation, not the pass condition: 6,160 data rows, 8 footer rows,
     27 distinct departments, TOBACCO 26, ALCOHOL 1, INSTANT LOTTERY 1, PHONE CARDS 15, NEWS 5, E-PAY 1,
     STAMPS 1 and DEFAULT 1,089. (`#1201` records 6,167 data rows, which counts 7 footer rows as data, and
     `#1200` states 24 not-deliverable lines while its own list sums to 23 including the lottery line, which
     ADR-007 reclassifies `PROHIBITED`; the validator's independent count decides, not those figures.)
R36. `git diff` against `origin/staging` shows no change to `wrangler.toml`, `.github/`, `prisma/schema.prisma`,
     `prisma/migrations/`, `scripts/lib/protected-hosts.ts` or `scripts/verify-worker-routes.ts`, and
     `tests/protected-hosts.test.ts` and `tests/worker-routes.test.ts` pass unchanged.
R37. `scripts/verify-catalogue-import.ts` applies the host guard before any client and provides `--snapshot <file>`
     (writes per-vendor row counts of `Vendor`, `VendorDomain`, `Product`, `Category`, `Inventory` and
     `ProductRestrictionAuditLog` to the file), `--diff <a> <b> --except <slug>` (exits 1 and names each
     difference for vendors other than `<slug>`), `--counts --vendor <slug>`, `--audit --vendor <slug>` and
     `--unique-probe --vendor <slug>`; the probe attempts to create a `Category` whose slug duplicates an existing
     category slug of that vendor, so it cannot succeed and leaves no row, and it exits 1 for a vendor with no
     category; apart from the snapshot file the script writes nothing.
R38. `CHANGELOG.md` is updated (Gate 4) with an entry citing `#1216` and the slice folder.
R39. `npm run lint`, `npm run typecheck`, `npm run format:check`, `npx vitest run --maxWorkers=4`,
     `npm run kms:validate` and `npm run kms:check-generated` all exit 0 after this slice, and `npm run
     kms:coverage` reports `baseline matches`.
