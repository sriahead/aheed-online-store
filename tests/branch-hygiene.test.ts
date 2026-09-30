import { describe, expect, it } from "vitest";
import { countVerdict, planPrune, type BranchCopy, type PrunePlan } from "@/scripts/branch-hygiene";

/**
 * #935 — the branch-prune rule, against fixture copies. The CLI half is exercised against a
 * throwaway repo in tests/prune-branches.integration.test.ts; nothing here touches git.
 */

const day = (d: number) => new Date(Date.UTC(2026, 8, d));
const copy = (
  name: string,
  date: Date,
  merged = true,
  location: BranchCopy["location"] = "origin",
): BranchCopy => ({ name, location, date, merged });
const noPrs = new Map<string, number>();

const names = (list: BranchCopy[]) => list.map((c) => `${c.location}:${c.name}`).sort();
const allCopies = (plan: PrunePlan) => [
  ...plan.keep,
  ...plan.delete,
  ...plan.review.map((r) => r.copy),
];

describe("planPrune", () => {
  it("(a) keeps exactly `keep` names, newest first, ties broken by name", () => {
    const copies = [
      copy("old", day(1)),
      copy("newest", day(9)),
      copy("tie-b", day(5)),
      copy("tie-a", day(5)),
      copy("mid", day(3)),
    ];
    const plan = planPrune(copies, noPrs, null, 3);
    expect(names(plan.keep)).toEqual(["origin:newest", "origin:tie-a", "origin:tie-b"]);
    expect(names(plan.delete)).toEqual(["origin:mid", "origin:old"]);
  });

  it("(b) main, staging and the current branch stay kept and do not use up `keep`", () => {
    const copies = [
      copy("main", day(1)),
      copy("staging", day(1)),
      copy("current", day(1), false, "local"),
      copy("current", day(1), false, "origin"),
      copy("recent", day(9)),
      copy("older", day(5)),
    ];
    const plan = planPrune(copies, noPrs, "current", 1);
    expect(names(plan.keep)).toEqual([
      "local:current",
      "origin:current",
      "origin:main",
      "origin:recent",
      "origin:staging",
    ]);
    expect(names(plan.delete)).toEqual(["origin:older"]);
  });

  it("(c) deletes a merged copy with no open PR", () => {
    const plan = planPrune([copy("done", day(1))], noPrs, null, 0);
    expect(names(plan.delete)).toEqual(["origin:done"]);
    expect(plan.review).toEqual([]);
  });

  it("(d) lists an unmerged copy for review as `not merged`", () => {
    const plan = planPrune([copy("wip", day(1), false)], noPrs, null, 0);
    expect(plan.delete).toEqual([]);
    expect(plan.review.map((r) => r.reason)).toEqual(["not merged"]);
  });

  it("(e) lists a merged copy that heads an open PR for review as `open PR #N`", () => {
    const plan = planPrune([copy("pr-head", day(1))], new Map([["pr-head", 725]]), null, 0);
    expect(plan.delete).toEqual([]);
    expect(plan.review.map((r) => r.reason)).toEqual(["open PR #725"]);
  });

  it("(f) judges local and origin copies of one name separately", () => {
    const copies = [copy("split", day(2), false, "local"), copy("split", day(1), true, "origin")];
    const plan = planPrune(copies, noPrs, null, 0);
    expect(names(plan.delete)).toEqual(["origin:split"]);
    expect(plan.review).toHaveLength(1);
    expect(plan.review[0].copy.location).toBe("local");
    expect(plan.review[0].reason).toBe("not merged");
    // The name date is the newer of the two copies.
    expect(plan.review[0].nameDate).toEqual(day(2));
  });

  it("(h) #939: lists a worktree's local copy for review; its origin copy is still deleted", () => {
    const copies = [copy("wt", day(1), true, "local"), copy("wt", day(1), true, "origin")];
    const worktrees = new Map([["wt", "C:/repo/.claude/worktrees/wt"]]);
    const plan = planPrune(copies, noPrs, null, 0, worktrees);
    expect(names(plan.delete)).toEqual(["origin:wt"]);
    expect(plan.review).toHaveLength(1);
    expect(plan.review[0].copy.location).toBe("local");
    expect(plan.review[0].reason).toBe("checked out in worktree C:/repo/.claude/worktrees/wt");
    // Without the worktree map, both copies are deleted as before #939.
    expect(names(planPrune(copies, noPrs, null, 0).delete)).toEqual(["local:wt", "origin:wt"]);
  });

  it("places every input copy in exactly one list", () => {
    const copies = [
      copy("main", day(1)),
      copy("a", day(8)),
      copy("b", day(7), false),
      copy("c", day(6), true, "local"),
      copy("c", day(6)),
      copy("d", day(5)),
    ];
    const plan = planPrune(copies, new Map([["d", 9]]), "a", 1);
    expect(names(allCopies(plan))).toEqual(names(copies));
  });
});

describe("countVerdict", () => {
  it("(g) is due exactly when either count reaches the threshold", () => {
    expect(countVerdict(29, 29, 30).due).toBe(false);
    expect(countVerdict(30, 0, 30).due).toBe(true);
    expect(countVerdict(0, 30, 30).due).toBe(true);
  });
});
