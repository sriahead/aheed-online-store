import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderRoutesBlock } from "../scripts/verify-worker-routes";
import {
  checkReadyCommand,
  emitRouteCommand,
  manifestSchema,
  type Manifest,
} from "../scripts/provision-vendor";
import { findPlaceholderPaths, pathResolves } from "../scripts/lib/manifest-readiness";

/**
 * #1216 R1-R5 — placeholder-bearing manifests and the two readiness commands. Everything here runs
 * on parsed objects: the commands return `{ code, stdout, stderr }` instead of exiting, so the
 * behaviour the operator sees is asserted without spawning a process or touching a database.
 */

const EXAMPLE = JSON.parse(readFileSync("prisma/manifests/example.json", "utf8"));

/** A manifest with every placeholder-looking value replaced by a real-looking one. */
function readyManifest(overrides: Record<string, unknown> = {}): Manifest {
  const text = JSON.stringify(EXAMPLE)
    .replace(/orders@example\.invalid/g, "orders@shop.example.com")
    .replace(/"\[PHONE\]"/g, '"01234 567890"')
    .replace(/"\[EMAIL\]"/g, '"hello@shop.example.com"')
    .replace(/"\[NUMBER\]"/g, '"12345678"')
    .replace(/example-grocer\.nocaped\.com/g, "shop.example.com");
  return manifestSchema.parse({ ...JSON.parse(text), ...overrides });
}

