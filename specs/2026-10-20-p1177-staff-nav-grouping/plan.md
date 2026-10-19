---
id: p1177-staff-nav-grouping-plan
title: "Grouped staff panel navigation from one shared nav module (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-20
visibility: internal
summary: "#1177: the admin panel's 25 flat nav links and 24 flat hub cards are grouped into six relevancy groups, both surfaces render from one shared module, and the parity test is rewritten to derive expectations from the filesystem and the pages' own role gates."
tags: [staff-panel, navigation, accessibility, p10]
related: [p1131-storefront-navigation-catalogue, app-conventions]
---

# Grouped staff panel navigation from one shared nav module (plan)

**Goal:** A store admin opening the panel sees six or seven labelled groups instead of 25
undifferentiated destinations, on **both** navigation surfaces, and the two surfaces can no longer
disagree about what the panel contains — because they stop being two hand-maintained lists.

This closes item **1b** of `docs/business-analysis/user-testing-feedback-2026-10-13.md`
(*"many tab items in the admin or staff view — categorise as per their relevancy"*), filed as
`#1177` at Gate 1 on 2026-10-20.

## What is actually there today

Measured, not recalled:

- **`components/staff/PanelNav.tsx:106-158`** — two hand-written branches in one `overflow-x-auto`
  row with chevron nudge buttons. **25 links** for a store admin (24 routes plus `/staff`
  Overview), **13** for vendor staff.
- **`app/(admin)/staff/page.tsx:85-332`** — **24 cards** in a single `grid gap-4 sm:grid-cols-2`,
  plus `/staff/errors` behind `auth.via === "platform-admin"`. Flat as well; the triage document
  never noticed this surface.
- **`tests/staff-nav-parity.test.ts`** — parses PanelNav's *source text*, locating the staff tier by
  the literal `currentTier === "staff"` and `") : ("` (lines 131-140).

## Why the module, and not two grouped files

Gate 1 chose one shared module over hand-grouping both files. The reason is in this repository's own
history: the relationship between these two files has drifted silently **twice** — `#612` (three
pages vanished from one surface, three were unreachable from the other) and `#626`
(`/staff/payments` missing from the staff tier for months while the parity test passed, because that
test is tier-blind). Grouping by hand would add a **third** thing to keep in sync — the group a route
belongs to — with nothing checking it. A route could sit under *Catalogue* on the bar and *Store
setup* on the hub and every test would stay green.

With one module, membership and grouping are true by construction, and the test's job narrows to the
part that genuinely cannot be derived: whether the module agrees with the **pages' own**
`requireVendorRole` gates.

### The current test has a hole this closes

`staffLinksIn()` compares the two files to **each other**. A route that exists on disk but is missing
from **both** surfaces passes silently. The `#633` block closes that for STAFF-admitting routes only
(it derives its expectation from the filesystem); an ADMIN-only route missing from both is still
invisible. Deriving the module's route set from `app/(admin)/staff/*/page.tsx` closes it for every
route. That is a deliberate strengthening, not scope creep — the test is being rewritten regardless,
and leaving the hole in place while rewriting around it would be a choice too.

## Scope (this slice)

### 1. New module — `components/staff/nav-items.ts`

A plain module (**not** `"use server"`, so exporting constants is legal — `CLAUDE.md`), importable by
both the client `PanelNav` and the server-rendered hub, exactly as both already import lucide icons
directly.

It carries, per route: `href`, `label`, `description` (the hub card body), `icon`, and `tier`
(`"staff"` = visible to both tiers, `"admin"` = admin tier only), grouped into an ordered list of
`{ id, label, items }`.

Two routes are deliberately **not** in it:

- **`/staff`** — PanelNav renders it as a standalone *Overview* link before the groups; the hub
  cannot link to itself. Already excluded by the parity test.
