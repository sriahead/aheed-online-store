---
id: p1356-demo-accounts-merqify-email-plan
title: "Demo logins on @merqify.com, with forwarded mail (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-31
visibility: internal
summary: "#1356: the six demo logins move from demo-*@example.com to demo-*@merqify.com. demo:accounts add renames existing accounts in place, demo detection matches the exact roster, and Cloudflare Email Routing forwards the six addresses to the owner's inbox."
tags: [demo-accounts, email, cloudflare, merqify, p12]
related: [env-setup, local-dev-playbook, platform-admin-guide]
---

# Demo logins on `@merqify.com`, with forwarded mail (plan)

**Goal:** the demo roster uses addresses that can receive mail. Every email a demo account
triggers then lands in the owner's shared inbox instead of bouncing, once the app can send
(`#1217`). The accounts already on new staging carry over unchanged: same ids, password and roles.

**Owner decision (2026-10-31, `#1356`):**
- The roster becomes `demo-*@merqify.com`.
- Mail to those addresses is forwarded to the owner's shared inbox (a Google Group).
- **The destination address is never written into this public repository.** Docs say "the owner's
  forwarding inbox".

## Why the roster moves

`example.com` is reserved (RFC 2606) and never receives mail. A demo account's order confirmation,
status email or password reset therefore goes nowhere. On `merqify.com`, Cloudflare Email Routing
can forward each demo address to a real inbox. `merqify.com` had **no MX or TXT records** on
2026-10-31, so turning Email Routing on clashes with nothing.

**Sending is a separate matter, and still blocked.**
- The app sends through Resend, which rejects recipients on unverified domains
  (`env-setup.md`, "Resend's API rejects `to` addresses on unverified domains").
- The sending domain is `#104`/`#1217`, so until one of them lands the **app** still delivers
  nothing to these addresses.
- This slice makes the receiving side ready and proves it with a manual test message (R16). It
  does not claim app emails arrive.

## Scope (this slice)

- **`scripts/lib/demo-roster.ts` (new).** It holds the roster data: the six accounts with their
  names, platform roles, store roles and `vendorSlug`, unchanged apart from the domain. It also
  holds `DEMO_EMAILS`, `LEGACY_DEMO_EMAILS` and `legacyDemoEmail()`.
  - The roster is a data-only module because two other scripts need the addresses:
    `scripts/lib/neon-migration-plan.ts` and, through it, `scripts/grant-role.ts`.
  - Importing `scripts/demo-accounts.ts` from those scripts would pull in Better Auth and Prisma.
- **`scripts/demo-accounts.ts`.**
  - **`add`** checks every account first, then writes.
    - New address present: reconcile it, as today.
    - Only the legacy `@example.com` address present: rename that user's email in place, then
      reconcile.
    - Neither present: sign up with the new address.
    - **Both** present: refuse the whole run before any write, because merging two users is not
      something a demo tool should guess at.
  - **Renaming keeps the user id**, so the password (Better Auth's credential `Account` row is
    keyed by user id), sessions, memberships, orders and favourites all stay attached.
  - **`remove`** deletes both address forms, so `#1332`'s go-live clean-up cannot leave a legacy
    account behind.
- **`isDemoEmail` (`scripts/lib/neon-migration-plan.ts`)** returns true for any roster address,
  new or legacy, and for any other `@example.com` address, which keeps today's behaviour for old
  staging's test users.
  - It is **false for every other `@merqify.com` address**: a real Merqify person must never be
    left out of a production copy or refused by `grant-role`.
  - Both callers (`migrate-to-new-neon.ts`'s `User` filter and `grant-role.ts`'s refusal) use the
    function unchanged.
- **Docs that name the current roster:**
  - `docs/developer-portal/env-setup.md`: the demo roster list, the Resend note, and a new "Demo
    mail forwarding" subsection with the owner's dashboard steps;
  - `docs/developer-portal/local-dev-playbook.md`: the line that names what `add` seeds;
  - `docs/platform-admin-guide/platform-admin-guide.md`: the demo platform admin;
  - the comment in `scripts/verify-mobile-layout.ts`.
- **Live, on new staging:** run `demo:accounts add` once, so staging's six accounts are renamed.
- **Owner, in the Merqify Cloudflare dashboard:**
  - enable Email Routing on `merqify.com` (it adds the MX and SPF records);
  - add the forwarding inbox as a destination and verify it;
  - add one rule per roster address. A catch-all is acceptable, at the owner's choice.

## Deliberately excluded

- **Sending from `merqify.com`, and app emails actually arriving.** That is `#1217` (Cloudflare
  Email Service) or `#104`, as explained above.
- **Generic test fixtures** (`shopper@example.com` and similar, about 30 test files). They are not
  the demo roster; `example.com` remains the right domain for fixtures that must never receive
  mail.
- **Dated history.**
  - `specs/20*` folders, roadmap change-log rows, and the dated evidence notes in `env-setup.md`
    and `local-dev-playbook.md` (for example "Seen at `#1226`") keep the address that was true at
    the time.
  - `docs/model-handoff.md` is reconciled at `/document`, not here.
- **Production and dev databases.** Production has no demo accounts until `#1341`, where the copy
  is followed by `demo:accounts add`, which now creates `@merqify.com` accounts directly. Dev is
  renamed the next time anyone runs `add` against it.
- **Automating Email Routing.** The deploy tokens have no Email Routing permission, and the steps
  are one-off.

## Open items carried forward

- **R16 is owner-reported**, because only the owner can see the forwarding inbox.
- **A Google Group destination must accept mail from non-members.** Otherwise Cloudflare's
  verification email and the forwarded messages are held for moderation. This is an owner setting
  in Google Groups.
- **`#1332`** (delete demo accounts at go-live) needs no change. Its `remove` now also covers the
  legacy form (R7).
