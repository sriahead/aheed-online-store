# KMS Pilot: Orders, Fulfilment & Payment Exceptions (requirements / acceptance criteria)

This pilot tests the revised KMS restructuring constraints (thematic synthesis, current knowledge first, section-end references) on the orders, fulfilment, and payment exceptions domain. It builds upon `#851` to prove the viability of progressive disclosure without structural upheaval.

R1. A single authoritative document exists detailing current order, fulfilment, and payment exception workflows.
R2. The document establishes current truth based on codebase reality first, then newest SDLC slices, and explicitly differentiates the handling of cancellations versus refunds.
R3. Every substantive section in the new document concludes with a "References / Related Artifacts" block linking to existing source evidence.
R4. A working register exists that explicitly classifies every discovered contradiction, obsolete claim, missing procedure, or unresolved decision as `Resolved`, `Superseded`, or `Unresolved`.
R5. Existing audience entry points (store admin, staff, shopper guides) link to the new canonical content without duplicating the core business rules.
R6. Staff, Store Admin, and Shopper navigation, visibility, and link behaviour are preserved: audience boundaries are respected, and no link returns a 404 for its intended audience in the compiled KMS site.
R7. A source-to-destination ledger exists mapping 100% of the original scoped artifacts to the consolidated sections or the working register.
R8. No historical `specs/` files are relocated, deleted, or structurally modified.
R9. The pilot acknowledges that full-KMS restructuring is blocked until explicit approval is granted following this pilot's validation.
R10. `CHANGELOG.md` updated (Gate 4).
R11. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
