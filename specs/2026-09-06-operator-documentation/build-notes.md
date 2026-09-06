# Operator documentation — runbook role delivery, guide accuracy, per-menu-item coverage (build notes)

Written at the end of Build, before the Clear. Slice issue **#633**, absorbing **#625** and
**#629**, folding in **#626**. Two commits on `feature/operator-documentation`: `1606449` (spec) and
`71a28c7` (implementation).

## What changed and why

**`lib/runbook-audiences.ts` is new, and it is the load-bearing piece.** The audience vocabulary now
exists once, in a pure module with no I/O and no React, so the server filter and the client's tab
list cannot drift apart. That is the whole defect in `#625`: the page admitted `staff`/`store-admin`
and `RunbookClient` re-filtered the result for `staff`/`admin`, and because `Array.includes` is
exact-element matching, `["store-admin"].includes("admin")` is `false` — one of 152 articles
rendered. Each file was individually correct; only their relationship was wrong.

**`components/staff/RunbookClient.tsx` no longer filters by audience at all.** This is the part worth
understanding, because the obvious fix was to change `"admin"` to `"store-admin"` and stop. That
would have left the real cause in place: a **hardcoded** tab list (`["all", "staff", "admin"]`) which
can silently drift from what the server actually delivers. Instead the tabs are derived from the
audiences the received documents carry (`deriveAudienceTabs`), so a tab exists if and only if it has
documents behind it. A tab that matches nothing is now unrepresentable rather than merely absent
today. The "All" tab is modelled as `null`, deliberately not as a member of the audience union —
treating `"all"` as an audience is exactly how the old list came to contain a value nothing matched.

**`app/(admin)/staff/runbook/page.tsx` gained the platform-admin branch.** Without it,
`docs/platform-admin-guide/platform-admin-guide.md` was unreachable in-product by anyone: a platform
admin passes the page's `requireVendorRole("STAFF", "ADMIN")` gate, but the vendor-audience filter
excluded their own guide. Gated on `auth.via === "platform-admin"`, matching the `/staff/errors` card
on the hub (`#508`) rather than inventing a new pattern. This is also what gives `/staff/errors`
somewhere correct to be documented.

**The three operator guides were restructured, not extended.** Both existing guides covered the panel
thematically — "Catalogue and Categories" was one prose block spanning several distinct pages — so
adding eight sections would have left a document that was half per-page and half per-theme, and the
coverage check enumerates routes rather than themes. All 18 routes now have a section with the same
seven labelled parts. Placement follows each page's own gate: four staff-accessible routes in the
playbook, thirteen admin-only in the store admin guide, `errors` in the platform guide.

**`tests/operator-doc-coverage.test.ts` is what makes this maintainable.** Prose is not executable
and this test does not pretend otherwise — but the claim class that actually hurt us in `#629` is
*who is allowed to do this*, and that is checkable. It enumerates route directories from the
filesystem, requires exactly one documented section each, and compares each section's
`Who can access` line against the page's real `requireVendorRole` arguments — treating an
`auth.via !== "platform-admin"` refusal as platform-admin-only, so `/staff/errors` is not documented
as reachable by every store admin. No hardcoded route list, so a new `/staff` page fails the suite
until someone documents it.

**`tests/staff-nav-parity.test.ts` gained a third block and a docstring correction.** The existing
parity assertions compare whole-file href sets, which is the **admin** view; the staff tier was never
compared against anything, which is why `/staff/payments` sat missing from it. The new block derives
the expected staff-tier set from the pages' own gates. The file's original docstring asserted that
the staff branch contained "overview, inventory, orders, runbook" — stale the moment this slice
touched it, and more importantly it stated the very assumption that made the test blind without
drawing the conclusion. Corrected to name which surface each block covers.

**`CLAUDE.md`'s vitest baseline moved to `102/1316`,** updated here rather than at `/document`
because a Clear sits between the two and a measured number does not survive it.

## Decisions taken during the build

**Removed the client filter entirely rather than aligning its string.** Rejected the two-line fix
(`"admin"` to `"store-admin"`) because it treats the symptom. The spec called for derived tabs and
that is what shipped, but the decision to delete the client-side narrowing outright — rather than
keep a corrected copy of it — was taken here. Two filters that must agree is the shape of the bug;
one filter cannot disagree with itself.

**Put the vocabulary in `lib/` rather than exporting it from the page.** `RunbookClient` is a
`"use server"`-adjacent client component and the page is a server component; a shared `lib/` module
is the existing pattern for pure rule surfaces (`lib/staff-orders-query.ts`, `lib/order-status.ts`,
`lib/cart-rules.ts`) and it is what lets the whole thing be unit-tested with no rendering and no
database.

**Chose a heading-keyed section format over a rigid template.** Sections are found by a route path in
backticks in the heading (`` `/staff/orders` ``), and the seven parts by bold labels. Rejected a
stricter machine-readable format (front-matter blocks per section, or a table) because these files
are read by shop staff in the runbook reader, and readability is the point. The consequence, recorded
for whoever edits them next: **a `####` heading inside a section terminates it** as far as the parser
is concerned, so keep sub-structure to bold labels and lists.

