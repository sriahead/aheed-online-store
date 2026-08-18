# Validation debt bucket (requirements / acceptance criteria)

Closes **#231** and its four constituent issues — **#192** (item 4), **#103**, **#207**, **#224**.
Rehabilitates and walks `specs/2026-08-13-p6.6-p0-ui-overhaul/` and
`specs/2026-08-13-p6.6c-operations-completion/`; live-verifies P3c's R7; extends
`scripts/sdd-check.ts`; covers `reverseRedemption`'s null-owner branch in `tests/loyalty.test.ts`.

In one line: check the four things that shipped unchecked, and make the audit able to see the fifth.

## P6.6 — exit-gate rehabilitation

R1. `specs/2026-08-13-p6.6-p0-ui-overhaul/requirements.md` states its acceptance criteria as
    sequentially numbered `R1..Rn`, and every obligation in the pre-rewrite file's R1–R8 is
    represented by at least one rewritten requirement — none silently dropped.

R2. `specs/2026-08-13-p6.6-p0-ui-overhaul/validation.md` is a `| Req | How to verify |` table with
    exactly one row per requirement in R1's numbering, in the same order, and every `Req` cell names
    a requirement that exists in that file.

R3. No row of that `validation.md` establishes a requirement by a document's own claim about itself,
    or by a subjective comparison to the prototype; every row names a command to run, a file
    property to inspect, or an observable behaviour to exercise. Verified by reading the table — not
    by grepping for an absent phrase, since a rewritten row may legitimately reference the mockup as
    context.

R4. The rewritten P6.6 `requirements.md` retains the header wishlist-link obligation from the
    original R1, marked explicitly as deferred and citing an open GitHub issue by number.

R5. `build-notes.md` records, for every rewritten P6.6 requirement, whether the artifact satisfies
    it, and at least one is recorded as **not** satisfied — demonstrating the rewrite states
    obligations rather than tracking the implementation.

## P6.6 — live walk

R6. The storefront header rendered from a running app contains all of: the vendor logo or its
    initial-based fallback derived from `VendorConfig`, a locality indicator, a product search
    input, an account or sign-in link, and a cart trigger. `build-notes.md` records which of the
    five were observed and by what means.

R7. The homepage renders a hero section containing the vendor's tagline, at least one call-to-action
    control, and the postcode deliverability form; submitting a postcode inside the vendor's
    configured prefixes and one outside produces the deliverable and non-deliverable responses
    respectively, both recorded verbatim.

R8. The homepage renders at least two product merchandising rows, each containing at least one
    product card. The observed row titles and per-row product counts are recorded — the empty-row
    defect #211 fixed makes a non-zero count the point of this requirement, not the row's presence.

R9. A rendered product card exposes, in this order: image, product name, unit/pack label, price, a
    discount indicator when and only when the product carries one, a quantity selector, and an
    add-to-cart control.

R10. Category navigation on the homepage renders each top-level category as a visual card or icon
     rather than a plain text link, verified against the rendered output.

R11. The same storefront routes rendered for a second vendor host (`srimart-staging.nocaped.com`)
     show that vendor's own name, tagline, locality and search placeholder. `build-notes.md` records
     the values observed for both vendors side by side. **Vendor name and locality must differ
     between the two**; for any other field that renders identically, `build-notes.md` states
     whether the seed genuinely sets it identically or the value is hardcoded — an unexplained match
     is a failure of this requirement, not a pass.

R12. Loading the storefront homepage in a real browser produces **zero** Content-Security-Policy
     violation reports in the console, and the rendered HTML contains no `<img>` whose `src` host
     falls outside `next.config.mjs`'s `img-src` allowlist.

R13. No file under `app/`, `components/`, `features/` or `lib/` contains an absolute `http`/`https`
     image URL as a `src` attribute or CSS `url()`. Targets the syntax that constitutes the defect,
     not the word.

## P6.6c — exit-gate rehabilitation

