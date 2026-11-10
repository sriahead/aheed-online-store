# PR #1481 retro-spec (validation)

> **Testing strategy (lean 80/20).** Unit tests prove the rules: vendor scoping, role hierarchy,
> parsers, route contract. One integration script proves both real Neon adapters. Preview and
> staging prove the journeys. This slice touches **auth roles, outgoing email, an HTTP route and the
> database**, so security checks run now, not only before release.

Ground rules for the validator:
- Run `npx vitest run` **alone**, with `--maxWorkers=4`.
- Use `npm run preview`, never `npm run dev`, for anything that touches the database.
- Before any Prisma CLI or DB script, check `DIRECT_URL` and `DATABASE_URL` **one at a time** (CLAUDE.md
  "Config & secrets"), print the host only, and confirm it is the **dev** host.
- In Git Bash, prefix `curl` with `MSYS_NO_PATHCONV=1`.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `npx vitest run tests/client-setup-telegram-links.test.ts --maxWorkers=4` passes. `grep -nE "bot[0-9]+:" lib/client-setup/telegram-links.ts` prints nothing. |
| R2  | Unit / E2E | Under `npm run preview`, as `demo-platform-admin`, open `/staff/platform/client-setup`, then the Order alerts card. Every link in `[data-telegram-quick-links]` is present, external links have `target="_blank"` and `rel="noopener noreferrer"` (DevTools), the "Shareable" labels match the `shareable: true` entries, and the token warning sentence is visible. |
| R3  | Acceptance | For each capability sentence in the three guide sections named in R3, find the control or code line that implements it, and record each pair in `build-notes.md`. Any sentence without a control fails. `grep -n "4,000" docs/staff-playbook/staff-tabs-guide.md` matches. |
| R4  | Unit | `npx vitest run tests/page-container.test.ts tests/staff-nav-parity.test.ts --maxWorkers=4` passes. `grep -n 'requireVendorRole("STAFF", "ADMIN")\|PanelRefusal\|redirect("/login")' "app/(admin)/staff/enquiries/page.tsx"` shows all three. |
| R5  | Unit | `grep -c '"/staff/enquiries"' components/staff/nav-items.ts` prints `1`, the entry has `tier: "staff"`, and `tests/staff-nav-parity.test.ts` passes. |
| R6  | Unit | R15's test passes. |
| R7  | Integration | R33's script prints `PASS list scoped to vendor, newest first, ≤100`. |
| R8  | Unit | `grep -rnE "@[a-z0-9-]+\.(com|co\.uk)" "app/(admin)/staff/enquiries/"` prints nothing. The page imports from `@/lib/config` to read `EMAIL_FROM`. |
| R9  | Unit | R13's test file has passing cases for cross-vendor "Enquiry not found." (no send), `<script>` in the reply arriving escaped in `html`, `replyTo === enquiry.toAddress` when it is set, and `replyTo` equal to the sender address when it is not. |
| R10 | Unit / E2E | R13's cases for `skipped` and `failed` assert no reply row is written and an error containing the reason is returned. On staging, see R34. |
| R11 | Unit | R13's case posts `status=HACKED` and asserts no update call. The cross-vendor id case asserts no update call. |
| R12 | Unit / Integration | R13's case sends two replies and asserts two reply rows, with the first unchanged. R33 prints `PASS reply appended`. |
| R13 | Unit | `npx vitest run tests/enquiries-service.test.ts --maxWorkers=4` passes. |
| R14 | Security | `grep -rn dangerouslySetInnerHTML "app/(admin)/staff/enquiries/"` prints nothing. Under preview, submit a contact form whose message is `<img src=x onerror=alert(1)>`; it shows as literal text in `/staff/enquiries` and no dialog opens. |
| R15 | Unit | `npx vitest run tests/contact-service-enquiry.test.ts --maxWorkers=4` passes. |
| R16 | Unit | `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts tests/repository-transaction-safety.test.ts --maxWorkers=4` passes. Every `where:` in `lib/repositories/enquiries.ts` includes `vendorId` (read the file). |
| R17 | Unit | `tests/roles.test.ts` case "finds a mixed-case, padded email" passes, and asserts `findFirst` was called with `mode: "insensitive"` and the lower-cased email. |
| R18 | Unit / E2E | `tests/roles.test.ts` case "store admin granting PLATFORM_ADMIN -> Forbidden, no transaction" passes. Under preview, as `demo-admin` (store admin) the role select has no Platform Admin option. As `demo-platform-admin` it has one, with the global warning text visible. |
| R19 | Unit | The existing case "blocks a store admin from modifying a platform-admin's privileges" passes unchanged. |
| R20 | Unit | A test calls `assignRoleAction` with `role=OWNER` and asserts `{ error: "Invalid role" }` and that `setVendorRole` was not called. |
| R21 | Unit | Cases assert, for a PLATFORM_ADMIN grant, `tx.user.update({ role: "ADMIN" })` plus a membership upsert with `ADMIN`; for STAFF to a platform admin, `role: "CUSTOMER"`; and an audit row with `oldRole: "PLATFORM_ADMIN"`. All run inside the transaction mock, with `isolationLevel: "Serializable"`. |
| R22 | Unit / Integration | Cases cover self-demotion with platform count 1 (refused) and 2 (allowed, vendor count not called), and demotion of *another* platform admin with count 1 (refused). R33 prints `PASS last platform admin refused`. |
| R23 | Unit / Integration | A case for an unknown email with `STAFF` asserts `tx.user.create` with the normalised email, `role: "CUSTOMER"`, `emailVerified: true`, followed by the upsert and audit in the same transaction. Unknown email with `null` throws "User not found". R33 prints `PASS provision STAFF`. |
| R24 | Unit | A case for an unknown email with `PLATFORM_ADMIN` throws the sign-up-first error, and the transaction mock is not called. |
| R25 | E2E (staging) | On staging, as `demo-platform-admin`, grant STAFF to a fresh allow-listed address with no account. Sign in as it by Google or password reset, land on `/staff`, confirm `/staff/team` refuses, and record the route used. Then revoke it (`NONE`). |
| R26 | Unit | `tests/inbound-email-worker.test.ts` cases pass: `/record` is called after `forward`; a `/record` 500 logs a line containing `500`; the alert is still requested; and a throw from `/record` does not reject `handleInboundEmail`. |
| R27 | Unit / Security | `npx vitest run tests/inbound-email-record-route.test.ts --maxWorkers=4` passes, with one case per status code (503, 401 for missing and wrong token, 400 for non-JSON, missing field and over-cap field, 404, 200, and 405 for `GET`). Under preview: `MSYS_NO_PATHCONV=1 curl -s -w '%{http_code}' -X POST http://localhost:8787/api/inbound-email/record -d '{}'` prints `401`. |
| R28 | Unit | Worker test cases cover the `Name <a@b.c>` header, a bare `a@b.c` header, a missing header with an envelope `from`, neither (`unknown@sender`), a multipart message (text/plain chosen), quoted-printable `=3D` and soft break, HTML tags stripped, a 5,000-character body cut to 4,000, and an empty body giving `(No message body)`. |
| R29 | Unit | `npx prisma validate` exits 0. `grep -nE "enum EnquirySource|enum EnquiryStatus|model VendorEnquiryReply" prisma/schema.prisma` matches all three. `VendorEnquiry` has no `replyBody`, `repliedAt` or `repliedBy` field. |
| R30 | Integration | `head -5 prisma/migrations/20261109225000_vendor_enquiries/migration.sql` shows the `#895` hand-authored header. `grep -niE "\bDROP\b" prisma/migrations/20261109225000_vendor_enquiries/migration.sql` prints nothing. No database is needed (`#1435` precedent): `git show origin/staging:prisma/schema.prisma > "$TEMP/base.prisma" && npx prisma migrate diff --from-schema-datamodel "$TEMP/base.prisma" --to-schema-datamodel prisma/schema.prisma --script` outputs exactly the migration's statements, ignoring the header comment and any `pg_trgm` index lines, which must **not** be copied in. `build-notes.md` records whether dev's `_prisma_migrations` already held `20261109225000_vendor_enquiries` and how it was reconciled. |
| R30a | Integration | With DB env confirmed as dev: `npx tsx scripts/verify-enquiry-reshape.ts` prints 7 `PASS` lines and `cleanup: 0 schema(s) left`. `npx vitest run tests/migration-enquiry-reshape.test.ts --maxWorkers=4` passes. After the next `deploy-staging`, `.scratch`-style read-only checks of AFC staging show `VendorEnquiryReply table exists: true` and no reply columns. |
| R31 | Unit | `npx vitest run tests/roles.test.ts tests/inbound-email-worker.test.ts tests/inbound-email-record-route.test.ts --maxWorkers=4` passes. `git diff origin/staging -- tests/roles.test.ts` shows no removed `expect(` line, only renamed doubles (`findUniqueUser` to a `findFirst` double) and added cases. |
| R32 | Unit | `npx vitest run tests/neon-migration-plan.test.ts --maxWorkers=4` passes. `grep -n "VendorEnquiry" scripts/lib/neon-migration-plan.ts` shows both models with `class: "skip"`. |
| R33 | Integration | With DB env confirmed as dev: `npx tsx scripts/verify-pr1481-integration.ts` exits 0 and prints one `PASS` line per check named in R33, ending with `cleanup: 0 rows left`. In the script source, the reads construct `PrismaNeonHttp` and the transactions construct `PrismaNeon`, matching `lib/db.ts`. |
| R34 | E2E (staging) | After D6's merge, `/api/health` on `staging.merqify.com` and `staging.aheedfoodcentre.co.uk` reports the merged commit. Walk every bullet in R34 and record each result in `build-notes.md` or the validation log as pass, fail, or not exercised with the reason. |
| R34a | Unit / Regression | `npx vitest run tests/worker-routes.test.ts --maxWorkers=4` passes, including the `#1482 R34a` block. The next `deploy-staging` run's "Verify Worker routes" step prints `INFO  staging.aheedfoodcentre.co.uk … routed by env afc-staging` and succeeds. |
| R35 | Acceptance | `git diff origin/staging -- CHANGELOG.md` mentions `/staff/enquiries`, Platform Admin grants, provisioning, `/api/inbound-email/record` and the migration. `gh pr view 1481 --json title,body` shows a title that is not docs-only, a body naming this spec folder, and `Closes #NN` for the umbrella issue. |
| R36 | Regression | Each of `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run kms:validate`, `npm run kms:check-generated` exits 0, run in sequence. Then `npx vitest run --maxWorkers=4`, run alone, reports 0 failed. `gh pr checks 1481` shows every required check `pass`. |
