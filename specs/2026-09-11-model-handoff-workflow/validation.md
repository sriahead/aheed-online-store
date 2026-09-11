# Project-state model handoff workflow integration (validation)

> **Testing strategy:** this is a process-documentation slice. Validation therefore compares the
> governing workflow, command files, handoff boundary, and branch diff directly. No test is added
> for a semantic judgment a script cannot make reliably.

## Validation Steps

| Req | Testing Area | How to verify |
|---|---|---|
| R1 | Acceptance | Read the responsibility-model section in `specs/sdd-workflow.md` and confirm it assigns exactly one distinct question to Build Notes, authoritative documentation, Model Handoff, and Orient. |
| R2 | Acceptance | Read the opening steps of `.claude/commands/orient.md`; confirm they order `CLAUDE.md` before `docs/model-handoff.md` and explicitly reject treating dated handoff state as live authority. |
| R3 | Acceptance | Compare `specs/sdd-workflow.md`'s Orient section with `.claude/commands/orient.md`; confirm both name local Git, GitHub, Project status/Priority, PRs, deployments, and scope-relevant environment facts for live verification, and both constrain deeper reads to current scope or discovered discrepancies. |
| R4 | Acceptance | Confirm both Orient definitions include `gh project item-list 2 --owner sriahead --format json --limit 600`, describe the board as status-and-priority rather than scope, and require open `High` items to lead the report. |
| R5 | Acceptance | Read the Document (build notes) stage and `/build-notes`; confirm both place the Project-State Handoff Check before commit and `npm run sdd:preclear`, and that the check asks whether Orient through Build surfaced project-level knowledge a future model would otherwise have to rediscover. |
| R6 | Acceptance | In both Build Notes definitions, confirm the three destinations are explicit and routine implementation details are excluded from `docs/model-handoff.md`. |
| R7 | Acceptance | Read the Document (final) stage and `/document`; confirm both run the material-overall-state check after Validate/Fix/Ship. |
| R8 | Acceptance | In both final Document definitions, confirm authoritative docs are updated first, stale handoff information is replaced or removed, and no handoff edit is required when overall state did not materially change. |
| R9 | Acceptance | Read the scope/ownership boundary in `docs/model-handoff.md`; confirm it points to authoritative sources, distinguishes Build Notes and final Document, rejects changelog behavior, and marks volatile GitHub/Project/deployment/environment information for live verification. |
| R10 | Regression | Review `git diff origin/staging...HEAD -- specs/sdd-workflow.md .claude/commands`; confirm the four gates, two Clears, model-switch ordering, template headings, validation authority, and carry-forward rule are unchanged in substance. |
| R11 | Regression | `git diff --exit-code origin/staging...HEAD -- scripts/sdd-check.ts specs/templates/feature-spec/build-notes.md .claude/commands/validate.md` exits 0. Confirm the final authored file list contains no new handoff artifact. |
| R12 | Regression | Run `git diff --name-only origin/staging...HEAD` and inspect every path. Apart from this slice's SDD files, `CHANGELOG.md`, `ARTIFACT_INDEX.md`, and `app/(admin)/staff/runbook/docs.ts`, authored changes are confined to the five process files named by R12. |
| R13 | Regression | `git rev-parse docs/orient-reads-board-priority` prints `d56c7b9...`; `git rev-parse docs/orient-reads-board-priority^` prints `2938597...`; and `git diff --name-only origin/staging...HEAD -- specs/2026-09-10-brand-colour-validation` prints nothing. |
| R14 | Integration | Run `npm run kms:validate` and `npm run kms:check-generated`; both exit 0. Then run `npm run kms:assemble:internal`, followed separately by `npx next build --webpack` from `kms/site-internal`; the internal docs build exits 0. |
| R15 | Gate 4 | `git diff origin/staging...HEAD -- CHANGELOG.md` shows an `[Unreleased]` entry naming #726 and the model-handoff workflow integration. |
| R16 | Regression | Run `npm run lint`, `npm run format:check`, `npm run typecheck`, `npx vitest run`, and `npm run build` sequentially; each exits 0, and Vitest reports no failed files or unhandled worker errors. |
