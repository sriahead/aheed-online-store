# Living stakeholder business case as a milestone-reviewed KMS artifact (requirements / acceptance criteria)

Closes `#777`.

Three deliverables: a KMS artifact, a process step that owns its review, and a machine check that
makes the process step something other than an honour system.

## The artifact

R1. `docs/business-analysis/business-case.md` exists and carries front-matter that
    `npm run kms:validate` accepts: `id: business-case`, `audience: [product, platform-admin]`,
    `type: doc`, `status: approved`, `visibility: internal`, a `version`, an `updated` ISO date, a
    `summary` between 20 and 300 characters, and `tags`.

R2. The document carries a status block near the top, before any narrative, as a two-column table
    containing exactly these two rows in this spelling:

    ```
    | **Milestone assessed** | <milestone name and state> |
    | **Last reviewed** | <YYYY-MM-DD> |
    ```

    `Last reviewed` is the field the machine check reads. A reader can see which milestone the
    assessment represents without scrolling, satisfying `#777`'s "milestone status must be part of
    the document".

R3. The document covers all twelve areas `#777` names: executive pitch and value proposition;
    implemented capabilities and their business value; comparison with Shopify for this business
    model; current and potential cost savings; current and projected operating costs with
    assumptions; revenue and monetisation including multi-vendor/SaaS; planned features and their
    expected impact; the day-to-day operating model; acquisition, marketing, retention and growth;
    limitations, risks and required investment; the 12–24 month commercial opportunity; and a
    closing stakeholder summary.

R4. Every capability claim carries exactly one of **IMPLEMENTED**, **IN PROGRESS** or **PLANNED**,
    and cites at least one of: a repository path, a Prisma model name, a route, an issue number or a
    PR number. A capability with no citation is not listed.

R5. The document states plainly, in the executive section rather than a footnote, that the store is
    **not yet trading**: production runs Stripe **test-mode** keys (`#113`, open) and Resend has no
    verified sending domain (`#104`, open), so no customer payment or customer email has occurred.
    No figure anywhere in the document is presented as realised revenue or realised saving.

R6. Every external commercial figure (Shopify plan pricing, Shopify Payments and third-party
    transaction rates, Stripe rates, Cloudflare Workers and R2 pricing, Neon pricing, Resend
    pricing, the GBP/USD rate) carries its source and the retrieval date `2026-09-16`.

R7. Every derived or projected number is labelled `ESTIMATE` and states the assumption it rests on
    at the point of use — order volume, basket value, request volume or storage — not in a general
    caveat elsewhere.

R8. The document ends with an append-only **Milestone revision history** section, newest first, and
    contains its first entry for this milestone. Each entry names the milestone assessed, what
    materially changed since the previous assessment, and what was **withdrawn or corrected**. The
    first entry states that it is the baseline and that no prior conclusions existed.

R9. After `npm run kms:build-index`, the document appears in `ARTIFACT_INDEX.md` under
    **Track 1 — Internal / Engineering** (`trackFor()` maps `product`/`platform-admin` to
    `internal-eng`) and in `app/(admin)/staff/runbook/docs.ts` with
    `audience: ["product","platform-admin"]`.

R10. The document is MDX-safe per `CLAUDE.md`'s KMS section: no bare `<` immediately followed by a
     digit, and no unbackticked `{...}` in prose. `npm run kms:assemble:internal` followed by a
     `kms/site-internal` build succeeds.

## The process step

R11. `specs/sdd-workflow.md`'s **Milestone close (Discover, then Learn)** section gains a business
     case review step positioned **after `/learn`** and before the front-matter bump, model switch
     and `/clear`, with its placement justified in the text (Learn establishes what shipped and
     which assumptions held; the business case consumes that rather than re-deriving it).

R12. The same requirement is stated in `.claude/commands/document.md` (its milestone-close step) and
     `.claude/commands/learn.md` (its closing instruction), so no single file is the only place the
     rule exists.

R13. The milestone-close section states explicitly that `npm run sdd:audit` will report the business
     case as due from the moment the roadmap closure row is written until the review lands, that
     this is the check working rather than a fault, and that the close is not finished until
     `sdd:audit` exits 0 again.

R14. `specs/sdd-workflow.md`'s front-matter `version` and `updated` are bumped.

R15. No change to the four SDD gates. The review is part of milestone close, which is explicitly not
     a gate.

## The machine check

R16. `scripts/sdd-check.ts` exports a pure function that extracts the last-reviewed date from the
     business case's text, returning `null` when the marker is absent or malformed.

R17. `scripts/sdd-check.ts` exports a pure function that, given `specs/roadmap.md`'s text, returns
     the date of the newest **phase-closure** row in the change log. A row qualifies when it is a
     change-log table row (begins `| YYYY-MM-DD |`) whose text matches a phase closure — `P<n>` or
     `P<n>.<m>` or `Milestone <n>` followed by `closed`/`CLOSED`, optionally via `is now`.

R18. `audit()` reports a documentation gap when the newest phase-closure date is **later than** the
     business case's last-reviewed date, naming both dates and the milestone row, and instructing
     the reader to run the milestone-close review.

R19. `audit()` reports a gap when `docs/business-analysis/business-case.md` is missing, or when its
     marker cannot be parsed. A typo in the marker must not silently disable the check.

R20. `audit()` passes when the last-reviewed date is on or after the newest closure date, printing a
     confirming line naming the milestone assessed so a reader can see the check actually ran.

R21. The check is additive to `audit()` only. `preclear()` is unchanged, and `npm run sdd:preclear`
     behaves exactly as before.

R22. `tests/business-case-review.test.ts` covers: marker present and parsed; marker absent; marker
     malformed; closure-row detection across the real spellings used in `specs/roadmap.md`
     (`**Milestone 0 closed.**`, `**P0 closed**`, `**P2.5 closed.**`, `P2.6 CLOSED`); a row
     mentioning a phase without closing it is not treated as a closure; review newer than closure
     passes; review older than closure fails.

R23. The test uses fixture strings, not the live `specs/roadmap.md`, for the pass/fail arithmetic —
     a test asserting against the live roadmap would change meaning every time a milestone closes.
     One test may additionally assert that the **real** roadmap yields a parseable closure date, so
     a future change to the change-log format is caught rather than silently returning `null`.

## Non-goals

- No public-facing variant of the document.
- No cost instrumentation, dashboard or actual-spend collection.
- No change to `lib/runbook-audiences.ts` — `platform-admin` is already an admitted audience with a
  label, so the document reaches `/staff/runbook` with no code change.
