---
id: discovery-log
title: "Discovery log"
audience: [dev, product]
type: doc
status: approved
version: "1.3.0"
updated: 2026-09-06
visibility: internal
summary: "Append-only record of Discover-phase findings — customer problems, opportunities, friction, gaps, risks and assumptions — each separating observed evidence from interpretation, and each ending in exactly one governance next action."
tags: [research, discovery, opportunities, risk, sdd]
related: [research-index, sdd-workflow, roadmap]
---

# Discovery log

Newest entry first. Written by the **Discover** phase (`/discover`, and automatically at every
milestone close). Nothing here is approved scope — see `docs/research/README.md`.

## Entry template

```
### YYYY-MM-DD — <short finding title>

**Trigger:** <milestone close | explicit /discover | incidental>
**Status of the area:** <already implemented | already tracked as #NN | genuinely unowned>

**Observed (verifiable today):** file, line, schema field, issue number, or command output.
**Interpretation:** what I think it means. Clearly separated from the line above.
**Confidence:** Known / Inferred / Needs validation.

**Why it matters commercially:** which customer behaviour would change, and the business value.
**Options considered:** including the cheapest one and doing nothing.
**Cost of delay:** what gets more expensive the longer this waits.

**Next action:** RESEARCH MORE | PROPOSE | ADD TO ROADMAP/BACKLOG | READY FOR SPEC | DO NOT PURSUE
```

---

## 2026-09-06 — fourth Discover pass (Admin/Staff portal usability brief)

An explicit `/discover` over the admin panel, prompted by a six-part usability brief (staff menu
allocation, category expand/collapse, catalogue category selection, brand sample data, per-menu-item
operator documentation, and status-report drill-down). Six genuinely unowned findings, and — more
usefully — **two of the six requested changes rest on premises the code does not support**, which is
exactly what this pass exists to catch before `/propose` commits to them.

**Two of the brief's items are already implemented and are recorded here as such rather than as
findings.** *Brand sample data* (item 4) exists end to end: `prisma/schema.prisma:180` carries a
full `Brand` model, `prisma/seed.ts:758` seeds three real grocery brands (Shan, East End, TRS) via
`CATALOGUE_BRANDS`, `/staff/brands` and `components/staff/BrandManager.tsx` manage them, and
`components/staff/ProductForm.tsx:214` already offers a brand picker. No schema change is required
and none should be proposed; the only open question is *volume* (three brands, carried by three
seeded products), which is a fixture edit, not a slice. *Reduced-motion support* (a stated UX
constraint) also exists — `app/globals.css:99` and `:138` already carry `prefers-reduced-motion`
blocks — and a keyboard-accessible disclosure pattern to copy exists at
`components/product/FilterPanel.tsx:38` (a native `details`/`summary`). Item 2 should reuse both
rather than invent a parallel one.

### 2026-09-06 — the runbook renders 1 of its 152 articles, and its "Admin" tab can never match anything

**Trigger:** explicit `/discover` over the admin panel, grounding item 5 (per-menu-item operator
documentation) in the surface that would deliver it.
**Status of the area:** genuinely unowned. No issue covers the runbook's filtering; `#602` is about
a *different* page being unlinked, not about this one rendering nothing.

**Observed (verifiable today):** `/staff/runbook` filters its articles **twice**, against two
different audience vocabularies. `app/(admin)/staff/runbook/page.tsx:19-21` keeps articles whose
`audience` includes `"staff"` or `"store-admin"`. `components/staff/RunbookClient.tsx:18-19` then
filters the already-filtered list again, keeping `"staff"` or **`"admin"`** — a different string.
Counted directly out of the generated `app/(admin)/staff/runbook/docs.ts`: **152 articles**, whose
audiences are `dev` (144), `admin` (8), `product` (4), `architect` (2), and one each of `design`,
`marketing`, `operations`, `platform-admin`, `shopper`, `staff` and `store-admin`. The server filter
therefore passes exactly **two** articles (`docs/staff-playbook/staff-tabs-guide.md`, audience
`staff`; and `docs/store-admin-guide/admin-tabs-guide.md`, audience `store-admin`). The client filter
then drops the second, because `["store-admin"].includes("admin")` is `false`. **Net result: one
article renders.** The same mismatch makes the UI's own `"admin"` filter tab
(`RunbookClient.tsx:22`) permanently empty — the 8 genuine `admin`-audience articles were already
removed by the server filter one layer up, so selecting that tab always renders "No documents found
for this filter."

**Interpretation:** the Store Admin Management Guide has been written, approved, front-mattered and
compiled into the runbook bundle, and no store admin can read it in the product. This is not a
content gap; it is a two-line vocabulary mismatch between a server filter and a client filter that
nobody could see from either file alone — the same shape as `#612`'s two-navigation-surface defect,
where each file was individually correct and the defect lived only in the relationship between them.
It also directly blocks the brief's item 5: writing per-menu-item documentation into
`docs/store-admin-guide/` today produces content that the delivery surface silently discards.

**Confidence:** Known. The article counts and both filter expressions were read out of the files;
`Array.includes` is exact-element matching, not substring.

**Why it matters commercially:** operator documentation is how a non-technical shop manager avoids
mis-pricing a product or hiding a department by accident. A guide that exists but does not render is
indistinguishable from one never written, and it has been silently absent since the guide was
authored (front-matter `updated: "2026-08-22"`).

**Options considered:** align the client filter's vocabulary with the server's and let both accept
`store-admin` (smallest possible change, two lines, and it makes the existing guide visible
immediately); additionally decide whether the `admin` tab should surface the 8 `admin`-audience
articles by widening the server filter, which is a deliberate scope question rather than a bug fix
because several of those are developer-facing; introduce a single shared audience constant so the
two layers cannot diverge again; do nothing, and accept that the admin guide is write-only.

