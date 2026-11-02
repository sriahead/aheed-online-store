# Client Setup: verified forward-to dropdown and suggested sender (validation)

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

## Live check setup

**Local (fallback states and the suggested sender):**
1. Use `npm run preview`, never `npm run dev`.
2. Check `DIRECT_URL` and `DATABASE_URL` one at a time, printing the host only. `.env` and
   `.dev.vars` must name the dev database (`ep-dry-morning`).
3. Add `EMAIL_FROM="no-reply@merqify.com"` to `.dev.vars`, so the platform domain is `merqify.com`.
4. Sign in as `demo-platform-admin@example.com`, using the **`.dev.vars`** `DEMO_ACCOUNT_PASSWORD`.
   The dev roster is still `@example.com` (`local-dev-playbook.md`).
5. Without a browser, drive the page with `curl`. Sign in with `POST /api/auth/sign-in/email` and
   a cookie jar, then `GET /staff/platform/client-setup?vendor=<slug>`.
6. Remove the added lines afterwards, and kill the whole `node`/`workerd` chain when done.

Dev's `CLOUDFLARE_*` credentials belong to a different account from Merqify's. So local shows
whatever that account returns, or a fallback. Don't treat it as proof of the `ok` state.

**Staging (the `ok` state):**
- Needs the owner to have added **Email Routing Addresses: Read** to the staging Merqify token.
- Without it, the `ok`-state rows (R5, R6 live, R10 `ok`, R11 `true`) are **unverified, with that
  reason**. Their component and unit tests still stand.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | Read the reader's module. It is under `lib/email/`, it exports the async reader with the R1 input and output types, and every code path returns rather than throws. R2's test file runs it. |
| R2  | Unit | `npx vitest run` on the reader's test file passes. It contains each case R2 lists: not-configured with `fetch` not called, single page, 50+3 pagination, 4-page cap, 403, 500, `success:false`, a thrown fetch, an abort-only fetch giving `error` under fake timers, verified null vs a timestamp, and the token absent from `JSON.stringify(result)`. Read the module: every request passes an abort signal with a 5 s timeout. |
| R3  | Unit | Read the slice diff. Credentials come from a `lib/config` export. `git diff origin/staging --name-only` files contain no new `process.env` read: `git diff origin/staging -- lib app components ':!app/(admin)/staff/runbook/docs.ts' \| grep '^+' \| grep process.env` prints nothing. The excluded file is the generated runbook bundle, which embeds documentation text that mentions `process.env` (amended at Validate, as `#1399`'s R3 was). |
| R4  | Unit + E2E | Read `getEmailSectionData`. It returns `destinations` from the reader called with the `lib/config` credentials and the global `fetch`. `npm run typecheck` exits 0. **Local or staging:** save the page HTML and count occurrences of the environment's token value without printing it (`grep -c -F "$TOKEN" page.html`, with `TOKEN` read from the env file). Expected: `0`. |
| R5  | Unit + E2E | Component test (R9) passes. **Staging, after the owner's permission:** on Client Setup, Forward to is a `<select>` listing the verified mailboxes (e.g. `info-merqifyhub@googlegroups.com`), pending ones disabled with "(awaiting verification)", and **Other…** last. Choosing Other… shows a text box and the warning. Otherwise mark it unverified with the reason. |
| R6  | Unit + E2E | Component test covers the three preselection cases. **Staging:** with `info-merqifyhub@` verified, it is preselected. |
| R7  | Unit | The component test reads the form's `FormData` and finds exactly one `forwardTo` entry in both the select case and the Other… case. `npx vitest run tests/client-setup.test.ts` passes, and its `addInboundAddressAction` cases are unmodified (`git diff origin/staging -- tests/client-setup.test.ts` shows no change to those cases). |
| R8  | Unit + E2E | The component test covers each reason message. **Local:** with dev's credentials removed from `.dev.vars` (both `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`, and from `.env` too, since precedence is per key), the page shows the text input and "…Cloudflare credentials are not set for this environment." Restore them afterwards. |
| R9  | Unit | `npx vitest run` on the slice's `AddInboundAddressForm` test passes with every case R9 lists. |
| R10 | E2E | **Local (not-configured):** the status card's Verified mailboxes row reads "Unavailable: credentials not set". **Staging:** after the permission, it reads "<v> verified, <p> pending" matching the Destination addresses list in Cloudflare. Otherwise "Unavailable: token lacks Email Routing Addresses Read", which also passes R10 for the `forbidden` branch. |
| R11 | Unit + E2E | `npx vitest run tests/client-setup.test.ts` passes, with the updated `destination` assertions covering true, false (one verified, one unverified forward-to) and null. `sending-domain` and `routing-rule` are still asserted `null`. **Staging:** a store whose receiving addresses all forward to a verified mailbox shows "Done" on the step. |
| R12 | Unit | `npx vitest run` on the suggested-sender test passes with every case R12 lists, including the localhost/IP exclusions. |
| R13 | Unit | The same test file covers R13's branches, including the `nocaped` case giving false. |
| R14 | Unit + E2E | The component test covers the button filling both inputs without a submit, and the hidden case. **Local:** for `srimart` (hosts `srimart-staging.nocaped.com` and `srimart.localhost:8787`, sender `orders@srimart…` or similar), the Sender card shows a suggestion and the button. Record the exact suggestion shown and check it against R12's rule for that store's hosts. |
| R15 | E2E | **Local:** a store whose saved sender's domain is not routable under R13 shows the `role="alert"` warning naming that domain. For the reverse case, save a sender of `orders-test@merqify.com` on a dev store: the warning disappears (platform domain), the page re-renders, and the suggestion still shows if it differs. Restore the original sender afterwards. |
| R16 | Unit | `npx vitest run tests/vendor-neutral-copy.test.ts` passes. Read every string the diff adds under `components/` and `app/`: none names a vendor or a product example. |
| R17 | Unit | Read `env-setup.md`'s Email section. It has the permission sentence, the without-permission behaviour, the suggested-sender rule, and a sanity-check block for this slice with a "Last run" line. |
| R18 | Unit | Read the platform admin guide's Client Setup section. Every item R18 lists is described, and each added sentence maps to R5–R15. |
| R19 | Unit | `git diff origin/staging -- CHANGELOG.md` shows an entry naming `#1392` and `#1403`. |
| R20 | Regression | `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run kms:validate` and `npm run build` exit 0. Run `npx vitest run --maxWorkers=4` alone, with no build beside it: green. `npm run kms:coverage` shows no new uncovered file. CI `gates` on the PR is the ground truth. |
