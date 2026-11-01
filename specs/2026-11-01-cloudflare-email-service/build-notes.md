# Cloudflare Email Service and Client Setup dashboard (build notes)

Written at the end of Build (2026-11-01), before the Clear. Commits on
`feature/1217-cloudflare-email-service`: spec `579e5bee`, code `dc29ee0d`, docs `833840e4`, and the
build-notes commit that carries this file and `CHANGELOG.md`.

Validation was **not** run here. What was run during Build is listed under "Evidence gathered at
Build" so Validate knows what is real and what is only claimed.

## What changed and why

**Outgoing email (R1–R13)**
- `lib/email.ts` is the port. `send()` now returns `EmailSendResult` (`sent` / `skipped` /
  `failed`) instead of `void`, so the Client Setup test email can report the outcome. Callers
  ignore the return value, so nothing else changed for them.
- Adapters live in `lib/email/`: `cloudflare.ts`, `resend.ts` and `log.ts`. `types.ts` holds the
  shapes; `policy.ts` holds the two pure decisions, `resolveSender` (R5) and `isRecipientAllowed`
  (R6).
- `lib/email.ts` imports from `./email/…`. A file `lib/email.ts` beside a directory `lib/email/`
  resolves fine: `@/lib/email` hits the file.
- **Order of checks in `send()`:**
  1. config parse (failure → `failed`, logged);
  2. recipient policy (→ `skipped`, `console.warn`);
  3. adapter selection;
  4. `EMAIL_FROM` required unless the adapter is `log`;
  5. sender resolution;
  6. deliver.
  Log lines never include the recipient address (the old code logged it).
- `getEmailBinding()` reads `EMAIL` from `getCloudflareContext()`. `selectEmailProvider()` is
  exported so the dashboard shows the same provider the sender uses.
- Send sites: `lib/auth.ts` (reset and verify) uses the new `getCurrentVendorSender()` in
  `lib/vendor-service.ts`. `features/checkout/send-confirmation.ts` and
  `features/orders/send-status-email.ts` pass `sender` from `fetchVendorProfile`.
- `lib/config.ts`: the new email schema (R8) and a separate `getInboundEmailEnv()` for the resolve
  route's token. `lib/dev-diagnostics.ts` "email" presence now means `EMAIL_FROM` is set.
- `wrangler.toml`:
  - `[[env.staging.send_email]]` and `[[env.production.send_email]]` with `name = "EMAIL"`;
  - `EMAIL_FROM = "no-reply@merqify.com"` in both `[vars]` blocks;
  - `EMAIL_RECIPIENT_MODE = "open"` in production vars only.
- `scripts/configure-env.mjs`: the `RESEND_*` keys are no longer required, and `INBOUND_EMAIL_TOKEN`
  is. The token is also pushed to the inbound Worker (`--config workers/inbound-email/wrangler.toml`).
  `RESEND_API_KEY`, `EMAIL_VERIFIED_DOMAINS` and `EMAIL_ALLOWED_RECIPIENTS` are optional secrets.
- Cost registries (R13): the `cloudflare-email` running-cost item is now `estimate` /
  `provider-pricing-page` with a `limits` block. The `email-transactional` cost driver is
  Cloudflare, `fixed: null`, 3,000 free units then $0.35 per 1,000.

**Incoming email (R14–R23)**
- `prisma/schema.prisma`: `enum InboundAddressPurpose`, `model VendorInboundAddress`, and the
  `Vendor.inboundAddresses` back-relation.
- Migration `20261101120000_vendor_inbound_address` is Prisma's own DDL, generated offline with
  `prisma migrate diff --from-schema-datamodel <staging schema> --to-schema-datamodel …`, with a
  header explaining why (`#895`). **It was applied to dev** (`ep-dry-morning`) by the owner on
  2026-11-01 with `prisma migrate deploy`. Two older pending migrations
  (`20261027080000_category_and_system_assets`, `20261027120000_ai_feature_pricing_review`) applied
  in the same run; they were already pending on dev and belong to earlier slices.