R14. `specs/2026-08-13-p6.6c-operations-completion/requirements.md` states its acceptance criteria as
     sequentially numbered `R1..Rn`, replacing the checkbox-bullet format, with all four original
     sections (navigation alignment, overview portal, runbook page, reports page) represented.

R15. `specs/2026-08-13-p6.6c-operations-completion/validation.md` is a `| Req | How to verify |`
     table with exactly one row per requirement in R14's numbering, in the same order, replacing the
     checklist format.

R16. The rewritten navigation requirement expresses the P6.6c-era admin tabs as a **required
     subset** rather than an exact count, so a later slice legitimately adding a tab does not
     falsify it. The pre-rewrite file asserted "all 9 tabs" while `components/staff/PanelNav.tsx`
     renders ten for the admin tier, `Team` having been added by P6.7.

R17. No row of that `validation.md` establishes a requirement by a document's own claim about
     itself; every row names a command, a file property, or an observable behaviour.

## P6.6c — live walk

R18. Signed in as an ADMIN, `/staff` renders and its panel navigation contains at least: Overview,
     Inventory, Orders, Catalogue, Categories, Loyalty, Discounts, Reports and Runbook. The full
     observed tab list is recorded verbatim.

R19. Signed in as a STAFF user, the panel navigation contains Overview, Inventory, Orders and
     Runbook, and contains none of Catalogue, Categories, Loyalty, Discounts, Reports or Team. The
     full observed tab list is recorded verbatim.

R20. The `/staff` overview page renders Inventory, Orders and Runbook cards for STAFF, and
     additionally renders a Reports card for ADMIN which is absent for STAFF.

R21. At a viewport width of 375px the panel navigation scrolls horizontally without wrapping to a
     second line, and the page body does not scroll horizontally. Recorded as the measured values
     that establish it (the nav's `scrollWidth` exceeding its `clientWidth`, and the nav's rendered
     height matching a single row) rather than as an impression of a screenshot.

R22. Every panel navigation link visible to a given role returns a successful response for that
     role — no 404 and no unhandled error. The status observed per link is recorded.

R23. `/staff/reports` renders exactly three metric cards (Total Revenue, Total Orders, Average
     Basket Value) for an ADMIN; the Total Orders figure increases by one after a new order is
     placed for that vendor; and a STAFF user requesting the same route is refused. The refusal's
     actual observed mechanism and status are recorded — not assumed to be an HTTP 403, since a
     Server Component refusal in this codebase renders `PanelRefusal`.

## #103 — P3c R7, the payment-failure path

R24. The window in which staging's `STRIPE_SECRET_KEY` is invalidated is explicitly confirmed by the
     human immediately beforehand; `build-notes.md` records that confirmation and the start and end
     times of the window.

R25. Before any secret is changed, a baseline is recorded proving the current staging key works (a
     checkout session is successfully created), and `secrets/staging.vars` is confirmed to contain a
     `STRIPE_SECRET_KEY` that is a **test-mode** key — its value begins `sk_test_` or `rk_test_`. A
     live-mode prefix (`sk_live_`/`rk_live_`) halts the slice's #103 work immediately and is
     reported, since it would mean staging is configured against live Stripe. The key's value is
     never printed, logged or committed — only the prefix and its presence are recorded.

R26. With an invalid `STRIPE_SECRET_KEY` set on the staging Worker, an attempted order leaves the
     order `CANCELLED`, writes a matching `OrderStatusEvent`, and restores `Inventory.quantity` to
     its exact pre-order value. All three are recorded with the actual observed values, including
     the pre-order and post-failure quantities.

R27. The real `STRIPE_SECRET_KEY` is restored from `secrets/staging.vars` and the restore is proven
     by a subsequent successful payment run against staging — not by the `wrangler secret put`
     command's own exit code, since Cloudflare secrets cannot be read back for comparison.

R28. `build-notes.md` states explicitly whether inbox delivery was confirmable, and if not, cites
     **#104** as the open reason. #104 is not closed by this slice.

