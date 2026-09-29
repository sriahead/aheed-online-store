/**
 * Branch hygiene CLI (#935).
 *
 *   npm run branches:count                 Local/origin branch counts; an ACTION: line at 30+.
 *                                          Read-only, always exits 0 — /orient runs it.
 *   npm run branches:prune                 Dry run: KEEP / DELETE / REVIEW. Deletes nothing.
 *   npm run branches:prune -- --apply      Delete the DELETE list, origin then local.
 *   npm run branches:prune -- --keep <N>   Keep N newest names instead of 12.
 *
 * The rule itself lives in scripts/branch-hygiene.ts. Runs against the git repo in the
 * current directory (not ROOT), so the integration test can point it at a throwaway repo.
 * BRANCH_HYGIENE_OPEN_PRS (a JSON array of {number, headRefName}) replaces the gh call —
 * for tests only. `prune` also reads `git worktree list --porcelain` (#939): a local branch
 * checked out in a worktree is listed under REVIEW rather than deleted, because git refuses
 * `branch -D` for it.
 */
import { execFileSync } from "node:child_process";
import {
  DEFAULT_KEEP,
  REMINDER_THRESHOLD,
  countVerdict,
  planPrune,
  type BranchCopy,
} from "./branch-hygiene";

const DELETE_BATCH = 50;

function run(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function tryRun(cmd: string, args: string[]): string | null {
  try {
    return run(cmd, args);
  } catch {
    return null;
  }
}

function lines(out: string | null): string[] {
  return out ? out.split("\n").filter(Boolean) : [];
}

interface RefRow {
  location: "local" | "origin";
  name: string;
  refname: string;
  date: Date;
}

function readRefs(): RefRow[] {
  const out = run("git", [
    "for-each-ref",
    "--format=%(refname)%09%(committerdate:iso-strict)",
    "refs/heads",
    "refs/remotes/origin",
  ]);
  const rows: RefRow[] = [];
  for (const line of lines(out)) {
    const [refname, date] = line.split("\t");
    if (refname === "refs/remotes/origin/HEAD") continue;
    if (refname.startsWith("refs/heads/")) {
      rows.push({ location: "local", name: refname.slice(11), refname, date: new Date(date) });
    } else {
      const name = refname.slice("refs/remotes/origin/".length);
      rows.push({ location: "origin", name, refname, date: new Date(date) });
    }
  }
  return rows;
}

/** Refnames whose tip is an ancestor of origin/staging or origin/main. */
function mergedRefnames(): Set<string> {
  const merged = new Set<string>();
  for (const base of ["origin/staging", "origin/main"]) {
    if (!tryRun("git", ["rev-parse", "--verify", "--quiet", base])) continue;
    const out = run("git", [
      "for-each-ref",
      `--merged=${base}`,
      "--format=%(refname)",
      "refs/heads",
      "refs/remotes/origin",
    ]);
    for (const ref of lines(out)) merged.add(ref);
  }
  return merged;
}

function openPrHeads(): Map<string, number> {
  const override = process.env.BRANCH_HYGIENE_OPEN_PRS;
  const raw =
    override ??
    run("gh", ["pr", "list", "--state", "open", "--limit", "500", "--json", "number,headRefName"]);
  const prs = JSON.parse(raw) as { number: number; headRefName: string }[];
  return new Map(prs.map((p) => [p.headRefName, p.number]));
}

/**
 * Branch name → worktree path, from `git worktree list --porcelain` (#939). Each worktree is a
 * block whose first line is `worktree <path>`; a detached or bare block has no `branch` line.
 * Throws if git fails, so `prune` never plans without it.
 */
function worktreeBranches(): Map<string, string> {
  const out = run("git", ["worktree", "list", "--porcelain"]);
  const map = new Map<string, string>();
  let path: string | null = null;
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) path = line.slice("worktree ".length);
    else if (line.startsWith("branch refs/heads/") && path !== null) {
      map.set(line.slice("branch refs/heads/".length), path);
    }
  }
  return map;
}

function fetchPrune(): boolean {
  return tryRun("git", ["fetch", "--prune", "--quiet", "origin"]) !== null;
}

function counts(): { local: number; origin: number } {
  const refs = readRefs();
  return {
    local: refs.filter((r) => r.location === "local").length,
    origin: refs.filter((r) => r.location === "origin").length,
  };
}

function label(copy: BranchCopy): string {
  return copy.location === "local" ? `local ${copy.name}` : `origin/${copy.name}`;
}

