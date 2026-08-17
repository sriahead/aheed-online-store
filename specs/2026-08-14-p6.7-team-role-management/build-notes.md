# Team & Role Management (P6.7) — build notes

> **Retrospective, written 2026-08-17 — not contemporaneous.** P6.7 was built and pushed directly
> to `staging` on 2026-08-13 (commits `3e9fdd8`, `7e376df`, `cdbaaeb` and others) with no PR, no
> `gates` run, and no build notes; issue #186 was closed the same day, before the work had reached
> review. This file was reconstructed afterwards from the commits, from PR #188's validate/fix pass,
> and from the live walk performed during `specs/2026-08-17-p6.7-closeout-promotion/`. It is written
> because `sdd:preclear` correctly refused a Clear on a slice folder with no build notes, and
> because this slice was about to reach production without any. Where it describes intent, that
> intent is inferred from the artifact rather than recalled.

## What changed and why

- **`prisma/schema.prisma`** — added `VendorRoleAuditLog` (`id`, `vendorId`, `userId` target,
  `actorId`, `oldRole`, `newRole`, `createdAt`), migration
  `20260813202736_p6_7_team_role_management`. Matches `plan.md` §2.1 exactly.
- **`lib/repositories/roles.ts`** — `getVendorTeam()` and `setVendorRole(targetEmail, newRole)`.
  The plan proposed `updateVendorRole(targetUserId, …)` on `lib/repositories/vendor.ts` or
  `lib/auth-rbac.ts`; the build put it in a new `roles.ts` and keyed on **email** rather than user
  id, because the UI's affordance is "search for a registered customer by email".
- **`app/(admin)/staff/team/page.tsx`** + **`components/staff/team/AssignRoleForm.tsx`** — the
  Team & Access surface: a Grant Access form (email + role `<select>` + Apply) and a Current
  Members table (name, email, store role, platform role, added date).
- **`PanelNav`** — a Team entry gated to admins; STAFF never sees the link, and the page itself
  renders an "Admin only" panel in place if reached directly.

The hierarchy from `plan.md` §2 is enforced in `setVendorRole`: granting `ADMIN` requires
`auth.via === "platform-admin"` (`roles.ts:42`); a store admin may not touch a platform admin's
privileges (`roles.ts:64`); `requireVendorRole("ADMIN")` denies STAFF entry outright. The membership
write and the audit insert share one `$transaction`, as the plan required.

## Decisions taken during the build

Inferred from the artifact — the original reasoning was not recorded anywhere.

- **A new `lib/repositories/roles.ts`** rather than extending `vendor.ts` or `auth-rbac.ts`, both of
  which `plan.md` floated. Keeps the audit-writing role mutation separate from the RBAC *reader*.
- **Keyed on email, not user id** — matches the UI's search affordance and `plan.md` §2.3.
- **`newRole: null` means "revoke"**, surfaced in the UI as a `NONE` option labelled
  "Revoke Access (Demote)", and implemented as `deleteMany` on the membership rather than a
  sentinel role value.
- **Refusals are thrown `Error`s surfaced as rendered text**, not HTTP statuses. `validation.md`
  originally described these as "403 Forbidden"; PR #188 corrected that wording — a Server Action
  returns a normal response with an error payload, and there is no route handler here to return a
  status from.

## Deviations from the spec

- **`plan.md` §2.2 named `updateVendorRole(targetUserId, newRole)` in `vendor.ts`/`auth-rbac.ts`;**
  the build shipped `setVendorRole(targetEmail, newRole)` in a new `lib/repositories/roles.ts`.
  Same behaviour, different name, location and key. Recorded here rather than reconciled — the
  shipped shape is the better one and is what every later doc references.
- **`plan.md` §2.3 said the Team & Access card is "visible only to `ADMIN`".** As shipped, a
  platform admin with *no* vendor membership also sees it, because `requireVendorRole()` returns
  early for any platform `ADMIN`. That is correct and intended behaviour under ADR-004, but it is
  not what the plan's sentence says.
- **The slice bypassed the delivery loop entirely** — no PR, no `gates`, no build notes, issue
  closed early. That is the deviation with the largest consequence: `staging` was left red on
  `lint`/`format:check`/`vitest` for four days, and PR #188 had to clean it up.

## Known-shaky areas

Largely closed by PR #188 and the 2026-08-17 walk; kept for the record.

- **The self-lockout guard was racy as originally built.** The admin count was read outside the
  write's transaction, so two concurrent self-demotions could both pass a stale count and leave a
  vendor with zero admins. Fixed in PR #188 by moving the count inside the `$transaction` at
  `Serializable` isolation. This is still the most delicate part of the file.
- **`plan.md` §3's privilege-escalation risk is now positively verified**, not just guarded:
  injecting an `ADMIN` option into the store admin's `<select>` and submitting is refused
  server-side with no write, and refusals write **zero** audit rows.
- **`demo-admin`'s `vendorRole: "ADMIN"` is dead weight** — never read, because of the
  platform-admin short-circuit. It misleads anyone reading the roster into thinking a store admin
  is representable there; it is not. `demo-store-admin@example.com` (#190) is.
- **Cross-vendor behaviour is untested.** Every check to date has run against the Aheed vendor
  only. A platform admin acting on SriMart, or a store admin of one vendor targeting another's
  member, has never been exercised — related in spirit to the open #141.
