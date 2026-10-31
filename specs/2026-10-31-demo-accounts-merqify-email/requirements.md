# Demo logins on `@merqify.com`, with forwarded mail (requirements / acceptance criteria)

Closes `#1356` (P12). The six demo logins move from `demo-*@example.com` to `demo-*@merqify.com`:
- `demo:accounts add` renames existing accounts in place;
- demo detection matches the exact roster;
- Cloudflare Email Routing forwards the six addresses to the owner's inbox.

The app still cannot *send* to these addresses until `#1217`/`#104` (`plan.md`, "Sending is a
separate matter"). "Roster" below means the six accounts:
`demo-admin`, `demo-platform-admin`, `demo-staff`, `demo-customer`, `demo-store-admin` and
`demo-srimart-admin`. Their "new" address is `<name>@merqify.com` and their "legacy" address is
`<name>@example.com`.

**Roster module**

R1. `scripts/lib/demo-roster.ts` exists and exports:
    - `DEMO_ACCOUNTS`: the six accounts, whose `name`, `platformRole`, `vendorRole` and
      `vendorSlug` equal the values in `scripts/demo-accounts.ts` at `0ca03fd`, and whose `email`
      is the new address;
    - `DEMO_EMAILS`: the six new addresses;
    - `LEGACY_DEMO_EMAILS`: the six legacy addresses;
    - `legacyDemoEmail(email)`: maps a new address to its legacy form.

    The module has no `import` statement. `demo-platform-admin@merqify.com` is the only account
    with `platformRole: "ADMIN"`.
R2. `scripts/demo-accounts.ts` imports `DEMO_ACCOUNTS` from `scripts/lib/demo-roster.ts` and
    re-exports it. Neither file contains a string literal ending in `@example.com` other than the
    one inside `legacyDemoEmail`.

**`add`**

R3. Before any write, `addDemoAccounts` looks up both the new and the legacy address of every
    roster account. If any account has **both** present, it throws an error that names both
    addresses, and no `user.update`, `vendorMembership.upsert` or sign-up call is made for **any**
    account.
R4. An account whose new address is absent and whose legacy address is present is renamed: one
    `user.update` with `where: { email: <legacy> }` and `data: { email: <new> }`. The user id is
    unchanged, no sign-up call is made, and `add` prints `~ <legacy> -> <new> [renamed]`.
R5. An account with neither address present is signed up with the new address, as before.
R6. After R4 or R5, and for an account whose new address was already present, the existing
    reconcile runs against the new address:
    - `role`, `emailVerified: true` and `name` are set;
    - the store membership is upserted.

    A second `add` immediately after the first makes no rename and no sign-up call, and prints
    `[reconciled]` for all six.

**`remove`**

R7. `removeDemoAccounts` issues one `deleteMany` whose `email.in` list contains all twelve
    addresses (`DEMO_EMAILS` plus `LEGACY_DEMO_EMAILS`).

**Demo detection**

R8. `isDemoEmail` (`scripts/lib/neon-migration-plan.ts`), after trimming and lower-casing its input:
    - returns `true` for each of the twelve roster addresses and for any address ending in
      `@example.com`;
    - returns `false` for `owner@merqify.com`, `info@merqify.com`, `demo@merqify.com` and
      `owner@aheedfoodcentre.co.uk`.
R9. `scripts/grant-role.ts` refuses a new roster address the same way it refused a legacy one:
    `npx tsx scripts/grant-role.ts --env-file secrets/merqify-staging.vars --email demo-customer@merqify.com --platform-admin`
    exits 1 printing `is a demo or test account`, and constructs no database client.
    `migrate-to-new-neon.ts`'s `User` filter still calls `isDemoEmail`.

**Docs**

R10. The following name `@merqify.com` roster addresses and no `demo-*@example.com` address:
     - the demo roster bullet list in `docs/developer-portal/env-setup.md` (the six lines that
       begin `` - `demo-``);
     - `docs/developer-portal/local-dev-playbook.md`'s sentence beginning
       `` `npx tsx scripts/demo-accounts.ts add` seeds the roster ``;
     - `docs/platform-admin-guide/platform-admin-guide.md`'s two lines naming the demo platform
       admin and `demo-admin`;
     - the comment in `scripts/verify-mobile-layout.ts` that names `demo-customer`.

     Dated evidence notes ("Seen at …", "`/validate` (date)") keep their original address.
R11. `docs/developer-portal/env-setup.md` has a subsection titled `Demo mail forwarding`. It
     lists:
     - enabling Email Routing on `merqify.com`;
     - adding and verifying "the owner's forwarding inbox" as a destination;
     - one rule per roster address, or a catch-all;
     - that a Google Group destination must accept mail from non-members;
     - that app emails do not arrive until `#1217`/`#104`.

     `git grep -n -i -E "google[g]roups"` over the whole repository prints nothing. (The bracket
     keeps this line from matching itself.)

**Tests**

R12. `tests/demo-accounts.test.ts` covers R3 (zero writes on conflict), R4, R5, R6 (idempotent
     second run) and R7 with the injected fake. `tests/neon-migration-plan.test.ts` covers every
     address listed in R8.

**Live, new staging (`ep-damp-snow-zamr1xa5`)**

R13. After `npm run demo:accounts -- add` against new staging, with that database's `DIRECT_URL`
     and the unchanged `DEMO_ACCOUNT_PASSWORD` from `secrets/merqify-staging.vars`:
     - the database holds exactly six users whose email is a roster address, all six `@merqify.com`;
     - it holds zero legacy roster users;
     - each user's id equals its id before the run;
     - each platform role and store membership equals the pre-run value.
R14. `POST /api/auth/sign-in/email` returns HTTP 200:
     - on `https://aheed-staging.merqify.com` for `demo-platform-admin@merqify.com`;
     - on `https://srimart-staging.merqify.com` for `demo-srimart-admin@merqify.com`;
     - both with the unchanged password.

**Owner-gated: mail forwarding**

R15. A DNS-over-HTTPS MX query for `merqify.com` returns only Cloudflare Email Routing hosts
     (`route1.mx.cloudflare.net`, `route2.mx.cloudflare.net`, `route3.mx.cloudflare.net`).
R16. A message sent by the owner from a personal mailbox to `demo-customer@merqify.com` arrives in
     the owner's forwarding inbox, as reported by the owner. It is reported **UNVERIFIED** until the
     owner confirms it.

**Gates**

R17. `CHANGELOG.md` updated (Gate 4).
R18. `lint`, `typecheck`, `test` and `format:check` all remain green after this slice.
