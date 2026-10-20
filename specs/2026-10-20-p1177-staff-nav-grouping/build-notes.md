# Grouped staff panel navigation from one shared nav module (build notes)

Branch `feature/p1177-staff-nav-grouping`. Spec commit `376d169`, build commit `12b3a0f`.
Validation runs from a fresh context against `requirements.md` (R1–R18) and `validation.md`.

## What changed and why

**`components/staff/nav-items.ts` (new) is now the only place a `/staff/*` destination is
written down.** It holds 24 routes — `href`, `label`, `description`, `icon`, `tier`, `tone` — in
six ordered groups, plus `visibleGroups(tier)`, which filters each group's items to the tier and
drops any group left empty. Both app surfaces render from it.

The shape is the point, so it is worth saying why it is *not* two grouped files. The relationship
between `PanelNav.tsx` and the hub had drifted silently twice (`#612`, `#626`). Grouping by hand
would have added a **third** thing to keep in sync — which group a route belongs to — with nothing
checking it: a route could sit under *Catalogue* on the bar and *Store setup* on the hub with every
test green. One module makes membership and grouping true by construction, and narrows the test's
job to the only part that cannot be derived — whether the module agrees with each page's own
`requireVendorRole` gate.

`tone` exists only to preserve each hub card's existing icon colour (`text-action` for `inventory`,
`orders`, `runbook`, `payments`; `text-accent` for the rest) across the regroup, because `plan.md`
excluded restyling the cards. It is not a design token decision and nothing else reads it.

**`components/staff/PanelNav.tsx`** is an Overview link plus one `<button>` trigger per visible
group. The horizontal scroller and its two chevron nudge buttons are gone — seven items fit, which
was the point. The bar is `flex-wrap`, so at phone width it wraps rather than scrolling, and each
panel is capped at `min(20rem, calc(100vw - 2rem))` so an open panel cannot push the document
sideways.

**A closed panel is `hidden`, not unmounted, and that is load-bearing rather than incidental.** It
keeps all 25 destinations readable from a single `curl` of any panel page, so "no route became
unreachable" is provable without driving a browser (R6). If a later change makes the panels
conditional, that proof quietly becomes impossible and R6's row stops meaning what it says.

**`app/(admin)/staff/page.tsx`** loses 289 lines of hand-written cards for a map over the same
groups, each in a `<section>` with an `<h2>`. `/staff/errors` keeps its trailing position, its own
`auth.via === "platform-admin"` check and its hand-written card, because `PanelNav`'s `currentTier`
prop cannot express "platform admin" and the route is excluded from the module by design.

**`tests/staff-nav-parity.test.ts`** was rewritten rather than patched. The old version located the
staff tier by the literal `currentTier === "staff"` and `") : ("`, so it was coupled to one shape of
JSX. It now imports the module, derives the expected route set from directories under
`app/(admin)/staff/` that have a `page.tsx`, derives each expected tier from that page's own
`requireVendorRole` arguments, and asserts that neither surface carries a `/staff/*` href of its own
beyond the two documented exceptions. 15 tests.

That also closed a hole worth recording: **the old test compared the two files to each other**, so a
route present on disk but missing from **both** surfaces passed silently. The `#633` block covered
that for STAFF-admitting routes only; an ADMIN-only route missing from both was invisible. Deriving
from the filesystem closes it for all 24.

**Docs reconciled on this branch**, because the slice changed the standing rule rather than merely
using it: `CLAUDE.md` ("Staff panel pages"), `docs/developer-portal/app-conventions.md` 1.17.0 and
`docs/staff-playbook/staff-tabs-guide.md` 2.13.0. Adding a `/staff/*` page is now one module entry
plus one operator-guide section — not an edit to `PanelNav.tsx` and the hub.

## Decisions taken during the build

- **A live defect was fixed as an unavoidable consequence, not as scope creep.** The hub had
  `/staff/feedback` inside its `isAdmin` block although the page is
  `requireVendorRole("STAFF", "ADMIN")` and the bar's staff tier listed it — so a staff member saw
  the link and no card. Neither existing test could catch it: the parity test reads hrefs from
  source text regardless of gating, and the `#633` tier block only inspects `PanelNav`. Once `tier`
  is derived from the page's own gate the mismatch cannot be expressed, so there was no version of
  this slice that preserved the bug. Recorded in the hub's doc comment and in
  `app-conventions.md`.
- **Eight label disagreements, not the three the spec named.** One module means one label per route,
  and reading the hub in full found five more than `plan.md` predicted. Resolved as: `/staff/orders`
  → `Orders`; `/staff/runbook` → `Runbook`; `/staff/products` → `Products`; `/staff/net-content` →
  `Net content review`; `/staff/discounts` → `Discount codes`; `/staff/search-synonyms` →
  `Search dictionary`; `/staff/team` → `Team & Access`; `/staff/categories` → `FolderTree` icon.
  **`/staff/products` was forced**: its old nav label was "Catalogue", which now names the group
  containing it. The others take the hub's wording, which was consistently the more specific of the
  two and already matched the operator guides' sentence case.
