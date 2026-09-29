import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * #935 — the prune CLI against a throwaway repo with a bare origin. This is the only place
 * `--apply` runs: validation must never delete the real repo's branches.
 *
 * Branches (committer dates fixed with GIT_COMMITTER_DATE):
 *   merged-old  (09-02)  merged into staging            → deleted, local + origin
 *   merged-old2 (09-03)  merged into staging            → deleted, local + origin
 *   unmerged    (09-04)  never merged                   → REVIEW, survives
 *   pr-head     (09-05)  merged, but heads an open PR   → REVIEW, survives
 *   new-1/new-2 (09-08/09) merged, newest two           → kept with --keep 2
 */

const REPO_ROOT = join(__dirname, "..");
const TSX_CLI = join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const SCRIPT = join(REPO_ROOT, "scripts", "prune-branches.ts");
const OPEN_PRS = JSON.stringify([{ number: 7, headRefName: "pr-head" }]);

let base: string;
let origin: string;
let work: string;

function git(cwd: string, args: string[], date?: string): string {
  const env = { ...process.env };
  if (date) {
    env.GIT_COMMITTER_DATE = date;
    env.GIT_AUTHOR_DATE = date;
  }
  return execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: "pipe" }).trim();
}

function cli(args: string[]): string {
  return execFileSync(process.execPath, [TSX_CLI, SCRIPT, ...args], {
    cwd: work,
    env: { ...process.env, BRANCH_HYGIENE_OPEN_PRS: OPEN_PRS },
    encoding: "utf8",
    stdio: "pipe",
  });
}

const refs = (cwd: string, pattern: string) =>
  git(cwd, ["for-each-ref", "--format=%(refname) %(objectname)", pattern]);
const branchNames = (cwd: string, pattern: string, prefix: string) =>
  git(cwd, ["for-each-ref", "--format=%(refname)", pattern])
    .split("\n")
    .filter(Boolean)
    .map((r) => r.slice(prefix.length))
    .filter((n) => n !== "HEAD")
    .sort();

function branch(name: string, date: string, mergeIntoStaging: boolean) {
  git(work, ["checkout", "-q", "-b", name, "main"]);
  git(work, ["commit", "-q", "--allow-empty", "-m", name], date);
  git(work, ["push", "-q", "origin", name]);
  if (mergeIntoStaging) {
    git(work, ["checkout", "-q", "staging"]);
    git(work, ["merge", "-q", "--no-ff", "-m", `merge ${name}`, name], date);
    git(work, ["push", "-q", "origin", "staging"]);
  }
}

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), "prune-branches-"));
  origin = join(base, "origin.git");
  work = join(base, "work");
  git(base, ["init", "-q", "--bare", "origin.git"]);
  git(base, ["init", "-q", "-b", "main", "work"]);
  git(work, ["config", "user.name", "Prune Test"]);
  git(work, ["config", "user.email", "prune-test@example.invalid"]);
  git(work, ["config", "commit.gpgsign", "false"]);
  git(work, ["remote", "add", "origin", origin]);
  git(work, ["commit", "-q", "--allow-empty", "-m", "root"], "2026-09-01T00:00:00Z");
  git(work, ["push", "-q", "origin", "main"]);
  git(work, ["branch", "staging"]);
  git(work, ["push", "-q", "origin", "staging"]);

  branch("merged-old", "2026-09-02T00:00:00Z", true);
  branch("merged-old2", "2026-09-03T00:00:00Z", true);
  branch("unmerged", "2026-09-04T00:00:00Z", false);
  branch("pr-head", "2026-09-05T00:00:00Z", true);
  branch("new-1", "2026-09-08T00:00:00Z", true);
  branch("new-2", "2026-09-09T00:00:00Z", true);
  git(work, ["checkout", "-q", "main"]);
  git(work, ["fetch", "-q", "origin"]);
}, 60_000);

afterAll(() => {
  if (base) rmSync(base, { recursive: true, force: true });
});

describe("prune-branches CLI", () => {
  it("dry run prints the plan and changes no refs", () => {
    const before = refs(work, "refs/") + refs(origin, "refs/");
    const out = cli(["prune", "--keep", "2"]);
    expect(refs(work, "refs/") + refs(origin, "refs/")).toBe(before);
    expect(out).toContain("KEEP (");
    expect(out).toContain("DELETE (4)");
    expect(out).toContain("REVIEW (");
    expect(out).toMatch(/origin\/pr-head\s+2026-09-05\s+open PR #7/);
    expect(out).toMatch(/local unmerged\s+2026-09-04\s+not merged/);
    expect(out.trim().split("\n").at(-1)).toMatch(/^Dry run — nothing deleted\./);
  }, 60_000);

  it("--apply deletes only merged, non-PR, non-kept copies, locally and on origin", () => {
    cli(["prune", "--apply", "--keep", "2"]);
    const expected = ["main", "new-1", "new-2", "pr-head", "staging", "unmerged"];
    expect(branchNames(work, "refs/heads", "refs/heads/")).toEqual(expected);
    expect(branchNames(work, "refs/remotes/origin", "refs/remotes/origin/")).toEqual(expected);
    expect(branchNames(origin, "refs/heads", "refs/heads/")).toEqual(expected);
  }, 60_000);

  it("rejects a --keep that is not a positive integer", () => {
    for (const bad of ["0", "abc"]) {
      expect(() => cli(["prune", "--keep", bad])).toThrow();
    }
  }, 60_000);

  it("count prints both counts and an ACTION line only when due", () => {
    const out = cli(["count"]);
    expect(out).toContain("Branches: local 6, origin 6 (reminder at 30)");
    expect(out).not.toContain("ACTION:");
  }, 60_000);
});
