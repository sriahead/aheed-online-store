import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUSINESS_CASE_PATH,
  auditBusinessCase,
  latestPhaseClosure,
  readBusinessCaseStatus,
} from "../scripts/sdd-business-case";

/**
 * `#777` — the stakeholder business case must be reviewed at every milestone close, and
 * `npm run sdd:audit` is what turns that from prose into an exit code.
 *
 * The pass/fail arithmetic is asserted against FIXTURE text, never the live `specs/roadmap.md`.
 * A test that read the real roadmap would change meaning every time a milestone closed, which is
 * the one property a regression test must not have. The single exception is the last block, which
 * reads the real files only to assert that they still PARSE — that is a format check, not an
 * arithmetic one, and it is what catches a future change to the change-log's shape.
 */

/** Row spellings taken verbatim from `specs/roadmap.md`, not invented for the test. */
const REAL_CLOSURE_ROWS = [
  "| 2026-08-06 | **Milestone 0 closed.** `/api/health` returns `db.ok: true` | Exit criteria met |",
  "| 2026-08-06 | **P0 closed** (backfilled retroactively). Foundation & scaffolding | Exit criteria met |",
  "| 2026-08-07 | **P2 closed.** Categories, product pages, images | Exit criteria met |",
  "| 2026-08-07 | **P2.5 closed.** Ratings & reviews and the storefront visual redesign | Exit criteria met |",
  "| 2026-09-05 | **P2.6 slice 6 promoted to production — catalogue filter facets, P2.6 CLOSED** | Promotion of #569 |",
];

const STATUS_BLOCK = [
  "| Field | Value |",
  "| --- | --- |",
  "| **Milestone assessed** | P9 — Production launch readiness (in progress) |",
  "| **Last reviewed** | 2026-09-16 |",
].join("\n");

describe("readBusinessCaseStatus", () => {
  it("reads both rows out of the status block", () => {
    const status = readBusinessCaseStatus(`# Business case\n\n${STATUS_BLOCK}\n\nBody.`);
    expect(status.lastReviewed).toBe("2026-09-16");
    expect(status.milestoneAssessed).toBe("P9 — Production launch readiness (in progress)");
  });

  it("returns null when the block is absent entirely", () => {
    expect(readBusinessCaseStatus("# Business case\n\nNo status block here.").lastReviewed).toBe(
      null,
    );
  });

  it("returns null for a malformed date rather than guessing", () => {
    // A typo that still looks date-shaped is the dangerous case: it must NOT parse into
    // something plausible, because a silently-disabled check is worse than an absent one.
    expect(readBusinessCaseStatus("| **Last reviewed** | 16-09-2026 |").lastReviewed).toBe(null);
  });

  it("requires the bold spelling — a plain cell does not match", () => {
    expect(readBusinessCaseStatus("| Last reviewed | 2026-09-16 |").lastReviewed).toBe(null);
  });

  it("reports a missing milestone row as null without failing the date read", () => {
    const status = readBusinessCaseStatus("| **Last reviewed** | 2026-09-16 |");
    expect(status.lastReviewed).toBe("2026-09-16");
    expect(status.milestoneAssessed).toBe(null);
  });
});

