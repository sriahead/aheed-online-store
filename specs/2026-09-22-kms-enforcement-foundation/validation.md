# KMS enforcement foundation (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

This slice is build tooling, CI governance and generated artifacts. There is no UI, no route, no
database access, no auth surface and no external dependency, so **Performance, Resilience,
Accessibility and Security testing are not applicable** and no `npm run preview` step is required —
nothing here touches Prisma or the Workers runtime. Confidence comes from Unit tests over the pure
derivation and predicate functions, Integration checks over the three `kms:` scripts and their
checked-in artifacts, and one System check that the internal docs site still builds and now carries
the document that was missing from it.

1. **Unit Testing** — `trackFor()` precedence, enum exhaustiveness, the slice-local predicate, and
   the assembly routing rule, in `tests/`.
2. **Integration Testing** — `kms:validate`, `kms:build-index`, `kms:check-generated` and the new
   ratchet script against the real repository tree.
3. **System / End-to-End Testing** — a real Nextra build of `kms/site-internal` over freshly
   assembled content.
4. **Regression & Acceptance Testing** — the root gates, plus a diff-shape check proving no
   application code, document body, move, rename or deletion rode along.

## The 18 slice-local files whose front-matter is removed (R6)

Each of these carries a front-matter block today and must not after this slice. Verified before the
slice: no document in the repository references any of their `id` values through `related`.

1. `specs/2026-08-13-p7a-compliance-hardening/requirements.md`
2. `specs/2026-08-13-p7a-compliance-hardening/validation.md`
3. `specs/2026-08-21-p8-storefront-branding-webp/requirements.md`
4. `specs/2026-08-21-p8-storefront-branding-webp/validation.md`
5. `specs/2026-08-21-view-switcher/requirements.md`
6. `specs/2026-08-22-ui-polish-docs-integration/build-notes.md`
7. `specs/2026-08-22-ui-polish-docs-integration/requirements.md`
8. `specs/2026-08-22-ui-polish-docs-integration/validation.md`
9. `specs/2026-09-12-staff-admin-help-ratings/build-notes.md`
10. `specs/2026-09-12-staff-admin-help-ratings/requirements.md`
11. `specs/2026-09-12-staff-admin-help-ratings/validation.md`
12. `specs/2026-09-12-staff-panel-operability/build-notes.md`
13. `specs/2026-09-12-staff-panel-operability/requirements.md`
14. `specs/2026-09-12-staff-panel-operability/validation.md`
15. `specs/2026-09-13-p401-shared-fulfilment-slots/requirements.md`
16. `specs/2026-09-13-p401-shared-fulfilment-slots/validation.md`
17. `specs/2026-09-13-p402-express-sla/requirements.md`
18. `specs/2026-09-13-p402-express-sla/validation.md`

## The 8 baseline directories and 15 files (R15)

| Directory | Uncovered files | Which |
| :--- | ---: | :--- |
| repository root | 5 | `ARTIFACT_INDEX.md`, `CHANGELOG.md`, `GEMINI.md`, `README.md`, `issue.md` |
| `.github` | 2 | `issue_body.md`, `pull_request_template.md` |
| `docs/ui-ref` | 1 | `README.md` |
| `docs/ui-ref-revised` | 1 | `README.md` |
| `hooks` | 1 | `README.md` |
| `kms/site-internal` | 3 | `AGENTS.md`, `CLAUDE.md`, `README.md` |
| `specs/2026-08-19-p7-closeout` | 1 | `rls-experiment.md` |
| `specs/2026-09-17-claude-md-guardrail-refactor` | 1 | `migration-ledger.md` |

