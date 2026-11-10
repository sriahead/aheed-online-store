import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * #1491 — every cell has its OWN `JOB_SIGNALS` KV namespace, and the app Worker and the scheduler of
 * one environment share it.
 *
 * Found 2026-11-10: `afc-staging` / `afc-production` reused the platform `staging` / `production`
 * ids (#1331 copied them), so the platform and AFC cells overwrote each other's job markers (one
 * cell emptying its outbox deleted the other's pending marker) and would have shared the database
 * warm-up schedule. Two cells must never share a namespace; one environment's two Workers must.
 */

const ENVS = ["staging", "production", "afc-staging", "afc-production"] as const;

function namespaceIds(path: string): Record<string, string> {
  const toml = readFileSync(path, "utf8");
  const ids: Record<string, string> = {};
  for (const env of ENVS) {
    const header = `[[env.${env}.kv_namespaces]]`;
    const at = toml.indexOf(header);
    expect(at, `${path}: ${header}`).toBeGreaterThan(-1);
    const block = toml.slice(at + header.length).split(/^\[/m)[0];
    expect(block, `${path}: ${env} binding`).toMatch(/^binding = "JOB_SIGNALS"$/m);
    const id = /^id = "([0-9a-f]{32})"$/m.exec(block)?.[1];
    expect(id, `${path}: ${env} id`).toBeTruthy();
    ids[env] = id as string;
  }
  return ids;
}

describe("JOB_SIGNALS namespaces (#1491)", () => {
  const app = namespaceIds("wrangler.toml");
  const scheduler = namespaceIds("workers/scheduler/wrangler.toml");

  it("each environment's app Worker and scheduler bind the same namespace", () => {
    expect(scheduler).toEqual(app);
  });

  it("no two environments share a namespace", () => {
    expect(new Set(Object.values(app)).size).toBe(ENVS.length);
  });
});