describe("manifest schema: placeholders (R1, R2)", () => {
  it("defaults to an empty list when absent", () => {
    expect(manifestSchema.parse(EXAMPLE).placeholders).toEqual([]);
  });

  it("accepts paths that resolve to a field", () => {
    const parsed = manifestSchema.parse({
      ...EXAMPLE,
      placeholders: ["config.senderEmail", "deliveryPrefixes", "footer.location"],
    });
    expect(parsed.placeholders).toHaveLength(3);
  });

  it("rejects a path that names no field, and names the path", () => {
    const result = manifestSchema.safeParse({ ...EXAMPLE, placeholders: ["config.nope"] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain("config.nope");
    }
  });

  it("still rejects an unknown key at the root, in config and in footer.config", () => {
    expect(manifestSchema.safeParse({ ...EXAMPLE, surprise: 1 }).success).toBe(false);
    expect(
      manifestSchema.safeParse({ ...EXAMPLE, config: { ...EXAMPLE.config, surprise: 1 } }).success,
    ).toBe(false);
    expect(
      manifestSchema.safeParse({
        ...EXAMPLE,
        footer: { ...EXAMPLE.footer, config: { ...EXAMPLE.footer.config, surprise: 1 } },
      }).success,
    ).toBe(false);
  });

  it("the committed example manifest still parses", () => {
    expect(manifestSchema.safeParse(EXAMPLE).success).toBe(true);
  });
});

describe("pathResolves", () => {
  it("resolves objects, arrays by index, and whole sub-trees; refuses anything else", () => {
    const m = { a: { b: [10, 20] }, c: 1 };
    expect(pathResolves(m, "a.b.1")).toBe(true);
    expect(pathResolves(m, "a")).toBe(true);
    expect(pathResolves(m, "a.b.2")).toBe(false);
    expect(pathResolves(m, "a.x")).toBe(false);
    expect(pathResolves(m, "c.d")).toBe(false);
    expect(pathResolves(m, "")).toBe(false);
  });
});

describe("--check-ready (R3)", () => {
  it("fails the committed example, which carries .invalid and bracket placeholders", () => {
    const result = checkReadyCommand(manifestSchema.parse(EXAMPLE));
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("config.senderEmail");
    expect(result.stderr).toContain("footer.config.contactPhone");
  });

  it("passes when nothing is marked", () => {
    const result = checkReadyCommand(readyManifest());
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("fails on a declared placeholder, including a number that cannot carry a marker", () => {
    const manifest = readyManifest({ placeholders: ["config.deliveryFeePence"] });
    const result = checkReadyCommand(manifest);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("config.deliveryFeePence");
  });

  it("fails on the OWNER TO CONFIRM marker in any string, case-insensitively, and names its path", () => {
    const base = readyManifest();
    const manifest = manifestSchema.parse({
      ...base,
      footer: {
        ...base.footer,
        location: { ...base.footer.location, addressLine1: "‹owner to confirm›" },
      },
    });
    const result = checkReadyCommand(manifest);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("footer.location.addressLine1");
  });

  it("lists every offending path, one per line, without duplicates", () => {
    const manifest = readyManifest({
      placeholders: ["config.heroSubtitle", "config.deliveryFeePence"],
    });
    const manifestWithMarker = manifestSchema.parse({
      ...manifest,
      config: { ...manifest.config, heroSubtitle: "OWNER TO CONFIRM" },
    });
    expect(findPlaceholderPaths(manifestWithMarker)).toEqual([
      "config.deliveryFeePence",
      "config.heroSubtitle",
    ]);
  });
});

describe("--emit-route (R5)", () => {
  const ready = readyManifest();

  it("prints exactly renderRoutesBlock for a ready, routable manifest", () => {
    const result = emitRouteCommand(ready, "staging");
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(renderRoutesBlock("staging", [ready.host]));
    expect(result.stderr).toBe("");
    expect(emitRouteCommand(ready, "production").stdout).toBe(
      renderRoutesBlock("production", [ready.host]),
    );
  });

  it("prints nothing on stdout and says why when the manifest is not ready", () => {
    const result = emitRouteCommand(manifestSchema.parse(EXAMPLE), "staging");
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("NOT READY");
  });

  it("refuses a host with a port or a localhost host", () => {
    for (const host of [
      "aheedsuperstore.localhost:8787",
      "shop.localhost",
      "shop.example.com:8787",
    ]) {
      const result = emitRouteCommand(readyManifest({ host }), "staging");
      expect(result.code).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("not a deployable host");
    }
  });

  it("refuses an environment other than staging or production", () => {
    for (const env of ["dev", "", undefined, "prod"]) {
      const result = emitRouteCommand(ready, env);
      expect(result.code).toBe(1);
      expect(result.stdout).toBe("");
    }
  });
});

/**
 * R5 at the COMMAND LINE. The functions above return `{ stdout, stderr }` and cannot see what
 * `main()` itself prints; validation found that `main()` wrote its "is valid" line to stdout, so a
 * refused `--emit-route` was not silent and a successful one was not exactly the route block. These
 * run the real script.
 */
describe("the real command line keeps stdout clean (R5)", () => {
  function run(manifest: unknown, ...args: string[]) {
    const dir = mkdtempSync(join(tmpdir(), "manifest-cli-"));
    try {
      const path = join(dir, "manifest.json");
      writeFileSync(path, JSON.stringify(manifest));
      const env = { ...process.env };
      delete env.DATABASE_URL;
      delete env.DIRECT_URL;
      return spawnSync("npx", ["tsx", "scripts/provision-vendor.ts", path, ...args], {
        encoding: "utf8",
        env,
        shell: process.platform === "win32",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("--emit-route on a manifest that is not ready exits 1 with nothing on stdout", () => {
    const result = run(EXAMPLE, "--emit-route", "--env", "staging");
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("NOT READY");
  }, 60_000);

  it("--emit-route on a ready, routable manifest prints exactly the route block", () => {
    const manifest = { ...readyManifest(), host: "shop.example.com" };
    const result = run(manifest, "--emit-route", "--env", "staging");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(renderRoutesBlock("staging", ["shop.example.com"]));
  }, 60_000);

  it("--emit-route refuses a localhost host and an unknown environment with nothing on stdout", () => {
    const local = run(
      { ...readyManifest(), host: "shop.localhost:8787" },
      "--emit-route",
      "--env",
      "staging",
    );
    expect(local.status).toBe(1);
    expect(local.stdout).toBe("");
    const dev = run(
      { ...readyManifest(), host: "shop.example.com" },
      "--emit-route",
      "--env",
      "dev",
    );
    expect(dev.status).toBe(1);
    expect(dev.stdout).toBe("");
  }, 60_000);

  it("--check-ready keeps stdout clean too: empty on failure, the single ready line on success", () => {
    const failing = run(EXAMPLE, "--check-ready");
    expect(failing.status).toBe(1);
    expect(failing.stdout).toBe("");
    const passing = run(readyManifest(), "--check-ready");
    expect(passing.status).toBe(0);
    expect(passing.stdout).toBe("manifest is ready: no placeholders remain\n");
  }, 60_000);
});