The last two are inside dated slice directories but are not slice-local: the predicate is exactly
the three template filenames, so these two count as ordinary uncovered documents.

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Integration  | `npm run kms:validate` prints no path beginning `graft/` in any category. Confirm the exclusion is root-anchored by reading `kms/schema/repo.ts`: the `graft` term appears in the root-anchored path pattern, not in the directory-name set. |
| R2  | Integration  | `npm run kms:validate` prints a scanned count of 700 or fewer on its first line, and its full output contains no occurrence of `graft/`. For contrast, the same command on `origin/staging` reports 1,281. |
| R3  | Unit         | Read `kms/schema/repo.ts` and confirm exactly one exported slice-local predicate. Confirm `kms/schema/validate.ts` and the ratchet script both import it and that neither restates the filename list or the dated-directory pattern. |
| R4  | Integration  | `npm run kms:validate` prints a distinct labelled line for slice-local files, a valid-front-matter count of exactly **195**, and a "no front-matter" count of exactly **15**. Add the three category counts together and confirm the total equals the scanned count printed on the first line. |
| R5  | Integration  | Add a front-matter block to any one slice-local file, run `npm run kms:validate`, and confirm it exits non-zero and names that exact path. Revert the edit and confirm it exits zero again. Check the exit code explicitly with `npm run kms:validate; echo $LASTEXITCODE` in PowerShell. |
| R6  | Integration  | For each of the 18 paths listed above, confirm the file's first line is not `---`. Then confirm the bodies are otherwise untouched by diffing **only those 18 paths**: `git diff origin/staging...HEAD -- <the 18 paths>` shows removed lines only, every removed line lies inside a leading front-matter block, and no line is added or modified. Do not diff all of `specs/` for this row — this slice legitimately adds its own spec directory there. |
| R7  | Integration  | `ARTIFACT_INDEX.md` states `195` artifacts in its generated header line, and searching it for `/requirements.md)`, `/validation.md)` and `/build-notes.md)` returns no match. |
| R8  | Unit         | Read `kms/schema/frontmatter.ts` and confirm an exported audience-to-track mapping and an exported ordered track-precedence list sit adjacent to the `Audience` enum, that the list reads staff-ops, internal-eng, customer-help, and that the body of `trackFor()` names no individual audience value. |
| R9  | Unit         | `npm run typecheck` exits zero as written. Then add a value to the `Audience` enum without adding a matching entry to the audience-to-track mapping, re-run `npm run typecheck`, and confirm it exits non-zero naming that mapping. Revert the enum edit and confirm `npm run typecheck` exits zero again. |
| R10 | Unit         | A test in `tests/kms-frontmatter.test.ts` asserts each of the four named documents' audience lists derive `staff-ops`. Separately, `npm run kms:build-index` then reading `ARTIFACT_INDEX.md` shows exactly one document grouped under the customer-help track, and it is `docs/shopper-help/shopping-guide.md`. |
| R11 | Unit         | Read `kms/scripts/assemble.ts` and confirm the write is guarded by both conditions. The test of R14 exercises the rule; a passing `npx vitest run` covers it. |
| R12 | Integration  | `npm run kms:validate` exits zero on the repository as it stands. Then edit `docs/shopper-help/shopping-guide.md`'s `visibility` from `public` to `internal`, re-run, and confirm it exits non-zero naming that path. Revert the edit. |
| R13 | System       | `npm run kms:assemble:internal`, then confirm `kms/site-internal/content/staff/runbook/order-fulfilment-core.mdx` exists on disk. |
| R14 | Unit         | `npx vitest run` passes, including a named test asserting an internal-visibility document is never routed to the public site. Confirm by reading the test that it calls the routing rule directly and reads no assembled directory. |
| R15 | Integration  | Open the checked-in baseline file and confirm its recorded counts match the 8-row table above exactly, directory for directory, and total 15. |
| R16 | Integration  | The ratchet npm script exits zero as the repository stands. Then create an empty `.md` file with no front-matter under `hooks/`, re-run, and confirm it exits non-zero naming `hooks` with both the baseline and measured numbers. Delete that file, re-run, and confirm it exits zero. Then delete `hooks/README.md`, re-run, and confirm it also exits non-zero — proving the check fails on a decrease as well as an increase. Restore the file with `git checkout -- hooks/README.md`. |
| R17 | Integration  | Run the ratchet with its update flag against a deliberately changed tree (the extra `hooks/` file from R16 still present), confirm it exits zero and rewrote the baseline. Then `git checkout --` the baseline file and delete the extra file. Confirm no other command in `package.json` writes the baseline. |
| R18 | Integration  | `.github/workflows/quality.yml` runs the ratchet inside the `kms` job. Confirm `deploy-staging.yml`, `deploy-production.yml` and `gates.yml` contain no ratchet invocation of their own. |
| R19 | Unit         | `npx vitest run tests/kms-frontmatter.test.ts` passes, and the file contains an assertion that a `dev` plus `customer` audience derives `internal-eng` and one that a `dev` plus `staff` audience derives `staff-ops`. Searching the file for `customer-help` finds it only in the customer-only assertion. |
| R20 | Integration  | Run `npm run kms:build-index`, then `npm run kms:assemble:internal`, then `npm run kms:check-generated` — the last exits zero. Then `git status --porcelain --untracked-files=no` produces no output. Untracked assembled content is expected and is `#857`, not a failure of this row. |
| R21 | System       | `npm run kms:assemble:internal` then, from `kms/site-internal`, `npx next build --webpack` — both exit zero. Read the real exit status; a build that prints errors and still returns zero is a failure for this row. |
| R22 | Regression   | `git diff --name-only origin/staging...HEAD` lists no path under `prisma/`, `lib/`, `features/` or `components/`, and the only `app/` path is `app/(admin)/staff/runbook/docs.ts`. `git diff --name-status origin/staging...HEAD` contains no line beginning `D` or `R`. |
| R23 | Acceptance   | `CHANGELOG.md` carries this slice's entry under `[Unreleased]`, naming `#861`. |
| R24 | Regression   | `npm run lint`, `npm run typecheck`, `npm run format:check` each exit zero, and `npx vitest run` passes with no unexecuted files. Run vitest on its own, not beside or straight after a build. |
