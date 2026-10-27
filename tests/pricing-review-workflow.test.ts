import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DASHBOARD_URL, reviewBody } from "@/scripts/pricing-review";

/**
 * #1309 R26-R27: the quarterly review script and its workflow. The workflow file is checked as text:
 * no YAML parser is a declared dependency, and adding one for a test would break R36.
 */

const WORKFLOW = readFileSync(".github/workflows/pricing-review.yml", "utf8");
const SCRIPT = readFileSync("scripts/pricing-review.ts", "utf8");

describe("scripts/pricing-review.ts (R26)", () => {
  const body = reviewBody(new Date("2026-10-27T12:00:00Z"));

  it("states the analysis date, staleness, owner confirmations, break-even and both flags", () => {
    expect(body).toContain("Committed analysis date: 2026-10-27");
    expect(body).toContain("Nothing stale");
    expect(body).toContain("## Owner to confirm");
    expect(body).toContain("- claude");
    expect(body).toMatch(/Break-even/);
    expect(body).toMatch(/vendor\(s\) at zero sales/);
    expect(body).toContain("Recommendation overdue: no");
    expect(body).toContain("Recommendation disagrees with the current numbers: no");
  });

  it("links the dashboard and says to press Refresh Recommendations", () => {
    expect(DASHBOARD_URL).toBe("https://staging.aheedfoodcentre.nocaped.com/staff/platform/costs");
    expect(body).toContain(DASHBOARD_URL);
    expect(body).toContain('"Refresh Recommendations"');
  });

  it("flags an overdue recommendation and stale figures later on", () => {
    const later = reviewBody(new Date("2027-04-01T06:00:00Z"));
    expect(later).toContain("Recommendation overdue: yes");
    expect(later).not.toContain("Nothing stale");
  });

  it("imports only the pure modules", () => {
    const imports = SCRIPT.match(/from "([^"]+)"/g) ?? [];
    for (const line of imports) {
      expect(line).toMatch(/"@\/lib\/(running-costs|pricing\/[a-z-]+)"/);
    }
    expect(SCRIPT).not.toMatch(/console\.log\(/);
  });
});

describe(".github/workflows/pricing-review.yml (R27)", () => {
  it("runs quarterly at 06:00 UTC and on demand", () => {
    const crons = WORKFLOW.match(/cron:\s*"([^"]+)"/g) ?? [];
    expect(crons).toEqual(['cron: "0 6 1 1,4,7,10 *"']);
    expect(WORKFLOW).toMatch(/^\s{2}workflow_dispatch:/m);
  });

  it("has exactly contents: read and issues: write", () => {
    const block = WORKFLOW.match(/^permissions:\n((?:\s{2}.+\n)+)/m)?.[1] ?? "";
    expect(
      block
        .trim()
        .split("\n")
        .map((l) => l.trim())
        .sort(),
    ).toEqual(["contents: read", "issues: write"]);
  });

  it("uses no secret other than GITHUB_TOKEN", () => {
    const secrets = [...WORKFLOW.matchAll(/secrets\.(\w+)/g)].map((m) => m[1]);
    expect(new Set(secrets)).toEqual(new Set(["GITHUB_TOKEN"]));
  });

  it("builds the body with the script and opens an issue only when none is open", () => {
    expect(WORKFLOW).toMatch(/run: npm ci/);
    expect(WORKFLOW).toContain("npx tsx scripts/pricing-review.ts");
    expect(WORKFLOW).toMatch(/title="Quarterly pricing review \$\(date -u \+%Y\)-Q\$\{quarter\}"/);
    expect(WORKFLOW).toMatch(/gh issue list[^\n]*--state open/);
    expect(WORKFLOW).toMatch(
      /if \[ "\$existing" != "0" \]; then[\s\S]*exit 0[\s\S]*gh issue create/,
    );
  });
});