**Bumped both restructured guides to `2.0.0` rather than a minor.** The store admin guide lost three
false claims and both were reorganised from thematic to per-menu-item; a reader returning to either
will not find the old structure. The platform guide took `1.1.0` — it gained a section and changed
nothing existing.

**Documented the `#627` category-ordering defect inside the Categories section as a limitation.**
That issue is explicitly out of this slice's scope and is not fixed here, but the guide tells an
admin to read the "in *department*" label rather than trusting a subcategory's position in the list.
Leaving it undocumented would have meant shipping a guide that describes a list as hierarchical when
it currently is not.

**Wrote the "no refunds" and "no invitations" statements as prominent notes at the top of the store
admin guide,** not only inside the relevant sections. `#629` was a false-capability problem, and an
operator looking for a refund control will not read the Team section to find out it does not exist.

**Found and dropped a FOURTH false capability claim, filed as `#634`.** The old guide said under
Store Configuration: "Delivery Rules: Set your store's standard Delivery Fee, Free Delivery
Threshold, and Minimum Order Amount." `VendorConfig` carries `deliveryFeePence`,
`freeDeliveryThresholdPence` and `minimumOrderPence`, but **nothing in the panel writes any of
them** — verified by searching `components/staff/` and `features/admin/` for all three names, which
returns no form input, no server action and no repository write. Their only writer is
`prisma/seed.ts`. This is the same operability gap `#612` closed for delivery *areas*, still open for
delivery *pricing*. The claim is not carried forward — the new Storefront section describes only the
logo, brand colours, hero subtitle and banner note, which are the controls that actually exist
(`VendorLogoUploader` plus four fields in `StorefrontConfigForm.tsx`, all confirmed by reading the
component). `#629` said three false claims; the real count in that document was four, and the fourth
was found by the procedural half of this slice's guard — checking each claim against a control —
rather than by any test.

## Deviations from the spec

**None** in substance. Two clarifications where the spec left the shape open:

- **R7's mechanism.** The spec said "a test fails if any audience value that `page.tsx` admits has no
  display label". Implemented by having both sides read `lib/runbook-audiences.ts` and asserting
  every value from `audiencesForViewer(true)` has an entry in `RUNBOOK_AUDIENCE_LABELS`, rather than
  parsing the two component files for audience strings. Stronger than the literal wording — the
  invariant is now structural rather than textual — and the file-parsing assertions the spec implied
  are also present in the same test file (`the client no longer filters by audience`).
- **R20's placement rule** is enforced by the coverage test as a fourth `describe` block deriving the
  expected guide from each page's own gate, rather than being left to the per-guide greps
  `validation.md` describes. Those greps still work; the test is the stronger check.

## Known-shaky areas

**R6's live half may not be runnable in this environment, and that is the first thing to check.**
`prisma/seed.ts` creates **no users at all** — there is no seeded platform-admin account and no
seeded store-admin account either. The two `curl` sign-ins `validation.md` describes both assume
accounts that a human created by hand at some earlier point. If no platform admin exists in the dev
database, R6's positive case (a platform admin sees the platform guide) cannot be exercised live and
falls back to the code path plus the negative check, exactly as `validation.md` states. Record which
path was taken rather than marking the row passed unqualified.

**The platform-admin branch has never executed against a real session.** Unit tests cover
`docsForViewer(docs, true)` thoroughly, but `auth.via === "platform-admin"` resolving correctly on a
real request is untested by anything in this slice. It is one boolean and it mirrors the hub's
existing check, but it is the newest untested line here.

**R8 is the row that actually proves `#625` is fixed, and nothing else does.** Every other check is a
unit test against a stub library or a grep against a file. Only fetching `/staff/runbook` under
`npm run preview` with a real session proves the two guides render together in the real component
tree. If one row gets walked properly, make it that one.

**R21 is a genuine manual sweep and cannot be shortcut — and it already caught one thing the tests
could not.** The coverage test pins permissions; it proves nothing about whether "you can upload a
banner image" corresponds to a real control. Running that sweep during Build is what found `#634`
(the delivery-rules claim above), which no test in this slice would ever have flagged. Eighteen
sections were written against the page sources, but by one reader in one pass. **Storefront** was
re-verified after `#634` and is now believed accurate (`VendorLogoUploader` plus `heroSubtitle`,
`bannerNote`, `brandGreen`, `brandGreenDark`). The sections still worth an independent re-check are
the ones whose capabilities were described from a form component rather than from the page itself:
**Bundles** and **Promotions**. Treat a claim in either as unverified until traced to a control.

**The Reports section makes a claim about a *relationship between two pages*.** It says the Orders
page's default view is narrower than the Reports revenue figure, so the two will not match. That is
`#628`'s territory and is true by reading (`REVENUE_STATUSES` is three statuses,
`STAFF_QUEUE_STATUSES` is two), but it is the one statement in the guides that cannot be checked
against a single page.

**Section-boundary parsing is positional.** `collectSections` splits on any `##`-to-`####` heading,
so a future editor adding a sub-heading inside a section silently truncates that section's body and
the seven-part check fails with a confusing message. The failure is loud, not silent, but the reason
will not be obvious from the assertion text.

**`kms/site-internal/next-env.d.ts` churns on every docs-site build** (`#596`/`#423`). It was reverted
before committing and the tree is clean, but running the R27 command during validation will dirty it
again — that is expected and is not a change this slice made.
