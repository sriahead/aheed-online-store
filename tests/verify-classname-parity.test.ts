import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { CLASSNAME_PARITY_ALLOWLIST } from "./fixtures/classname-parity-allowlist";

/**
 * Proves R58 to R60 (#1223) through the real process: `scripts/verify-classname-parity.ts` is spawned
 * against small BASE and HEAD trees written to a temp directory, so the exit code and stderr are what a
 * validator would see (the R10 rule: a requirement about what a command exits with is not proved by
 * calling the function behind it).
 */

const ROOT = join(__dirname, "..");
const scratch = mkdtempSync(join(tmpdir(), "classname-parity-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const LUCIDE = (body: string) =>
  `import { Search, Heart } from "lucide-react";\nexport function C() {\n  return (\n    <div>\n${body}\n    </div>\n  );\n}\n`;
const ICON = (body: string) =>
  `import { Icon } from "@/components/icons/Icon";\nexport function C() {\n  return (\n    <div>\n${body}\n    </div>\n  );\n}\n`;

let counter = 0;
function trees(files: Record<string, { base: string; head: string }>) {
  const dir = join(scratch, `case-${(counter += 1)}`);
  for (const [path, { base, head }] of Object.entries(files)) {
    for (const [side, text] of [
      ["base", base],
      ["head", head],
    ] as const) {
      const file = join(dir, side, path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
    }
  }
  return { base: join(dir, "base"), head: join(dir, "head") };
}

function run(root: { base: string; head: string }, ...extra: string[]) {
  return spawnSync(
    "npx",
    [
      "tsx",
      "scripts/verify-classname-parity.ts",
      "--base-root",
      root.base,
      "--head-root",
      root.head,
      ...extra,
    ],
    { cwd: ROOT, encoding: "utf8", shell: process.platform === "win32" },
  );
}

const FILE = "components/Thing.tsx";

describe("scripts/verify-classname-parity.ts (real process)", { timeout: 30_000 }, () => {
  it("exits 0 for an identical pair, ignoring aria-hidden and layout", () => {
    const result = run(
      trees({
        [FILE]: {
          base: LUCIDE(
            '      <Search className="h-4 w-4" aria-hidden />\n      <Heart className={`h-4 ${on ? "fill-current" : ""}`} strokeWidth={1.5} />',
          ),
          head: ICON(
            '      <Icon name="search" className="h-4 w-4" />\n      <Icon\n        name="heart"\n        className={`h-4 ${on ? "fill-current" : ""}`}\n        strokeWidth={1.5}\n      />',
          ),
        },
      }),
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain("checked 1 file(s), 0 not migrated, 0 allowed");
  });

  it("fails and names the file and line when one className differs", () => {
    const result = run(
      trees({
        [FILE]: {
          base: LUCIDE('      <Search className="h-4 w-4" />'),
          head: ICON('      <Icon name="search" className="h-5 w-5" />'),
        },
      }),
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`${FILE}:5:`);
    expect(result.stderr).toContain("className changed");
  });

  it("fails when HEAD adds a size prop", () => {
    const result = run(
      trees({
        [FILE]: {
          base: LUCIDE('      <Search className="h-4 w-4" />'),
          head: ICON('      <Icon name="search" className="h-4 w-4" size="sm" />'),
        },
      }),
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("size");
  });

  it("fails when an element was dropped", () => {
    const result = run(
      trees({
        [FILE]: {
          base: LUCIDE('      <Search className="a" />\n      <Heart className="b" />'),
          head: ICON('      <Icon name="search" className="a" />'),
        },
      }),
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("2 Lucide element(s) at BASE but 1 Icon element(s) at HEAD");
  });

  it("fails when a prop other than className is dropped or added", () => {
    const dropped = run(
      trees({
        [FILE]: {
          base: LUCIDE('      <Heart className="a" strokeWidth={1.25} />'),
          head: ICON('      <Icon name="heart" className="a" />'),
        },
      }),
    );
    expect(dropped.status).not.toBe(0);
    expect(dropped.stderr).toContain("strokeWidth was dropped");
    const added = run(
      trees({
        [FILE]: {
          base: LUCIDE('      <Heart className="a" />'),
          head: ICON('      <Icon name="heart" className="a" strokeWidth={2} />'),
        },
      }),
    );
    expect(added.status).not.toBe(0);
    expect(added.stderr).toContain("strokeWidth was added");
  });

  it("treats a file that still imports lucide-react as not migrated: 0 by default, a failure with --require-migrated", () => {
    const root = trees({
      [FILE]: {
        base: LUCIDE('      <Search className="a" />'),
        head: LUCIDE('      <Search className="a" />'),
      },
    });
    const lenient = run(root);
    expect(lenient.status, lenient.stderr).toBe(0);
    expect(lenient.stderr).toContain("1 not migrated");
    const strict = run(root, "--require-migrated");
    expect(strict.status).not.toBe(0);
    expect(strict.stderr).toContain(FILE);
  });

  it("skips an --allow-listed file that would otherwise fail, and counts it", () => {
    const root = trees({
      [FILE]: {
        base: LUCIDE('      <Search className="h-4 w-4" />'),
        head: ICON('      <Icon name="search" className="h-9 w-9" />'),
      },
    });
    expect(run(root).status).not.toBe(0);
    const allowed = run(root, "--allow", FILE);
    expect(allowed.status, allowed.stderr).toBe(0);
    expect(allowed.stderr).toContain("0 not migrated, 1 allowed");
  });

  it("fails an --allow entry that names a file not in both trees (a stale allowlist)", () => {
    const root = trees({
      [FILE]: {
        base: LUCIDE('      <Search className="a" />'),
        head: ICON('      <Icon name="search" className="a" />'),
      },
    });
    const result = run(root, "--allow", "components/Gone.tsx");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("components/Gone.tsx");
  });

  it("resolves an aliased Lucide import", () => {
    const result = run(
      trees({
        [FILE]: {
          base: `import { Search as Glass } from "lucide-react";\nexport const C = () => <Glass className="a" />;\n`,
          head: `import { Icon } from "@/components/icons/Icon";\nexport const C = () => <Icon name="search" className="b" />;\n`,
        },
      }),
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("className changed");
  });

  it("exits 2 with usage when a root is missing", () => {
    const result = spawnSync("npx", ["tsx", "scripts/verify-classname-parity.ts"], {
      cwd: ROOT,
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("usage");
  });
});

describe("CLASSNAME_PARITY_ALLOWLIST (R59)", () => {
  it("is exactly the five R57 files and the four P1 value-position files, each with a reason", () => {
    expect(CLASSNAME_PARITY_ALLOWLIST.map((entry) => entry.path).sort()).toEqual(
      [
        "app/(storefront)/quick-shop/page.tsx",
        "components/account/AccountNav.tsx",
        "components/layout/ViewSwitcher.tsx",
        "components/product/CollectionNav.tsx",
        "components/cart/AddToCartButton.tsx",
        "app/(admin)/staff/page.tsx",
        "components/layout/DepartmentHero.tsx",
        "components/layout/DepartmentScroller.tsx",
        "components/staff/PanelNav.tsx",
      ].sort(),
    );
    for (const entry of CLASSNAME_PARITY_ALLOWLIST)
      expect(entry.reason.trim().length).toBeGreaterThan(10);
  });
});