- **`react-hooks/set-state-in-effect` is silenced, not satisfied.** `CLAUDE.md` prescribes exactly
  this for a close-on-navigation effect. The alternatives the rule suggests were considered and
  rejected: closing in each link's `onClick` misses a navigation the nav did not originate (browser
  back, a redirect, a link elsewhere on the page), and keying the state off the pathname
  reintroduces the open-then-immediately-close loop the dependency rule is about. `openGroup` is
  deliberately absent from the dependency array; `close` is stable via `useCallback`, so
  `exhaustive-deps` stays satisfied and is **not** the rule being silenced.
- **Dismissal listens on `pointerdown`, not `click`**, so a drag that starts outside the panel
  dismisses it, and the handler is only attached while a group is open.
- **Escape restores focus inside the state updater** (`setOpenGroup((current) => …)`) rather than
  reading `openGroup` from the closure, so the correct trigger is focused even if the effect's
  closure is stale.
- **Group ids are kebab-case and stable** (`orders-fulfilment`, `store-setup`, …) because they are
  used as DOM ids via `panel-nav-${group.id}` for `aria-controls`. Renaming one changes markup, so
  the test pins the six **labels** in order rather than the ids.

## Deviations from the spec

- **R12 understated the work.** It named three routes whose surfaces disagreed; there were eight.
  All eight are resolved above, and the three R12 names resolve exactly as it says, so R12 passes as
  written — but a validator comparing the diff to R12 will see five more label changes than the
  requirement mentions, and they are intended.
- **`validation.md`'s R10 row named the wrong lint rule.** It said
  `react-hooks/exhaustive-deps`; the rule that actually fires is
  `react-hooks/set-state-in-effect`. The row was corrected on this branch (commit `12b3a0f`) rather
  than left to fail validation on a wrong expectation. This is the only spec file edited after the
  spec commit.
- **R1 lists five item fields; items carry a sixth, `tone`.** R1 asserts those five exist, which
  holds. `tone` is the card-colour preservation described above.
- **A fourth document was edited that no requirement named.** R14 covers only
  `docs/staff-playbook/staff-tabs-guide.md`, but `docs/store-admin-guide/admin-tabs-guide.md` 2.18.0
  listed the pages a staff member can also open **by label**, including "Catalogue" for
  `/staff/products` and "Search Dictionary" for `/staff/search-synonyms`. This slice renamed both,
  so leaving it would have had an operator guide naming a label that no longer exists — a defect
  *introduced by* the rename rather than a pre-existing one, so completing it belongs on this
  branch. The same edit adds the six group names, matching what R14 did for the staff guide.
- Nothing else. No requirement was reinterpreted, narrowed or skipped.

## Known-shaky areas

- **R9 and R10 are the risk this slice accepted at Gate 1, and nothing mechanical covers them.**
  No test exercises the dropdowns' keyboard semantics, dismissal or close-on-navigation — they are
  live rows by design. `#1144` (the storefront header's method menu, open and unreproduced) is the
  same defect class. **Run R10 twice as `validation.md` says**: once from a panel page and once
  again from the destination, because a close that only works on first navigation would pass a
  single attempt. Look here first if anything is wrong.
- **The full `npx vitest run` is nondeterministic, and it bit once during this build.** The first
  run reported 2 failures in `tests/storefront-chrome-rewards-gate.test.tsx`
  (`queryAllByLabelText` found 2 launchers, expected 1). That file **passes alone**, passes alone
  with this slice's changes stashed, and the **second full run was 285 files / 3578 tests, all
  green**. This slice touches no storefront chrome. It is `#1125`/`#1037`, not a regression — but a
  validator who sees it should re-run rather than assume either way.
- **No live check has been run at all.** R6–R12 and R16 are unverified: this context wrote the code
  and deliberately did not validate it. The counts (25 admin / 13 staff destinations, 6 / 5 group
  triggers) are derived from the module and asserted by unit tests, **not** observed in a browser.
- **The staff tier was never rendered during the build.** `visibleGroups("staff")` is unit-tested,
  but the `admin-tier=staff` cookie path through `app/(admin)/layout.tsx` and the hub was not
  exercised. R7 and R11's staff rows are the first real test of it.
- **`aria-expanded` on a trigger whose group contains the active route** also styles that trigger as
  current. If a group is open *and* holds the active route the two states coincide visually; that is
  intended, but it means a screenshot cannot distinguish them — read `aria-expanded`, not the
  underline.
- **SriMart's store-admin account cannot sign in on dev** (`demo-srimart-admin` answers 401; its
  password is not `DEMO_ACCOUNT_PASSWORD`). R16's SriMart half goes through `demo-admin`, a platform
  admin. That is the proven path, and it means the SriMart check exercises the **admin** tier only.
- **`npm run preview` must be started with `env -u DIRECT_URL -u DATABASE_URL`** if `printenv` shows
  either set — at this slice's Orient the session environment exported the **production**
  `DIRECT_URL`. This slice writes to no database, so the risk is reading the wrong one, not
  corrupting it.
