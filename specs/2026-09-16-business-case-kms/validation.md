# Living stakeholder business case as a milestone-reviewed KMS artifact (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

1. **Unit Testing** — the two pure parsers in `scripts/sdd-check.ts` and the comparison between them.
2. **Integration Testing** — `npm run sdd:audit` against the real repository; `npm run kms:validate` and `npm run kms:build-index` against the real document.
3. **System / End-to-End Testing** — the KMS internal-site build, which is the only thing that surfaces the MDX traps.
4. **Regression & Acceptance Testing** — `sdd:preclear` unchanged; the twelve content areas present; no unsourced figure.
5. **Performance & Resilience Testing** — not applicable. No request-path code, no query, no route.
6. **Security & Accessibility Testing** — one row only, and it is a real one: the document must not be readable by a vendor store admin, because it carries platform commercials. Verified through the audience filter rather than by rendering.

---

## Before you start

**This slice touches no runtime code.** Nothing here reaches a database, a route or a customer. The
risks are entirely (a) the document asserting something the repository does not support, and (b) the
check silently not working.

**The MDX traps are the likeliest build breakage.** `CLAUDE.md` records three separate occasions
where a bare `{...}` or a `<` before a digit passed every root gate and broke
`deploy-docs-internal` after merge. A document full of prices and percentages is unusually exposed:
write `under 1%`, never `<1%`, and backtick anything brace-shaped. R10's command is the only check
that catches it, and its **exit status** must be read directly — piping it through `tail` reports
the pipe's success, not the build's.

---

## Requirements coverage

| # | Requirement | How it is checked | Result |
| --- | --- | --- | --- |
| R1 | Front-matter valid | `npm run kms:validate` exits 0 and names no error for `docs/business-analysis/business-case.md` | |
| R2 | Status block present and correctly spelled | `grep -n "\*\*Last reviewed\*\*" docs/business-analysis/business-case.md` returns exactly one line, and the cell holds an ISO date | |
| R3 | Twelve content areas | Read the document's table of contents against `#777`'s twelve numbered areas; every one has a section | |
| R4 | Every capability tagged and cited | Walk the capability tables; each row carries IMPLEMENTED / IN PROGRESS / PLANNED and at least one path, model, route, issue or PR | |
| R5 | Not-yet-trading stated in the executive section | `grep -n "test-mode\|#113\|#104" docs/business-analysis/business-case.md` shows the statement above the fold, not only in a risks table | |
| R6 | External figures sourced and dated | Every price in the Shopify, infrastructure and payments sections carries a source and `2026-09-16` | |
| R7 | Estimates labelled at point of use | `grep -c "ESTIMATE" docs/business-analysis/business-case.md` is non-zero, and each cost/saving table states its volume assumption in the table itself | |
| R8 | Revision history present with baseline entry | The final section exists, newest-first, with the first entry naming this milestone and stating that it is the baseline | |
| R9 | Indexed and bundled | After `npm run kms:build-index`: the title appears in `ARTIFACT_INDEX.md` under Track 1, and `grep -c "business-case" "app/(admin)/staff/runbook/docs.ts"` is non-zero | |
| R10 | MDX-safe | `npm run kms:assemble:internal && (cd kms/site-internal && npx next build --webpack)` — read the real exit status | |
| R11 | Workflow step added after Learn | Read `specs/sdd-workflow.md`'s Milestone close section; the step sits after `/learn` and carries its rationale | |
| R12 | Mirrored in both commands | `grep -n "business case" .claude/commands/document.md .claude/commands/learn.md` returns a hit in each | |
| R13 | In-flight audit behaviour documented | The milestone-close section states that `sdd:audit` reports the review as due until it lands, and that the close ends with `sdd:audit` exiting 0 | |
| R14 | Workflow front-matter bumped | `git diff` shows `version` and `updated` changed in `specs/sdd-workflow.md` | |
| R15 | Gates untouched | `git diff` touches no gate definition; `.github/workflows/` unchanged | |
| R16 | Marker parser exported and pure | `npx vitest run tests/business-case-review.test.ts` — marker present, absent, malformed | |
| R17 | Closure-row parser | Same test file: the four real spellings from `specs/roadmap.md` all parse; the newest wins | |
| R18 | Gap reported when stale | Same test file, plus a live check: temporarily set `Last reviewed` to `2020-01-01`, run `npm run sdd:audit`, confirm exit 1 and the message names both dates. **Restore the file afterwards.** | |
| R19 | Missing or malformed marker is a gap | Same test file, plus a live check: temporarily rename the document, run `npm run sdd:audit`, confirm exit 1. **Restore afterwards.** | |
| R20 | Passes when current, and says so | `npm run sdd:audit` exits 0 on the branch as committed, and prints a line naming the milestone assessed | |
| R21 | preclear unchanged | `npm run sdd:preclear` behaves as before; `git diff scripts/sdd-check.ts` shows no edit inside `preclear()` | |
| R22 | Test coverage | `npx vitest run tests/business-case-review.test.ts` — all cases pass | |
| R23 | Fixtures, not the live roadmap, for arithmetic | Read the test: pass/fail cases use fixture strings; at most one case reads the real roadmap, and only to assert a date parses | |
| R24 | Not visible to a vendor store admin | `docsForViewer(docs, false)` excludes it — asserted by reading `lib/runbook-audiences.ts` against the document's `audience` array, since `product` and `platform-admin` are both absent from `RUNBOOK_VENDOR_AUDIENCES` | |
| R25 | Whole suite green | `npx vitest run` **alone**, not concurrently with a build. Expect the file/test totals to have moved by exactly this slice's additions | |
| R26 | Root gates | `npm run lint`, `npm run typecheck`, `npm run format:check` all exit 0 | |

## Notes for the validator

**R25 — check the count, not the exit code.** `CLAUDE.md`'s vitest section records that a suite run
under load reports `exit 0` while whole files never execute. The baseline before this slice is
**139 files / 1842 tests**; this slice adds one file. Anything short of that is a non-result to
re-run, not a pass.

**R18 and R19 both mutate the working tree deliberately.** Restore with `git checkout --` and
confirm `git status --porcelain` is clean before moving on. Do not leave a `2020-01-01` review date
committed; it would make the check fail permanently and teach the next reader to ignore it.

**R4 is the row most likely to fail honestly.** It is the one place this document can mislead a
stakeholder, and no tool checks it. Walk the capability tables against the repository rather than
against the document's own prose — `CLAUDE.md` records four separate instances of a docstring
asserting a property the code did not have, including three files asserting the same untrue
sentence.
