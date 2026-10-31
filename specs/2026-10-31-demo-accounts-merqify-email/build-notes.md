# Demo logins on `@merqify.com`, with forwarded mail (build notes)

Written at the end of Build, **before** the Clear. Spec commit `cd352934`, build commit `5e274dc5`,
branch `feature/demo-accounts-merqify-email` (from `staging` at `0ca03fd`). Issue `#1356`.

## What changed and why

- **`scripts/lib/demo-roster.ts` (new, no imports).** The roster moved out of
  `scripts/demo-accounts.ts` so `scripts/lib/neon-migration-plan.ts` can read it without pulling in
  Better Auth. It exports `DEMO_ACCOUNTS` (six `demo-*@merqify.com` addresses), `DEMO_EMAILS`,
  `legacyDemoEmail()` and `LEGACY_DEMO_EMAILS`. `scripts/demo-accounts.ts` re-exports the roster and
  its types, so existing importers are unchanged.
- **`add` renames a legacy account in place (R2–R6).** A read-only pre-pass looks up both addresses
  for every roster entry. If any entry has **both**, it throws before writing anything (R3).
  Otherwise each entry is `present`, `legacy` (one `user.update` of `email` only, logged
  `~ old -> new [renamed]`) or `absent` (sign-up). The existing reconcile then runs unchanged, so a
  renamed user keeps its id, password (the credential account is keyed by user id), role and
  memberships.
- **`remove` deletes both address sets (R7)**: 12 addresses in one call.
- **`isDemoEmail` (R8)** matches the 12 roster addresses (case-insensitive) or any `@example.com`
  address. Any other `@merqify.com` address is never treated as demo.
- **Docs (R9–R12):** `env-setup.md` 1.27.0 (roster, new "Demo mail forwarding" subsection with the
  four owner steps, Resend note), `local-dev-playbook.md` 1.38.0, `platform-admin-guide.md` 1.7.0,
  plus a comment in `scripts/verify-mobile-layout.ts`. CHANGELOG "Changed" entry.
- **Tests:** `tests/demo-accounts.test.ts` (rename, conflict zero writes, idempotent after rename,
  all-new sign-up, 12-address remove) and `tests/neon-migration-plan.test.ts` (R8 cases).

## Decisions taken during the build

- **The forwarding inbox is never named in the repo.** The repo is public, so the docs, spec and
  issue say "the owner's forwarding inbox". R11's guard uses `google[g]roups` so the spec does not
  match itself.
- **The `User` plan reason was shortened to one line**, because the `MODEL_PLAN` scan test reads
  single-line entries.
- **The live rename ran against new staging only** (`ep-damp-snow-zamr1xa5`, host-guarded script).
  Production (`ep-dry-mouse`) is not live yet; `#1341`'s cut-over runs the same `add`.

## Deviations from the spec

- None in code. **R15/R16 (Email Routing) are deferred by the owner** ("I will add this later",
  2026-10-31). The doc steps ship, but the DNS and test-mail checks stay open until the owner
  enables routing.

## Known-shaky areas

- **Live results, recorded 2026-10-31 (R13/R14):**
  - The first `add` printed six `[renamed]` lines. The ids (`2Ig6rY09`, `tTShavz0`, `VYJg9kGR`,
    `fHrJjfhW`, `csPl1XID`, `MRvvIK9G`), roles and memberships match the pre-run snapshot. Zero
    `demo-*@example.com` users remain.
  - A second run printed six `[reconciled]` lines and no renames.
  - Sign-in returns 200 for `demo-platform-admin@merqify.com` on `aheed-staging.merqify.com` and
    for `demo-srimart-admin@merqify.com` on `srimart-staging.merqify.com`. The old
    `demo-platform-admin@example.com` returns 401.
- **App emails to demo addresses still don't arrive** until a verified sending domain exists
  (`#1217`/`#104`). Forwarding covers inbound mail only.
- **Old Nocaped staging still holds `@example.com` demo users.** It is being decommissioned, so it
  was left alone.
