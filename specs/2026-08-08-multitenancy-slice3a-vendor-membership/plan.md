---
id: multitenancy-slice3a-vendor-membership
title: "ADR-004 slice 3a — per-vendor authorization (VendorMembership) (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-08
visibility: internal
summary: Introduce VendorMembership for per-vendor staff/admin authorization, keeping User.role as the platform-level role, and add a requireVendorRole() gate — the no-infra, testable-now first piece of ADR-004 slice 3.
tags: [multi-tenancy, auth, rbac, vendor-membership]
related: [adr-004-multi-tenancy, multitenancy-slice2-vendor-enforcement, adr-002-auth-library, architecture]
---

# ADR-004 slice 3a — per-vendor authorization (VendorMembership) (plan)

First sub-slice of ADR-004 slice 3 (issue #68). The infra-free, testable-now part; 3b (host→tenant
resolver + wildcard routing) and 3c (auth cookie scoping) follow and need the wildcard DNS + a 2nd
vendor. `requirements.md` holds the checkable criteria.

**Goal:** make authorization **per-vendor** — a user can be staff/admin of one vendor without being
so for another — while keeping identity global (ADR-004). This is the data model + gate that P6's
admin/staff panel (and 3b/3c) build on.

**Design (the model decision):**
- **`User.role` stays the PLATFORM-level role** (`CUSTOMER`/`STAFF`/`ADMIN`). Platform `ADMIN` = the
  operator, transcends all vendors. No `User` schema change. `/dev` (platform diagnostics) keeps
  gating on platform `ADMIN` via the existing `requireRole` — unchanged.
- **`VendorMembership(userId, vendorId, role)`** — per-vendor role (`VendorRole` = `STAFF`|`ADMIN`;
  no `CUSTOMER`, since a membership *is* a staff/admin grant). `@@unique([userId, vendorId])`.
- **`requireVendorRole(...allowed)`** (new, in `lib/auth-rbac.ts`): 401 if unauthenticated; **allow
  if platform `ADMIN`**; else resolve the current vendor via `getCurrentVendorId()` (slice 2 seam)
  and allow iff a `VendorMembership` for that vendor has a role in `allowed`; else 403.

**Scope (this slice):**
- Prisma: `VendorRole` enum + `VendorMembership` model (+ `memberships` back-relations on `User`,
  `Vendor`); a straightforward additive migration (new table — no backfill).
- `lib/auth-rbac.ts`: add `requireVendorRole()`; `requireRole` (platform) untouched.
- Demo memberships so it's exercisable: `demo-admin` → Aheed `ADMIN`, `demo-staff` → Aheed `STAFF`,
  `demo-customer` → none. Created by the **demo-accounts tool only** — it owns the demo users, so it's
  the only place that can attach their memberships; `prisma/seed.ts` seeds catalogue (not users) and
  is untouched here. Idempotent.
- Unit test for `requireVendorRole` (platform-admin, vendor role match/mismatch, no membership,
  unauthenticated).

**Deliberately excluded:**
- Host→tenant resolution / wildcard routing — **3b**.
- Auth cookie scoping / family SSO / custom-domain isolation — **3c**.
- Any new admin/staff *panel* or route that consumes `requireVendorRole` — that's **P6**; 3a ships
  the primitive + its test, not a UI. (`requireVendorRole` is intentionally added ahead of its P6
  consumer because 3b/3c and P6 all depend on the membership model existing.)
- Changing `/dev`'s gate — it stays platform-admin.

**Open items carried forward:**
- `getCurrentVendorId()` is still the interim single-vendor resolver until 3b; `requireVendorRole`
  therefore checks membership against the sole vendor for now — correct, and it starts working
  per-host automatically once 3b lands.
- The 2nd vendor (SriMart) + its dummy catalogue are **3b** test fixtures, not built here.
