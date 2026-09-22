# KMS enforcement foundation (build notes)

Written at the end of Build, **before** the Clear. This is the one artifact the Clear bets on:
the validating context is fresh and has only the spec, the artifact, and this file.

No front-matter — like `requirements.md` and `validation.md` this is slice-local, not a KMS
artifact, and it does not get an `ARTIFACT_INDEX.md` entry. This slice is what makes that rule
enforced rather than merely stated, so this file is also its own first test case.

Branch `feature/861-kms-enforcement-foundation`, cut fresh from `staging` at `b889d04`. Two
commits: `dffa433` (spec) and `0fa1fca` (implementation).

## What changed and why

**`kms/schema/repo.ts`** — added `graft` to the root-anchored `EXCLUDE_PATH_PATTERN`, and added the
single exported `isSliceLocal()` predicate that `validate.ts` and the ratchet both use.

`graft/` is gitignored and untracked, so it exists on a machine that has run the graft indexer and
never on a CI checkout: `kms:validate` scanned 1,281 files locally against ~628 in CI, with 653 of
the 1,069 "no front-matter" warnings being graft cards. Every count the module feeds was therefore
machine-dependent. Root-anchored rather than a bare directory-name exclusion, matching `.gitignore`.

**`kms/schema/frontmatter.ts`** — replaced `trackFor()`'s `if` cascade with `AUDIENCE_TRACK`
(`Record<Audience, Track>`, exhaustive at compile time) plus `TRACK_PRECEDENCE`
(`staff-ops`, `internal-eng`, `customer-help`, exhaustive over `Track` via the `exhaustiveTracks`
helper). Added `TRACK_SITE`, the track-to-surface mapping, which now lives in the schema because
`validate.ts` needs the same fact and two copies would drift.

The old derivation returned the **first** matching branch with customer audiences tested first, and
`platform-admin` appeared in the enum and in no branch at all. Four documents re-route, all
corrections; `docs/platform-admin-guide/` stops rendering in the engineering section.

**`kms/scripts/assemble.ts`** — extracted the routing rule into the exported pure function
`destinationFor(fm, site)`, which requires **both** the track's site and the document's own
`visibility` to match the site being assembled. The second condition is the fix: assembly never read
`visibility` at all, so `docs/operations-research/order-fulfilment-core.md` (`visibility: internal`,
audience including `shopper`) was routed to the public site and was absent from the internal docs
site entirely. `TRACK_TO_DIR` became `TRACK_SUBDIR` (folder names only; the site comes from
`TRACK_SITE`). Added a `require.main === module` guard so `tests/` can import the function without
executing the whole assembly — without it, `parseArgs()` would `process.exit(1)` on the test
runner's argv.

**`kms/schema/validate.ts`** — two new failing categories and one new expected category:
slice-local files are reported separately (not as warnings); a slice-local file **carrying**
front-matter fails; and a document whose derived track and declared `visibility` disagree fails.

**The 18 stray slice-local files** — front-matter blocks removed. 213 lines deleted, 0 added.

**`kms/scripts/coverage-ratchet.ts` + `kms/coverage-baseline.json` + `kms:coverage`** — new. Counts
uncovered, non-slice-local markdown per directory and fails on any drift from the checked-in
baseline. Wired into `quality.yml`'s `kms` job only, never a caller (`#537`).

**`tests/kms-frontmatter.test.ts`** — 5 tests became 17, covering the new precedence, the
`platform-admin` fall-through, the four re-routed documents by their real audience lists, the
assembly routing rule in both directions, and `isSliceLocal()`.

**Generated artifacts** — `ARTIFACT_INDEX.md` 212 → **195** and `app/(admin)/staff/runbook/docs.ts`
rebuilt to match.

## Decisions taken during the build

- **`TRACK_SITE` lives in the schema, not in `assemble.ts`.** The spec only required assembly to
  read `visibility` and validation to check agreement; it did not say where the shared fact should
  live. Putting it in `frontmatter.ts` leaves `assemble.ts` owning only folder names, which are a
  build detail. Two copies of "which surface does this track render on" would have been free to
  drift, which is the defect class this slice exists to close.