- **`/staff/errors`** — platform-admin-only. `PanelNav`'s `currentTier` prop has no way to express
  that, which is why the card lives in the hub alone behind its own `auth.via` check. It stays
  hand-written there, in its own trailing section. Already excluded by the parity test.

### 2. The taxonomy

Six groups covering all 24 module routes, with nothing orphaned:

| Group | Routes | Admin | Staff |
| --- | --- | --- | --- |
| Orders & Fulfilment | `orders`, `fulfilment`, `payments` | 3 | 1 |
| Catalogue | `products`, `inventory`, `categories`, `brands`, `attributes`, `net-content` | 6 | 6 |
| Offers & Loyalty | `promotions`, `bundles`, `loyalty`, `discounts` | 4 | 2 |
| Customers & Content | `customers`, `feedback`, `faqs`, `assistant`, `search-synonyms` | 5 | 2 |
| Store setup | `storefront`, `delivery-areas`, `team`, `ai-usage` | 4 | **0** |
| Insights & Help | `reports`, `runbook` | 2 | 1 |

Plus the standalone *Overview* link. So the bar carries **7 triggers for an admin** (1 link + 6
groups) and **6 for staff** (1 link + 5 groups), reaching 25 and 13 destinations respectively —
the same counts as today.

**Store setup is empty for the staff tier**, so "a group with no visible items does not render" is a
requirement with a real live case rather than a defensive branch nobody exercises.

Tier assignment is not invented here. It is read from each page's own gate
(`requireVendorRole(...)` in `app/(admin)/staff/<route>/page.tsx`): twelve routes admit `"STAFF"`
(`attributes`, `brands`, `bundles`, `categories`, `feedback`, `inventory`, `net-content`, `orders`,
`products`, `promotions`, `runbook`, `search-synonyms`) and twelve are ADMIN-only.

> **Note for a reader trusting the test's prose:** `tests/staff-nav-parity.test.ts`'s comment block
> says `/staff/payments` admits STAFF. **It no longer does** — `app/(admin)/staff/payments/page.tsx`
> is `requireVendorRole("ADMIN")` today, almost certainly reallocated by `#737`. The test's *logic*
> is right (it derives from the gate and so self-corrected); only its prose is stale. Do not port
> that sentence forward.

### 3. `components/staff/PanelNav.tsx` — grouped dropdowns

Gate 1 chose dropdowns over a two-tier bar, a collapsible sidebar and labelled separators.

The bar becomes the Overview link plus one `<button>` trigger per visible group, each opening a
panel of that group's links. The horizontal scroller and its chevron nudge buttons go: seven
triggers fit without scrolling, which is the point of the change.

### 4. `app/(admin)/staff/page.tsx` — headed card sections

The same groups, in the same order, as `<section>`s with a heading each, cards in the existing
two-column grid. The `/staff/errors` card keeps its trailing position and its own `auth.via` gate.

### 5. `tests/staff-nav-parity.test.ts` — rewritten

Imports the module. Derives the expected route set from the filesystem and the expected tier from
each page's own `requireVendorRole`, keeping the self-verifying property `#626` bought. Adds a check
that neither surface hand-writes a `/staff/*` href any more, so the module cannot be quietly bypassed
later.

### 6. Operator guides

No route is added or removed, so `tests/operator-doc-coverage.test.ts` stays green on its own terms.
But `docs/staff-playbook/staff-tabs-guide.md:38-42` carries an **informal grouping in prose** —
*"**Catalogue** (Products, Categories, Brands, Bundles, Promotions)"* — which disagrees with the
taxonomy above (Bundles and Promotions move to *Offers & Loyalty*). That sentence is reconciled to
the shipped groups. `docs/store-admin-guide/admin-tabs-guide.md:16` says "one section per menu item",
which stays true.

### 7. The standing rule changes, so the persistent docs change

