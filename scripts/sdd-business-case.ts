/**
 * Business-case staleness auditing for `npm run sdd:audit` (#777).
 *
 * `docs/business-analysis/business-case.md` is the stakeholder-facing account of what this
 * platform is worth commercially. Unlike every other document in the KMS it makes claims that
 * decay on a schedule nobody controls: a capability gets descoped, a vendor moves its pricing,
 * a milestone closes and changes what "current" means. The artifact is therefore required to be
 * reviewed at every milestone close (`specs/sdd-workflow.md`, Milestone close).
 *
 * That requirement is the kind this repository has repeatedly failed to keep as prose. `CLAUDE.md`
 * records a ruling that sat deferred behind a question another document had already answered, and
 * four separate docstrings asserting a property the code did not have. So the requirement gets an
 * exit code, attached to `sdd:audit` — the one check in the loop that runs *after* Ship, which is
 * exactly why the promotion audit (#207) lives there too.
 *
 * The matcher lives here rather than in `scripts/sdd-check.ts` for the same reason
 * `scripts/sdd-promotions.ts` does: that file is a CLI entry point calling `process.exit()` at
 * module scope, so importing it from a test would terminate the test run. Keeping the decision
 * logic pure and importable is what lets the stale case be proven against fixture text instead of
 * by mutating a tracked file.
 */

/** Repo-relative path of the artifact this module audits. */
export const BUSINESS_CASE_PATH = "docs/business-analysis/business-case.md";

/**
 * The document's own status block, which is deliberately human-visible rather than an HTML
 * comment: `#777` requires a reader to see which milestone an assessment represents without
 * having to trust a machine. The check reads the same row the reader does, so the two cannot
 * disagree.
 *
 *   | **Last reviewed** | 2026-09-16 |
 *
 * Leading `**` is required. A plain `| Last reviewed | ... |` does not match, which is
 * deliberate: the spelling is part of the contract, and a near-miss must fail loudly rather
 * than parse into something plausible.
 */
const LAST_REVIEWED_ROW = /^\|\s*\*\*Last reviewed\*\*\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|/m;

/** The companion row, reported back so a passing run names what was actually assessed. */
const MILESTONE_ROW = /^\|\s*\*\*Milestone assessed\*\*\s*\|\s*([^|]+?)\s*\|/m;

/**
 * A `specs/roadmap.md` change-log row: `| YYYY-MM-DD | Change | Reason |`.
 *
 * Only change-log rows are considered. The phase list further up the same file carries
 * `**P8 — Deployment & launch. CLOSED 2026-08-28**` in prose, and treating that as a closure
 * event would make every run report the same historical milestone forever.
 */
const CHANGE_LOG_ROW = /^\|\s*(\d{4}-\d{2}-\d{2})\s*\|/;

/**
 * What a phase closure looks like in a change-log row, across the spellings actually used:
 *
 *   **Milestone 0 closed.**
 *   **P0 closed**            **P2 closed.**            **P2.5 closed.**
 *   ... catalogue filter facets, P2.6 CLOSED**
 *   **P2.6 — Search & AI shopping is now CLOSED**
 *
 * The phase name must be ADJACENT to the verb — optionally separated by an em-dash-delimited
 * phase title, which is the only separator any real row uses. A first attempt allowed any 80
 * characters between the two and matched ordinary prose in droves: `P10, two closed`,
 * `P10 (#426), milestone closed`, `P10 and their milestones closed` are all narrative, not
 * closure events, and every one of them matched. Requiring adjacency is what distinguishes a
 * row announcing its own closure from a row mentioning a phase and, separately, the word.
 *
 * Also deliberately requires the phase BEFORE the verb: `closed P8 and redistributed its 39
 * open issues` describes an action taken on another phase inside this row, not this row's event.
 */
