# Client Setup default forward-to inbox (validation)

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

## Live check setup (rows R6, R8)

The page reads the database, so use `npm run preview`, **never** `npm run dev` (CLAUDE.md, Database).
1. Before any Prisma or DB step, check `DIRECT_URL` and `DATABASE_URL` one at a time, printing the host only (CLAUDE.md, Config & secrets). `.env` and `.dev.vars` must name the **dev** database.
2. Add `INBOUND_DEFAULT_FORWARD="default-inbox@example.com"` to `.dev.vars`. Under preview, `.dev.vars` wins.
3. Run `npm run preview`.
4. Sign in as a platform admin from the demo roster (`scripts/lib/demo-roster.ts`) and open `/staff/platform/client-setup`.
5. Remove the line from `.dev.vars` afterwards, and kill the whole `node`/`workerd` chain when done.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `npx vitest run tests/config-inbound-default-forward.test.ts` passes. It must cover these cases: unset, blank `"   "`, valid, `"  Info-Hub@Example.COM "` giving `info-hub@example.com`, and `"not-an-email"` giving `invalid`. |
| R2  | Unit | The same file has a case that sets `INBOUND_DEFAULT_FORWARD="not-an-email"` and asserts `getEmailEnv()` and `getInboundEmailEnv()` behave as they do with it unset. Also read `lib/config.ts` and confirm neither `emailSchema` nor `inboundEmailSchema` names the key. |
| R3  | Unit | `grep -rn "merqifyhub" lib app components features workers scripts --exclude=docs.ts` prints nothing. The excluded file is the generated runbook bundle `app/(admin)/staff/runbook/docs.ts` (amended at Validate). Also confirm `getInboundDefaultForward` in `lib/config.ts` returns `unset` for a missing value rather than any address. |
| R4  | Unit | `grep -n "INBOUND_DEFAULT_FORWARD" wrangler.toml` shows exactly two assignments, one under `[env.staging.vars]` and one under `[env.production.vars]`, each `= "info-merqifyhub@googlegroups.com"` with a `#1399` comment nearby. |
| R5  | Unit | `npx vitest run` on the slice's component test file passes. It renders `AddInboundAddressForm` once with `{status:"set", address}`: the `forwardTo` input's value is the address, `required` is set, and the helper line is present. It renders once with `unset`: the value is empty and there is no helper line. |
| R6  | E2E | Live check setup, then on the page, with the default `default-inbox@example.com`: the status card shows "Default forward-to  default-inbox@example.com", and the Add address form's Forward to field is prefilled with it. Change `.dev.vars` to `INBOUND_DEFAULT_FORWARD="nope"`, then rebuild and restart preview. The row reads "Invalid: check INBOUND_DEFAULT_FORWARD" in an element with `role="alert"`, and the field is empty. If preview cannot run, record why and fall back to checking this on staging after deploy (the row should read `info-merqifyhub@googlegroups.com`). |
| R7  | Unit | `npx vitest run` on the slice's grouping test passes. It covers two rows sharing a `forwardTo`, a third row alone, `isDefault` true and false, sort order, and `[]` for no rows. Confirm the module has no `"use server"` directive. |
| R8  | E2E | Live check setup, on a dev store: add `a@example.com` and `b@example.com`, both forwarding to `default-inbox@example.com`, and `c@example.com` forwarding to `other@example.com`. The list shows two `data-forward-group` blocks: `default-inbox@example.com` labelled as the platform default with `a@` and `b@` under it, and `other@example.com` with `c@`. Each address keeps its purpose and Remove button. Remove all three afterwards. The page shows "No receiving addresses yet." again. |
| R9  | Integration | `npx vitest run` on the test for `addInboundAddress` passes the two-addresses-one-mailbox case. `npx vitest run tests/client-setup.test.ts` still passes, including "explains a forwarding loop". R8's live step also proves this against the real database. |
| R10 | Unit | `npx vitest run tests/vendor-neutral-copy.test.ts` passes. Read every string the diff adds under `components/` and `app/`: none names a vendor or a product example. |
| R11 | Unit | Read `env-setup.md` "Email: sending and receiving". The Keys table has an `INBOUND_DEFAULT_FORWARD` row with the where and meaning from R11, and the text pairs it with `INBOUND_FALLBACK_FORWARD` and says it must be a verified destination. |
| R12 | Unit | Read the Client Setup section of `platform-admin-guide.md`. It describes the prefill, the grouping and the status row, and each new sentence maps to R5, R6 or R8's control. |
| R13 | Unit | `git diff origin/staging -- CHANGELOG.md` shows an entry naming `#1399`. |
| R14 | Regression | `npm run lint`, `npm run typecheck`, `npm run format:check` and `npm run kms:validate` exit 0. `npx vitest run --maxWorkers=4` (run alone, no build beside it) is green. `npm run kms:coverage` shows no new uncovered file. CI `gates` on the PR is the ground truth. |
