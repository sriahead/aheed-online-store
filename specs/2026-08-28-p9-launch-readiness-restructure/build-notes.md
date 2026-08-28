# P8 closeout and the P9 / P10 restructure (build notes)

Issue **#426**. Branch `feature/426-p9-launch-readiness-restructure`, PR **#447** into `staging`.

Sequencing and decision work only. No application code changed — the only non-documentation file in
the diff is `app/(admin)/staff/runbook/docs.ts`, which is **generated** by `npm run kms:build-index`
and picked up this slice's `plan.md` as artifact 113.

## What changed and why

### `specs/roadmap.md` (1.52.0 → 1.53.0)

- **P8 reframed as a historical record.** Its bullet now opens `CLOSED 2026-08-28 — historical record
  only` and states what P8 did and did not deliver: it shipped its debt-and-compliance half (P8.1)
  and its storefront half (P8.5), and never delivered the launch itself.
- **Each subdivision annotated with where its work went**, without renumbering any of them: P8.2 →
  superseded by P9.2; P8.3, P8.6, P8.7 → folded into P10. Their original text is preserved verbatim
  after a `Recorded as originally written:` marker, because change-log rows and
  `specs/2026-08-23-p8.1b-closeout/plan.md` cite these numbers.
- **Two new `##` sections added**, `P9 — Production launch readiness` (with `###` subsections for
  P9.1–P9.4, each carrying an objective, its issues, and an exit gate) and
  `P10 — Post-launch improvements`. Pointer bullets for both were added to the `## Phases` list so
  that list stays complete.
- **The #408 blockquote's two stale paragraphs updated**: the earliest-phase milestone rule now
  reflects #398 on P9.3 and #397/#400/#403/#407 on P10, and the board-limitation note now covers P9,
  P9.1–P9.4 and P10 alongside its existing P7.5/P8.5/P8.6/P8.7 list.
- One Roadmap Change Log row appended. No existing row modified.

### Issue tracker

Six milestones created — `P9 — Production launch readiness`, `P9.1 — Security & transaction safety`,
`P9.2 — Production infrastructure & reliability`, `P9.3 — Launch quality validation`,
`P9.4 — Launch certification`, `P10 — Post-launch improvements`. `P8.6` and `P8.7` closed at zero
open issues.

All 39 open P8 issues redistributed; membership was verified exactly (not by a `contains` check) for
every milestone. `P8 — Deployment & launch` now holds exactly one open issue, **#420**, which closes
on its own promotion. **#91** and **#408** closed with explanatory comments via `gh issue close`, not
through the PR.

Twenty issues filed: **#427**–**#433** (P9.1), **#434**–**#438** (P9.2), **#439**–**#442** (P9.3),
**#443**–**#445** (P9.4), **#446** (P10).

### `CHANGELOG.md`

Gate 4 entry added under `### Documentation`.

## Decisions taken during the build

- **Six milestones rather than one `P9`.** Existing convention already treats sub-phases as their own
  milestones (P7.5, P8.5, P8.6, P8.7), and a single P9 milestone could not express which exit gate an
  issue sits behind. A parent `P9` milestone exists too, holding #426 itself, mirroring how `P8` and
  `P8.5` coexisted.
- **Seven P10 themes recorded as prose, not filed as issues.** The brief rules out a generic
  "optimize database" project by name; the reasoning generalises to broader E2E, error-state polish,
  search evolution, caching, background processing and analytics. An issue that cannot state what
  evidence would close it is a placeholder, and placeholders in a milestone are what produced the
  39-issue P8 this slice unwound.
- **No `phase:`/`gate:` labels applied.** CLAUDE.md says every PR carries `phase:P_` + `gate:_`
  labels. **No such labels exist in this repository** — `gh label list` returns fifteen labels, none
  of them phase or gate. #420, #421 and #409 carry none either. Followed actual practice (topical
  labels) rather than the documented-but-unimplemented rule. Flagged below.
- **#91 and #408 closed outside the PR.** A PR body naming roughly forty issue numbers is exactly the
  shape that once closed #174 and #214 by accident. The PR carries one closing keyword, `Closes
  #426`, and a note at the top saying so.

## Deviations from the spec

- **R32's live check was completed only in part, and this is a real gap rather than a formality.**
  The spec asked for `/staff/bundles/new` to be loaded under `npm run preview` **while signed in as a
  store admin**. What was verified live: the route resolves and is not a dead end — it returned
  `307 → /login`, identical to a real bundle id (`/staff/bundles/some-nonexistent-id`), while a
  genuinely unmatched path (`/staff/bundles/new/definitely-not-a-route`) returned `404`. That proves
  the `[bundleId]` segment matches `new` and the request reaches the page's auth gate.
  **What was not verified: that the create form renders for an authenticated admin.** Sign-in as
  `demo-admin@example.com` through `/api/auth/sign-in/email` returned **401** against the database
  `.dev.vars` points at — the demo account is not present there, or was created with a different
  password. Reseeding a database to prove a negative was judged disproportionate, so the check was
  stopped rather than escalated.
  **Per R20, no issue was filed** — the routing evidence plus the explicit `const isNew = bundleId
  === "new"` branch at `[bundleId]/page.tsx:47` is enough to say the reported dead end does not
  exist. If anyone wants the render itself confirmed, it is one signed-in page load away and belongs
  in #441's staff UAT walk, which covers bundles anyway.
- **The password was deliberately never printed.** It was read into a shell variable and JSON-encoded
  through `node -e` rather than interpolated. A first attempt at naive interpolation returned
  `Invalid JSON in request body`, which is itself a signal the value contains JSON-hostile
  characters. This matters here specifically: **#175 exists because an `.env` grep once printed a
  Neon password into a transcript**, and that mistake cost a credential rotation that is still open.

## Known-shaky areas

- **`ARTIFACT_INDEX.md`/`docs.ts` freshness.** Rebuilt (113 artifacts, up from 112). CI's `gates`
  check strips the generated footer's commit SHA before comparing, so a bare `git diff --exit-code`
  on these files always shows a one-commit difference by construction. Not a failure.
- **`kms/site-internal/next-env.d.ts` was dirtied by the docs-site build and restored with `git
  checkout --`.** This is **#423**, now in P10 — a known tooling gap, not something this slice
  introduced. Anyone re-running R36 will see it again.
- **The disposition of 28 of the 39 issues was a judgement call, not a transcription.** The brief
  named only 13 moves. The other 26 were classified here and approved as a table before execution,
  but three were genuinely arguable and were put to the human explicitly: P8.6/P8.7 folding into P10,
  #421's set going to P10 except #398's unit-price half, and #221 going to P10. Those three rulings
  are recorded in `plan.md` and in the roadmap so a later reader does not silently re-derive them.
- **#340 was reclassified from backlog to security.** It sat in P8 among post-launch enhancements; it
  is a cross-tenant write path and now sits in P9.1 beside #432, which covers the same class
  structurally. If that reclassification is wrong, it is wrong in the safe direction.
- **CLAUDE.md's label rule is stale** and is not something this slice fixed. Worth either creating
  the labels or removing the claim; not filed as an issue, because it is a one-line documentation
  correction rather than tracked work.
