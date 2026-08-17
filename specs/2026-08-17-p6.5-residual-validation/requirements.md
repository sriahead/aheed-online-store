# P6.5 residual validation & gap-register reconciliation (requirements / acceptance criteria)

Closes the validation debt issue **#192** recorded when the P6.5–P7a catch-up promotion shipped four
slices on a smoke pass. Builds on `docs/gap-register.md` (`gap-register-audit`),
`docs/sdd/self-review/GAP-REGISTER.md` (`gap-register`) and
`specs/2026-08-13-p6.5-self-review-hardening/`. In one line: make the gap registers say what is
actually true, and replace the P6.5 exit gate that certified a document instead of the code.

## Register consolidation

R1. `docs/gap-register.md` contains one table row for every GAP-ID that exists anywhere in the repo
    — at minimum GAP-001 through GAP-015 — with no ID appearing on two rows. New IDs filed under
    R12 are included rather than excluded by this count.

R2. `docs/sdd/self-review/GAP-REGISTER.md` contains no GAP-ID **table rows** of its own and links to
    `docs/gap-register.md` by a relative path that resolves from its own location. Prose in that
    file may still name GAP-001..004 — the requirement is about the table, not the words.

R3. `docs/gap-register.md` front-matter states it is the master register, and its `version` is
    bumped from `1.0.0`.

## Register accuracy

R4. Every row of `docs/gap-register.md` whose `Status` is not `Open` cites, in the row or its
    detailed section, at least one concrete artifact a reader can check: a merged PR number, a
    commit SHA, or a repo-relative file path.

R5. For every GitHub issue cited anywhere in `docs/gap-register.md`, the citing row's `Status` is
    consistent with that issue's real state: a row whose cited issues are all CLOSED does not have
    Status `Open` or `Deferred`, and a row citing any OPEN issue does not have Status `Fixed` or
    `Resolved`. This binds GAP-002 to R13's outcome — if #176 stays open, GAP-002 cannot remain
    `Fixed`.

R6. GAP-007 cites issue **#180**, not #167.

R7. GAP-008's Status is not `Deferred`, and the row cites PR #204.

R8. GAP-009's Status is not `Deferred`.

R9. GAP-010's Status is not `Deferred`, and the row cites PR #204.

R10. GAP-013's Status is not `Deferred`, and the row cites issue #45 as closed.

R11. `docs/gap-register.md` carries a dated reconciliation note listing every GAP-ID in the master
     table, each marked either changed (with its old and new value) or confirmed unchanged.

R12. Any gap discovered during the audit that is recorded as handled but is not present in the code
     is filed as a GitHub issue, added to Project #2 with a Phase set, and cited by its register
     row. If the audit finds no such gap, `build-notes.md` states that no recorded-but-unbuilt gap
     was found.

## Issue #176

R13. A real browser sign-in is driven against `npm run preview` at `http://localhost:8787` and the
     outcome — the HTTP status returned and whether the response contained `Invalid origin` — is
     recorded verbatim in `build-notes.md`.

R14. If R13 shows the sign-in succeeding, issue #176 is CLOSED with a comment citing
     `lib/auth-origin.ts`'s `splitHostPort`/`inferProto` and this slice. If R13 shows it still
     failing, #176 remains OPEN and `build-notes.md` records the failure under known-shaky areas.

R15. `docs/sdd/self-review/SELF-REVIEW.md` and `docs/sdd/self-review/VALIDATION-RESULTS.md` describe
     GAP-002's status consistently with R13's outcome, and both note that its original validation
     was unit-level only.

R16. `specs/sdd-workflow.md`'s Validate section contains no instruction to apply an uncommitted
     local patch to `lib/auth-origin.ts`, and its text reflects R13's actual outcome. Verified by
     reading the section — not by grepping for an absent phrase, since corrected text legitimately
     names the defect it resolved.

R17. `specs/sdd-workflow.md` front-matter `version` and `updated` are bumped.

## P6.5 exit-gate correction

R18. `specs/2026-08-13-p6.5-self-review-hardening/requirements.md` states its acceptance criteria as
     sequentially numbered `R1..Rn` items.

R19. `specs/2026-08-13-p6.5-self-review-hardening/validation.md` has one row per requirement in
     R18's numbering, in the same order, and every `Req` cell names a requirement that exists in
     that file.

R20. No row of that `validation.md` verifies a requirement solely by a document's own claim about
     itself; every row names a command to run, a file property to inspect, or an observable
     behaviour to exercise.

R21. At least one row of that `validation.md` verifies a GAP-001..004 claim against the artifact it
     describes rather than against the register.

## Issue #192 live items

R22. A staff order status transition is fired live against `npm run preview` on an order with a
     synthetic recipient address; the resulting `OrderStatusEvent` row and the email dispatch
     outcome are recorded in `build-notes.md`.

R23. The first-visit cookie consent banner is exercised in a browser with no `aheed_cookie_consent`
     cookie: `build-notes.md` records that the banner rendered, the cookie's value after accepting,
     and that a reload did not re-render it.

R24. Issue #192 records, in a comment, which of its four listed items this slice covered and which
     remain — and is closed only if none remain.

## Carry-forward and KMS

R25. `specs/roadmap.md`'s change log contains a row for PR #206 (`staging → main`, merge `081f618`)
     recording the P7a fix + doc-reconciliation promotion to production.

R26. `specs/roadmap.md` front-matter `version` and `updated` are bumped.

R27. `npm run kms:build-index` is run after every front-matter edit in this slice, and the resulting
     `ARTIFACT_INDEX.md` is committed.

R28. `npm run kms:validate` exits 0.

R29. `npm run sdd:audit` exits 0.

## Gates

R30. `CHANGELOG.md` updated (Gate 4).

R31. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
