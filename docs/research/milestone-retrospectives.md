---
id: milestone-retrospectives
title: "Milestone retrospectives"
audience: [dev, product]
type: doc
status: approved
version: "1.1.0"
updated: 2026-09-05
visibility: internal
summary: "Append-only record of Learn-phase retrospectives — what each completed milestone actually delivered, which assumptions held or failed, what emerged unexpectedly, and which lessons were promoted into CLAUDE.md or the workflow."
tags: [research, retrospective, learn, milestone, sdd]
related: [research-index, sdd-workflow, roadmap, changelog]
---

# Milestone retrospectives

Newest entry first. Written by the **Learn** phase (`/learn`, and automatically at every milestone
close, immediately after Discover).

A retrospective is **evidence-first**. Where a claim can be checked — a merged PR, a roadmap
change-log row, an issue number, a CI run id, a live query — cite it. Where it cannot, say
**"no evidence available"** rather than reaching a conclusion anyway. An honest gap is a finding;
an invented conclusion is a liability, because the next reader will treat it as fact.

## Entry template

```
## <milestone> — retrospective (YYYY-MM-DD)

**Closed by:** <PR #NN / merge SHA>   **Roadmap closure row:** <date of the row>

### What was delivered
Issue by issue, against what the milestone said it would deliver. Name anything descoped, and
whether it was re-homed to a later phase or dropped.

### Assumptions tested
| Assumption | Where it was recorded | Outcome | Evidence |
| --- | --- | --- | --- |
Outcome is one of: held / disproved / still untested. "Still untested" is a legitimate row and
should be the honest answer whenever nothing actually exercised it.

### What emerged that nobody planned for
The defects, traps and surprises found during Build, Validate or Ship. Each one: what it was, what
found it, and what would have found it earlier.

### Repeat / avoid
Concrete practices, not sentiments. "Ran the KMS assemble build before pushing every spec edit" is
a practice; "communicate better" is not.

### Lessons promoted
Where each durable lesson went — `CLAUDE.md`, `specs/sdd-workflow.md`, a test, a CI check, an ADR.
A lesson recorded only here has not been promoted; this repo has already paid for the difference
between a ruling that lives where it gets read and one that does not.

### Measurement
What the milestone's changes were supposed to move, and whether that can be observed yet. If there
is no instrumentation, say so plainly — do not substitute an estimate.

### Follow-on
Issues filed, roadmap rows added, hypotheses handed to the Discovery log.
```

---

## P2.6 — Search & AI shopping — retrospective (2026-09-05)

**Closed by:** PR #604 (merge `5ecaafa`, `staging -> main`)   **Roadmap closure row:** 2026-09-05

This is the **first entry written under the Discover/Learn phases** — P2.6 was inserted ahead of P9
on 2026-09-03 and closed first, ahead of the prediction this file's placeholder note made when it
was written three days earlier.

### What was delivered

Six slices, proposed and shipped in full, 2026-09-03 to 2026-09-05 (roughly 2.5 days end to end):