- **`trackFor()`'s unreachable branch throws instead of returning `internal-eng`.** Both mappings
  are compiler-enforced and `audience` is `min(1)`, so the fall-through cannot be reached. Returning
  a default there would reintroduce exactly the silent behaviour that hid `platform-admin` for weeks.
- **Precedence is `staff-ops` first, not `internal-eng` first.** Measured both orderings against all
  212 documents before choosing. Engineering-first files `order-fulfilment-core.md` under `dev/`;
  staff-first puts it in `staff/`, where its primary audience looks. Recorded in `plan.md` §3 with
  the four-document table.
- **The baseline JSON carries a `total` alongside `directories`.** Redundant — it is the sum — but
  it makes the one number a human cares about readable without adding up eight rows, and it is
  regenerated, never hand-edited.
- **One UTF-8 BOM removed.** `specs/2026-08-21-p8-storefront-branding-webp/validation.md` began
  `EF BB BF` before its `---`, almost certainly the `Set-Content` double-encoding `CLAUDE.md` warns
  about. Stripped with the front-matter block, since leaving it would have left a file starting with
  an invisible byte and no front-matter.
- **Seven files also lost a blank separator line** after their closing `---`. Prettier does not
  accept a leading blank line in Markdown, so `format:check` would have failed had they been kept.
  This is within R6's "the block and its delimiters"; it is called out here so a validator reading
  the diff is not surprised by a 12-line removal where the front-matter was 11 lines.

## Deviations from the spec

None in substance. Two wording notes for the validator:

- **R15 says "matching the table in `validation.md`".** The generated baseline matches that 8-row
  table exactly, including the two slice-directory entries (`rls-experiment.md`,
  `migration-ledger.md`) that are *not* slice-local.
- **R4 pins only the "no front-matter" count (15) and the valid count (195)**, deliberately, because
  this slice adds files to the scanned and slice-local totals. As built, `kms:validate` reports
  scanned 632, valid 195, slice-local 422, no-front-matter 15 once this `build-notes.md` exists —
  632 = 195 + 422 + 15. Before this file was written the numbers were 631 / 195 / 421 / 15. **If the
  validator sees 422 rather than 421, that is correct, not drift.**

## Known-shaky areas

- **The `exhaustiveTracks` helper is a type-level trick.** `Track extends T[number] ? unknown :
  never` makes the argument unassignable when a track is missing. It compiles and `typecheck`
  passes, but R9's negative case — adding a `Track` value and confirming `typecheck` *fails* — was
  not exercised during Build. The `Audience` half of R9 is the one that matters more and is easier
  to exercise; both need the deliberate-break test at Validate.
- **`kms:validate`'s new checks were proven by construction, not by a deliberate break.** The
  slice-local-with-front-matter path fired for real on all 18 files before they were fixed, so that
  one is genuinely exercised. The **track/visibility disagreement** check has only ever reported 0 —
  it has never fired. R12's validation row exists precisely to force it to fire once.
- **The ratchet's failure path was smoke-tested, not unit-tested.** Verified by hand in both
  directions (exit 1 on an added file, exit 1 on a removed one, exit 0 restored). There is no test
  file for `coverage-ratchet.ts`; the spec did not ask for one, and the check is itself a CI gate.
  Worth a second look at whether that is enough.
- **`kms/site-public/content/customer/shopping-guide.mdx` is stale**, still in the pre-`#853` flat
  layout rather than `customer/guide/`. Untouched here: the public site is out of scope, and
  `kms:assemble:public` was deliberately not run, so this slice changes nothing under
  `kms/site-public/`. Running it would correct the layout and is a reasonable follow-up.
- **`#857` makes `git status` noisy.** `npm run kms:assemble:internal` leaves ~194 untracked `.mdx`
  files because `.gitignore` still matches the pre-`#853` layout. R20 uses
  `--untracked-files=no` for exactly this reason. **Do not "fix" a failing tree-clean check by
  committing assembled content** — it is generated output and `#857` is the real defect.
- **The `docs.ts` diff is large and entirely generated.** 18 documents removed and 4 re-routed
  rewrites a lot of a 2.5 MB file. Nothing in it is hand-edited; `kms:check-generated` is the proof.
