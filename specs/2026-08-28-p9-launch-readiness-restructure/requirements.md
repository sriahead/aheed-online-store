# P8 closeout and the P9 / P10 restructure (requirements / acceptance criteria)

Closes P8 as a historical record, creates **P9 — Production launch readiness** with four sub-phases,
creates **P10 — Post-launch improvements**, disposes of all 39 open P8 issues, and files the
launch-readiness issues P9 needs. Builds on `roadmap`. Documentation, milestone and issue-tracker
work only — **no application code is built by this slice**, including any fix for the security items
it files. Full narrative and the reasoning behind each requirement: `plan.md`.

## Milestones

R1. GitHub milestones exist with these exact titles: `P09 — Production launch readiness`,
    `P09.1 — Security & transaction safety`, `P09.2 — Production infrastructure & reliability`,
    `P09.3 — Launch quality validation`, `P09.4 — Launch certification`, and
    `P10 — Post-launch improvements`.

R2. The milestones `P08.6 — Storefront discovery & conversion` and
    `P08.7 — Fulfilment & merchandising data models` are **closed** and hold **zero open issues**.

R3. The milestone `P08 — Deployment & launch` holds **zero open issues except #420**, which R11
    keeps open and unchanged. It remains open as a historical record only if it still holds closed
    issues; its closed-issue count is unchanged by this slice except for #91 and #408.

## Issue disposition

R4. #340 is open on milestone `P09.1 — Security & transaction safety`.

R5. Each of #113, #104, #227, #246, #175, #219, #101, #94 and #236 is open on milestone
    `P09.2 — Production infrastructure & reliability`.

R6. Each of #174, #350, #351 and #398 is open on milestone `P09.3 — Launch quality validation`.

R7. Each of #390, #416, #421, #397, #403, #407, #221, #75, #100, #116, #137, #146, #147, #148, #149,
    #151, #232, #280, #286, #288, #372, #373 and #423 is open on milestone
    `P10 — Post-launch improvements`.

R8. Every issue that was open on `P08.6 — Storefront discovery & conversion` or
    `P08.7 — Fulfilment & merchandising data models` before this slice — #394, #395, #396, #399,
    #400, #401, #402, #404, #405, #406, #422 — is open on `P10 — Post-launch improvements`.

R9. #91 and #408 are **closed**, each carrying a closing comment that states why (the P8 epic
    closing with its phase; #408 fully sequenced by #420).

R10. **#243 is still closed and was not reopened**, and its milestone is unchanged.

R11. #420 is still **open** and its milestone is unchanged — it closes on promotion, not here.

## New issues

R12. Seven issues exist on `P09.1 — Security & transaction safety`, one for each of: guest order PII
     authorization; checkout cancellation authorization; Stripe session to `Payment.providerReference`
     binding; production payment fail-closed; production authentication rate limiting; cross-tenant
     database integrity; commercial database CHECK constraints. Each names the file(s) it concerns
     and states a "done when" condition.

R13. Five issues exist on `P09.2 — Production infrastructure & reliability`, one for each of:
     migration-safe production deployment; release quality gates; backup/PITR verification and
     restore test; critical production alerting; production rollback procedure.

R14. Four issues exist on `P09.3 — Launch quality validation`, one for each of: storefront LCP
     re-measurement against the release candidate; minimal Playwright launch smoke suite; customer
     and staff UAT; accessibility launch validation.

R15. Three issues exist on `P09.4 — Launch certification`, one for each of: production game day;
     exact release-candidate verification; final GO/NO-GO assessment.

R16. One issue exists on `P10 — Post-launch improvements` for CSP hardening.

R17. The LCP issue filed under R14 states in its body that #243 is closed and is deliberately not
     reopened, and that its own first task is measurement rather than optimization.

R18. The Playwright issue filed under R14 states that no `playwright.config.ts`, `e2e/` directory or
     Playwright dependency exists in the repo, so the work includes harness setup, and it names the
     five journeys: browse to cart; guest checkout; authenticated checkout; guest order lookup;
     staff authentication and RBAC.

R19. No issue is filed for the P10 themes recorded as prose only: broader E2E coverage, loading and
     error-state polish, database and index optimization, search evolution, caching,
     background-processing evolution, analytics separation.

R20. An issue for `/staff/bundles/new` is filed **only if** the live check under R32 shows the route
     fails. If the route renders, no issue is filed and the result is recorded in `build-notes.md`.

