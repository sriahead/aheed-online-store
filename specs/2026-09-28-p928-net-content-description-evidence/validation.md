# #928 — Product description as net-content evidence (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests.
>
> - **Build:** did we build the component correctly? Unit tests cover the excerpt, the size
>   finder, the four validator rules, the prompt both ways, and the run loop's shared excerpt.
> - **Validate:** does it work in the real system? The live rows below run against **dev**, with
>   real Workers AI calls.

## Before any live row

1. Confirm that `.env` and `.dev.vars` both point `DATABASE_URL`/`DIRECT_URL` at
   `ep-dry-morning-zab7dx08` (dev). Diff both against `secrets/staging.vars` and
   `secrets/production.vars` so that neither points at staging or production.
2. Confirm the Cloudflare AI credentials (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`) are
   present in `.dev.vars`.
3. Run `npm run db:generate` after checkout, so the bare `@prisma/client` the script uses knows
   `DESCRIPTION`.

## Reading dev and signing in

**Reading dev.** Use a short `npx tsx` script with the bare `@prisma/client` and `PrismaNeon`,
against dev's `DIRECT_URL`, the same shape `scripts/suggest-net-content.ts` uses. Prisma Studio also
works.

**Product ids.** Find them by `vendor.slug = "aheed-food-centre"` and product `slug`.

**Eligibility.** A product is eligible when:
- it is active;
- `netContentAmount` is null;
- it has no `NetContentSuggestion` with `status = PENDING`.

`--include-attempted` lifts the "never attempted before" rule only. If a target product has a
PENDING row left over from an earlier slice, **do not reject it to make room**: record it as
ineligible, as R13 allows.

**Signing in.** Use the curl sign-in and cookie technique in
`docs/developer-portal/local-dev-playbook.md`, with the `demo-store-admin@example.com` account from
`scripts/demo-accounts.ts` (password in `secrets/staging.vars` / `.dev.vars`, see
`docs/developer-portal/env-setup.md` "Demo accounts").

**Cost.** R13 and R15 spend real Workers AI neurons: about 5 per call, four calls at most. Keep the
rows they create; they are the evidence.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Read | `git diff --name-only origin/staging -- prisma/migrations` lists exactly one new `…_p928_net_content_description_evidence/migration.sql`. Read it: the only statement is `ALTER TYPE "NetContentEvidenceSource" ADD VALUE 'DESCRIPTION';`. `grep -ci drop <that file>` prints `0`. Read `prisma/schema.prisma`'s enum for the four values. |
| R2  | Integration (dev) | Query dev: `SELECT enum_range(NULL::"NetContentEvidenceSource")` (via a read-only `$queryRaw` in a throwaway script) includes `DESCRIPTION`. `npx prisma migrate status` against dev's `DIRECT_URL` reports up to date. Do **not** use `prisma migrate dev` (`#895`: it offers a reset). |
| R3  | Unit | Tests in `tests/net-content-suggester.test.ts` cover (a) `""` and `"   "` returning `""`; (b) a 45-character description returned trimmed and unchanged; (c) a 600-character description with a word straddling character 500: the result is ≤ 500 characters and does not end with that word's first part. A 600-character string with no whitespace returns its first 500 characters. Assert `DESCRIPTION_EXCERPT_CHARS === 500`. |
| R4  | Unit | One test asserts each of the seven examples in R4 with `toEqual`, exactly. |
| R5  | Unit | Starting from a reply that passes (Coconut Milk: name `Coconut Milk`, `descriptionSent` = the pilot description, evidence `400ml tin`, `400 MILLILITRE`), four tests each break one rule and expect `null`: (a) `descriptionSent: ""`; (b) evidence `500ml tin`; (c) name `Coconut Milk 400ml`; (d) `descriptionSent` = `Rich coconut milk, 400ml tin, also available in 1L`. One test covers Croissants: `4 EACH` quoting `pack of 4` passes, and `1 EACH` quoting the same fails. |
| R6  | Unit / Read | For each of the two files, print the `it(` titles on `origin/staging` with `git show origin/staging:<file> \| grep -oE "it\(['\"\`][^'\"\`]*"`, which covers all three quote styles. Every one also appears in the working-tree file (a `grep -F` per title, or a short script). Then `npx vitest run tests/net-content-suggester.test.ts tests/net-content-run.test.ts` exits 0. |
| R7  | Unit | A test builds the prompt with `description: "Free range eggs, box of 6."` and no photo. It asserts: the exact line `Description: Free range eggs, box of 6.` appears after the `Unit label:` line; the `"PHOTO"\|"NAME"\|"UNIT_LABEL"\|"DESCRIPTION"` list is present; the three rules (c)–(e) are present by substring; and `use only the name and unit label` is absent. |
| R8  | Unit + Read | The test in R8 exists, compares against full literal strings, and passes. **Independent check:** `git show origin/staging:lib/net-content-suggester.ts > lib/__p928_staging_suggester.ts`. Then run a throwaway `npx tsx` script that calls both functions with `{ name: "Test", unitLabel: "£1 / each", hasPhoto: false/true, storeDescription: null }`, the new one also with `description: ""`. It prints `true` for both equality checks. Delete the temporary file afterwards; `git status` shows it gone. |
| R9  | Unit | The test in R9 exists in `tests/net-content-run.test.ts` and passes. Read it: the mocked suggester's received `description` has length ≤ 500 and equals `descriptionExcerpt(fullText)`; the two quoted replies give NO_ANSWER and PENDING/`DESCRIPTION` as stated. |
| R10 | Read | Run `git diff origin/staging -- lib/repositories/net-content-suggestions.ts`. There are no `-` lines, and every `+` line lies inside `EligibleProduct` or `listEligibleProductsForNetContent`. |
| R11 | Read | Run the exact `git diff origin/staging -- …` command in R11. Output is empty. |
| R12 | Read + E2E | `grep -n 'DESCRIPTION: "description"' "app/(admin)/staff/net-content/page.tsx"` prints one line. `npm run typecheck` exits 0. The live half is R14. |
| R13 | E2E (dev) | Before: record, for the three products, `netContentAmount` and their existing suggestion rows (ids, statuses). Run the R13 command once per eligible product. After: list the new rows (created after the before-snapshot) with `status`, `amount`, `unit`, `evidenceSource`, `evidenceText`. Check (a) value by value, and (b) by counting. For (c), re-read the three products' `netContentAmount`: unchanged, still null. Paste the script's printed summary lines into `build-notes.md`. |
| R14 | E2E (dev) | Start `npm run preview`. Sign in as `demo-store-admin@example.com` and `curl` `http://localhost:8787/staff/net-content`. For each PENDING row from R13, the HTML contains `from the description`, and that row's `evidenceText`, HTML-escaped (for example `pack of 4`). |
| R15 | E2E (dev) | Pick an eligible Aheed product with a metric size in its name. Check it with `metricSizesIn(name)` in a throwaway `npx tsx` call, and record the name. Run the script with `--product <id> --include-attempted --limit 1`. The new row is NO_ANSWER, or PENDING with `evidenceSource` other than `DESCRIPTION`. If no eligible product with a sized name exists on dev, record that and mark R15 as proven by R5(c)'s unit test only. **Do not create or edit a product to manufacture one.** |
| R16 | Read | Run `grep -n "#928" specs/architecture.md`: it prints a line in the `#900` net-content paragraph. Read that paragraph for the three facts in R16. Compare the front-matter with `git show origin/staging:specs/architecture.md \| head -12`. |
| R17 | Read | Run `grep -n -i "description" docs/staff-playbook/staff-tabs-guide.md` and read the hits inside the `/staff/net-content` section. The **From the …** sentence includes the description, and one sentence tells staff to check a description quote. Front-matter: `version` > `2.8.0`, and `updated` ≥ `2026-09-28`. |
| R18 | Gate | Run each command in R18 exactly as written. `grep -c "p928-net-content-description-evidence/plan.md" ARTIFACT_INDEX.md` prints `1`. |
| R19 | Gate | `grep -n "#928" CHANGELOG.md` shows an entry under `## [Unreleased]`. |
| R20 | Gate | `npm run lint`, `npm run typecheck` and `npm run format:check` each exit 0. Then run `npx vitest run` **alone**, with no build running. It exits 0, and its file count matches the number of test files, so no file silently failed to start. **CI on the PR is ground truth.** |