**Cost of delay:** every documentation slice written before this is fixed compounds the waste —
item 5's whole deliverable would land in a directory whose contents do not reach the reader.

**Next action:** PROPOSE — filed as **#625**.

---

### 2026-09-06 — a STAFF user loses the Payment Issues link the moment they leave the hub

**Trigger:** explicit `/discover`, grounding item 1 (Admin/Staff menu allocation) in the real RBAC
map rather than in the nav components.
**Status of the area:** genuinely unowned. `#612` fixed navigation parity at the whole-file level
and added `tests/staff-nav-parity.test.ts`; that test is **tier-blind by construction** and cannot
see this.

**Observed (verifiable today):** the real RBAC map, read from every page's own gate, is that exactly
four staff pages admit a STAFF member — `inventory`, `orders`, `payments` and `runbook` all call
`requireVendorRole("STAFF", "ADMIN")`; the other fourteen call `requireVendorRole("ADMIN")`.
`app/(admin)/staff/page.tsx` renders the Payment Issues card **outside** its `isAdmin` block, so a
STAFF member correctly sees it on the hub and can open it. `components/staff/PanelNav.tsx`'s
`currentTier === "staff"` branch lists only Overview, Inventory, Orders and Runbook — **no
Payments**. So the link is present on the hub, absent from the persistent nav, and disappears the
instant a STAFF user navigates to any other page. `tests/staff-nav-parity.test.ts` passes throughout,
because it collects every href in each file and compares the two sets; its own docstring states the
assumption that makes it blind here — "PanelNav's staff-tier branch is a strict subset of its
admin-tier branch ... so collecting every href in the file yields the admin-tier set exactly." That
is true, and it is precisely why the staff-tier set is never compared against anything.

**Interpretation:** the parity guarantee `#612` established is a guarantee about the *admin* view
only. The staff view has no equivalent check, and it has already drifted once — silently, in the
direction that matters most operationally, since `/staff/payments` is where a shop worker finds an
order whose payment left it stranded. The brief's item 1 asks which admin items should move to the
staff view; the honest first answer is that one already-permitted item is missing from it.

**Confidence:** Known. Page gates, both nav surfaces and the test were each read directly.

**Why it matters commercially:** a stranded `PENDING_PAYMENT` order holds its stock, its discount
code use and its loyalty redemption (see `#618`). The person most likely to notice a customer
chasing an order that never confirmed is shop-floor staff, and the panel hides their route to it
everywhere except the front door.

**Options considered:** add the Payments link to the staff branch and extend the parity test to
compare the **staff-tier** sets of both surfaces against the set of pages that actually admit STAFF —
deriving the expected set from the pages' own `requireVendorRole` calls, which turns the test from a
two-file comparison into a check against the real authorization model, and makes any future item-1
reallocation self-verifying; add the link alone and leave the test as-is (cheapest, and the drift
recurs); do nothing.

**Cost of delay:** low technically, but it is a live operational blind spot today, and item 1 will
add more staff-visible items on top of an unchecked surface.

**Next action:** PROPOSE — filed as **#626**.

---

### 2026-09-06 — the category list interleaves subcategories with unrelated parents

**Trigger:** explicit `/discover`, grounding item 2 (category expand/collapse) in the data the list
is actually built from.
**Status of the area:** genuinely unowned.

**Observed (verifiable today):** `lib/repositories/categories.ts:163`'s `listCategoriesForAdmin`
orders by `sortOrder` then `name` — a single **global** ordering with no grouping by `parentId`.
Every top-level category is created by `prisma/seed.ts:875` as
`tx.category.create({ data: { ...category, vendorId } })` from a fixture typed at
`prisma/seed.ts:356` as `category: { slug: string; name: string }` — **no `sortOrder`**, so all 13
top-level categories take the schema default of `0`. Subcategories are created at
`prisma/seed.ts:960-967` with `sortOrder: index`, i.e. `0`, `1`, `2` within each parent. The
`sortOrder: 0` bucket therefore contains all 13 departments plus the 9 first-children, ordered by
name alone. `app/(admin)/staff/categories/page.tsx:56-58` then indents any row carrying a `parentId`
by `ml-6`, under whatever row happens to precede it. Working the fixture through by hand, the list
opens: Baby and Kids, Bakery, Beverages, **Bread and Loaves** (indented, "in Bakery"), **Cleaning**
(indented, "in Household"), **Crisps and Namkeen** (indented, "in Snacks"), Dairy and Eggs,
**Fresh Fruit** (indented, "in Fruit and Veg") — so an indented Household subcategory renders
directly beneath Beverages. The page's own docstring concedes the mechanism without drawing the
conclusion: "Sub-categories are indented under the ordering the repository already returns rather
than re-sorted here."

**Interpretation:** the visual hierarchy on `/staff/categories` is decorative — the indent implies a
parent-child relationship to whichever row precedes it, and that row is usually a different
department. The `in <parent-name>` caption is currently the only thing preventing an outright
misreading. This matters for the brief's item 2 well beyond cosmetics: **expand/collapse cannot be
built on this ordering at all**, because there is no contiguous run of children to reveal or hide
under a parent. Item 2 is therefore not a UI slice; it is a repository-ordering fix with a UI on
top, and proposing it as the latter alone would produce a component that cannot be made correct.

**Confidence:** Known for the ordering, the missing fixture `sortOrder` and the rendering. The
worked example above is derived from the fixture rather than read off a running page, so the exact
sequence is Inferred — the interleaving itself is not.