describe("latestPhaseClosure", () => {
  it.each(REAL_CLOSURE_ROWS)("recognises the real spelling: %s", (row) => {
    expect(latestPhaseClosure(row)).not.toBe(null);
  });

  it("returns the newest by date, not by file position", () => {
    // Backfilled rows are normal here — the P3a/P3b/P3c rows were written days late — so
    // trusting append order would be trusting a convention this repo has broken on purpose.
    const roadmap = [REAL_CLOSURE_ROWS[4], REAL_CLOSURE_ROWS[0]].join("\n");
    expect(latestPhaseClosure(roadmap)?.date).toBe("2026-09-05");
  });

  it("ignores a row that mentions a phase without closing it", () => {
    const row = "| 2026-09-10 | **P9.2 slice 3** shipped — delivery areas widened | Progress |";
    expect(latestPhaseClosure(row)).toBe(null);
  });

  /**
   * Narrative prose taken verbatim from `specs/roadmap.md`. A first version of the matcher
   * allowed any 80 characters between the phase name and the verb, and every one of these
   * matched — inventing closure events out of ordinary sentences and, in the live run, reporting
   * a phase closure on 2026-09-15 that never happened. Adjacency is what fixed it.
   */
  it.each([
    "| 2026-08-28 | Launch work moved to P10, two closed as historical | Restructure |",
    "| 2026-08-28 | Redistributed to P9 and P10 (#426), milestone closed | Restructure |",
    "| 2026-08-29 | Post-launch items moved to P10 and their milestones closed | Bookkeeping |",
  ])("does not invent a closure out of narrative prose: %s", (row) => {
    expect(latestPhaseClosure(row)).toBe(null);
  });

  it("does not treat a negated statement as a closure", () => {
    // The em-dash title segment is lazy, so without the negation guard it swallows "... is not"
    // and leaves "closed" to match.
    const row = "| 2026-09-10 | **P9.2 — Production infrastructure** is not closed | Progress |";
    expect(latestPhaseClosure(row)).toBe(null);
  });

  it("ignores prose outside the change-log table", () => {
    // The phase list carries `**P8 — Deployment & launch. CLOSED 2026-08-28**` as prose; treating
    // it as an event would make every run report the same historical milestone forever.
    const prose = "- **P8 — Deployment & launch. CLOSED 2026-08-28 — historical record only.**";
    expect(latestPhaseClosure(prose)).toBe(null);
  });

  it("returns null when the change log holds no closure at all", () => {
    const roadmap = "| 2026-09-14 | Shared fulfilment state shipped | Progress |";
    expect(latestPhaseClosure(roadmap)).toBe(null);
  });
});

describe("auditBusinessCase", () => {
  const roadmap = REAL_CLOSURE_ROWS.join("\n"); // newest closure: 2026-09-05

  it("passes when the review is newer than the newest closure", () => {
    const verdict = auditBusinessCase(STATUS_BLOCK, roadmap);
    expect(verdict.kind).toBe("ok");
  });

  it("passes when the review lands on the SAME day as the closure", () => {
    // The milestone-close sequence writes the roadmap row and performs the review within one
    // close. Demanding a strictly later date would make a correctly-followed close unsatisfiable.
    const sameDay = "| **Last reviewed** | 2026-09-05 |";
    expect(auditBusinessCase(sameDay, roadmap).kind).toBe("ok");
  });

  it("reports stale when a milestone closed after the last review", () => {
    const old = "| **Last reviewed** | 2026-08-20 |";
    const verdict = auditBusinessCase(old, roadmap);
    expect(verdict.kind).toBe("stale");
    if (verdict.kind === "stale") {
      expect(verdict.lastReviewed).toBe("2026-08-20");
      expect(verdict.closure.date).toBe("2026-09-05");
    }
  });

  it("reports missing when the file does not exist", () => {
    expect(auditBusinessCase(null, roadmap).kind).toBe("missing");
  });

  it("reports unparseable when the marker is malformed", () => {
    expect(auditBusinessCase("# Business case\n\nNo marker.", roadmap).kind).toBe("unparseable");
  });

  it("passes when the roadmap records no closure yet", () => {
    expect(
      auditBusinessCase(STATUS_BLOCK, "| 2026-09-14 | Something shipped | Progress |").kind,
    ).toBe("ok");
  });
});

describe("the real files still parse", () => {
  // Format check only — deliberately asserts nothing about which date is newer, so this block
  // does not change meaning when a milestone closes.
  const root = join(__dirname, "..");

  it("the live roadmap yields a parseable phase closure", () => {
    const roadmap = readFileSync(join(root, "specs", "roadmap.md"), "utf8");
    expect(latestPhaseClosure(roadmap)?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("the live business case yields a parseable status block", () => {
    const text = readFileSync(join(root, BUSINESS_CASE_PATH), "utf8");
    const status = readBusinessCaseStatus(text);
    expect(status.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(status.milestoneAssessed).toBeTruthy();
  });
});