const PHASE_CLOSURE =
  /\b(?:Milestone\s+\d+|P\d+(?:\.\d+)?)(?:\s+—\s+[^|*]{0,60}?)?\s+(?:is\s+now\s+)?(?:closed|CLOSED)\b/;

/**
 * Negation guard, applied to the whole row after `PHASE_CLOSURE` matches.
 *
 * The em-dash title segment above is lazy, so it can swallow `... is not` and leave `closed` to
 * match — turning `P9.2 — Production infrastructure is not closed` into a closure event. The
 * failure direction matters here: a false POSITIVE merely asks for a review that is not due,
 * while a false NEGATIVE silently stops the check firing at all, which is the outcome this whole
 * module exists to prevent. So the guard is deliberately narrow — `not`/`never` immediately
 * before the verb — rather than anything that might reject a genuine closure row.
 */
const NEGATED_CLOSURE = /\b(?:not|never)\s+(?:yet\s+)?(?:closed|CLOSED)\b/;

export type BusinessCaseStatus = {
  /** ISO date from the `Last reviewed` row, or null when absent or malformed. */
  lastReviewed: string | null;
  /** Free text from the `Milestone assessed` row, or null. Reported, never compared. */
  milestoneAssessed: string | null;
};

/**
 * Read the status block out of the business case's raw text.
 *
 * Returns nulls rather than throwing: a missing file and a malformed marker are both gaps the
 * caller reports, and neither should crash an audit that still has promotions to check.
 */
export function readBusinessCaseStatus(text: string): BusinessCaseStatus {
  return {
    lastReviewed: LAST_REVIEWED_ROW.exec(text)?.[1] ?? null,
    milestoneAssessed: MILESTONE_ROW.exec(text)?.[1]?.trim() ?? null,
  };
}

export type PhaseClosure = {
  date: string;
  /** The row's full text, so a report can quote what closed rather than only when. */
  row: string;
};

/**
 * The newest phase-closure row in `specs/roadmap.md`'s change log, or null if there is none.
 *
 * "Newest" is by the row's own date, not by file order. Rows are appended chronologically today,
 * but a backfilled row is normal here — the P3a/P3b/P3c rows were written days late — so relying
 * on position would be relying on a convention this repository has already broken on purpose.
 */
export function latestPhaseClosure(roadmapText: string): PhaseClosure | null {
  let newest: PhaseClosure | null = null;
  for (const line of roadmapText.split("\n")) {
    const dated = CHANGE_LOG_ROW.exec(line);
    if (!dated) continue;
    if (!PHASE_CLOSURE.test(line) || NEGATED_CLOSURE.test(line)) continue;
    if (!newest || dated[1] > newest.date) newest = { date: dated[1], row: line.trim() };
  }
  return newest;
}

export type BusinessCaseVerdict =
  | {
      kind: "ok";
      lastReviewed: string;
      milestoneAssessed: string | null;
      closureDate: string | null;
    }
  | { kind: "missing" }
  | { kind: "unparseable" }
  | { kind: "stale"; lastReviewed: string; closure: PhaseClosure };

/**
 * Decide whether the business case is due for review.
 *
 * `text` is null when the file does not exist. A closure on the SAME day as the review passes:
 * the milestone-close sequence writes the roadmap row and performs the review within one close,
 * and demanding a strictly later date would make a correctly-followed close impossible to satisfy.
 */
export function auditBusinessCase(text: string | null, roadmapText: string): BusinessCaseVerdict {
  if (text === null) return { kind: "missing" };
  const status = readBusinessCaseStatus(text);
  if (!status.lastReviewed) return { kind: "unparseable" };

  const closure = latestPhaseClosure(roadmapText);
  if (closure && closure.date > status.lastReviewed) {
    return { kind: "stale", lastReviewed: status.lastReviewed, closure };
  }
  return {
    kind: "ok",
    lastReviewed: status.lastReviewed,
    milestoneAssessed: status.milestoneAssessed,
    closureDate: closure?.date ?? null,
  };
}
