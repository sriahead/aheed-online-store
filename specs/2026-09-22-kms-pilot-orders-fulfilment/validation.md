# KMS Pilot: Orders, Fulfilment & Payment Exceptions (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
> 
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

This slice is purely documentation and KMS structural validation, so testing relies heavily on the `kms:` tooling and manual verification of link integrity and audience boundaries.

1. **Unit Testing**
   - *When needed:* Every feature.
   - *Purpose:* Test isolated business logic, utilities, and components.
2. **Integration Testing**
   - *When needed:* Every feature. (Includes Contract testing).
   - *Purpose:* Verify the component works with its immediate dependencies (e.g., database, external services).
3. **System / End-to-End Testing**
   - *When needed:* For critical user journeys and validation testing.
   - *Purpose:* Validate that the feature works correctly in the real system.
4. **Regression & Acceptance Testing**
   - *When needed:* Mainly before release, or when changing core flows. (Includes Smoke and Sanity testing).
   - *Purpose:* Ensure existing functionality remains unbroken and acceptance criteria are met.
5. **Performance & Resilience Testing**
   - *When needed:* Mainly before release, or for performance-sensitive APIs. (Includes Load, Stress, and Spike testing).
   - *Purpose:* Ensure the system meets throughput/latency targets and degrades gracefully.
6. **Security & Accessibility Testing**
   - *When needed:* Mainly before release, or earlier for features involving auth, payments, or UI changes.
   - *Purpose:* Ensure the system is safe and accessible to all users.

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Integration  | Verify the canonical document exists and compiles successfully via `npm run kms:validate`. |
| R2  | Manual       | Read the document to confirm cancellation and refund logic are explicitly separated and that codebase reality was used to resolve claims. |
| R3  | Manual       | Check that substantive sections end with a "References / Related Artifacts" block containing valid Markdown links. |
| R4  | Integration  | Check the working register (e.g., `docs/business-analysis/gap-register.md`) to verify that all logged contradictions are explicitly tagged as `[Resolved]`, `[Superseded]`, or `[Unresolved]`. |
| R5  | Manual       | Review audience entry points (`admin-tabs-guide.md`, `staff-tabs-guide.md`, `shopping-guide.md`) to ensure they link to the canonical document rather than redefining the rules. |
| R6  | E2E          | Run `npm run kms:assemble:internal && (cd kms/site-internal && npx next build --webpack)`. Verify that clicking through the generated KMS site as Staff, Store Admin, and Shopper does not return 404s for authorized links and properly blocks unauthorized content. |
| R7  | Manual       | Audit the source-to-destination ledger to ensure 100% of the pilot's original scoped artifacts are accounted for. |
| R8  | Integration  | Run `git status` to ensure no historical `specs/` files were moved or deleted. |
| R9  | Manual       | Verify `plan.md` explicitly lists full-KMS restructuring as an excluded, approval-gated phase. |
| R10 | Manual       | Verify the `[Unreleased]` section of `CHANGELOG.md` contains the pilot entry via `cat CHANGELOG.md`. |
| R11 | Unit         | `npm run kms:validate` and `npm run kms:check-generated` exit 0, alongside standard root `npm run lint`, `npm run typecheck`, `npm run format:check`. |
