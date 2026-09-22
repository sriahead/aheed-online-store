# KMS enforcement foundation (requirements / acceptance criteria)

Closes `#861`. Repairs the three broken KMS enforcement controls found by the strategy section 24
Steps 1 to 4 analysis, applies unresolved decision **U7**, and lands the coverage ratchet. Builds on
`kms-strategy-evaluation` (v2.0.0, `status: review`) and `sdd-workflow`. Nothing outside `kms/`,
two checked-in generated artifacts, `.github/workflows/quality.yml` and `tests/` is touched; no
document body is edited, and no file is moved, renamed or deleted.

Throughout, **slice-local file** means a file named `requirements.md`, `validation.md` or
`build-notes.md` located directly inside a dated slice directory under `specs/` (a directory whose
name begins with four digits, a hyphen, two digits, a hyphen, two digits).

## The walker

R1. `kms/schema/repo.ts` excludes the repository-root `graft/` directory from `walk()` using its
    root-anchored path exclusion, not a bare directory-name match, so a directory named `graft`
    nested anywhere else is unaffected.

R2. `npm run kms:validate` reports a scanned-file count that includes no path beginning `graft/`,
    and that count is 700 or fewer (it is 628 plus whatever this slice itself adds; before this
    slice the same command reports 1,281).

R2a. *(Prerequisite fix discovered mid-slice.)* `scripts/sdd-check.ts`'s pre-clear slice detection
     selects only slice directories in which at least one of the four spec files was **added** on
     this branch relative to its base, rather than every slice directory containing any changed
     file. `npm run sdd:preclear` exits zero on this branch, and the only slice it reports is
     `specs/2026-09-22-kms-enforcement-foundation/`.

     Needed because R6 edits files inside 7 historical slice directories, which made the existing
     detection demand the full four-file contract from slices that shipped in August — three of
     which pre-date the convention. Verified pre-existing: `build-notes.md` and `validation.md` are
     absent from those slices on `origin/staging`, and
     `specs/2026-08-22-ui-polish-docs-integration/build-notes.md` has never carried the four
     required headings. The gate's purpose is that the slice **under work** is fully on disk; a
     months-old slice whose front-matter this branch strips is not under work. No historical spec
     file is created, backfilled or modified to satisfy this requirement.

R3. `kms/schema/repo.ts` exports a single predicate identifying a slice-local file, and
    `kms/schema/validate.ts` and the coverage ratchet of R11 both use that one exported predicate
    rather than each restating the rule.

## U7 — slice-local files

R4. `npm run kms:validate` reports slice-local files in their own labelled category, separate from
    and not counted within the "no front-matter" warning category. On the repository as this slice
    leaves it: the "no front-matter" count is exactly **15**, the valid-front-matter count is
    exactly **195**, and the valid, slice-local and "no front-matter" counts sum to the scanned
    count with nothing left over.

    The absolute scanned and slice-local numbers are deliberately not fixed here because this slice
    adds files to both: its own `plan.md` is the 195th valid document, and its own `requirements.md`,
    `validation.md` and `build-notes.md` are slice-local. 15 and 195 are the two numbers that do not
    move.

R5. `npm run kms:validate` exits non-zero, naming every offending path, when any slice-local file
    contains a front-matter block.

R6. No slice-local file in the repository contains a front-matter block. This requires removing the
    front-matter block, and only the front-matter block, from the 18 files listed in
    `validation.md`'s R6 row; the body of each of those 18 files is byte-identical to its state
    before this slice apart from the removal of that block and its delimiters.

R7. `ARTIFACT_INDEX.md` reports exactly 195 artifacts — the 212 of today, minus the 18 of R6, plus
    this slice's own `plan.md` — and contains no row whose path ends `/requirements.md`,
    `/validation.md` or `/build-notes.md`.

## Track derivation

R8. `kms/schema/frontmatter.ts` declares, adjacent to the `Audience` enum, two named exported
    constants: a mapping from every audience value to its track, and an ordered list of tracks
    expressing precedence as `staff-ops`, then `internal-eng`, then `customer-help`. `trackFor()`
    returns the first track in that ordered list to which any of the document's audiences maps, and
    contains no conditional branch naming an individual audience value.

R9. The audience-to-track mapping of R8 is typed so that it must cover the `Audience` enum
    exhaustively: adding a value to `Audience` without adding a corresponding entry to the mapping
    makes `npm run typecheck` exit non-zero. The precedence list of R8 is likewise typed to cover
    every `Track` value.

R10. `trackFor()` returns `staff-ops` for `docs/operations-research/order-fulfilment-core.md`,
     `specs/2026-09-22-kms-pilot-orders-fulfilment/plan.md`,
     `docs/platform-admin-guide/platform-admin-guide.md` and
     `docs/business-analysis/business-case.md`; and returns `customer-help` for exactly one document
     in the repository, `docs/shopper-help/shopping-guide.md`.

## Visibility and assembly

R11. `kms/scripts/assemble.ts` writes a document into a site's content directory only when the
     document's own `visibility` field equals the site being assembled **and** that document's
     derived track maps to the same site. A document failing either condition is written nowhere.

R12. `npm run kms:validate` exits non-zero, naming every offending path, when a document's derived
     track maps to a site that differs from that document's declared `visibility`.

R13. After `npm run kms:assemble:internal`, the file
     `kms/site-internal/content/staff/runbook/order-fulfilment-core.mdx` exists.

R14. A test in `tests/` asserts that no document carrying `visibility: internal` can be routed to
     the public site, by exercising the assembly routing rule directly rather than by inspecting a
     previously assembled directory on disk.

## Coverage ratchet

R15. A checked-in baseline file records, per directory, the number of files that the walker of R1
     scans, that are not slice-local, and that carry no front-matter. Its recorded total is 15
     across 8 directories, matching the table in `validation.md`.

R16. A new npm script runs the ratchet. It exits zero when the measured per-directory counts equal
     the baseline exactly, and exits non-zero naming each differing directory and both numbers when
     any directory's measured count differs from its baseline in either direction, including when a
     directory is present in one and absent from the other.

R17. The ratchet script accepts a flag that rewrites the baseline file from the measured counts and
     exits zero, and that flag is the only way the baseline file is written.

R18. The ratchet runs in the `kms` job of `.github/workflows/quality.yml` and in no caller workflow.

## Regression and gates

R19. `tests/kms-frontmatter.test.ts` asserts the R8 precedence, including that an audience list of
     `dev` plus `customer` derives `internal-eng` and that an audience list of `dev` plus `staff`
     derives `staff-ops`; no assertion of the superseded first-match behaviour remains in the file.

R20. After running `npm run kms:build-index` then `npm run kms:assemble:internal`,
     `npm run kms:check-generated` exits zero and `git status --porcelain --untracked-files=no`
     produces no output. Untracked files are excluded from this check because `#857` leaves the
     assembled content untracked; that defect is out of scope here and must not be masked by
     rewording the requirement.

R21. `npm run kms:assemble:internal` followed by a real Next build in `kms/site-internal` both exit
     zero.

R22. `git diff --name-only` for this slice against `origin/staging` lists no path under `prisma/`,
     `lib/`, `features/`, `components/` or `app/` other than `app/(admin)/staff/runbook/docs.ts`,
     and lists no deleted or renamed file.

R23. `CHANGELOG.md` updated (Gate 4).

R24. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
