# P9.1: Production Authentication Rate Limiting (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
> 
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Every feature should have appropriate **Unit** and **Integration** testing, followed by relevant validation testing. Broader testing mainly happens before release. However, testing is risk-based: features involving auth, payments, UI changes, performance-sensitive APIs, databases, or external dependencies require additional relevant testing earlier.

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
| R1  | Integration  | Run `npx prisma format` and `npx prisma validate`. Both exit 0, and `prisma/schema.prisma` contains the `AuthenticationAttempt` model. |
| R2  | Unit         | Run `npm test tests/repository-auth-rate-limit.test.ts` (write it) to assert 5 attempts pass and the 6th is rejected within the time window. |
| R3  | Build        | Run `npm run test tests/repository-client-injection.test.ts` to confirm `lib/repositories/auth-rate-limit.ts` is pure and takes `prisma` as an argument. |
| R4  | System       | Start `npm run preview`. Attempt a sign-in with a valid email but incorrect password 6 times rapidly. The 6th attempt should return a `429` status code. |
| R5  | System       | In `npm run preview`, ensure that non-sensitive paths like `getSession` (`/api/auth/get-session`) do not get rate-limited after 6 calls. |
| R6  | System       | Verified manually in R4: network response is `429 Too Many Requests`. |
| R7  | Build        | Check `CHANGELOG.md` diff for the new entry. |
| R8  | Build        | `npm run lint && npm run typecheck && npm run test && npm run format:check` all exit 0. |