- **Slice 1** (`#564`, PR #573): tokenised multi-word search matching, five-tier relevance ranking.
- **Slice 2** (`#565`, PR #577): typo/identity/broad zero-result recovery ladder, `SearchQueryLog`.
- **Slice 3** (`#566` + `#396`/`#580`/`#572`/`#578`, PR #585): Desi/transliteration synonym
  dictionary with staff approval, staff-triggered AI synonym proposals, thin-result recovery,
  tokeniser hygiene.
- **Slice 4** (`#567`, PR #592): AI Shop List — a natural-language pre-pass over the existing,
  unchanged deterministic matcher.
- **Slice 5** (`#568`, PR #597): autocomplete, slide-out filter panel, removable chips, category
  drill-down.
- **Slice 6** (`#569`, PR #603): catalogue filter facets — brand, dietary flags, country of origin,
  offers; new `Brand` model and `/staff/brands`.

All six were promoted to production the same day (or next) they merged to `staging` (PRs #575,
#581, #586, #593, #598, #604) — no slice sat on `staging` waiting, and none were reverted.

**Descoped or re-homed, not dropped:**

- **Pack size as a facet** — explicitly excluded from slice 6, deferred to `#398` (P9.3's unit
  model). `Product.unitLabel` is free text and cannot support it without that work landing first.
- **Brand landing pages / mega-menu thumbnails** — explicitly excluded from slice 6, deferred to
  `#394` (P10). `Brand.imageKey` exists so `#394` has somewhere to put a thumbnail; nothing renders
  it yet.
- **AI on the public, unauthenticated search request path** — this is the milestone's largest
  in-flight scope change. Slice 2 was originally specified with an AI call on the zero-result path;
  a same-day second `/propose`, triggered by two Discover findings (`#570` personal-data-without-
  data-rights-wiring, `#571` unmetered-attacker-controlled-cost), reversed that entirely. AI moved
  to slice 3, staff-triggered and offline only, writing rows a human must approve. **This was caught
  before anything shipped**, not found live afterward — the one scope change in this milestone that
  is a genuine SDD-loop success story rather than a gap.
- **Backfilling brand/dietary/HMC data onto the ~2,000 pre-existing catalogue products** — never
  actually promised as this milestone's job; correctly left as real-catalogue-import work for
  Aheed's own operators, not a gap.

### Assumptions tested

| Assumption | Where it was recorded | Outcome | Evidence |
| --- | --- | --- | --- |
| Multi-word matching + relevance ranking will improve shopper conversion | `/propose` trigger for the whole phase | **Still untested** | No analytics instrumentation exists anywhere in the app (`#607`, re-confirmed 2026-09-05) — there is no way to observe whether search behaviour actually changed for a real shopper |
| A hand-constructed mock of Workers AI's REST response shape represents what the real endpoint returns | Implicit in `#566`/`#567`'s Build | **Disproved, twice, in the same milestone** | `lib/list-normalisation.ts` (`#567`) shipped completely non-functional on its first live test (`result.response` is an already-parsed value, not a string); `lib/search-synonym-proposals.ts` (`#566`) carries the identical unfixed assumption and is **still unverified at milestone close** (`#583`, `#589`) |
| A synonym dictionary can be sequenced independently of the relevance-threshold/thin-result question | `#580`'s own filed note, reversed at slice 3's `/spec` | **Disproved** | Widening recall made the thin-result bug *more* reachable, not less — folding `#580` into slice 3 was forced, not a preference |
| AI belongs on the public zero-result search request path | Slice 2's original scope | **Disproved, caught pre-ship** | `#570`/`#571` (Discover, 2026-09-03) — reversed same-day, no version of this ever reached a real request |
| GAP-011 (trigram-index `DROP` proposals) is an occasional migration-generation nuisance | Recorded at `#508` before this milestone | **Disproved further — now a certainty** | Fired on all **six** migrations this milestone generated (once per slice carrying one), the third through eighth recorded occurrences overall |
| Ranking availability ahead of relevance would help conversion | 2026-09-03 Discover challenge to `#564` as filed | **Held / recommendation adopted directly** | `#564` shipped with relevance dominating availability by design instead — the Discover finding's own recommended fix, absorbed into the slice rather than filed as a separate defect |

### What emerged that nobody planned for

- **The Workers AI response-shape assumption failure, twice.** What found it: a live call under
  `npm run preview` with real credentials, for the first time either module had ever been run that
  way — a green unit suite (built against a test double that encoded the same wrong assumption) had
  said nothing was wrong for both. **What would have found it earlier:** nothing short of a live
  call, since a unit test double is only as good as its author's assumption about the shape being
  tested — this is exactly the transferable lesson `CLAUDE.md` already records for the identical
  Prisma-driver-error-code failure shape, and now for a second real service.
- **The `validation.md`-grep-matches-its-own-comment trap recurred five times in one slice (slice
  5).** `specs/sdd-workflow.md` had already documented this pattern from four prior slices before
  P2.6 began, naming it explicitly as something to expect. Documenting it did not reduce its
  recurrence rate within the very milestone that added an eighth recorded instance to that count.
  What found it: reading each flagged row's actual mechanism rather than trusting the grep exit
  code, every single time. What would have found it earlier: unclear — this is a methodology
  discipline, not a code defect, and no mechanical check obviously distinguishes "the string exists
  only in a justifying comment" from "the string exists in real code" without doing the same read a
  human already does. Worth a `/propose` on whether a small script (grep, then separately check
  whether every match sits on a comment-only line) is worth building rather than continuing to rely
  on the same documented-but-recurring vigilance.
- **Discover findings tagged `PROPOSE` sat for three days with no issue filed.** Found only by this
  same milestone's closing Discover pass re-reading its own earlier entries (2026-09-02's paid-order
  refund/substitution and no-analytics findings) — no mechanism was watching for a `PROPOSE`-tagged
  log entry with no linked issue. What would have found it earlier: a version of `sdd:audit` that
  walks `docs/research/discovery-log.md` for `PROPOSE`/`ADD TO ROADMAP`/`READY FOR SPEC` entries
  with no `#NNN` reference and flags them, the same shape as the existing roadmap/promotion audit.
- **A milestone-tagging inconsistency**: follow-up issues filed during slices 3, 5 and 6 (`#582`,
  `#583`, `#599`, `#601`, `#602`) never received the `P02.6` milestone, while slice 4's own
  follow-ups (`#588`–`#591`) did. Found only while grounding this Learn pass against the milestone's
  own issue list. Low-stakes, but it made the milestone undercount its own remaining work by five
  issues until fixed.

### Repeat / avoid

- **Repeat:** filing the Discover-sourced scope reversal (AI off the public request path) as a
  same-day second `/propose` rather than shipping the original plan and fixing it after — this is
  the cheapest possible point in the loop to change a decision, and it was used correctly here.
- **Repeat:** every slice's `/validate` running from a genuinely fresh context and re-running from
  the top after any `/fix`, rather than patching only the failed row — this is what caught both
  slice 4's dead AI pre-pass and slice 5's chip defect before either reached production.
- **Avoid:** treating a green unit-test suite as evidence about a real external service's response
  shape (Workers AI, and previously Prisma's driver error codes) — a live call is the only thing
  that has ever actually caught this in this repo, twice now for two different services.
- **Avoid:** writing a Discover finding without filing its issue in the same sitting, when its next
  action is anything other than `RESEARCH MORE` or `DO NOT PURSUE` — two findings sat unconverted
  for three days this milestone until the closing pass caught it.

### Lessons promoted

- **Workers AI response-shape handling** — already promoted to `CLAUDE.md`'s "Workers AI" section
  at slice 4's close (2026-09-04); this retrospective adds no new promotion here, only confirms the
  second instance (`lib/search-synonym-proposals.ts`) is still open at milestone close, tracked on
  `#583`/`#589`.
- **GAP-011's certainty** — already promoted to `CLAUDE.md`'s database section, updated at every
  occurrence including this milestone's sixth.
- **The `validation.md`-grep-matches-comment trap** — already extensively promoted to
  `specs/sdd-workflow.md`'s Validate section (eight prior instances); this retrospective does not
  re-promote it, but names the possible mechanical check above as a candidate for `/propose` rather
  than continuing to only document it.
- **NEW — Discover findings need their issue filed in the same sitting.** Not yet promoted anywhere
  besides this entry and the addenda added to the two affected `docs/research/discovery-log.md`
  entries. Recommended destination: a short addition to `specs/sdd-workflow.md`'s Discover section,
  and/or the `sdd:audit` extension named above under "what would have found it earlier." Filed as
  **`#610`** so it does not stay a retrospective-only observation.

### Measurement

The milestone's stated commercial goal — better search and discovery converting more shoppers — is
**not observable**. No analytics instrumentation of any kind exists in this application (`#607`),
so there is no baseline for conversion, basket-abandonment or search-success before this milestone
and no way to measure movement after it. This is stated plainly rather than estimated: nothing here
can currently show whether six slices of search and facet work changed a single shopper's behaviour.

What **is** measured is the technical, non-behavioural goal: query latency stayed within budget
throughout. `docs/developer-portal/nfr-baseline.md` tracks `searchProducts`'s p95 across the
milestone — 75.1ms before P2.6, 95.4ms after slice 1's tokenisation, 102.1ms after slice 6's tripled
facet probe count — always comfortably under the 400ms target from `specs/mission.md`. The
performance side of this milestone's goal is verified; the commercial side is not, and `#607`
already exists to close that gap.

### Follow-on

- **`#606`** — a paid order cannot be reduced, substituted or refunded (backfilled from a stale
  2026-09-02 Discover finding).
- **`#607`** — no analytics instrumentation exists (backfilled from the same date; also the reason
  this retrospective's own Measurement section above cannot report a behavioural result).
- **`#608`** — six of slice 6's new facet fields never reach a product card or detail page.
- **`#610`** — (filed from this Learn pass) consider a mechanical check, alongside `sdd:audit`, that
  flags a Discover-log entry tagged `PROPOSE`/`ADD TO ROADMAP`/`READY FOR SPEC` with no linked
  issue.
- **Still open, unresolved by this milestone:** `#583`/`#589` (the second, still-unfixed Workers AI
  response-shape instance), `#582` (bulk approve/reject), `#599` (suggest route's `Cache-Control`
  not actually edge-cached), `#601`/`#602` (found during slice 6's own Build), `#397` (this
  milestone's own catalogue-filters issue — only its non-pack-size half is now superseded by
  `#569`), `#286` (`pg_trgm` fuzzy search re-evaluation, independent of this phase).
- **Open question, not decided here:** whether the `P02.6` GitHub milestone should eventually be
  formally closed with its eleven remaining issues redistributed elsewhere, the way P8's 39 were at
  its own close (`#426`) — or whether it is fine for a closed phase's milestone to keep tracking its
  own follow-up work indefinitely. Left for a future `/propose` rather than decided unilaterally
  here.

---

**P8, closed 2026-08-28, predates these phases and is deliberately not backfilled** — a
retrospective written months later from the change log alone would be reconstruction, not evidence,
which is exactly what the template above forbids. Its durable lessons were already promoted into
`CLAUDE.md` at the time they were learned.
