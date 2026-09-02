---
description: "Forward-looking research pass — find unowned problems, opportunities, risks and gaps, without changing approved scope"
---

Run a Discover pass on: $ARGUMENTS

(No argument means a full pass over the current product and project state.)

Follow the **Discover** stage of `specs/sdd-workflow.md` (read it if not already in context).

1. **Ground first, in this order of authority:** `prisma/schema.prisma` and the actual code; then
   `specs/roadmap.md` and the open issues (`gh issue list --limit 200`); then the ADRs under
   `specs/decisions/`; then `CLAUDE.md`; then anything external. Where a document and the code
   disagree, **the code wins** — this repo has repeatedly held docs asserting properties the code
   did not have.
2. **Read `docs/research/discovery-log.md` before writing anything.** A finding already recorded
   there is not a new finding; add evidence to it or supersede it, don't duplicate it.
3. **Classify every candidate before writing it down** — already implemented (cite the file or
   schema field) / already tracked (cite the issue and its phase, including deliberate deferrals and
   ADR exclusions) / genuinely unowned. **Only the third is a finding.** Presenting an existing
   feature or a filed issue as a discovery is the single failure that discredits the whole log.
4. **Separate observed evidence from interpretation from recommendation**, and label confidence
   (Known / Inferred / Needs validation). Never present an assumption as evidence.
5. **Think in grocery terms**, not generic e-commerce: variable weight, butcher preparation,
   substitutions, stock volatility, freshness, halal certification confidence, pack size and unit
   pricing, minimum order, delivery charges and postcode eligibility, delivery capacity, chilled and
   frozen fulfilment, heavy-order economics, repeat weekly shopping, forgotten items, multi-buy
   pricing. Test each finding against the awkward cases, not the happy path.
6. **Challenge the plan where it deserves it** — wrong sequencing, an unnoticed gate, a simpler
   alternative, a mobile or accessibility cost, a conflict with an ADR. Say so. Do not
   automatically agree with an idea just because it is already on the roadmap.
7. **Append each finding to `docs/research/discovery-log.md`** using that file's template, newest
   first, and bump its front-matter `version` and `updated`.
8. **File a GitHub issue** for anything whose next action is `PROPOSE`, `ADD TO ROADMAP/BACKLOG` or
   `READY FOR SPEC`. A `RESEARCH MORE` finding stays in the log. A `DO NOT PURSUE` finding stays in
   the log too, with its reasoning — so it is not rediscovered in six months.
9. Every entry ends with **exactly one** next action: `RESEARCH MORE` / `PROPOSE` /
   `ADD TO ROADMAP/BACKLOG` / `READY FOR SPEC` / `DO NOT PURSUE`.

**Do not implement anything, and do not change approved scope.** Discover recommends and challenges;
`/propose` decides. Findings are evidence, not a backlog.

Watch the MDX traps when writing to `docs/`: no bare `<` before a digit, no unbackticked curly
braces in prose. Run `npm run kms:validate` before finishing.
