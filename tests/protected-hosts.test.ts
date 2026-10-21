import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertNotDeployedDatabase,
  normalizeHost,
  protectedHosts,
} from "../scripts/lib/protected-hosts";

/**
 * #490 — the guard that stops a row-writing script reaching staging or production.
 *
 * `protectedHosts` and `assertNotDeployedDatabase` read `secrets/*.vars` RELATIVE to the process
 * working directory, so these tests chdir into a temporary directory and write fixture var files
 * there. That also means they never read the real `secrets/` files, so the suite does not depend on
 * a developer having them and cannot leak a real hostname into output.
 */

const STAGING_HOST = "ep-fixture-staging.eu-west-2.aws.neon.tech";
const PRODUCTION_HOST = "ep-fixture-production.eu-west-2.aws.neon.tech";

let workDir: string;
let originalCwd: string;

function writeVarFiles(options: { staging?: string; production?: string }) {
  mkdirSync(join(workDir, "secrets"), { recursive: true });
  if (options.staging !== undefined) {
    writeFileSync(join(workDir, "secrets", "staging.vars"), options.staging, "utf8");
  }
  if (options.production !== undefined) {
    writeFileSync(join(workDir, "secrets", "production.vars"), options.production, "utf8");
  }
}

beforeEach(() => {
  originalCwd = process.cwd();
  workDir = mkdtempSync(join(tmpdir(), "protected-hosts-"));
  process.chdir(workDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(workDir, { recursive: true, force: true });
});

describe("normalizeHost", () => {
  it("treats a Neon pooled host and its direct host as the same database", () => {
    // Without this, naming the pooled form in DIRECT_URL would slip past a guard that recorded the
    // direct form — the whole control, bypassed by a URL spelling.
    expect(normalizeHost(`postgres://u:p@ep-x-pooler.eu-west-2.aws.neon.tech/neondb`)).toBe(
      normalizeHost(`postgres://u:p@ep-x.eu-west-2.aws.neon.tech/neondb`),
    );
  });

  it("lower-cases the host and ignores port, path and query", () => {
    expect(normalizeHost("postgres://u:p@EP-X.AWS.NEON.TECH:5432/db?sslmode=require")).toBe(
      "ep-x.aws.neon.tech",
    );
  });

  it("returns null when there is no host at all", () => {
    expect(normalizeHost("not-a-url")).toBeNull();
  });
});

describe("protectedHosts", () => {
  it("parses both the plain and the spaced-equals forms (#505)", () => {
    // #505 found two reference-database keys written with spaces around `=`. A line this fails to
    // parse is a protected host it fails to protect, and that failure is silent.
    writeVarFiles({
      staging: `DIRECT_URL=postgres://u:p@${STAGING_HOST}/neondb\n`,
      production: `DATABASE_URL = "postgres://u:p@${PRODUCTION_HOST}/neondb"\n`,
    });
    const { hosts, readFiles } = protectedHosts();
    expect(hosts.has(STAGING_HOST)).toBe(true);
    expect(hosts.has(PRODUCTION_HOST)).toBe(true);
    expect(readFiles).toHaveLength(2);
  });

  it("records which files were readable, so a gap is visible rather than assumed safe", () => {
    writeVarFiles({ staging: `DIRECT_URL=postgres://u:p@${STAGING_HOST}/neondb\n` });
    const { hosts, readFiles } = protectedHosts();
    expect(readFiles).toEqual(["secrets/staging.vars"]);
    expect(hosts.has(STAGING_HOST)).toBe(true);
  });

  it("reads nothing when neither file exists", () => {
    const { hosts, readFiles } = protectedHosts();
    expect(readFiles).toEqual([]);
    expect(hosts.size).toBe(0);
  });
});

describe("assertNotDeployedDatabase", () => {
  it("throws on an empty connection string", () => {
    writeVarFiles({ staging: `DIRECT_URL=postgres://u:p@${STAGING_HOST}/neondb\n` });
    expect(() => assertNotDeployedDatabase(undefined)).toThrow(/empty/i);
    expect(() => assertNotDeployedDatabase("")).toThrow(/empty/i);
  });

  it("throws when neither var file can be read, rather than assuming dev", () => {
    // The refusal that matters most: absence of evidence is not evidence of safety.
    expect(() => assertNotDeployedDatabase("postgres://u:p@ep-dev.aws.neon.tech/neondb")).toThrow(
      /neither .* could be read/i,
    );
  });

  it("throws when the host is staging, and when it is production", () => {
    writeVarFiles({
      staging: `DIRECT_URL=postgres://u:p@${STAGING_HOST}/neondb\n`,
      production: `DIRECT_URL=postgres://u:p@${PRODUCTION_HOST}/neondb\n`,
    });
    expect(() => assertNotDeployedDatabase(`postgres://u:p@${STAGING_HOST}/neondb`)).toThrow(
      /REFUSING TO RUN/,
    );
    expect(() => assertNotDeployedDatabase(`postgres://u:p@${PRODUCTION_HOST}/neondb`)).toThrow(
      /REFUSING TO RUN/,
    );
  });

  it("throws when a POOLED url names a host recorded in its direct form", () => {
    writeVarFiles({
      staging: `DIRECT_URL=postgres://u:p@ep-fixture.eu-west-2.aws.neon.tech/neondb\n`,
      production: "DIRECT_URL=postgres://u:p@ep-other.eu-west-2.aws.neon.tech/neondb\n",
    });
    expect(() =>
      assertNotDeployedDatabase("postgres://u:p@ep-fixture-pooler.eu-west-2.aws.neon.tech/neondb"),
    ).toThrow(/REFUSING TO RUN/);
  });

  it("returns the resolved host and files checked for a dev database", () => {
    writeVarFiles({
      staging: `DIRECT_URL=postgres://u:p@${STAGING_HOST}/neondb\n`,
      production: `DIRECT_URL=postgres://u:p@${PRODUCTION_HOST}/neondb\n`,
    });
    const result = assertNotDeployedDatabase(
      "postgres://u:p@ep-dev.eu-west-2.aws.neon.tech/neondb",
    );
    expect(result.host).toBe("ep-dev.eu-west-2.aws.neon.tech");
    expect(result.readFiles).toHaveLength(2);
  });
});
