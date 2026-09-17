# CLAUDE.md guardrail refactor — reduce always-loaded context (requirements / acceptance criteria)

Closes **#786**. Implements the resolutions for **#584** (the vitest baseline keeps going stale) and
**#546** (the PR label rule names labels that do not exist). `CLAUDE.md` is 149,380 characters of
context loaded into every session before any work begins; roughly 40k duplicates documents that
already own the material, and five of its statements are false against the repository. This slice
reduces it to 10,000 characters or fewer, relocates every rule to an authoritative destination
first, repoints every reference that pointed into a moved section, and corrects the five false
statements from repository evidence. No application source, behaviour, config or environment
changes.

Throughout, **"the two generated artifacts"** means exactly these two files, which
`npm run kms:build-index` writes together:

- `ARTIFACT_INDEX.md`
- `app/(admin)/staff/runbook/docs.ts`

**Base commit** for every "before" comparison below is the merge-base of this branch with
`origin/staging`, referred to as `BASE`. Resolve it once with `git merge-base HEAD origin/staging`.

**On issue closure.** Closing `#584` and `#546`, and commenting on `#724` and `#505`, are **Ship and
Document obligations, not Gate-3 requirements** — they need a PR identity that does not exist during
validation, and gating validation on them would make a passing slice unverifiable until after it
merges. What Gate 3 proves is that this slice **fully implements** the changes those issues require:
`R14` for `#546`, `R15` for `#724`'s overlap, `R16` for `#584`, `R13` for `#505`'s overlap. The
closure checklist lives in `plan.md`.

R1. `CLAUDE.md` is **14,000 characters or fewer**, measured by `wc -c`. Correctness takes priority
    over compression: no rule may be dropped, and no wording may be shortened into ambiguity, to
    reach this number. There is no minimum size.

    **Amended at `/fix` (2026-09-17), approved by the user.** The original ceiling was 10,000. Four
    compression passes reached 13,925 with every rule intact and every source-cited heading
    preserved (17,344 → 15,508 → 14,753 → 14,012 → 13,925, each pass yielding less) — Build assessed
    that as the honest floor and escalated the remaining gap rather than trimming a rule into
    ambiguity or reducing a heavily-cited section (Server Actions: 11 source citations) to a bare
    pointer. The user chose to accept ~13.9k over either alternative. 14,000 gives headroom above
    the achieved 13,925 rather than pinning the ceiling to today's exact byte count.

R2. `CLAUDE.md` contains **no `@`-prefixed import line** — no line matching `^@` and no inline
    `@path` reference used to pull another file's content into the session automatically. Every
    reference to another document is plain prose naming the file to read.

R3. Exactly **three** new documentation files exist, at exactly these paths, and no fourth new
    documentation file is added anywhere by this slice:
    - `docs/developer-portal/runtime-pitfalls.md`
    - `docs/developer-portal/app-conventions.md`
    - `docs/developer-portal/local-dev-playbook.md`

R4. `specs/2026-09-17-claude-md-guardrail-refactor/migration-ledger.md` exists and accounts for the
    pre-change file **by line, not by bullet**. Its columns are, in this order:
    `Ref | Lines | Section | Rule | Disposition | Destination | Heading | Verify phrase`.
    `Lines` is a `start-end` range of line numbers in `BASE:CLAUDE.md`. `Disposition` is exactly one
    of `KEEP`, `COMPRESS`, `MOVE` or `DELETE`. Rule-bearing content is recognised **regardless of its
    Markdown form** — top-level bullets, nested bullets, numbered items, left-margin prose
    paragraphs, table rows and headings all qualify; the bullet is not the unit.

R5. **Line coverage is total.** Every non-blank line of `BASE:CLAUDE.md` below the front-matter is
    claimed by exactly one ledger row's `Lines` range. The set difference between the file's
    non-blank body lines and the union of all ledger ranges is **empty**, verified by the command in
    `validation.md`. No line may be unaccounted for, and no line may be claimed twice.

R6. Every ledger row is honestly dispositioned, and no row is a stub:
    - Rows marked `MOVE` or `COMPRESS` name a destination file that exists and contains the rule's
      substance, proven by a literal `grep` for that row's own `Verify phrase`.
    - Rows marked `KEEP` name a heading that exists in the post-change `CLAUDE.md`.
    - Rows marked `DELETE` carry a classification of either `DUPLICATE` — naming the document and
      heading where the same rule is already stated — or `NARRATIVE` — naming the ledger `Ref` of
      the rule whose evidence, example or history it is. A `NARRATIVE` row may not be the only row
      covering a rule, and narrative content is never counted as a rule in its own right.

    No row may have an empty, unverified or self-referential destination.

R7. Every `CLAUDE.md` section name cited from source code still resolves to a real heading in
    `CLAUDE.md`. The cited names are extracted mechanically by the command in `validation.md`; for
    each extracted name, a heading exists in `CLAUDE.md` whose text contains that name's
    distinguishing word (for example `Server Actions`, `Repository layer`, `Staff panel`,
    `Database`, `Storage`, `Schema`, `Hooks`, `Design tokens`, `Config`, `Branch strategy`,
    `Dependency`, `Hard stops`).