This is the part a dated spec folder cannot carry on its own. Today **`CLAUDE.md`** ("Staff panel
pages") and **`docs/developer-portal/app-conventions.md`** (around line 214) both tell a future
session that a new `/staff/*` page must land on three surfaces, two of which are
`components/staff/PanelNav.tsx` and the hub. After this slice that instruction is wrong: a new page
is registered **once**, in the module, which feeds both. Leaving either document describing the old
workflow would send the next session to edit files that no longer hold the list — exactly the doc
drift this repository's conventions exist to prevent. Both are corrected (R15).

The *count* of surfaces does not drop: it is now the module plus one of the three operator guides,
and `tests/operator-doc-coverage.test.ts` is unchanged.

## Copy and icon changes that fall out of the decision

One module means **one** label and **one** icon per route, and today the two surfaces disagree on
three. These are user-visible and are listed so they are not discovered as surprises at `/validate`:

| Route | PanelNav today | Hub today | Shipped |
| --- | --- | --- | --- |
| `/staff/orders` | "Fulfillment & Orders" (staff) / "Orders" (admin) | "Orders" | **"Orders"** — the staff label was compensating for a tier with no `/staff/fulfilment`; the *Orders & Fulfilment* group now carries that sense |
| `/staff/runbook` | "Internal Operational Runbook" (staff) / "Runbook" (admin) | "Internal Operational Runbook" | **"Runbook"** — under *Insights & Help* the qualifier is redundant |
| `/staff/categories` | `LayoutDashboard` icon | `FolderTree` icon | **`FolderTree`** — `LayoutDashboard` is Overview's icon, so the bar showed the same glyph twice |

All labels stay vendor-neutral and carry no grocery example, per the standing rule in
`docs/developer-portal/app-conventions.md` ("User-facing copy").

## The risk accepted at Gate 1

Dropdowns are the shape that needs keyboard semantics, outside-click dismissal and close-on-navigate
for every trigger. That is the pattern behind **`#1144`** (*"Header method menu: confirm it always
closes after a choice"*, open and unreproduced), and `CLAUDE.md` carries a standing rule about
exactly this failure:

> A `useEffect` that closes a UI element on `pathname` change must NOT list that element's `open`
> state in its dependencies — opening it re-triggers the effect and closes it immediately. Call the
> close function unconditionally and silence the specific lint rule instead.

The owner chose dropdowns with that named. It is therefore carried as **R9 and R10 — proven live
under `npm run preview`, on both vendors** — rather than as a code read. A green `lint`/`typecheck`
says nothing about it.

## Deliberately excluded

- **No tier reallocation.** Which role may open which page was `#737`'s work and is settled. This
  slice reads the gates; it does not change one.
- **No `/staff/*` page added or removed**, so `tests/operator-doc-coverage.test.ts`'s expected set is
  unchanged and its test *count* does not move.
- **`#1170`** — `toCategoryOptionGroups` dropping a subcategory listed before its department — is a
  different grouping defect, in the staff **category pickers**, and stays on its own issue.
- **No new mobile behaviour.** The bar must remain usable and must not scroll horizontally at
  desktop width; no sticky header, drawer or bottom bar is introduced (`#395` owns that).
- **No change to `/staff/errors`'s placement or gate**, and none to the `admin-tier` cookie that
  `app/(admin)/layout.tsx:28-36` uses to let an admin preview the staff tier.
- **No restyling of the hub cards themselves** beyond wrapping them in headed sections.
- **No search or filter over the nav.** If 24 destinations still feel long once grouped, that is a
  later observation, not a hedge to build now.

## Open items carried forward

- **`#1144`** stays open. This slice does not fix the storefront header's method menu; it must not
  reproduce its defect, which is what R9 checks.
- The **group taxonomy** is a judgement call, not a derivation. *Offers & Loyalty* versus
  *Customers & Content* is the weakest seam — `feedback` and `search-synonyms` could defensibly sit
  under *Catalogue*. The owner approved this split at Gate 1; a later change is a copy edit to one
  module, which is part of why the module exists.
