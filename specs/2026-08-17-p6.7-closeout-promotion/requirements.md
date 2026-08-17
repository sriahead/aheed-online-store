# P6.7 closeout & catch-up promotion (requirements / acceptance criteria)

Closes out issue **#186** (P6.7 live validation + promotion) and **#190** (the demo-accounts roster
gap that blocks it). P6.7's code shipped to `staging` ungated on 2026-08-13 and was retro-validated
structurally by PR #188; what remains is proving the role hierarchy through real signed-in sessions
and promoting five staging-only slices — including the #187 connection-exhaustion fix — to
production. Full narrative in `plan.md`. The account under R1 is a prerequisite: without it,
`specs/2026-08-14-p6.7-team-role-management/validation.md` §1.2 is unreachable.

## Prerequisite — the store-admin account (#190)

R1. `scripts/demo-accounts.ts`'s exported `DEMO_ACCOUNTS` array contains exactly four entries, the
    fourth being `{ email: "demo-store-admin@example.com", name: "Demo Store Admin", platformRole:
    "CUSTOMER", vendorRole: "ADMIN" }`.

R2. `tests/demo-accounts.test.ts`'s "splits platform role from vendor membership" assertion lists
    all four entries, and `npm test` exits 0.

R3. `npm run demo:accounts -- add`, run in a Node process whose `DIRECT_URL` is staging's, exits 0
    and prints a line matching `demo-store-admin@example.com (platform CUSTOMER, vendor ADMIN)`.

R3a. `build-notes.md` contains a line beginning `Neon host (R3):` recording the masked host that R3
    targeted, and that host string is identical to the `DATABASE_URL` host in
    `secrets/staging.vars` with the `-pooler` infix removed. (`CLAUDE.md`: a staging-sounding
    filename is not evidence the host is staging.)

## Live walk — P6.7 validation.md §1 and §2 (#186)

Each of R4–R8 is performed in a real browser against `https://staging.aheedfoodcentre.nocaped.com`,
signed in as the stated account, against the vendor that `addDemoAccounts` attached the memberships
to (`scripts/demo-accounts.ts:119` — the oldest `ACTIVE` vendor).

R4. Signed in as `demo-admin@example.com` (platform admin), every §1.1 row is observed to hold:
    `/staff/team` renders; a plain `USER` searched by email can be assigned `ADMIN` and then appears
    in the Team list as a Store Admin; a plain `USER` can be assigned `STAFF` and appears as Staff;
    demoting a Store Admin back to `USER` succeeds.

R5. Signed in as `demo-store-admin@example.com` (vendor `ADMIN`, platform `CUSTOMER`), every §1.2
    row is observed to hold: `/staff/team` renders; a plain `USER` can be assigned `STAFF`; the
    role selector **does not offer `ADMIN`**; and invoking the assign action for `ADMIN` anyway
    returns `{ success: false, error }` with no row written, as does attempting to demote
    `demo-admin@example.com`.

R6. Signed in as `demo-staff@example.com` (vendor `STAFF`), navigating to `/staff/team` does not
    render the team management UI — access is refused (redirect or error page), per §1.3.

R7. Signed in as `demo-store-admin@example.com` while it is the vendor's only remaining `ADMIN`
    membership, attempting to demote itself to `USER` or `STAFF` is refused and the membership row
    is unchanged, per §1.4.

R8. A live query against staging's `VendorRoleAuditLog` shows exactly one row per role change
    performed in R4–R7, each row's `actorId` matching the account that performed it, `oldRole` and
    `newRole` matching the observed transition, and `vendorId` and `userId` populated — per §2.

R9. `specs/2026-08-14-p6.7-team-role-management/validation.md`'s §1 and §2 checkboxes are `[x]`,
    and its status blockquote states that §1 and §2 were walked live on staging on 2026-08-17,
    superseding the current text saying they have not been.

## Smoke pass on the four ungated slices

R10. `build-notes.md` contains a "Smoke pass" section listing, for each of P6.5, P6.6, P6.6c and
    P7a, the specific checks run on staging and their result, plus an explicit statement of what
    was **not** covered. At minimum the section covers: storefront home renders with vendor
    branding; add-to-cart and the cart drawer; a checkout reaching the Stripe redirect; the admin
    panel's order dashboard and a status transition; the staff inventory view; the cookie consent
    banner and one legal page.

## Reconciliation (carry-forward, this branch)

R11. `specs/Validation.md` no longer exists; its content is at `docs/regression-tests.md` with a
    valid front-matter block (`id`, `title`, `audience`, `type`, `status`, `version`, `updated`,
    `visibility`, `summary`, `tags`), and `docs/regression-tests.md` appears as a row in
    `ARTIFACT_INDEX.md`.

R12. `specs/roadmap.md`'s P6.5 and P7a change-log rows each state that the slice reached `staging`
    by direct push with no anchoring issue or PR, and each names the commit that carried it
    (`982eafb` for P6.5, `624a842` for P7a) in place of the incorrect `Issue #180` / `PR #183`
    citations. Verified by reading the two rows, not by grepping for the absence of the old
    numbers — a row that explains the miscitation may legitimately still name it
    (`specs/sdd-workflow.md`, Spec: don't grep for a word's absence in prose).

R13. On GitHub Project #2, issues #183, #184 and #187 have Status `In Review`; #185 has Status
    `In Review` rather than `Done`; #176 has Status `Backlog`; and an item exists for P6.6
    (PR #182's UI overhaul) with Phase `P6`.

R14. `specs/roadmap.md` has a new change-log row dated 2026-08-17 for this slice, and
    `npm run sdd:audit` exits 0 reporting `specs/2026-08-17-p6.7-closeout-promotion/` as documented.

R15. `npm run kms:build-index` produces no diff against the committed `ARTIFACT_INDEX.md` when run
    as the last step before commit.

## Promotion

> **R16–R18 are verified at Ship, not at Gate 3.** They describe outcomes that only exist *after*
> this branch merges into `staging` and the promotion PR merges into `main` — both of which happen
> after Validate. A fresh validation context must report them as **not yet applicable**, with that
> reason, rather than as failures. Every other requirement (R1–R15, R19, R20) is checkable on the
> branch before Ship.

R16. A PR from `staging` into `main` titled in the existing "Promote … to production" convention is
    merged, its `gates` run concluded `success`, and the `deploy-production` workflow run for the
    resulting `main` commit concluded `success`.

R17. After R16, `https://aheedfoodcentre.nocaped.com/api/health` returns HTTP 200 with `db.ok` true.

R18. After R16, issues #186 and #190 are closed and their Project #2 items have Status `Done`.

## Gates

R19. `CHANGELOG.md` has an `[Unreleased]` entry on this branch describing this slice (Gate 4).

R20. `npm run lint`, `npm run typecheck`, `npm test` and `npm run format:check` all exit 0 after
    this slice.
