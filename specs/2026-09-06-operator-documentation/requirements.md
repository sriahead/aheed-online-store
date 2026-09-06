# Operator documentation — runbook role delivery, guide accuracy, per-menu-item coverage (requirements)

Closes `#633`, absorbing `#625` (the staff runbook renders 1 of its 152 articles because two filter
layers use different audience vocabularies) and `#629` (the store admin guide documents three
capabilities that do not exist), and folding in `#626` (the staff nav omits `/staff/payments`, which
STAFF can open). Builds on the 2026-09-06 Discover pass (`docs/research/discovery-log.md` 1.3.0).
See `plan.md` for why delivery, accuracy and coverage are one slice rather than three.

Throughout, "operator guides" means exactly these three files:
`docs/staff-playbook/staff-tabs-guide.md`, `docs/store-admin-guide/admin-tabs-guide.md`, and
`docs/platform-admin-guide/platform-admin-guide.md`.

## Part 1 — runbook role delivery

R1. `components/staff/RunbookClient.tsx` contains no expression that filters its received `docs`
    prop by `audience` before the user-selected tab is applied; every document the server passes is
    reachable from the rendered UI.

R2. The runbook's filter tabs are computed at runtime from the `audience` values present in the
    received documents. No audience string is hardcoded in a tab list literal in
    `components/staff/RunbookClient.tsx`.

R3. Every tab rendered by `components/staff/RunbookClient.tsx`, other than the "All" tab, selects at
    least one document when clicked — i.e. no tab can be rendered with an empty result set.

R4. Each derived tab renders a human-readable label rather than the raw audience slug: `staff`
    renders as "Staff", `store-admin` as "Store admin", `platform-admin` as "Platform admin".

R5. `app/(admin)/staff/runbook/page.tsx` passes documents whose `audience` includes `staff` or
    `store-admin` to every viewer that satisfies its `requireVendorRole("STAFF", "ADMIN")` gate.

R6. `app/(admin)/staff/runbook/page.tsx` additionally passes documents whose `audience` includes
    `platform-admin` when, and only when, `auth.via === "platform-admin"`.

R7. A test fails if any audience value that `app/(admin)/staff/runbook/page.tsx` admits has no
    display label in `components/staff/RunbookClient.tsx`.

R8. `/staff/runbook`, requested by a signed-in store admin under `npm run preview`, returns HTTP 200
    and its HTML contains both the string `Staff Daily Operations Playbook` and the string
    `Store Admin Management Guide`.

## Part 2 — accuracy of the existing guides

R9. `docs/store-admin-guide/admin-tabs-guide.md` contains no claim that a refund can be issued from
    the admin panel, and where refunds are mentioned it states they are not available in the panel.

R10. `docs/store-admin-guide/admin-tabs-guide.md` states that a store admin can grant the Staff role
     only, and that granting the Store Admin role requires a platform administrator.

R11. `docs/store-admin-guide/admin-tabs-guide.md` states that a person must already have registered
     an account before a role can be assigned to them, and that roles are assigned by email address.

R12. `docs/store-admin-guide/admin-tabs-guide.md` contains no claim that staff members can be invited
     from the panel.

R13. `docs/staff-playbook/staff-tabs-guide.md` contains no statement of a fixed tab count that
     contradicts `components/staff/PanelNav.tsx`'s staff-tier branch.

R14. The `version` front-matter field of every operator guide this slice edits is incremented, and
     its `updated` field is `2026-09-06`.

## Part 3 — per-menu-item coverage

R15. Every immediate subdirectory of `app/(admin)/staff/` that contains a `page.tsx` has a
     documented section in exactly one of the three operator guides.

R16. Each such section contains all seven of these labelled parts: Purpose; Who can access it; What
     you can do; Typical workflow; Important fields and filters; Common mistakes and limitations;
     What happens after changes are saved.

R17. Each such section carries a `Who can access` value drawn from exactly this set:
     `Staff and store admins`, `Store admins only`, `Platform admins only`.

R18. Each section's `Who can access` value matches the access its page actually enforces:
     `requireVendorRole("STAFF", "ADMIN")` maps to `Staff and store admins`;
     `requireVendorRole("ADMIN")` maps to `Store admins only`; a page that additionally refuses
     `auth.via !== "platform-admin"` maps to `Platform admins only`.

R19. A single test file enforces R15, R16, R17 and R18 by enumerating the route directories from the
     filesystem and parsing each page's `requireVendorRole` call. It contains no hardcoded list of
     route names, so a newly added `/staff/*` page fails the suite until it is documented.

R20. Sections for the four routes that admit STAFF (`inventory`, `orders`, `payments`, `runbook`)
     live in `docs/staff-playbook/staff-tabs-guide.md`; sections for the thirteen ADMIN-only routes
     (`brands`, `bundles`, `categories`, `customers`, `delivery-areas`, `discounts`, `loyalty`,
     `products`, `promotions`, `reports`, `search-synonyms`, `storefront`, `team`) live in
     `docs/store-admin-guide/admin-tabs-guide.md`; the section for `errors` lives in
     `docs/platform-admin-guide/platform-admin-guide.md`. Four plus thirteen plus one is the 18
     route directories R15 enumerates.

R21. No operator guide states that a capability exists which cannot be reached from the page it
     documents — verified for this slice by R9 through R13 plus R18, and by the Build-time rule that
     every section is written against the page source and its gate.

## Part 4 — staff navigation (`#626`)

R22. `components/staff/PanelNav.tsx`'s `currentTier === "staff"` branch renders a link to
     `/staff/payments`.

R23. A test asserts that the set of `/staff/*` routes linked from `PanelNav.tsx`'s staff-tier branch
     equals the set of route directories whose `page.tsx` calls `requireVendorRole` with `STAFF`,
     excluding any route that additionally refuses `auth.via !== "platform-admin"`.

R24. `tests/staff-nav-parity.test.ts` continues to pass unmodified in its existing assertions, or its
     docstring is updated to state which surface each assertion covers if it is changed.

## Documentation pipeline and gates

R25. `npm run kms:validate` exits 0 and reports `invalid front-matter (failing): 0`.

R26. `npm run kms:build-index` has been run and `npm run kms:check-generated` reports both generated
     artefacts current.

R27. `npm run kms:assemble:internal` exits 0 and `npx next build --webpack` inside `kms/site-internal`
     exits 0, confirming no MDX parse trap in the new prose.

R28. `CHANGELOG.md` updated (Gate 4).

R29. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
