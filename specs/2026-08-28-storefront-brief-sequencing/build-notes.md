# Storefront & fulfilment brief — roadmap sequencing (build notes)

Written at the end of Build, before the Clear. Slice-local, no front-matter.

Branch `feature/420-storefront-brief-sequencing`, in the **main checkout** at
`E:\GitRepositories\aheed-online-store` — **no sub-agent worktree was used**, so `git worktree list`
should show only the primary checkout and there is no second location holding this slice's work.

Two commits: `40e15ae` (spec files, Gate 2) and `5332018` (the build), plus this notes commit.

## What changed and why

**No application code was touched.** This slice is documentation and one architectural decision.
`lint`, `typecheck`, `vitest` and `build` are unchanged by construction; they were run to prove
that, not because anything could have broken them.

### `specs/roadmap.md` (1.51.0 → 1.52.0)

Before this slice the file did not contain the strings `#408`, `#394` or `#407` anywhere — fourteen
issues existed, sat on Project #2, carried `P8 — Deployment & launch` as an explicitly stated
holding position, and were sequenced nowhere. Added:

- **P8.6 — Storefront discovery & conversion** and **P8.7 — Fulfilment & merchandising data
  models**, appended to the P8 decomposition rather than renumbering anything. P8.1, P8.2, P8.3 and
  P8.5 keep their numbers and meanings; a note on P8.3 says explicitly that it remains the
  unscheduled catch-all, since two named phases being carved out of its territory invites the
  opposite reading.
- The **pre-launch set inside P8.2** — #407, #397's Country-of-Origin facet, the #403 investigation,
  #398's unit-price derivation half — with prose stating it is sequenced here and **built by a
  separate later slice under its own issue** (now filed, see "Deferred items" below).
- A **summary blockquote** after the phase bullets carrying the cross-cutting facts that belong to
  no single phase: the brief's provenance, the #397/#398/#400 phase splits, the earliest-phase
  milestone rule, and the #267 board Phase-field limitation.
- Two **change-log rows**: the carry-forward row for **PR #419** (which `sdd:audit` had reported as
  the one pending promotion at `/orient`), and this slice's own row.

### `specs/decisions/ADR-006-store-locations.md` (new)

Rules that a store location is a child of `Vendor`, never a second tenancy axis, and **never a
second mandatory filter on queries in `lib/repositories/*`**. That second clause is the load-bearing
one: making isolation a pair rather than a single value would rewrite every repository query and
invalidate the premise of `tests/repository-vendor-scoping.test.ts`. A location is a dimension of
*data*, not of *isolation*.

It also resolves a naming collision found by reading ADR-004 rather than trusting #408's framing —
see "Decisions taken during the build".

### `specs/decisions/ADR-004-multi-tenancy.md` (1.9.0 → 1.10.0)

Decision 1's `Region`/`Location` bullet now carries a pointer to ADR-006 distinguishing the two
concepts, and `related:` gains `adr-006-store-locations`.

