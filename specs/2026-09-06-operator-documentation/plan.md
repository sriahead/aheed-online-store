---
id: operator-documentation-plan
title: "Operator documentation — runbook role delivery, guide accuracy, per-menu-item coverage (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-06
visibility: internal
summary: "Repairs the staff runbook's audience routing so operator guides actually render, corrects three false capability claims in the store admin guide, and documents all 18 Admin/Staff menu items with a mechanical coverage and permissions check."
tags: [documentation, staff-panel, runbook, rbac, operators]
related: [store-admin-tabs-guide, staff-tabs-guide, platform-admin-guide, discovery-log]
---

# Operator documentation — runbook role delivery, guide accuracy, per-menu-item coverage (plan)

Closes `#633`, absorbing `#625` (delivery) and `#629` (accuracy), and folding in `#626` (the staff
nav's missing Payment Issues link, because this slice documents that page for staff and would
otherwise describe a route they cannot see). Grounded in the 2026-09-06 Discover pass
(`docs/research/discovery-log.md` 1.3.0, PR #632).

**Goal:** make the store's own operator documentation reach the people it is written for, say only
true things, and cover every menu item — so a non-technical shop manager can run the panel without
guessing, and so the next page added cannot ship undocumented.

## Why these three parts are one slice

They are sequentially dependent, not merely related. The new documentation is **only reachable once
the filter is fixed** — writing it first would publish sixteen sections nobody can open, which is
precisely the defect `#625` describes. And correcting the existing guide is what stops the delivery
repair from making a *wrong* document more visible than it is today: the admin guide currently tells
operators they can issue Stripe refunds, and the moment `#625` lands, that claim becomes readable.
Delivery, then accuracy, then coverage.

## Part 1 — repair role delivery (`#625`)

`/staff/runbook` filters its articles twice against two different vocabularies.
`app/(admin)/staff/runbook/page.tsx` keeps `audience` values `staff` or `store-admin`;
`components/staff/RunbookClient.tsx` then re-filters that result for `staff` or **`admin`**. Because
`Array.includes` is exact-element matching, `["store-admin"].includes("admin")` is `false`, so **one
of 152 articles renders** and the UI's own "Admin" tab can never match anything.

**The root cause is the hardcoded tab list, not the mismatched string.** A tab list written as a
literal `["all", "staff", "admin"]` can drift from the audiences actually delivered, silently, which
is exactly what happened. So the fix removes the client's own audience filter entirely — the server
has already decided what this viewer may see — and **derives the tab list from the audiences present
in the documents actually received**. A tab then exists if and only if it has documents behind it,
and this class of defect cannot recur.

**The server filter is deliberately NOT widened to admit `audience: [admin]` documents.** All eight
of those are developer artifacts — `docs/business-analysis/gap-register.md`, three
`docs/developer-portal/sdd/self-review/` documents, and four `plan.md`/`requirements.md`/
`validation.md` spec files. In this repository `admin` means "developer and admin reviewer", not
"store admin"; admitting them would put SDD specs in a shop manager's runbook.

**Platform-admin documents become visible to platform admins only**, gated on
`auth.via === "platform-admin"` — the same pattern `app/(admin)/staff/page.tsx` already uses for the
Error Events card (`#508`). Without this, `docs/platform-admin-guide/platform-admin-guide.md` is
unreachable in-product by anyone (a platform admin passes the runbook's role gate but the server
filter excludes their own guide), and `/staff/errors` has nowhere correct to be documented.

## Part 2 — correct the existing guides (`#629`)

`docs/store-admin-guide/admin-tabs-guide.md` (status `approved`, version `1.2.0`) documents three
things that are not true. The third was found while grounding `/propose` and is not in `#629`'s
original text:

1. **"issue full refunds via the payment provider (Stripe)"** — no refund path exists anywhere in
   the application. `lib/repositories/orders.ts` has none. The capability gap is `#606`; this slice
   documents its absence rather than building it.
2. **"Invite new staff members"** — there is no invitation path. `lib/repositories/roles.ts` requires
   the target user to already exist and throws `User not found with that email address` otherwise, so
   a colleague must self-register first and then be assigned a role by email.
3. **"assign users as either Staff or Admins"** — `lib/repositories/roles.ts` throws
   `Forbidden: Only a platform-admin can grant the Store Admin role`. A store admin can grant
   **STAFF only**.

`docs/staff-playbook/staff-tabs-guide.md` separately opens by saying the staff panel "contains three
main tabs" and documents three. Staff actually reach four from the nav, plus Payment Issues from the
hub.

## Part 3 — document every menu item

There are **18** route directories under `app/(admin)/staff/`, each with a `page.tsx`. The Discover
pass named eight with no coverage at all (Payment Issues, Brands, Bundles, Reports, Customers,
Delivery Areas, Search Synonyms, Error Events), but the existing guides cover the rest *thematically*
rather than per menu item — "Catalogue and Categories" is one prose section spanning several distinct
pages. Since the coverage check enumerates routes from the filesystem, **both guides are restructured
into per-menu-item sections covering all 18 routes**, not merely extended with eight new ones. That is
a larger content change than "write the eight missing guides" and is called out here so it is not a
surprise at Build.

Each section carries the structure from the brief: Purpose, Who can access it, What you can do,
Typical workflow, Important fields and filters, Common mistakes and limitations, and What happens
after changes are saved.

**Sections are placed by audience, matching where each page's own gate admits the reader:**

- `docs/staff-playbook/staff-tabs-guide.md` (`audience: [staff]`) — the four routes that admit STAFF:
  `inventory`, `orders`, `payments`, `runbook`, plus the existing Overview.
- `docs/store-admin-guide/admin-tabs-guide.md` (`audience: [store-admin]`) — the thirteen ADMIN-only
  routes: `brands`, `bundles`, `categories`, `customers`, `delivery-areas`, `discounts`, `loyalty`,
  `products`, `promotions`, `reports`, `search-synonyms`, `storefront`, `team`, and a cross-reference
  for the staff routes an admin also reaches.
- `docs/platform-admin-guide/platform-admin-guide.md` (`audience: [platform-admin]`) — `errors`.

### Guarding against repeating the refund mistake at scale

Writing sixteen more sections risks the `#629` failure sixteen times over. Prose claims cannot be
checked mechanically, but the most dangerous class of claim — **who is allowed to do this** — can be.
A new test enumerates the route directories from the filesystem, requires each to have a documented
section, parses that section's `Who can access` line, and compares it against the page's real
`requireVendorRole(...)` arguments. A guide that misstates a permission fails the suite.

This is the same reasoning as `tests/staff-nav-parity.test.ts`: the defect lives in the relationship
between a document and the code it describes, which no per-file review catches. The procedural half
still matters — every section is written against the real page and its gate, never from the roadmap
or from another document — but the permissions half is now enforced rather than trusted.

### The verified access map

Read from each page's own `requireVendorRole` call, not from any existing document:

| Access | Routes |
| --- | --- |
| Staff and store admins | `inventory`, `orders`, `payments`, `runbook` |
| Store admins only | `brands`, `bundles`, `categories`, `customers`, `delivery-areas`, `discounts`, `loyalty`, `products`, `promotions`, `reports`, `search-synonyms`, `storefront`, `team` |
| Platform admins only | `errors` — `requireVendorRole("ADMIN")` plus an `auth.via !== "platform-admin"` refusal (`#508`) |

## Part 4 — the staff nav's missing Payment Issues link (`#626`)

`components/staff/PanelNav.tsx`'s `currentTier === "staff"` branch omits `/staff/payments`, although
the page admits STAFF and the hub renders its card to them — so the link vanishes the moment a staff
member navigates off the hub. `tests/staff-nav-parity.test.ts` cannot see this: it compares
whole-file href sets between the two surfaces, and the staff-tier branch is never compared against
anything.

Folded in here because Part 3 documents Payment Issues for staff, and documenting a route the nav
hides from them would be incoherent. The fix is the link plus a test asserting the **staff-tier** link
set equals the set of routes whose page admits STAFF — derived from the pages' own gates, so a future
menu reallocation is self-verifying.

**Deliberately excluded:**

- **Building a refund capability.** This slice documents that refunds are not available in the panel.
  `#606` owns whether they get built.
- **A staff invitation flow.** Same reasoning: the guide will describe the real process (self-register,
  then be assigned by email) rather than a flow that does not exist.
- **`#627`, `#628`, `#630`, `#631`** from the same Discover pass — category ordering, report
  drill-down, the flat category select, and the hardcoded staff-panel hexes. Separate slices.
- **Widening the runbook to developer (`audience: [dev]`) documents.** 144 of the 152 articles are
  developer material; the runbook is an operator surface and stays one.
- **Shopper-facing help content** (`docs/shopper-help/`). Different audience, not a panel menu item.
- **Restructuring `docs/platform-admin-guide/platform-admin-guide.md` beyond adding the Error Events
  section.** Its existing content is about vendor onboarding and impersonation, which this slice does
  not touch.

**Open items carried forward:**

- `#606` — a paid order cannot be reduced, substituted or refunded. This slice makes the absence
  explicit in the documentation; it does not close the gap.
- `#513` — the delivery board's Phase field offers only `M0`–`P8`, so `#633` cannot be tagged `P9.2`.
  Recorded rather than worked around by selecting a wrong phase.