**Why it matters commercially:** categories are how a shop's departments are structured, and a
manager reorganising them is reading this list to decide what sits where. A list that indents
"Cleaning" under "Beverages" invites a genuinely wrong edit, and mis-filed departments are the
single most visible catalogue error a shopper encounters.

**Options considered:** return the rows already grouped — order by parent, then children within
parent (either as a nested shape or a stable flattened one), which fixes the list and makes
expand/collapse possible in the same change; sort in the page instead (leaves every other consumer
of `listCategoriesForAdmin` — notably `ProductForm`'s picker — still interleaved); backfill
`sortOrder` on top-level categories in the seed and a migration (helps ordering *within* a tier but
does **not** group parents with their children, so it does not fix this); do nothing and drop item 2.

**Cost of delay:** it is a prerequisite, so any delay simply relocates the same work into item 2's
own slice, where it will be discovered mid-Build rather than at Spec.

**Next action:** PROPOSE — filed as **#627**.

---

### 2026-09-06 — the report tiles and the order list count different things, so a naive drill-down would disagree with itself

**Trigger:** explicit `/discover`, grounding item 6 (status-report drill-down) in the numbers the
report actually produces.
**Status of the area:** genuinely unowned. `#607` covers the absence of analytics instrumentation;
this is about the reports that **do** exist being un-drillable without contradicting themselves.

**Observed (verifiable today):** `app/(admin)/staff/reports/page.tsx` renders stat tiles only — no
link, no filter, no per-status breakdown anywhere on the page. Its Total Orders and Total Revenue
tiles come from `lib/repositories/orders.ts:1130`'s `getFinancialsForStaff`, which aggregates
`where: { vendorId, status: { in: [...REVENUE_STATUSES] } }`, and `lib/order-status.ts:186` defines
`REVENUE_STATUSES` as `CONFIRMED`, `OUT_FOR_DELIVERY`, `DELIVERED` — deliberately excluding
`PENDING_PAYMENT` and `CANCELLED`, because counting them overstated revenue by 39% on staging
(`#238`). A drill-down target already exists: `/staff/orders` accepts `?status=` and `?q=`, parsed by
`lib/staff-orders-query.ts`. But that parser resolves a status to exactly one of three things — the
default queue (`STAFF_QUEUE_STATUSES`, i.e. `CONFIRMED` and `OUT_FOR_DELIVERY`), the sentinel `all`
(every status), or **one** single `OrderStatus`. There is no way to express the three-status
`REVENUE_STATUSES` set in a URL.

**Interpretation:** the brief's own acceptance condition — that aggregated numbers and their detail
views represent the same filtered dataset — is the thing that would break first here, and silently.
Linking "Total Orders" to `/staff/orders?status=all` shows a **larger** count than the tile (it adds
abandoned and cancelled orders); linking it to the bare `/staff/orders` shows a **smaller** one (the
queue omits `DELIVERED`). Neither is wrong as a list; both contradict the tile they were reached
from, and a store admin reconciling the two has no way to tell which number to trust. Additionally,
the brief's worked example ("Total Orders, then Orders by status, then click Out for Delivery")
assumes a by-status breakdown that does not exist on the page at all — the intermediate tier has to
be built, not merely linked. Note also that Reports is `requireVendorRole("ADMIN")` while
`/staff/orders` is `STAFF, ADMIN`, so the drill-down direction is safe, but the reverse (surfacing
report links from the order list) would not be.

**Confidence:** Known — every status set, the aggregate's `where` clause and the query parser's three
branches were read directly.

**Why it matters commercially:** the reports page is the only financial surface a store owner has,
and its credibility was itself repaired once already (`#238`). A drill-down whose detail view does
not add up to its own headline would re-open exactly the trust problem that fix closed.

**Options considered:** make the tile's filter expressible — extend `parseStaffOrdersQuery` with a
named multi-status selection (e.g. a `revenue` sentinel alongside `all`) so the tile links to
precisely its own dataset and the list can state the filter it is showing; build the by-status
breakdown as a real intermediate tier grouped from one `groupBy` over the same `where` clause, with
each row linking to its single status (which `?status=` already expresses correctly today, so only
the *totals* row is the hard case); scope the first slice to per-status drill-down only and leave the
aggregate tiles un-linked, which is honest and much cheaper; do nothing.

**Cost of delay:** none accruing — but proposing item 6 without resolving this would specify a
feature whose stated acceptance criterion is unmeetable.

**Next action:** PROPOSE — filed as **#628**.

---

### 2026-09-06 — the store admin guide documents two capabilities that do not exist

**Trigger:** explicit `/discover`, reading the existing operator documentation before proposing more
of it.
**Status of the area:** genuinely unowned as a documentation defect. The *refund* capability gap
itself is tracked as `#606`; that the shipped guide tells operators the feature is already there is
not.

**Observed (verifiable today):** `docs/store-admin-guide/admin-tabs-guide.md` (status `approved`,
version `1.2.0`, `updated: "2026-08-22"`) states under Orders and Fulfillment that an admin can
"issue full refunds via the payment provider (Stripe)", and under Team Management that they can
"Invite new staff members". Neither exists. A case-insensitive search for `refund` across `app/`,
`lib/`, `features/` and `components/` returns only `lib/loyalty.ts`, `lib/repositories/loyalty.ts`,
`lib/order-status.ts` (points reversal, not payment refunds), the storefront terms page and the
generated runbook bundle — `lib/repositories/orders.ts` contains no refund path at all. A search for
`invite` across `app/(admin)/staff/team/`, `components/staff/team/` and `lib/repositories/roles.ts`
returns nothing; `lib/repositories/roles.ts` exports exactly `listVendorTeam` and `applyVendorRole`,
so the page assigns roles to users who already exist. Separately,
`docs/staff-playbook/staff-tabs-guide.md` opens by telling staff their panel "contains three main
tabs" and documents Fulfillment, Inventory and Overview; the staff nav actually carries four (Runbook
is the fourth) and the hub additionally offers Payment Issues.