- `lib/repositories/inbound-address.ts` has six exports, each taking its client explicitly:
  `findInboundAddress`, `listInboundAddresses`, `createInboundAddress` (unique index as the guard,
  `isUniqueViolation`), `deleteInboundAddress` (`deleteMany` scoped by vendor), `normaliseAddress`
  and `findVendorOrderNumber`.
- `lib/inbound-email-service.ts`: `resolveInboundEmailWith(prisma, …)` (client-injected, so a
  script can call it), `resolveInboundEmail(…)` and `extractOrderNumberCandidates`. Reads only.
- `app/api/inbound-email/resolve/route.ts`: same guard shape as `app/api/jobs/*` (503 / 401 /
  400 / 404 / 200), header `x-inbound-token`.
- `workers/inbound-email/`: its own `wrangler.toml` (staging `aheed-inbound-email-staging`,
  production `aheed-inbound-email`, `APP_BASE_URL` per env) and `src/index.ts`. The handler is
  `handleInboundEmail` (exported for tests) behind the default `email()` export.
- Both deploy workflows gained a "Deploy inbound email worker" step right after the scheduler
  step.

**Client Setup (R24–R34)**
- `lib/client-setup/sections.ts`: the section list, the Email section's seven steps,
  `EMAIL_LIMITS` and `senderConfigured`.
- `lib/client-setup/form-state.ts`: the form state and zod schemas. It is a plain module, because
  the `"use server"` rule forbids exporting them from the actions file.
- `lib/client-setup-service.ts`: page data (`getEmailSectionData` reuses `resolveSender` for "Mail
  goes out as") and the writes. `addInboundAddress` holds the loop guard.
- `lib/repositories/vendor.ts`: new `updateVendorSender` (`findUnique`, then a singular `update`;
  returns false when there is no config row).
- `app/(admin)/staff/platform/client-setup/page.tsx` and `actions.ts`;
  `components/staff/client-setup/EmailSetupForms.tsx` (four `useActionState` forms).
- Registered once in `components/staff/platform-nav-items.ts` ("Client Setup", icon `list-checks`).
- `lib/vendor-readiness-service.ts`: `outgoing_email_service` is now "Store Email Sender".
  `evaluateVendorReadinessData` takes an optional third parameter, `emailVerifiedDomains`, so it
  stays pure; `evaluateVendorReadiness` passes the parsed env value.

**Other files touched so existing guards stay green**
- `tests/repository-vendor-scoping.test.ts`: allowlist entry for `findInboundAddress`, with the
  reason recorded in ADR-004.
- `tests/page-container.test.ts`: width entry for the new page.
- `features/feature-catalogue/catalogue.ts`: platform entry "Client setup" (status `partial`).
- `scripts/lib/neon-migration-plan.ts`: `VendorInboundAddress` is `skip`, because addresses are
  per environment.
- `tests/operator-doc-coverage.test.ts`: `client-setup` added to `platformSubdirs`, so the guide
  section is genuinely enforced (it was not before: that list is hardcoded).

**Docs**
- `docs/developer-portal/env-setup.md` 1.33.0: the new section "Email: sending and receiving"
  (keys table, setup order, limits, sanity check with "Last run: not yet run"). The Resend
  "stopgap" passages at the cut-over notes and the demo-mail note were corrected.
- `docs/platform-admin-guide/platform-admin-guide.md`: the Client Setup section.
- `specs/architecture.md`: the email row, the Workers list, the diagram node and the layering label.
- `specs/decisions/ADR-004-multi-tenancy.md`: the `findInboundAddress` exception.
- The owner approved editing `docs/` alongside the parallel KMS-documents work (2026-11-01). The
  edits are additive sections plus the corrected passages.

## Decisions taken during the build

- **`EMAIL_FROM` is committed `[vars]`, not a secret**, in both environments, as
  `no-reply@merqify.com`. The owner has not confirmed that exact address. A `[vars]` entry survives
  deploys, and a same-named secret would clash with it.
- **`EMAIL_VERIFIED_DOMAINS` and `EMAIL_ALLOWED_RECIPIENTS` are secrets**, not `[vars]`. Onboarding
  a domain or a tester then needs no commit or deploy (secrets persist across `wrangler deploy`).
  The allowlist also holds personal addresses, which must not be committed.
- **`INBOUND_FALLBACK_FORWARD` is a secret** on the inbound Worker, for the same no-personal-address
  reason.
- **Inbound Worker production name is `aheed-inbound-email`**, the spec's literal (R20), not
  `…-production` like the scheduler.
- **A readiness item for an unverified domain shows `OPTIONAL`, not `MISSING`**, with
  `required: false`, so readiness scores did not move.
- **The test-email "skipped" message reads "Skipped by recipient policy or configuration: <reason>"**,
  because the log adapter also returns `skipped`. The reason text tells them apart.
- **`send()` returns a result** (see above) rather than adding a second method.
- **Cost registry `asOf` dates were kept at each registry's shared read date** (`READ` /
  `2026-10-27`). `tests/pricing-registries.test.ts` requires `asOf <= BUILD_DATE`, and the
  staleness tests assume one date. The actual 2026-11-01 read date is in `limits.retrievedOn` and
  a comment. `tests/pricing-refresh.test.ts` expectations gained the Cloudflare pricing URL,
  because a priced `limits` block makes it a refresh source.