function count(): void {
  if (!fetchPrune()) console.log("git fetch failed — offline, counting cached refs.");
  const { local, origin } = counts();
  console.log(`Branches: local ${local}, origin ${origin} (reminder at ${REMINDER_THRESHOLD})`);
  if (countVerdict(local, origin, REMINDER_THRESHOLD).due) {
    console.log(
      `ACTION: branch count is ${REMINDER_THRESHOLD} or more — run /prune-branches to clean up.`,
    );
  }
}

function parseKeep(args: string[]): number {
  const i = args.indexOf("--keep");
  if (i === -1) return DEFAULT_KEEP;
  const value = args[i + 1];
  if (!value || !/^[1-9]\d*$/.test(value)) {
    throw new Error(`--keep needs a positive integer, got "${value ?? ""}".`);
  }
  return Number(value);
}

function prune(args: string[]): number {
  const apply = args.includes("--apply");
  const keep = parseKeep(args);

  if (!fetchPrune()) {
    console.error("git fetch --prune origin failed — refusing to plan against stale refs.");
    return 1;
  }

  let openPrs: Map<string, number>;
  try {
    openPrs = openPrHeads();
  } catch (err) {
    console.error(
      "Could not list open PRs with `gh pr list` — nothing deleted. A merged branch can only be" +
        " deleted once it is proven to have no open PR. Check `gh auth status` (in the Bash tool," +
        " prefix GH_TOKEN=$(gh auth token -u sriahead)).",
    );
    console.error(String(err instanceof Error ? err.message : err));
    return 1;
  }

  let worktrees: Map<string, string>;
  try {
    worktrees = worktreeBranches();
  } catch (err) {
    console.error(
      "`git worktree list --porcelain` failed — nothing deleted. Without it a branch checked out" +
        " in another worktree could land on the DELETE list, and git would refuse the delete.",
    );
    console.error(String(err instanceof Error ? err.message : err));
    return 1;
  }

  const merged = mergedRefnames();
  const copies: BranchCopy[] = readRefs().map((r) => ({
    name: r.name,
    location: r.location,
    date: r.date,
    merged: merged.has(r.refname),
  }));
  const current = tryRun("git", ["symbolic-ref", "--short", "-q", "HEAD"]) || null;
  const plan = planPrune(copies, openPrs, current, keep, worktrees);

  console.log(`KEEP (${plan.keep.length})`);
  for (const c of plan.keep) console.log(`  ${label(c)}`);
  console.log(`\nDELETE (${plan.delete.length})`);
  for (const c of plan.delete) console.log(`  ${label(c)}`);
  console.log(`\nREVIEW (${plan.review.length})`);
  for (const r of plan.review) {
    console.log(`  ${label(r.copy)}  ${r.nameDate.toISOString().slice(0, 10)}  ${r.reason}`);
  }
  console.log("");

  if (!apply) {
    console.log("Dry run — nothing deleted. Re-run with --apply to delete the DELETE list.");
    return 0;
  }

  let failed = 0;
  const originNames = plan.delete.filter((c) => c.location === "origin").map((c) => c.name);
  for (let i = 0; i < originNames.length; i += DELETE_BATCH) {
    const batch = originNames.slice(i, i + DELETE_BATCH);
    try {
      run("git", ["push", "origin", "--delete", ...batch]);
    } catch (err) {
      failed++;
      console.error(`git push origin --delete failed for: ${batch.join(" ")}`);
      console.error(String(err instanceof Error ? err.message : err));
    }
  }
  const localNames = plan.delete.filter((c) => c.location === "local").map((c) => c.name);
  if (localNames.length > 0) {
    try {
      run("git", ["branch", "-D", ...localNames]);
    } catch (err) {
      failed++;
      console.error(`git branch -D failed for: ${localNames.join(" ")}`);
      console.error(String(err instanceof Error ? err.message : err));
    }
  }

  const after = counts();
  console.log(`Deleted. Branches now: local ${after.local}, origin ${after.origin}`);
  return failed > 0 ? 1 : 0;
}

function main(): number {
  const [sub, ...args] = process.argv.slice(2);
  if (sub === "count") {
    // A reminder must never fail /orient — report and exit 0 whatever happens.
    try {
      count();
    } catch (err) {
      console.log(`Branch count unavailable: ${err instanceof Error ? err.message : err}`);
    }
    return 0;
  }
  if (sub === "prune") {
    try {
      return prune(args);
    } catch (err) {
      console.error(String(err instanceof Error ? err.message : err));
      return 1;
    }
  }
  console.error("Usage: tsx scripts/prune-branches.ts <count|prune> [--apply] [--keep N]");
  return 1;
}

process.exitCode = main();