**Interpretation:** the two approved operator guides describe a portal that differs from the one that
shipped — two capabilities that were never built, and a tab count that has been wrong since at least
the runbook was added. Combined with the runbook-filter finding above (only one of the two guides
renders at all), the practical state is that operator documentation is both partly wrong and largely
unreachable. This reframes the brief's item 5: it is not "write new documentation", it is "make the
existing surface work, correct what is already approved, then extend it to the menu items with no
coverage at all" — and the uncovered set is large, since neither guide mentions Payment Issues,
Brands, Bundles, Reports, Customers, Delivery Areas, Search Synonyms or Error Events.

**Confidence:** Known.

**Why it matters commercially:** an operator who reads that they can refund a customer through the
panel will promise a refund to that customer on the phone, and then be unable to issue it. That is a
worse outcome than absent documentation, because it converts a missing feature into a broken promise
to a shopper.

**Options considered:** correct the two guides to describe only what exists and note the refund path
as out-of-product for now (cheapest, and it removes the customer-facing risk immediately); do that
and add the missing per-menu-item coverage in the same slice; hold all documentation work until
`#606` decides whether refunds get built, which leaves an actively misleading approved document live
in the meantime; do nothing.

**Cost of delay:** the misleading refund line is live to every store admin who can reach the guide —
which, per the finding above, is currently nobody, so the *exposure* begins the moment the runbook
filter is fixed. Sequence the correction before or with that fix, not after.

**Next action:** PROPOSE — filed as **#629**.

---

### 2026-09-06 — Aheed's brand colours are hardcoded into shared staff pages, so SriMart renders the wrong palette