- **The dashboard's server actions live under `app/(admin)/staff/platform/client-setup/actions.ts`**,
  as the spec says, and the client component imports them from `@/app/…`. This matches the
  existing `PricingReviewPanel` → `platform/costs/actions` precedent.

## Deviations from the spec

1. **R10: four send sites, not three.** `features/orders/send-status-email.ts` also sends to the
   buyer and now passes `sender` too. The spec missed it, but the intent (every send carries the
   vendor) covers it. Existing order-email tests were changed only to select the Resend adapter
   explicitly (`EMAIL_PROVIDER=resend`, `EMAIL_FROM`, `EMAIL_RECIPIENT_MODE=open`). Two new
   vendor-sender assertions were added in `tests/order-confirmation-email.test.ts`.
2. **R12: `configure-env` does not require `EMAIL_FROM`.** It is committed in `wrangler.toml` `[vars]`
   (see Decisions), so pushing it as a secret would conflict. `INBOUND_EMAIL_TOKEN` is required as
   specified.
3. **R9's grep over `app` matches `app/(admin)/staff/runbook/docs.ts`**, which `kms:build-index`
   generates from the docs. Those docs legitimately name the retired key in prose. This is the
   spec-wording trap `sdd-workflow.md` warns about. Excluding that one generated file, the R9 grep
   prints nothing (verified at Build).
4. **R16 named only the purity and client-injection tests.**
   `tests/repository-vendor-scoping.test.ts` also needed an allowlist entry for the un-scoped
   `findInboundAddress`, with the reason recorded in ADR-004 as that test demands. The purity and
   client-injection tests are unchanged.
5. **R30 says "the build-notes-named verification script".** It is
   `scripts/verify-inbound-address-unique.ts`.

## Known-shaky areas