**Why this edit exists at all:** ADR-004 is the document a reader with a locations question will
open — it is the multi-tenancy ADR and its own summary lists "locations" among the things that come
from the database. Without a pointer, ADR-006 is a ruling sitting in a file nobody would think to
open, which is the precise failure mode `CLAUDE.md` records for GAP-011 ("a ruling that lives only
in a doc nobody opens at decision time is not a ruling").

### Issue tracker

Milestones **P8.6** (number 14) and **P8.7** (number 15) created, following the existing `P7.5` /
`P8.5` milestone precedent. Ten of the fourteen brief issues re-milestoned; #397, #398, #403 and
#407 deliberately left on `P8 — Deployment & launch`. All fourteen remain open.

## Decisions taken during the build

**1. ADR-006 rules architectural shape, not the business question — and this is a narrowing of what
`/propose` literally asked for.** The approved option read "an ADR deciding whether a Vendor can have
multiple physical locations." What shipped decides whether locations are a *tenancy axis* and leaves
open whether Aheed actually trades from more than one site. Reasoning: the second question is
commercial, this repository cannot answer it, and an ADR that guessed would record a business
decision as an architectural one. The expensive-to-retrofit half is the shape, and settling it is
enough to size #400 and #402. **This was flagged to the human twice — at the end of `/spec` with two
explicit options, and again at the start of `/build` — and `/build` was invoked without redirecting,
which was taken as approval of the narrower reading.** It is reversible by editing ADR-006; nothing
downstream is built on it yet. Tracked as its own issue (see below) so the open half does not
evaporate.

**2. Filed ADR-006 as a new ADR rather than amending ADR-004.** ADR-004's numbered decisions are
cited by name across `CLAUDE.md`, `specs/architecture.md` and several slice specs; editing decision
1 in place to mean something new risks invalidating live citations. The compromise is the additive
pointer described above — ADR-004 gains a cross-reference, not a changed decision.

**3. Resolved a `Location` naming collision the brief never mentions.** ADR-004 decision 1 already
anticipates `Region`/`Location` reference tables "when geography grows beyond delivery areas" —
geography reference data, with no stock and nothing collected from it. That is a different thing
from a trading site. ADR-006 carries a two-row table separating them and rules that a trading site
takes the more specific name `VendorLocation`, leaving `Location` to geography. Found by reading
ADR-004 during the adversarial pass; requirement R14 exists because of it.

**4. Wrote this slice's own roadmap change-log row at Build rather than at Document (final).** It
makes `sdd:audit` exit 0 now rather than reporting this slice as a gap. The row is factual about
scope and deliberately carries **no PR number, merge SHA or CI claim**, because none exist yet —
Document (final) enriches it after Ship. This is a deviation from the usual stage ordering, taken
because a change-log row describing *scope* is knowable at Build while one describing *outcome* is
not, and R9 needed the former.

**5. Reverted `kms/site-internal/next-env.d.ts`.** Running the internal docs site build rewrites it
from `.next/dev/types/...` to `.next/types/...`; the committed version holds the dev-mode paths. It
is a Next-generated artifact incidental to running the required MDX check, not part of this slice,
and committing it would flip back the next time anyone runs `next dev`. Filed as an issue since the
workflow *requires* that build for any `specs/`-touching slice, so every such slice hits it.

## Deviations from the spec

**One, and it is in the spec's own `validation.md` rather than the artifact.**

Rows R1, R2 and R3 originally used unanchored `awk` ranges (`/\*\*P8.6 — Storefront discovery/,...`).
The roadmap's summary blockquote below the phase bullets names every phase again, so those ranges
re-matched there and ran past their intended end — R1's extraction was pulling issue numbers from
P8.7's bullet and the blockquote as well as its own. A number genuinely missing from the P8.6 bullet
could therefore have **passed** on the blockquote's mention of it.

Corrected during Build to anchor on the bullet's own line prefix (`^  - \*\*P8\.6 — Storefront
discovery`); blockquote lines begin with `>` and no longer match. Verified empirically: the tightened
R1 range yields exactly the P8.6 bullet's numbers, R2's yields P8.7's, R3's yields P8.2's. Each row
now states why the anchor is load-bearing, so a future reader does not "simplify" it back.

This is the "a `validation.md` row's literal command is a looser proxy for its own requirement"
trap recorded in `specs/sdd-workflow.md` — caught here on my own spec rather than at `/validate`.

No deviation in `requirements.md` or in the artifact itself.

## Known-shaky areas

**1. Six rows are judgement rows, and they are where a fresh context should spend its time.**
R3, R7, R13, R14, R15 and R16 assert that something is *stated* — a gate, a ruling, a
reconciliation. A grep proves a string is present, not that it is asserted rather than merely
mentioned. R7 is the weakest of these: it asks for six gating relationships in prose, and
"#363 gates #401 and #402" being *present* is not the same as it being stated *as a gate*. Read the
extracted bullets, do not trust the numbers appearing.

**2. R19's milestone mapping is the row most likely to be wrong in a way nothing else catches.**
It was applied via ten `gh api -X PATCH` calls and verified once by listing #394–#407. If a patch
had silently no-opped, the verification would have caught it — but re-run the listing rather than
trusting this note, since it is the one requirement whose state lives entirely on GitHub and not in
the repository. The earliest-phase rule (a split issue takes its earliest phase's milestone) is the
part a validator is most likely to disagree with if they re-derive it instead of reading R19.

**3. The MDX check is the only thing standing between this slice and a broken docs deploy, and it
must be run unpiped.** This slice adds a large amount of prose to `specs/`, which is exactly the
surface where a bare `<` before a digit or an unbackticked curly brace breaks
`deploy-docs-internal` while every root gate stays green. It was run and returned a real
`REAL_EXIT=0` with 116 pages prerendered — but the failure mode of *checking* it is piping through
`tail`, which reports the pipe's status. Redirect to a file and read the exit code separately.

**4. `sdd:audit` exits 0 right now, which is unusual at this point in the loop** and could read as
suspicious to a fresh context expecting this slice's own directory to be reported as a gap. It is
not a bug; see decision 4 above. R10 is deliberately pinned to PR #419 only, so it does not depend
on this.

**5. Nothing here was validated against a running application, and nothing needed to be.** No
database, Worker, browser, migration or credential is involved. A validator should not go looking
for a `npm run preview` step; there isn't one, and its absence is not an omission.
