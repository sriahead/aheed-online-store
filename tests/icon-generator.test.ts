import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Proves R7, R8 and R10 (#1223) by running the REAL script as a child process.
 *
 * A requirement about what a command prints or exits with is not proved by calling the function behind
 * it (`specs/sdd-workflow.md`, #1216): `main()` owns the exit code. So every case here spawns
 * `npx tsx scripts/build-icons.ts` and reads its exit status and stderr.
 */

const ROOT = join(__dirname, "..");
const scratch = mkdtempSync(join(tmpdir(), "icon-generator-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function run(args: string[]) {
  return spawnSync("npx", ["tsx", "scripts/build-icons.ts", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
}

function fixture(name: string, registry: unknown): string {
  const path = join(scratch, `${name}.json`);
  writeFileSync(path, JSON.stringify(registry));
  return path;
}

describe("scripts/build-icons.ts (real process)", () => {
  it("accepts a valid registry and exits 0", () => {
    const result = run([
      "--registry",
      fixture("ok", { search: { tier: "functional", provider: "lucide", id: "search" } }),
    ]);
    expect(result.status, result.stderr).toBe(0);
  });

  it("fails on an id that does not exist, naming the semantic name and the id", () => {
    const result = run([
      "--registry",
      fixture("missing", { nope: { tier: "decorative", provider: "lucide", id: "no-such-icon" } }),
    ]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("nope");
    expect(result.stderr).toContain("no-such-icon");
  });

  it("fails on a duotone entry that lacks its secondary layer, naming it", () => {
    // `cell-signal-none-duotone` is one of the two Phosphor duotone icons without the layer.
    const result = run([
      "--registry",
      fixture("flat", {
        bars: { tier: "decorative", provider: "ph", id: "cell-signal-none-duotone" },
      }),
    ]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("bars");
    expect(result.stderr).toContain("cell-signal-none-duotone");
  });

  it("fails when a functional entry names a Phosphor icon", () => {
    const result = run([
      "--registry",
      fixture("tier", { bad: { tier: "functional", provider: "ph", id: "truck" } }),
    ]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("bad");
  });

  it("rejects unsafe markup (checked through the library with a poisoned set)", async () => {
    // The CLI reads real node_modules, so the poisoned-body cases go through the library seam; the
    // exit-code behaviour of an `IconBuildError` is already proved by the cases above.
    const { buildIconData, IconBuildError } = await import("../scripts/lib/icon-build");
    const poison = (body: string) =>
      buildIconData(
        { evil: { tier: "decorative", provider: "lucide", id: "x" } },
        { loadSet: () => ({ icons: { x: { body } }, width: 24, height: 24 }) },
      );
    for (const body of [
      "<script>alert(1)</script>",
      '<foreignObject width="1" height="1"/>',
      '<a href="javascript:alert(1)"/>',
      '<path d="M0 0" onload="x()"/>',
    ]) {
      expect(() => poison(body), body).toThrow(IconBuildError);
    }
    expect(() => poison('<path d="M0 0"/>')).not.toThrow();
  });

  it("is deterministic and `--check` agrees with a fresh build (R7, R8)", () => {
    const check = run(["--check"]);
    expect(check.status, check.stderr).toBe(0);
    expect(check.stderr).toContain("current");
  });

  it("`--check` fails and names the file when the generated module is edited (R8)", () => {
    const path = join(ROOT, "components/icons/generated/icon-data.ts");
    const original = readFileSync(path, "utf8");
    try {
      writeFileSync(path, original + " ");
      const result = run(["--check"]);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("icon-data.ts");
    } finally {
      writeFileSync(path, original);
    }
  });
});