- **No real email has been sent or received through Cloudflare.** `merqify.com` is not onboarded in
  Email Sending yet (owner step).
  - `wrangler deploy --dry-run` shows `env.EMAIL (unrestricted)  Send Email` for both
    environments, so the binding itself restricts no recipient (spec risk 1, half answered).
  - Whether `send({from:{name,email}, replyTo, …})` is accepted exactly as typed by
    `@cloudflare/workers-types` 5.20260804.1 is unproven until R39.
  - **After promotion, production sends through Cloudflare (the binding exists), and every send
    fails, logged, until the domain is onboarded.** Before this slice, production used Resend in
    sandbox mode, which also never delivered to real customers (#104), so no working path is lost.
    The Resend secrets still on the Workers are unused unless `EMAIL_PROVIDER=resend` is set.
- **The inbound Worker has never received a message.** `email()` forwarding needs a verified
  destination address, and its behaviour on `forward()` to an unverified address is untested.
- **The Client Setup server actions were not driven end to end** (no browser or action-encoding
  curl). They are covered by unit tests with the gate and service mocked. Live under
  `npm run preview` on dev, only these were seen:
  - the page renders for the platform admin;
  - the store admin gets "Platform admin only";
  - `?vendor=no-such` shows "not found" with HTTP 200;
  - the seven guide steps render;
  - provider shows `log` and status `blocked` locally (no binding and no `EMAIL_FROM` in local env).
  R28's save, add and remove round trip is Validate's to run.
- **The store picker renders one button per vendor: 779 on dev** (test residue). That is
  unusable there, but fine on staging and production. Tracked in #1391.
- **The resolve route was exercised live only for the 503 case** (no `INBOUND_EMAIL_TOKEN` in
  `.dev.vars`). The 401, 404 and 200 cases are unit-tested. R17's live check needs a token added to
  `.dev.vars` and a preview restart (both files, per the precedence rule).
- **Prettier collapsed `EmailSendResult` and `CreateInboundAddressResult` onto one-line unions.**
  That is cosmetic, but it reads oddly.
- **Windows: `python` writes CRLF by default.** The first scripted edits produced CRLF in nine files;
  they were normalised to LF, and later scripts used `newline=""`. `git ls-files --eol` showed no
  `w/crlf` at commit time. Re-check if a file looks fully rewritten in the diff.

## Evidence gathered at Build (not a substitute for Validate)

- `npm run typecheck`, `npm run build` (webpack) and `npx eslint` on all new and changed files
  passed. The full `npx vitest run --maxWorkers=4` passed after the fixes noted above
  (372 files). It ran before the final docs commit; the docs commit changed only
  `tests/operator-doc-coverage.test.ts` among tests, and that file passes alone (150 tests).
- `npx wrangler deploy --dry-run --env staging|production` passed with `env.EMAIL` and `EMAIL_FROM`
  listed (production also `EMAIL_RECIPIENT_MODE ("open")`). The inbound Worker's staging dry-run
  passed (1.85 KiB, `APP_BASE_URL` only).
- `kms:validate`, `kms:check-generated` (after commit) and `kms:assemble:internal`, plus a Next build
  in `kms/site-internal`, passed. The only `kms:coverage` difference is
  `misc: baseline 0, measured 1`, which is the gitignored local `misc/` folder (CLAUDE.md), not a
  regression.
- **R30, against dev `ep-dry-morning`:**
  `npx tsx scripts/verify-inbound-address-unique.ts` printed:
  - `getPrisma() / PrismaNeonHttp: code=23505 isUniqueViolation=true`;
  - `getPrismaWs() / PrismaNeon: code=P2002 isUniqueViolation=true`;
  - `createInboundAddress over HTTP: {"ok":false,"reason":"duplicate"}`;
  - `R30 PASSED`.
  Run with `NODE_OPTIONS=--dns-result-order=ipv4first` (this machine's IPv6 issue).
- **R18 against real dev data**, with a temporary SRIMART SUPPORT address created through the
  repository and removed afterwards:
  - subject `SRI-20260811-SAC325` → `orderRelated:true`;
  - Aheed's real order `AHE-20260810-H6HWXL` → `false, null`;
  - no number → `false`;
  - an upper-cased `to` still matched.
- **Dev login for live checks:** `demo-platform-admin@example.com` (role ADMIN) and
  `demo-store-admin@example.com`, password `DEMO_ACCOUNT_PASSWORD` in `.dev.vars`. Sign in with
  `POST /api/auth/sign-in/email` plus an `Origin` header.
- **Dev ids:** Aheed `a4ed0000-0000-4000-a000-000000000001` (host `localhost:8787`), SriMart
  `5217a4a7-0000-4000-a000-000000000002` (host `srimart.localhost:8787`).
