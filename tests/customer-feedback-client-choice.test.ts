import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * P9.2 (#818) R10 — the bulk moderation path must use the WEBSOCKET Prisma client, and
 * every other path must not.
 *
 * WHY THIS IS A SOURCE-TEXT TEST AND NOT A BEHAVIOURAL ONE. `updateMany` over the HTTP
 * adapter (`getPrisma()`) crashes unconditionally, even matching zero rows, because it opens
 * an implicit transaction the HTTP adapter cannot run. Nothing in `build`, `typecheck` or a
 * mocked unit test reproduces that — a hand-built double reproduces its author's guess about
 * the adapter, not the adapter. The only real proof is running it against a live database,
 * which is `scripts/verify-customer-feedback.ts --bulk-approve`.
 *
 * So this file does the narrower job that IS reliably checkable without a database: it pins
 * the client each call site passes, so a later edit that quietly swaps `getPrismaWs()` for
 * `getPrisma()` fails here rather than in production. Read it as a tripwire on a known
 * footgun, not as evidence the query works.
 *
 * Parsed from source text for the same reason `tests/staff-nav-parity.test.ts` is: the
 * property under test is which client is handed to which function, and rendering or calling
 * the module would need the WASM engine that Node cannot load.
 */

const REPO_ROOT = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

/**
 * Source with comments removed.
 *
 * These files DISCUSS `updateMany` and `createMany` at length in their docstrings, precisely
 * because the rule is easy to get wrong — so a substring check against the raw text is
 * satisfied by the prose warning against the thing it is looking for. That is the same
 * comment-unaware-parser defect `tests/panel-refusal-coverage.test.ts` documents and
 * `tests/radius-scale.test.ts` was fixed for in 82dbb1d. Caught here by the tests failing
 * against correct code, which is the cheap direction to find it.
 *
 * A regex, not a TypeScript parse: the properties under test are call-site level and a
 * stripped-comment view is sufficient for them. String literals containing `//` would be
 * mangled by this, and none of these files has one.
 */
function code(relativePath: string): string {
  return read(relativePath)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("customer feedback Prisma client choice (R10)", () => {
  const repository = code("lib/repositories/customer-feedback.ts");
  const service = code("lib/customer-feedback-service.ts");

  it("the bulk moderation export takes the websocket client type", () => {
    const signature = repository.match(
      /export async function setFeedbackStatusBulk\(\s*(\w+):\s*(\w+),/,
    );
    expect(signature, "setFeedbackStatusBulk not found — was it renamed?").not.toBeNull();
    // `DbWs` is the file's alias for ReturnType<typeof getPrismaWs>.
    expect(signature?.[2]).toBe("DbWs");
  });

  it("the service passes getPrismaWs() to the bulk path", () => {
    const approveMany = service.slice(
      service.indexOf("async approveMany("),
      service.indexOf("async customerHasCompletedOrder("),
    );
    expect(approveMany).toContain("getPrismaWs()");
  });

  it("no other repository export declares the websocket client", () => {
    const wsParams = repository.match(/:\s*DbWs\b/g) ?? [];
    // Exactly one: setFeedbackStatusBulk. The type alias declaration itself is `type DbWs =`,
    // which this pattern does not match.
    expect(wsParams).toHaveLength(1);
  });

  it("updateMany appears only in the websocket-backed export", () => {
    const occurrences = repository.split("updateMany").length - 1;
    expect(
      occurrences,
      "updateMany over getPrisma() throws unconditionally — see CLAUDE.md and #382",
    ).toBe(1);

    const bulkBody = repository.slice(
      repository.indexOf("export async function setFeedbackStatusBulk("),
    );
    expect(bulkBody).toContain("updateMany");
  });

  it("createMany is not used at all in this feature's repositories", () => {
    const rateLimit = code("lib/repositories/customer-feedback-rate-limit.ts");
    const links = code("lib/repositories/vendor-review-links.ts");
    for (const source of [repository, rateLimit, links]) {
      expect(source).not.toContain("createMany");
    }
  });

  it("the rate limiter and the link repository take only the HTTP client", () => {
    const rateLimit = code("lib/repositories/customer-feedback-rate-limit.ts");
    const links = code("lib/repositories/vendor-review-links.ts");
    expect(rateLimit).not.toContain("getPrismaWs");
    expect(links).not.toContain("getPrismaWs");
  });
});
