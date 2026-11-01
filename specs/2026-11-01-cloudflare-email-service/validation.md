# Cloudflare Email Service: per-vendor outgoing and incoming email (validation)

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
All local DB-touching checks run against **dev** only, after the CLAUDE.md environment checks:
- check each of `DIRECT_URL` and `DATABASE_URL` one at a time, and prefix Prisma commands with
  `env -u DIRECT_URL -u DATABASE_URL` if either is set;
- read the datasource host first.

Live HTTP checks use `npm run preview`, never `npm run dev`.

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `ls lib/email/cloudflare.ts lib/email/resend.ts lib/email/log.ts` lists all three. Read `lib/email.ts`: it exports `EmailService` (with optional `sender: { name; email }`) and `getEmailService`. |
| R2  | Unit | `npx vitest run tests/email --maxWorkers=4` passes. Read the selection tests: one case per branch (three explicit values, plus unset with and without the binding). |
| R3  | Unit | Same run. The cloudflare-adapter test asserts the exact object given to a fake `EMAIL.send`: the `from` object, a single `to`, `subject`, `html`, and `replyTo` when expected. |
| R4  | Unit | Same run. The resend-adapter test asserts URL `https://api.resend.com/emails`, an `Authorization: Bearer` header, and a body with `from` as `Name <email>` and `reply_to` when set. |
| R5  | Unit | Same run. The sender-resolution tests cover a verified domain, an unverified domain (`replyTo` set), no sender, and a mixed-case domain. |
| R6  | Unit | Same run. The recipient-policy tests cover `open`, allowlist hit, allowlist miss (no adapter call, one log line), unset mode, and an empty allowlist. |
| R7  | Unit | Same run. One failure test per adapter (binding throws; Resend returns 500; binding or key missing) asserts `await send()` resolves and one log was written. |
| R8  | Unit | The config tests pass and include the three production cases: no `EMAIL_FROM` fails; `resend` without a key fails; `cloudflare` with no Resend key passes. `grep -n "RESEND_FROM_EMAIL" lib/config.ts` prints nothing. |
| R9  | Unit | `grep -rn "RESEND_FROM_EMAIL" lib app features scripts workers wrangler.toml .github` prints nothing. Scoped on purpose: `specs/` and `docs/` legitimately name the retired key. |
| R10 | Unit | `grep -n "sender" lib/auth.ts features/checkout/send-confirmation.ts` shows a `sender` argument at all three send sites. `grep -n "getCurrentVendorSender\b" lib/vendor-service.ts` matches an export. In `git diff staging -- tests/`, the auth and confirmation tests change only to add `sender`; no subject or HTML expectation changes. |
| R11 | Integration | `grep -n -A2 "send_email" wrangler.toml` shows `name = "EMAIL"` under staging and production. `grep -n EMAIL_RECIPIENT_MODE wrangler.toml` shows `"open"` only in the production vars block. After `npm run build`, `npx wrangler deploy --dry-run --env staging` and `npx wrangler deploy --dry-run --env production` exit 0. |
| R12 | Unit | `scripts/configure-env.mjs` lists neither `RESEND_*` key as required, and does list `EMAIL_FROM` and `INBOUND_EMAIL_TOKEN`. Any existing configure-env test passes. |
| R13 | Unit | Read `lib/running-costs.ts`'s `cloudflare-email` entry: no "not confirmed", 3,000 included, $0.35 per 1,000. Read `lib/pricing/cost-drivers.ts`'s `email-transactional`: provider Cloudflare Email Service, `sourceUrl` on `developers.cloudflare.com`. The existing running-costs and cost-driver tests pass. |
| R14 | Unit | Read the enum and model in `prisma/schema.prisma` against R14. `npm run db:generate` exits 0. `git diff staging -- prisma/schema.prisma` adds no `Json` type. |
| R15 | Integration | `git diff --name-only staging -- prisma/migrations` shows exactly one new `migration.sql`. Over it, `grep -inE '^\s*(DROP|UPDATE|INSERT|DELETE)\b'` and `grep -n trgm` both print nothing, and its header explains the hand-authoring (`#895`). Apply it to dev with `prisma migrate deploy`. If auto mode blocks that, hand the command to the owner. |
| R16 | Unit | `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts --maxWorkers=4` passes, and `git diff staging --` on those two files is empty. |
| R17 | Integration | The route tests pass with cases for 503, 401 (missing and wrong token), 400, 404 and 200. Live under `npm run preview` with the dev token set in `.dev.vars`: a POST of `{"to":"nobody@example.com","subject":"x"}` to `/api/inbound-email/resolve` with the token returns 404, and without the header returns 401. |
| R18 | Integration | The route or service tests include R18's four cases. Live under `npm run preview` against dev, after the Client Setup dashboard adds a SUPPORT address for one vendor: a subject carrying one of that vendor's real order numbers gives `orderRelated: true`, and another vendor's real order number gives `orderRelated: false, orderNumber: null`. Remove the address afterwards. |
| R19 | Unit | Over `lib/inbound-email-service.ts`, `grep -nE "\.(create|update|upsert|delete|createMany|updateMany|deleteMany|\$executeRaw)"` prints nothing. The route test asserts no write method on the client double is called. |
| R20 | Unit | Both `workers/inbound-email/wrangler.toml` and `workers/inbound-email/src/index.ts` exist. The config shows names `aheed-inbound-email-staging` and `aheed-inbound-email`, and `grep -nE "DATABASE_URL|r2_buckets|kv_namespaces|hyperdrive"` over it prints nothing. `npx wrangler deploy --dry-run --config workers/inbound-email/wrangler.toml --env staging` exits 0. |
| R21 | Unit | The inbound-worker tests pass with cases for 200 (one `forward(forwardTo)`, one log line holding all four fields), 404 (`setReject`, no forward), and network error, 500 and 401 (forward to `INBOUND_FALLBACK_FORWARD`). |
| R22 | Unit | The same run has a log-capture case: distinctive `from` and `subject` strings appear in no captured log line. |
| R23 | Integration | `git diff staging --` on the two deploy workflows shows only added lines: one inbound-email deploy step each, after the application deploy. After the merge to `staging`, the CI `deploy-staging` run is green and its log shows the inbound Worker deployed. |
| R24 | Unit | `grep -n "client-setup" components/staff/platform-nav-items.ts` shows one entry labelled "Client Setup". `grep -rn "/staff/platform/client-setup\"" app components --include=*.tsx` shows no hand-written link outside the nav model (a `?vendor=` link built by the readiness item, R34, is a data `editHref`, allowed). `npx vitest run tests/staff-nav-parity.test.ts --maxWorkers=4` passes. |
| R25 | Unit | Read the page: the `requireVendorRole("ADMIN")` and `auth.via === "platform-admin"` gate, 401 redirect, `PanelRefusal` on refusal, `<PageContainer width="wide">`. `npx vitest run tests/page-container.test.ts tests/platform-admin-rbac.test.ts --maxWorkers=4` passes. Live under `npm run preview`: signed in as the demo store admin (not a platform admin), `/staff/platform/client-setup` shows the refusal panel. |
| R26 | E2E | Under `npm run preview` against dev, signed in as a platform admin: the picker lists every vendor (compare with `/staff/platform/vendors`); `?vendor=<second slug>` shows that vendor's data; `?vendor=no-such` shows "not found" with HTTP 200. |
| R27 | Unit | Read `lib/client-setup/sections.ts`: exactly one entry, `email`. Its test asserts unique ids and at least one step per section, and passes. |
| R28 | E2E | Under `npm run preview` against dev, as a platform admin on a non-default vendor: change the sender name and save (the message confirms, and a reload shows the new value); add a SUPPORT address, which appears in the list; remove it, and it disappears. Revert the sender name. An action test asserts that a non-platform-admin call returns a refusal result and writes nothing. |
| R29 | Unit | `grep -nE "^export (const|let|var|class|type|interface|enum|default)" app/(admin)/staff/platform/client-setup/actions.ts` prints nothing (the module exports only `export async function`s). Action tests cover the loop refusal and the already-registered refusal. |
| R30 | Integration | Run the build-notes-named verification script against dev (host checked first): it inserts a duplicate address through `getPrisma()` **and** through `getPrismaWs()`, prints the `.code` each produced, and the predicate returns true for both. Build-notes records both codes. The action-level test exercises both `"P2002"` and `"23505"`. |
| R31 | E2E | Under `npm run preview`, the Email section shows the provider, `EMAIL_FROM`, recipient mode, verified or unverified for the vendor's domain, the effective From address, and the limits table. View-source and `grep` of the page HTML for the dev `RESEND_API_KEY` and `INBOUND_EMAIL_TOKEN` values print nothing. Read the component: the effective From comes from R5's exported function. |
| R32 | Unit | Read the `email` section entry: seven steps in R32's order; external `href`s on `dash.cloudflare.com` or `developers.cloudflare.com`; steps 2, 3 and 5 have data-driven `done`, and 1, 4 and 6 render "check in Cloudflare". A unit test of the evaluators covers 2, 3 and 5. |
| R33 | Unit | An action test asserts the recipient is the session user's email, whatever the form posts, and that the three outcomes map to "sent", "skipped by recipient policy" and "failed". Read the form: it has no recipient input. |
| R34 | Unit | Read the `outgoing_email_service` item: not `PLANNED`, status derived from the verified sender domain, `editHref` to `/staff/platform/client-setup?vendor=<slug>`. `npx vitest run tests/vendor-readiness --maxWorkers=4` passes. |
| R35 | Unit | Read the email text in `specs/architecture.md`: provider-agnostic port, Cloudflare default, Resend fallback, and `workers/inbound-email` named beside `workers/scheduler`. |
| R36 | Unit | `grep -n "Email: sending and receiving" docs/developer-portal/env-setup.md` matches. The section covers every key from R8 and R12 plus `INBOUND_FALLBACK_FORWARD`, domain setup, routing rules, destination verification, the Client Setup dashboard as the place addresses and senders are managed, the limits table, and a sanity check with expected results and a "Last run" line. |
| R37 | Unit | `grep -n "client-setup" docs/platform-admin-guide/platform-admin-guide.md` matches. Read the section and trace each capability sentence to a control on the page. `npx vitest run tests/operator-doc-coverage.test.ts --maxWorkers=4` passes. |
| R38 | Integration | `npm run kms:validate`, `npm run kms:check-generated` and `npm run kms:coverage` each exit 0. Then `npm run kms:assemble:internal`, and a production build in `kms/site-internal`, exits 0. |
| R39 | E2E (owner-gated) | On staging after the owner steps:<ul><li>A password reset on `aheed-staging.merqify.com` for an allowlisted inbox arrives, with From and Reply-To as R5 says (read the headers).</li><li>A reset for a non-listed address produces the skip line in `npx wrangler tail aheed-store-staging`, and no email.</li><li>A mail to the staging ORDERS address reaches its `forwardTo`, with the R21 line in `npx wrangler tail aheed-inbound-email-staging`.</li></ul>Any missing owner step means **UNVERIFIED (owner-gated)**, with the step named. It is never recorded as a pass. |
| R40 | Unit | `git diff staging -- CHANGELOG.md` shows an entry naming `#1217`. |
| R41 | Unit | CI on the PR (`quality.yml`) is green. Locally, run `npm run lint`, `npm run typecheck`, `npm run format:check` and `npm run build`, then `npx vitest run --maxWorkers=4` **alone**, not beside a build. |
