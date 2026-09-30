/**
 * Branch hygiene planner (#935) — pure, no I/O. `scripts/prune-branches.ts` reads git/gh
 * and feeds this; the tests feed it fixtures.
 *
 * The rule: keep the `keep` newest branch NAMES (a name's date is the newer of its local
 * and origin copies), plus main, staging and the checked-out branch, which don't count
 * towards `keep`. Every other copy is judged on its own — a local copy can carry commits
 * its origin copy doesn't — and is deleted only when it is merged and its name is not
 * the head of an open PR. Everything else is listed for a human to decide.
 *
 * (#939) A local copy that would be deleted but is checked out in a worktree goes to REVIEW
 * instead: git refuses `branch -D` for it, and it is plausibly work in progress. Its origin
 * copy is judged normally — deleting a remote ref never touches a worktree.
 */

export type Location = "local" | "origin";

export interface BranchCopy {
  name: string;
  location: Location;
  /** Committer date of the copy's tip. */
  date: Date;
  /** Tip is an ancestor of origin/staging or origin/main. */
  merged: boolean;
}

export interface ReviewEntry {
  copy: BranchCopy;
  /** The newest date among the name's copies. */
  nameDate: Date;
  reason: string;
}

export interface PrunePlan {
  keep: BranchCopy[];
  delete: BranchCopy[];
  review: ReviewEntry[];
}

export const PROTECTED_NAMES: readonly string[] = ["main", "staging"];
export const DEFAULT_KEEP = 12;
export const REMINDER_THRESHOLD = 30;

export function planPrune(
  copies: readonly BranchCopy[],
  openPrs: ReadonlyMap<string, number>,
  currentBranch: string | null,
  keep: number,
  /** Branch name → path of the worktree it is checked out in. */
  worktrees: ReadonlyMap<string, string> = new Map(),
): PrunePlan {
  const nameDates = new Map<string, Date>();
  for (const c of copies) {
    const seen = nameDates.get(c.name);
    if (!seen || c.date > seen) nameDates.set(c.name, c.date);
  }

  const protectedNames = new Set(PROTECTED_NAMES);
  if (currentBranch) protectedNames.add(currentBranch);

  const ranked = [...nameDates.entries()]
    .filter(([name]) => !protectedNames.has(name))
    .sort(([a, da], [b, db]) => db.getTime() - da.getTime() || (a < b ? -1 : a > b ? 1 : 0))
    .map(([name]) => name);
  const kept = new Set([...protectedNames, ...ranked.slice(0, keep)]);

  const plan: PrunePlan = { keep: [], delete: [], review: [] };
  for (const copy of copies) {
    if (kept.has(copy.name)) {
      plan.keep.push(copy);
      continue;
    }
    const pr = openPrs.get(copy.name);
    if (copy.merged && pr === undefined) {
      const worktree = copy.location === "local" ? worktrees.get(copy.name) : undefined;
      if (worktree === undefined) {
        plan.delete.push(copy);
      } else {
        plan.review.push({
          copy,
          nameDate: nameDates.get(copy.name)!,
          reason: `checked out in worktree ${worktree}`,
        });
      }
      continue;
    }
    plan.review.push({
      copy,
      nameDate: nameDates.get(copy.name)!,
      reason: pr !== undefined ? `open PR #${pr}` : "not merged",
    });
  }
  return plan;
}

export function countVerdict(
  localCount: number,
  originCount: number,
  threshold: number,
): { due: boolean } {
  return { due: localCount >= threshold || originCount >= threshold };
}