## #207 — sdd:audit promotion rows

R29. `npm run sdd:audit` enumerates the merged `staging → main` pull requests after the loop
     baseline, **prints each one and whether a `specs/roadmap.md` change-log row cites it**, and
     reports as a gap any whose PR number and merge SHA are both absent from every row. Printing the
     per-promotion verdict is part of the requirement: it makes a passing run observable rather than
     silent, which is what let the missing-row gap recur five times behind a green check.

R30. When `gh` is unavailable or unauthenticated, the promotion check reports that it was skipped
     and the reason, and `sdd:audit` does not fail on that account — matching `hooks/pre-push`'s
     "resolve what you can, else don't block" posture.

R31. A promotion merged after the most recent `specs/roadmap.md` change-log edit is not reported as
     missing, so the check does not fire falsely on a branch cut immediately after a promotion.

R32. The promotion check matches a roadmap row to a promotion on the PR number or the merge SHA, and
     `scripts/sdd-check.ts` documents which forms it accepts.

R33. `tests/` contains cases covering the promotion matcher against **fixture** roadmap content — a
     cited promotion, an uncited one, and the pending carry-forward case of R31 — so the
     missing-row case is provable without mutating the real `specs/roadmap.md`.

R34. `npm run sdd:audit` exits 0 on this branch.

## #224 — reverseRedemption's null-owner path

R35. `tests/loyalty.test.ts` contains a case reversing a redemption whose `userId` is null, asserting
     that the `REVERSAL` ledger row is written with the correct `points` and `orderId`, that no
     `LoyaltyAccount` write is attempted and nothing throws, and that a second reversal for the same
     order is refused by the idempotency guard.

R36. `npm test` exits 0 with that case present.

## Findings, issues and closeout

R37. Every defect found during the walks that is not corrected in this slice is filed as a GitHub
     issue, added to Project #2 with a Phase set, and cited from `build-notes.md`. At minimum this
     covers the wishlist link (R4) and a per-vendor hero image to replace the removed hardcoded one.

R38. Issue **#192** carries a comment stating that item 4 is discharged and naming what was walked
     for P6.6 and P6.6c.

R39. `specs/roadmap.md` gains a change-log row for this slice citing
     `specs/2026-08-18-validation-debt-bucket/`, and its front-matter `version` and `updated` are
     bumped.

R40. No commit message, PR body, or document changed on this branch places a closing keyword
     (`close`/`closes`/`closed`/`fix`/`fixes`/`fixed`/`resolve`/`resolves`/`resolved`) immediately
     before `#104`, `#113`, `#163`, `#169` or `#174`. Verified by reading every commit message in
     the branch's range before merge, not only the PR body.

R41. `npm run kms:build-index` is run **last**, after every front-matter edit in this slice, and the
     resulting `ARTIFACT_INDEX.md` is committed.

R42. `npm run kms:validate` exits 0.

## Persistent docs whose standing description this slice changes

R43. Every defect found by the walks — including the two confirmed before the walk began (the
     CSP-blocked hero image, the never-built wishlist link) — is recorded in `docs/gap-register.md`
     as a row carrying a GAP-ID, a Status and a citation a reader can check, and the register's
     front-matter `version` is bumped. The master register silently going stale is precisely the
     failure `specs/2026-08-17-p6.5-residual-validation/` consolidated it to end.

R44. `specs/sdd-workflow.md`'s "Two machine checks" section describes `sdd:audit`'s promotion check
     added under R29–R33, and its front-matter `version` and `updated` are bumped.

R45. `CLAUDE.md`'s description of `npm run sdd:audit` reflects the promotion check, so the guardrails
     file and the workflow file do not disagree about what the command verifies.

## Gates

R46. `CHANGELOG.md` updated (Gate 4).

R47. `lint`, `typecheck`, `test` and `format:check` all exit 0 after this slice.

R48. `npm run sdd:preclear` exits 0 before the pre-validation Clear.