## Roadmap

R21. `specs/roadmap.md`'s P8 entry describes P8 as a historical or completed record and no longer
     presents P8.2 as the forthcoming launch bucket.

R22. `specs/roadmap.md` contains a section defining **P9 — Production launch readiness** with four
     named sub-phases P9.1, P9.2, P9.3 and P9.4, each carrying an objective and an exit gate.

R23. `specs/roadmap.md`'s P9.1 subsection names each of #340 and the seven new P9.1 issue numbers.

R24. `specs/roadmap.md`'s P9.2 subsection names each of #113, #104, #227, #246, #175, #219, #101,
     #94, #236 and the five new P9.2 issue numbers.

R25. `specs/roadmap.md`'s P9.3 subsection names each of #174, #350, #351, #398 and the four new P9.3
     issue numbers.

R26. `specs/roadmap.md` contains a section defining **P10 — Post-launch improvements** that names
     every issue listed in R7 and R8, and states that P8.3, P8.6 and P8.7 fold into it.

R27. `specs/roadmap.md`'s P10 section preserves #420's gate analysis in prose, naming all four
     relationships: #363 gates #401 and #402; ADR-006 gates #402 and #400's per-store half; #398's
     variant model gates #399 and #397's Pack Size facet; and #399 additionally requires a
     payments-capture decision amending ADR-005.

R28. `specs/roadmap.md` states that #243 is closed and was not reopened, and that a new issue
     measures LCP against the release candidate instead.

R29. `specs/roadmap.md` records the three human rulings from `plan.md`: P8.6/P8.7 folding into P10;
     #421's set going to P10 except #398's unit-price half; and #221 going to P10 unblocked by #104.

R30. `specs/roadmap.md` states that Project #2's Phase field cannot express P9 or P10, and
     cross-references **#267**.

R31. `specs/roadmap.md`'s existing P8.1, P8.2, P8.3, P8.5, P8.6 and P8.7 entries are **not
     renumbered**, and the pre-existing Roadmap Change Log rows are unmodified.

## Live check

R32. `/staff/bundles/new` is loaded under `npm run preview` while signed in as a store admin, and
     the outcome — renders, or fails with the observed error — is recorded in `build-notes.md`.

## Gates and hygiene

R33. `specs/roadmap.md`'s front matter carries a `version` higher than `1.52.0` and
     `updated: 2026-08-28`, and a new Roadmap Change Log row records this slice.

R34. `CHANGELOG.md` has an entry for this slice on the branch (Gate 4).

R35. `npm run kms:validate` exits 0.

R36. `npm run kms:assemble:internal` exits 0 and the internal docs site builds — this slice adds
     substantial prose to `specs/`, which is the pipeline the root gates never run.

R37. `npm run lint`, `npm run typecheck`, `npx vitest run` and `npm run format:check` each exit 0.

R38. `ARTIFACT_INDEX.md` contains a row for this slice's `plan.md`.

R39. This slice's PR body carries exactly one closing keyword, `Closes #426`, and closes no other
     issue.

## Milestone title sort order

R40. **Every** GitHub milestone title carries a zero-padded two-digit phase number, so the milestone
     list sorts in delivery order: `P00 — Foundation & scaffolding`, `P01 — Auth & accounts`,
     `P02 — Catalogue & browsing`, `P02.5 — Ratings, reviews & storefront visual design`,
     `P03 — Cart & checkout`, `P04 — Orders & delivery status`, `P05 — Loyalty & discounts`,
     `P06 — Admin & staff panel`, `P07 — Compliance & hardening`, `P07.5 — Pre-launch closeout`,
     `P08 — Deployment & launch`, `P08.5 — Storefront conversion overhaul`,
     `P08.6 — Storefront discovery & conversion`, `P08.7 — Fulfilment & merchandising data models`,
     `P09 — Production launch readiness`, `P09.1` through `P09.4`, and `P10 — Post-launch
     improvements`. `M0 — Walking Skeleton` is unchanged — it is not a P-phase and sorts ahead of
     them all anyway.

R41. `specs/roadmap.md` records that milestone titles are zero-padded **while phase names in prose,
     spec directory names and front-matter `id` values keep the short form**, and states that
     `P09.1` and `P9.1` denote the same phase so neither is later "fixed" to match the other.

R42. No spec directory was renamed and no front-matter `id` was changed by this slice.
