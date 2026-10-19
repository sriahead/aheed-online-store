# Grouped staff panel navigation from one shared nav module (requirements / acceptance criteria)

Closes `#1177`, which files item **1b** of `docs/business-analysis/user-testing-feedback-2026-10-13.md`.
The admin panel's two navigation surfaces — the bar at `components/staff/PanelNav.tsx` (25 flat
links for an admin, 13 for staff) and the hub at `app/(admin)/staff/page.tsx` (24 flat cards) — are
grouped into six relevancy groups rendered from **one** shared module, and
`tests/staff-nav-parity.test.ts` is rewritten to derive its expectations from the filesystem and from
each page's own `requireVendorRole` gate rather than by comparing the two files to each other. Gate 1
(2026-10-20) chose dropdown menus and the shared module; the narrative and the excluded items are in
`plan.md`.

Throughout: **"module"** means `components/staff/nav-items.ts`; **"a route admits STAFF"** means
`app/(admin)/staff/<route>/page.tsx` contains a `requireVendorRole(...)` call whose arguments include
the string `"STAFF"` and which does not refuse on `auth.via !== "platform-admin"`.

R1. `components/staff/nav-items.ts` exists, contains no `"use server"` directive, and exports an
    ordered `STAFF_NAV_GROUPS` whose every element is `{ id, label, items }` with a non-empty
    `items`; every item is `{ href, label, description, icon, tier }` with `tier` one of `"staff"`
    or `"admin"`. Group `id` values are unique and group `label` values are unique.

R2. The set of `href` values across every group equals exactly the set
    `/staff/<dir>` for every directory under `app/(admin)/staff/` that contains a `page.tsx`,
    **minus** `/staff/errors`. It is 24 routes, and `/staff` itself appears in no group.

R3. For every module item, `tier === "staff"` if and only if that item's route admits STAFF. This
    yields exactly twelve `"staff"` items — `attributes`, `brands`, `bundles`, `categories`,
    `feedback`, `inventory`, `net-content`, `orders`, `products`, `promotions`, `runbook`,
    `search-synonyms` — and twelve `"admin"` items.

R4. `STAFF_NAV_GROUPS` has exactly six groups in this order, with exactly these members:
    `Orders & Fulfilment` (`orders`, `fulfilment`, `payments`); `Catalogue` (`products`,
    `inventory`, `categories`, `brands`, `attributes`, `net-content`); `Offers & Loyalty`
    (`promotions`, `bundles`, `loyalty`, `discounts`); `Customers & Content` (`customers`,
    `feedback`, `faqs`, `assistant`, `search-synonyms`); `Store setup` (`storefront`,
    `delivery-areas`, `team`, `ai-usage`); `Insights & Help` (`reports`, `runbook`).

R5. Neither `components/staff/PanelNav.tsx` nor `app/(admin)/staff/page.tsx` contains a string
    literal matching `"/staff/<name>"` any more, with exactly two exceptions: `"/staff"` in
    `PanelNav.tsx` (the Overview link) and `"/staff/errors"` in the hub. Both files import from the
    module.

R6. Rendered for `currentTier="admin"`, `PanelNav` presents an *Overview* link to `/staff` plus
    exactly six group triggers, and the union of the Overview link and every group's links is
    exactly 25 distinct destinations — the 24 module routes plus `/staff`. A closed group's links
    are **present in the server-rendered HTML and hidden**, not conditionally unmounted, so the
    full destination set is readable from one `curl` of any `/staff/*` page.

R7. Rendered for `currentTier="staff"`, `PanelNav` presents the *Overview* link plus exactly five
    group triggers; the *Store setup* trigger and its links are absent from the HTML entirely, not
    hidden; and the destinations total exactly 13 — `/staff` plus the twelve routes that admit
    STAFF. No link to an ADMIN-only route appears anywhere in the served HTML. (R6's "hidden, not
    unmounted" applies to groups the tier *can* see; a group the tier cannot see is not rendered at
    all, which is what makes the two cases distinguishable.)

R8. At a 1280px-wide viewport the bar renders on one line with no horizontal scrolling on the nav
    element (`scrollWidth <= clientWidth`), and the chevron "Scroll left" / "Scroll right" buttons
    are gone from `components/staff/PanelNav.tsx`. At a 390px-wide viewport every trigger is still
    reachable — the bar may wrap or scroll there — and an **open** group panel causes no horizontal
    overflow of the document (`document.documentElement.scrollWidth <= clientWidth`).

R9. Each group trigger is a `<button>` carrying `aria-expanded` that reflects its state. Opening a
    second group closes the first (at most one open at a time). `Escape` closes the open group and
    returns focus to its trigger. A click outside the open panel closes it.

R10. Navigating by clicking a link inside an open group closes that group: after the destination
     page renders, no group panel is open. The `useEffect` that performs this close does **not**
     list the open-group state in its dependency array (`CLAUDE.md`, React & Next.js Hooks).

R11. The hub renders the six groups as sections in `STAFF_NAV_GROUPS` order, each with a heading
     carrying the group's label, cards inside in the existing two-column grid. For a staff-tier
     viewer the *Store setup* section and its heading are absent. The `/staff/errors` card still
     renders last, still only when `auth.via === "platform-admin"`, and still outside the groups.

R12. Each of the three routes whose two surfaces disagreed today resolves to one value, used by both:
     `/staff/orders` is labelled `Orders`; `/staff/runbook` is labelled `Runbook`; `/staff/categories`
     uses the `FolderTree` icon. No label or description in the module names a vendor or uses a
     grocery-specific example.

R13. `npx vitest run tests/staff-nav-parity.test.ts tests/operator-doc-coverage.test.ts
     tests/panel-token-purity.test.ts tests/panel-refusal-coverage.test.ts` exits 0. The rewritten
     `tests/staff-nav-parity.test.ts` imports the module, derives its expected route set from the
     filesystem (R2) and its expected tiers from the pages' own gates (R3), and asserts R5; it does
     not parse `PanelNav.tsx` for `currentTier === "staff"` or `") : ("` any more.

R14. `docs/staff-playbook/staff-tabs-guide.md`'s prose grouping (the "Your core operational pages
     are…" paragraph) names the groups a staff viewer actually sees and no longer places Bundles or
     Promotions under Catalogue. No `#### ` heading is introduced inside an existing operator-guide
     section.

R15. The standing rule for adding a `/staff/*` page is corrected everywhere it is written, because
     this slice changes it: `CLAUDE.md`'s "Staff panel pages" section and
     `docs/developer-portal/app-conventions.md`'s staff-surface rule both state that a new page is
     registered in `components/staff/nav-items.ts` — which feeds both app surfaces — plus one of the
     three operator guides, rather than in `PanelNav.tsx` and the hub separately. Neither document
     still instructs a reader to edit `PanelNav.tsx` or `app/(admin)/staff/page.tsx` to add a link.

R16. The grouped nav and hub are checked live against **both** vendors — Aheed and SriMart — and the
     group chrome renders in each vendor's own colours, with no arbitrary hex
     (`[#rrggbb]`) anywhere in `components/staff/` or `app/(admin)/`.

R17. `CHANGELOG.md` updated (Gate 4).

R18. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
