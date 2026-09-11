# Project-state model handoff workflow integration (requirements / acceptance criteria)

This slice closes `#726` by integrating one concise project-state handoff into the existing SDD
loop. It changes process documentation only: Build Notes retain current-slice detail, authoritative
documents retain permanent truth, the model handoff retains important overall current position, and
Orient reverifies what is live.

R1. `specs/sdd-workflow.md` defines the four-part responsibility model: Build Notes answer what
    happened in the current slice; authoritative documents answer what is permanently true;
    `docs/model-handoff.md` answers what a fresh model needs to understand about the current overall
    project position; and Orient answers what is actually true now.

R2. `.claude/commands/orient.md` instructs a fresh session to read `CLAUDE.md` first and
    `docs/model-handoff.md` second, and states that the handoff is dated recovery context rather
    than authority for volatile state.

R3. Both the governing Orient section and `/orient` require live reverification of local Git,
    GitHub, Project status and Priority, open PRs, deployments, and any scope-relevant environment
    fact, while limiting deeper authoritative-document and code reads to the current task or a
    discrepancy that needs resolution.

R4. Both the governing Orient section and `/orient` retain Project #2's `--limit 600` requirement,
    treat the board as a status-and-priority view rather than a scope source, and require the
    orientation report to lead with open `High` items.

R5. `.claude/commands/build-notes.md` and the governing Document (build notes) stage require the
    pre-Clear Project-State Handoff Check: whether Orient through Build discovered or changed
    project-level knowledge that would otherwise be lost and that a future model would otherwise
    need to rediscover.

R6. The Build Notes check routes current-slice implementation and validation detail to
    `build-notes.md`, durable project truth to the appropriate authoritative documentation, and
    important overall current state to `docs/model-handoff.md`; it explicitly keeps routine
    implementation detail out of the model handoff.

R7. `.claude/commands/document.md` and the governing Document (final) stage require a final-state
    check after Validate, Fix, and Ship to decide whether the completed work materially changed the
    overall project state.

R8. The final-state check updates authoritative documentation where appropriate before reconciling
    `docs/model-handoff.md`, replaces or removes stale handoff information rather than appending
    history, and leaves the handoff untouched when overall project state did not materially change.

R9. `docs/model-handoff.md` states its concise scope and ownership boundary, references
    authoritative documents instead of duplicating them, distinguishes itself from Build Notes and
    final Document, and marks GitHub, Project, deployment, and environment facts as requiring live
    verification.

R10. The existing four SDD gates, two Clears, model-switch ordering, Build Notes template headings,
     validation authority, and post-Ship documentation carry-forward rule remain unchanged.

R11. `scripts/sdd-check.ts`, `specs/templates/feature-spec/build-notes.md`, and
     `.claude/commands/validate.md` have no branch diff; the semantic handoff decision is not
     automated and no new handoff artifact is created.

R12. The authored process change is limited to `specs/sdd-workflow.md`,
     `.claude/commands/orient.md`, `.claude/commands/build-notes.md`, `.claude/commands/document.md`,
     and `docs/model-handoff.md`, plus this slice's SDD documentation, Gate 4 CHANGELOG entry, and
     generated KMS artifacts.

R13. The `docs/orient-reads-board-priority` branch still points to `d56c7b9`, its parent remains
     `2938597`, and no file under `specs/2026-09-10-brand-colour-validation/` appears in this branch's
     diff from `origin/staging`.

R14. KMS front-matter validation, generated-artifact validation, and the internal KMS site build
     all pass after the documentation changes.

R15. `CHANGELOG.md` contains an `[Unreleased]` entry for #726 before Ship (Gate 4).

R16. `lint`, `format:check`, `typecheck`, `test`, and `build` all remain green after this slice.