R8. No application source, configuration or environment file is modified. `git diff --name-only
    BASE...HEAD` lists only files ending in `.md`, plus exactly `ARTIFACT_INDEX.md`,
    `app/(admin)/staff/runbook/docs.ts`, and any `.mjs` file added under this slice's own
    `specs/2026-09-17-claude-md-guardrail-refactor/` folder. In particular, no file under `lib/`,
    `app/` (other than the generated `app/(admin)/staff/runbook/docs.ts`), `features/`,
    `components/`, `tests/`, `scripts/`, `prisma/`, `.github/`, `.env`, `.dev.vars` or `secrets/` is
    modified.

    **Amended at `/fix` (2026-09-17), approved by the user.** `gen-ledger.mjs` and
    `verify-ledger.mjs` are the tooling `validation.md`'s R6 row asks for ("script it rather than
    eyeballing") and the only way to reproduce the R4–R6 completeness proof. Both live inside this
    slice's own spec folder, are imported by nothing outside it, and run only when invoked by hand —
    no application, configuration or environment behaviour is affected. The user chose to keep them
    over deleting them after Gate 3, since deletion would make the ledger unreproducible.

R9. Every documentation reference that pointed into a `CLAUDE.md` section this slice moved now names
    the destination document instead. After the change, no file under `docs/` or `specs/` (excluding
    this slice's own folder, which may describe the history) refers a reader to `CLAUDE.md` for
    material that `CLAUDE.md` no longer contains.

R10. The two circular references are broken in one direction only: `specs/architecture.md` §3.1 and
     `docs/business-analysis/gap-register.md` (GAP-011) each state the raw-SQL exception's scope
     themselves, or name a document other than `CLAUDE.md`, and neither defers to `CLAUDE.md` for
     it. `CLAUDE.md` may still point at `specs/architecture.md` §3.1; §3.1 must not point back.

R11. `CLAUDE.md` contains no claim that the project is at Milestone 0 or that features are blocked
     pending M0. It states the current phase as **P10**, records that M0 through P9 have shipped,
     and states that the platform has not yet traded, naming `#113` and `#104` as the open
     owner-gated blockers.

R12. `CLAUDE.md` states `@prisma/adapter-neon` as **7.9.1** everywhere it appears, and contains no
     occurrence of the string `adapter-neon@6.19.3`. It records the 6.x-client / 7.x-adapter
     straddle as deliberate and tracked by `#560`. The three pinned versions it quotes
     (`@neondatabase/serverless` 1.1.0, `@prisma/adapter-neon` 7.9.1, `@prisma/client` 6.19.3) match
     the `PINNED` literals in `tests/dependency-pins.test.ts`.

R13. `CLAUDE.md` retains the env-format rule as **no spaces around `=`, quoted values, comments on
     their own line**, and contains no claim that this repository's env files generally use the
     spaced form. It records that exactly two keys carry the spaced form, so a script that rewrites
     an env file must tolerate both spacings, and cross-references `#505`. (Implements `#505`'s
     `CLAUDE.md` overlap only; the env files themselves are out of scope.)

R14. `CLAUDE.md` contains no requirement that a PR carry `phase:` or `gate:` labels. The gate line
     requires the issue reference (`Closes #NN`) and the CHANGELOG entry only. (Implements the
     resolution `#546` asks for.)

R15. `CLAUDE.md` contains no claim that the delivery board holds status only. It records that the
     board carries a **Priority** field alongside Status and Phase. (Implements `#724`'s `CLAUDE.md`
     overlap only; the command and roadmap halves are out of scope.)

R16. No hardcoded vitest suite baseline (a file count and test count presented as the expected
     totals) appears in `CLAUDE.md` or in any of the three new documents. The forks-pool trap is
     still documented, with a detection procedure that needs no recorded number. (Implements the
     resolution `#584` asks for, by removal rather than relocation.)

R17. All three new documents carry valid KMS front-matter, and `npm run kms:validate` reports
     `invalid front-matter (failing): 0`. Each new document's `id` matches `^[a-z0-9-]+$`, and each
     `summary` is between 20 and 300 characters.

R18. `CLAUDE.md`'s front-matter keeps `id: claude-md`, and carries `version: "2.0.0"`,
     `updated: 2026-09-17`, and a `summary` between 20 and 300 characters that describes the file's
     reduced scope.

R19. Both generated artifacts — `ARTIFACT_INDEX.md` and `app/(admin)/staff/runbook/docs.ts` — are
     regenerated by `npm run kms:build-index` and committed, and `npm run kms:check-generated`
     exits 0. `ARTIFACT_INDEX.md` contains an entry for
     `specs/2026-09-17-claude-md-guardrail-refactor/plan.md` and for each of the three new
     documents.

R20. The internal docs site builds: `npm run kms:assemble:internal` followed by a real Next build in
     `kms/site-internal` exits 0. No prose added by this slice contains a bare `<` immediately
     followed by a digit or letter, or a bare curly-brace expression outside backticks.

R21. `CHANGELOG.md` is updated on the branch (Gate 4).

R22. `lint`, `typecheck`, `test` and `format:check` all remain green after this slice.