**Trigger:** explicit `/discover`, checking the brief's "no raw hex" constraint against the panel it
applies to.
**Status of the area:** genuinely unowned in these files. `#512` tracks one instance of the same
class (`ProductFilterForm`'s Apply button) and is storefront-side; these are different files and
carry the additional multi-tenant consequence below.

**Observed (verifiable today):** `app/(admin)/staff/inventory/InventoryTable.tsx:131` renders the
price as `text-[#2e7d32]` and `:159` renders a control as
`bg-[#e8f5e9] text-[#2e7d32] hover:bg-[#c8e6c9]`; `app/(admin)/staff/errors/page.tsx:49` uses
`bg-[#f5f5f0]`. Those values are Aheed's own brand primitives — `prisma/seed.ts:283-289` seeds
Aheed's `VendorBranding` with `brandGreen: "#4caf50"`, `brandCream: "#f5f5f0"` and the green tint
`#e8f5e9`. SriMart's seeded primitives are deliberately different values (blue, purple, red, per
`CLAUDE.md`'s design-tokens section). `components/staff/ProductForm.tsx:26` states the rule this
breaks, in the panel's own code: "Colours are semantic tokens per design-system.md, never raw hex."

**Interpretation:** `/staff/inventory` is one of the four pages a STAFF member can open, and it is
vendor-scoped chrome — a SriMart staff member sees Aheed's green on their own store's inventory
screen. This is not a tidiness issue but the exact failure `CLAUDE.md`'s design-token section warns
about, firing where nothing checks: no test asserts a second vendor's rendered admin output, and the
affected literals are Tailwind arbitrary values, so neither `lint` nor `format:check` sees them. It
is a small finding, recorded mainly because items 2 and 3 will both edit staff-panel components under
a stated "no raw hex" constraint — the constraint is already violated in the files next door.

**Confidence:** Known for the literals and the seeded primitives. That the mismatch is visually
material on SriMart's panel is Needs validation — it requires fetching a staff page under SriMart's
host, which `CLAUDE.md` already prescribes for branding changes.

**Why it matters commercially:** the platform's multi-tenant promise is that a vendor's staff see
their own store. Colour bleed from another tenant is a small but direct contradiction of that, and it
is cheapest to fix while these components are already open.

**Options considered:** replace the three literals with the existing semantic tokens as incidental
cleanup inside whichever item-2 or item-3 slice touches the panel (smallest, no separate slice); do
it as its own tiny slice alongside `#512` so both instances of the class close together; leave it and
accept the drift.

**Cost of delay:** negligible in isolation; it only compounds if items 2 and 3 copy the surrounding
style.

**Next action:** ADD TO ROADMAP/BACKLOG — filed as **#631**.

---

### 2026-09-06 — the product form's single flat category select cannot express what the data model allows

**Trigger:** explicit `/discover`, grounding item 3 (catalogue category selection).
**Status of the area:** genuinely unowned.

**Observed (verifiable today):** `components/staff/ProductForm.tsx:128-146` renders **one** `select`
named `categoryId`, populated from the flat `AdminCategoryRow[]` and labelled with the parent name,
an arrow and the child name for children, or the bare name for parents — every tier in one list, in
the interleaved order the category finding above describes. Both tiers are genuinely assignable and
both are genuinely used: `prisma/seed.ts:886` assigns every hand-curated product to a **top-level**
category (`categoryId: createdCategory.id`, created in the parent loop), while
`seedGeneratedCatalogue` (`prisma/seed.ts:1101-1102`) assigns its generated products to
**subcategories** resolved by child slug. `prisma/schema.prisma:318-335` places no constraint on
which tier a `Product.categoryId` may point at.

**Interpretation:** the brief's preferred cascade — pick a Category, then pick from its
Subcategories — is the right direction, but a naive implementation would remove a capability that is
in active use, because "assign this product to the department itself" is currently a valid and common
choice. A correct cascade needs the parent to remain selectable in its own right (an explicit "in
this department directly" option rather than an empty second field), and needs a defined answer for
the four departments that have no children at all (Frozen Foods, Health and Beauty, Baby and Kids,
Pet Supplies in the Aheed fixture). The brief anticipates the second case; it does not anticipate the
first, and the first is the one that would silently break existing editing behaviour.

**Confidence:** Known — the form, both seed assignment paths and the schema were read directly.

**Why it matters commercially:** mis-classified products are invisible to the shoppers browsing the
department they should be in, and this form is the only place a non-technical manager classifies a
product. The brief's stated goal (reduce incorrect classification) is well aimed; the risk is that a
cascade built without the direct-to-department case makes classification *worse* for the products
that legitimately use it.

**Options considered:** two dependent fields where selecting a category populates the second and the
second always offers an explicit "directly in this department" choice, with the field hidden (not
merely empty) for childless departments; keep one field but group it with `optgroup` per department,
which is a far smaller change, needs no client state, and removes the ambiguity without removing any
capability; do nothing. Both of the first two depend on the grouped ordering from the category
finding above.

**Cost of delay:** none accruing.

**Next action:** PROPOSE — filed as **#630**.

---

## 2026-09-05 — third Discover pass (P2.6 milestone close)

Run automatically at milestone close, per `specs/sdd-workflow.md`, immediately after `#569`
(P2.6's sixth and final slice) shipped and promoted. One genuinely new finding, plus a
process correction: two 2026-09-02 findings below had carried `PROPOSE` for three days with no
issue filed — an instruction-8 gap in the pass that wrote them, now fixed (filed as **#606** and
**#607**, addenda added in place below rather than duplicating the research). Everything else this
pass surfaced was already owned: the missing brand mega-menu/thumbnails are `#394`; pack size is
`#398`; the three filter-key-list/staff-hub-link gaps found during `#569`'s own Build are `#601`/
`#602`; the AI synonym proposal response-shape risk is `#583`.

### 2026-09-05 — six of `#569`'s seven new facet fields never reach a product card or detail page

**Trigger:** milestone-close Discover, grounding in the code that just shipped (`#569`).
**Status of the area:** genuinely unowned — not required by `#569`'s own requirements (`R20`–`R23`
scoped the filter *controls*, not what a matched product then displays) and not covered by any
other filed issue.

**Observed (verifiable today):** `lib/repositories/products.ts:420`'s `productSummarySelect` — the
one shape every storefront card, list and detail page is built from (`ProductDetail extends
ProductSummary`, line 92) — selects `isHalal`, `isFresh`, `isOrganic`, `origin` and
`originalPrice`, and nothing else from `#569`. It was not touched by `#569`. `ProductCard.tsx`
renders a badge for `isHalal` (line 65) and `isFresh` (line 71) and shows `origin` as plain text
(line 119) — all three pre-existing. There is no badge, label or any rendering anywhere in
`app/(storefront)/` or `components/product/` for `isVegetarian`, `isGlutenFree`, `isHmcCertified`,
`brandId`/`Brand.name`, `hmcReference` or `hmcVerifiedAt`. A shopper can filter `/search` to
"Vegetarian" or "Brand: Shan" or "HMC certified" and get a correctly narrowed result set (confirmed
live at this slice's own `/validate`), but nothing on the resulting product cards or detail pages
confirms *why* a product matched, or shows the brand name, or shows the HMC certificate reference
and verified date the admin form requires before the flag can even be ticked.

**Interpretation:** the filter half of this facet feature is complete; the display half — showing a
shopper the fact that made a product match, which is also how a shopper who is just browsing
(not filtering) discovers these attributes at all — was not built. For three of the six facets
(vegetarian, gluten-free, brand) this is a lost merchandising signal: no badge, no
brand-recognition cue anywhere a shopper is actually looking at a product. For HMC certification
specifically it is sharper than a missing badge: `#569`'s own stated reason for requiring
`hmcReference`/`hmcVerifiedAt` before the flag can be ticked is `#239` — a real incident of this
codebase asserting HMC certification with no basis for it. Storing that provenance but never
showing it to the shopper relying on the claim leaves the shopper in exactly the position `#239`
was about: taking a certification claim on faith, with the safeguard existing only in the database
and the admin form, never reaching the person who needs to trust it.

**Confidence:** the code facts (the shared select, the badge code, the absence everywhere else) are
Known — grepped directly, not inferred. That this is a genuine shopper-trust gap for HMC
specifically, rather than a cosmetic one for the other five fields, is Inferred from `#569`'s own
stated rationale for the provenance requirement.

**Why it matters commercially:** brand and dietary badges are a scan-speed and trust signal in
grocery browsing — a shopper does not read filter chips while scrolling a result grid, they read
badges on the card. For HMC, the gap is closer to a compliance/reputational one: the codebase now
argues internally (in the schema, in the admin form's validation, in this slice's own commit
history) that an HMC claim needs evidence, while showing the shopper no more evidence than existed
before this slice shipped.

**Options considered:** extend `productSummarySelect` and `ProductCard.tsx`/the detail page with
badges for the three new booleans plus a brand name/link, matching the existing `isHalal`/`isFresh`
pattern exactly (smallest change, reuses an established pattern); do the same but additionally
surface `hmcReference`/`hmcVerifiedAt` only on the product detail page (not the card, where space is
tight) as a small "Certified — ref. X, verified DD/MM/YYYY" line, which is the part that actually
closes the `#239` gap rather than just adding cosmetic parity; leave it as-is, accepting that this
slice's facets are filter-only until a future slice's own display work happens to cover them.

**Cost of delay:** low technically (the shape and the badge pattern both already exist to copy), but
every day live is a day the HMC provenance the schema now enforces is invisible to the shopper it
exists to protect.

**Next action:** PROPOSE — filed as **#608**.

---

## 2026-09-03 — second Discover pass (P2.6 search & AI shopping, at /propose)

Five findings from a pass over the search path, the shop-list matcher, the data-rights machinery and
the six slice issues filed for P2.6 the same day (**#564** to **#569**). Everything else the pass
surfaced was **already owned**: fuzzy ranking is `#286`, synonyms `#396`, facets `#397`, pack size
`#398`, saved lists `#116`, stock badges `#400`, the mega-menu `#394`, and the filter-form token
`#512`. The landing page having a postcode checker where every other route has a search box is
**already implemented deliberately** (P8.5f, `components/layout/Header.tsx`) and is not a gap.

Two of these are filed as issues; three are constraints on slices already filed and are recorded
here plus as comments on those issues, because a near-duplicate issue for a rule that belongs in an
unwritten spec is noise rather than tracking.

### 2026-09-03 — a search query log is personal data and nothing connects it to data rights

**Trigger:** explicit /discover on P2.6.
**Status of the area:** genuinely unowned — `#565` proposes the log and does not mention data rights.

**Observed (verifiable today):** `lib/repositories/data-rights.ts` exports exactly ten model sets
(`user`, `account`, `session`, `address`, `order`, `review`, `cart`, `loyaltyAccount`,
`loyaltyLedgerEntry`, `discountRedemption`) and its erasure path deletes reviews, carts and loyalty
accounts, tombstones orders and deletes the user. That function's own comment warns that "a partial
erasure leaves a user half-deleted with no way to tell where it stopped". `#565` proposes a
vendor-scoped search query log recording queries and zero-result queries; its body says nothing
about export or erasure. `ErrorEvent` (`prisma/schema.prisma:962`) is absent from both paths too,
but carries no user link, so it raises the question rather than answering it.

**Interpretation:** a search history tied to a signed-in user is personal data under UK GDPR, and P7
built the data-subject-rights machinery precisely so that new personal data has somewhere to go. A
log added without wiring is a silent compliance regression of exactly the shape this repo has
already paid for elsewhere.

**Confidence:** the code facts are Known. Whether the log will carry a user link at all is **Needs
validation** — it is an open design choice in `#565`'s unwritten spec, and the cheapest resolution
is to decide it never does.

**Why it matters commercially:** a data-subject access request that silently omits a category of
personal data is a regulatory exposure, and search history is unusually revealing — dietary,
religious and health inferences all fall out of grocery queries.

**Options considered:** record no user link at all, storing vendor plus a hashed IP exactly as
`OrderLookupAttempt` and `AuthenticationAttempt` already do ("SHA-256 of the caller's IP, not the IP
itself — this table exists purely as a counter"), which removes the problem at the root and still
serves the curation purpose the log exists for; link to the user and wire the model into both export
and erasure; link and accept the gap, which is not defensible.

**Cost of delay:** after launch this becomes a migration over live rows plus a decision about
backfilling or discarding history already collected.

**Next action:** PROPOSE

### 2026-09-03 — the zero-result AI call is an unmetered, attacker-controlled cost path

**Trigger:** explicit /discover on P2.6.
**Status of the area:** genuinely unowned — `#565` specifies the AI call and no limit on it.

**Observed (verifiable today):** `/search` is public and unauthenticated, and `#565` attaches a
Cloudflare AI call to any query returning zero results — a condition fully controlled by the caller
through the `q` parameter. **There is no middleware layer to limit it centrally:** no `proxy.ts` or
`middleware.ts` exists, and `CLAUDE.md` records that none can ship on this stack at all, because
Next 16 forbids the edge runtime for a Proxy file while `@opennextjs/cloudflare` 1.20.2 exits the
build on a Node-runtime one. Rate limiting therefore exists only per route, in two places:
`lib/auth.ts` (and only as a **plugin** — a bare `onRequest` config key silently never runs, `#483`)
and guest order lookup. Both are backed by the same model shape, `vendorId` plus `ipHash` plus
`createdAt` with a matching index (`OrderLookupAttempt`, `AuthenticationAttempt`).
`lib/image-generation.ts:44` already carries a 429 retry loop with 2s and 4s backoff because
Workers AI rate-limits this account in practice.

**Interpretation:** a trivial script issuing random queries converts each request into a paid
inference. The account's AI quota is **shared with the product image pipeline**, so the failure is
not only a bill — exhausting it also stalls image generation, which `#523` already showed is a
fragile, bounded, scheduled job.

**Confidence:** Known. Every element is a verified code or configuration fact.

**Why it matters commercially:** unbudgeted spend on an endpoint no one is watching, plus a
shared-quota outage in an unrelated subsystem, and neither has an alert behind it — `#437`
(critical production alerting) is still open.

**Options considered:** a per-route limiter reusing the existing counter-model shape, which is a
known-good pattern here; a cheap pre-filter so AI is reached only after the deterministic rungs fail
and only for queries that look like plausible product terms; caching corrections by normalised query
so a repeated attack costs nothing after the first hit; doing nothing, which is only tenable if the
AI rung is never reached by anonymous traffic.

**Cost of delay:** designing the limiter alongside `#565` is nearly free; adding it after an
unexpected bill or a stalled image job means doing it under pressure.

**Next action:** PROPOSE

### 2026-09-03 — the recovery ladder fires on zero results, but the damaging case is one bad result

**Trigger:** explicit /discover on P2.6.
**Status of the area:** genuinely unowned — a design gap between `#564` and `#565` as filed.

**Observed (verifiable today):** `searchProducts` (`lib/repositories/products.ts:359`) ORs `name`
with `description`, so a term hitting prose in an unrelated product's description is a match. P3d
deliberately excluded `description` from **list** matching and recorded why: "A term matching prose
in a description produces a confident-looking wrong match, which is precisely what the review step
exists to prevent." The two paths therefore already disagree, and the storefront takes the looser
one. `#565`'s ladder is specified to run when a search yields no products; `#564` leaves whether
`description` stays in the match set as an open question for its spec.

**Interpretation:** a one-word query such as `haldi` that happens to appear in a single product's
description returns exactly one result, so the correction and synonym rungs never run. The shopper
sees one tangential product instead of the turmeric shelf — worse than zero results, because zero at
least triggers recovery. The trigger should be a relevance or confidence threshold, not a count
of zero.

**Confidence:** the code facts and the P3d ruling are Known. That this pattern occurs in the live
catalogue is **Needs validation** — and it becomes directly measurable from `#565`'s own query log
once that exists, which is an argument for shipping the log before tuning the trigger.

**Why it matters commercially:** grocery staples carry many near-synonyms and shoppers type one
word. A single irrelevant result reads as "they do not stock this" just as firmly as an empty page,
while consuming the one mechanism built to prevent that conclusion.

**Options considered:** fire the ladder on a relevance threshold rather than a result count; drop
`description` from search matching so the storefront agrees with the list matcher; keep
`description` but rank name matches above it and offer a "did you mean" alongside thin results
rather than only in place of empty ones.

**Cost of delay:** `#564` and `#565` are being specced now. The trigger condition is cheap to get
right before staff begin curating synonyms against it and awkward afterwards.

**Next action:** PROPOSE

### 2026-09-03 — the AI shop list accepts pack sizes it has no model to resolve

**Trigger:** explicit /discover on P2.6.
**Status of the area:** genuinely unowned as a **sequencing** question; the underlying unit model is
tracked as `#398`.

**Observed (verifiable today):** `#567` accepts pack sizes as input and requires that "quantities and
specified pack sizes are retained wherever possible". `Product` carries no pack-size field, and
`unitLabel` is free text of the form "GBP 2.40 per kg", unusable as a facet or a comparison. `#569`
avoids this by **excluding** pack size and deferring to `#398`; `#567` cannot, because pack size is
part of its input. `#398`'s unit-price half sits in **P9.3** and its variant and unit-of-measure
model in **P10** — both *after* P2.6, which was sequenced ahead of P9 on 2026-09-03.

**Interpretation:** "2kg atta" against a catalogue holding 1kg, 5kg and 10kg bags has no defined
resolution — two of the small bag, the nearest single pack, or a refusal are all defensible, and
they are not equivalent to the shopper. Without a unit model the AI will pick one confidently, which
is precisely the "materially different product" outcome the requirement forbids. This is a
dependency inversion created by the sequencing decision, not a defect in any single issue.

**Confidence:** Known.

**Why it matters commercially:** weight-denominated staples — atta, rice, keema, dal — are exactly
the vocabulary the Desi shop-list feature exists to serve, so this is the centre of the use case
rather than an edge of it.

**Options considered:** constrain `#567` to count quantities and route weight-denominated lines to
the review step flagged as needing a choice, which is the smallest change, keeps the
never-substitute guarantee intact and needs no unit model; pull `#398`'s unit derivation forward
ahead of `#567`, which reopens the sequencing decision; resolve to the nearest single pack and show
the size prominently in review, which is guessing with a disclosure.

**Cost of delay:** if `#567` is built before this is settled, its matcher encodes a guess that
`#398` then has to unpick, in the one place where a wrong answer charges the customer for the wrong
weight of food.

**Next action:** PROPOSE

### 2026-09-03 — ranking in-stock first can hide that the shop stocks the item at all

**Trigger:** explicit /discover on P2.6; a challenge to `#564` as filed.
**Status of the area:** partly tracked — `#400` (smart stock badges with expected restock date) is
filed and sits in P10.

**Observed (verifiable today):** `#564` will rank in-stock products ahead of out-of-stock ones.
An `inStockOnly` filter **already exists** as an explicit opt-in
(`buildFilterWhere`, `lib/repositories/products.ts:189`, setting the inventory quantity predicate to
greater than zero), so the shopper already has a control for "only show me what I can buy today".
Ordering is currently `createdAt desc, id desc` for every listing including search.

**Interpretation:** making availability the default *ordering* removes the signal that the store
carries the item at all, and the customer already had a way to ask for that behaviour when they
wanted it. In grocery, stock volatility on fresh and chilled lines is routine rather than
exceptional, and the shopper is a weekly returner: "out of stock, back Thursday" retains them,
while a result set that looks empty of their staple sends them to a competitor permanently.

**Confidence:** the code facts are Known. The retention claim is **Inferred** — and it cannot
currently be measured, because no analytics instrumentation exists (see the 2026-09-02 entry on
that, still unresolved).

**Why it matters commercially:** the cost of getting this wrong is asymmetric. Burying an
out-of-stock staple risks losing a weekly shopper outright; showing it with an honest availability
badge costs one line of a result page.

**Options considered:** rank in-stock first but guarantee an exact name match is always visible
regardless of stock, which preserves both signals; keep recency ordering and rely on availability
badges to carry the message; expose ordering as an explicit sort control and default it to
relevance rather than availability.

**Cost of delay:** low in code terms — this is a rule in one spec — but it is much easier to state
now than to revisit once `#568`'s autocomplete inherits the same ranking.

**Next action:** PROPOSE

---

## 2026-09-02 — first Discover pass (pre-launch, P9 in flight)

Three findings from a full pass over the schema, routes, the 99 spec slices and the 88 open issues.
Everything else the pass surfaced was **already owned** — the fourteen issues of the `#408` brief
(`#394` to `#407`), `#116`, `#232`, `#286`, `#146` to `#149` and `#100` are all filed and
sequenced, and are deliberately not repeated here.

### 2026-09-02 — a paid order cannot be reduced, substituted or refunded

**Trigger:** first Discover pass.
**Status of the area:** genuinely unowned — no issue, no spec, no schema support.

**Observed:** `features/orders/` contains only `advance-status.ts`, `advance-status-bulk.ts`,
`guest-data-rights.ts`, `reorder-items.ts` and `send-status-email.ts`; there is no staff
order-line-edit module. `lib/repositories/orders.ts` releases stock on cancellation only for
`PENDING_PAYMENT` orders. `PaymentStatus` declares `REFUNDED` and no code path ever writes it.
`ADR-005` states a paid order's code use cannot currently be reversed and that refunds are that
ADR's undecided territory. `CLAUDE.md` records `#137` and `#151` as structurally unreachable for
the same reason. `OrderItem` has no substitution, fulfilled-quantity or per-line note field.

**Interpretation:** a short pick — routine daily reality for fresh meat and produce — has no
representation. Staff can only deliver short and correct it out of band, after the customer has
already been charged in full, because `lib/payments.ts` pins no `capture_method` and so captures
immediately.

**Confidence:** the code facts are Known. That short picks are frequent at Aheed specifically is
**Inferred** — it is reasonable for a butcher, but it is not observed Aheed data.

**Why it matters commercially:** the first imperfect order is where grocery repeat-purchase rate is
won or lost. The exposure is also consumer-rights shaped, not merely UX shaped.

**Options considered:** a full substitution-preference flow (too large, and `#399`'s variant model
gates the weight half of it); a reduce-only line adjustment with a refund (smallest change that
makes the outcome representable); manual out-of-band refunds through the Stripe dashboard (works
today, leaves no order-level audit trail and cannot reverse loyalty points or a discount code).

**Cost of delay:** it needs an `ADR-005` amendment on refunds and capture, which `#399` also needs.
Deciding it once serves both; deciding it after launch means deciding it while live orders exist.

**Next action:** PROPOSE

**Update 2026-09-05 (P2.6 milestone-close Discover pass):** this finding carried `PROPOSE` for
three days with no issue filed — an instruction-8 gap in the pass that wrote it. Re-verified still
current (the `REFUNDED` enum value still has no writer, `ADR-005`'s own text still calls this "open
territory") and filed as **#606**.

### 2026-09-02 — there is no analytics instrumentation of any kind

**Trigger:** first Discover pass.
**Status of the area:** genuinely unowned.

**Observed:** `package.json` matches nothing for `analytics`, `gtag`, `plausible`, `posthog`,
`segment`, `mixpanel` or `umami`. No event-dispatch call exists in `app/`, `features/`,
`components/` or `lib/`. `lib/repositories/reports.ts` and the staff reports page both state that
sales analytics is deliberately absent while production runs Stripe test keys.

**Interpretation:** no conversion, basket-abandonment or search-success figure can be produced
today, and no baseline can exist for any future change. This is a **measurement** gap rather than a
feature gap, and it silently weakens every prioritisation argument made without it.

**Confidence:** Known.

**Why it matters commercially:** without a baseline, a shipped optimisation cannot be shown to have
worked, so the Learn phase can only report what was delivered, never whether behaviour changed.

**Options considered:** a full product-analytics vendor (cost, and a cookie-consent surface);
a minimal first-party event table written through the existing repository layer (view, add to
basket, begin checkout, purchase — vendor-scoped, no third party, no consent banner); nothing.

**Cost of delay:** every day of live trading without it is a baseline that cannot be recovered
retrospectively.

**Next action:** PROPOSE

**Update 2026-09-05 (P2.6 milestone-close Discover pass):** also carried `PROPOSE` with no issue for
three days. Re-verified still current and filed as **#607** — this gap is now doubly relevant, since
the 2026-09-03 "ranking in-stock first" finding below explicitly cannot be validated without it.

### 2026-09-02 — an order carries no delivery date, slot or capacity ceiling

**Trigger:** first Discover pass.
**Status of the area:** partly tracked — `#401` (delivery calendar) is filed and sits in P10.

**Observed:** `Order` carries `deliveryFeePence` and no date, slot or fulfilment-type field.
`VendorDeliveryArea` carries a postcode district prefix and no capacity. `#401` is gated on `#363`
(the vendor timezone is a hardcoded constant).

**Interpretation:** the *customer-facing* half of this is correctly deferred — the three-step
status in `specs/mission.md` is a deliberate MVP decision. The **operational** half is not the same
question: with no capacity ceiling, nothing stops a day taking more chilled orders than the van can
physically deliver. That is an operational risk that a launch surfaces immediately.

**Confidence:** schema facts Known. Whether Aheed's real delivery capacity is likely to be exceeded
at launch volumes is **Needs validation** — it depends on their van count and round size, which
this repo cannot answer.

**Why it matters commercially:** a missed chilled delivery is a refund plus a lost customer, and it
is the failure mode with the worst word-of-mouth in grocery.

**Options considered:** the full `#401` calendar (P10, gated); a per-day order cap with a simple
cut-off message (small, needs `#363` resolved for the cut-off time to be correct); an operational
answer outside the software, if Aheed's real capacity comfortably exceeds launch volume.

**Cost of delay:** low if the operational answer holds; high if it does not, and only Aheed can say
which.

**Next action:** RESEARCH MORE — ask Aheed for van count, round size and realistic daily order
ceiling before proposing anything.
