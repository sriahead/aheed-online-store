import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type AccessApp,
  classifyProbe,
  entryCoversHost,
  evaluateAccess,
  fetchAccessApps,
  parseDocsRoutePatterns,
  policyProblem,
  probeUrl,
} from "../scripts/verify-docs-access";

/**
 * #1328 — the decisions that stand between a push to `staging` and internal docs on the open
 * internet. Fixtures follow the documented Access API shape; the live rows in
 * `specs/2026-10-30-docs-access-guard/validation.md` prove the script against the real API, which a
 * fixture cannot.
 */

const HOST = "docs-shoplocal.merqify.com";
const ALLOW = {
  name: "Owners",
  decision: "allow",
  include: [{ email: { email: "a@example.com" } }],
};

function app(overrides: Partial<AccessApp>): AccessApp {
  return { name: "docs", type: "self_hosted", domain: HOST, policies: [ALLOW], ...overrides };
}

function verdict(apps: AccessApp[]) {
  return evaluateAccess([HOST], apps)[0];
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("which Access applications cover the docs host", () => {
  it("an exact-host app passes", () => {
    expect(verdict([app({})]).ok).toBe(true);
  });

  it("a host/* app passes", () => {
    expect(verdict([app({ domain: `${HOST}/*` })]).ok).toBe(true);
  });

  it("a *.merqify.com wildcard app passes", () => {
    expect(verdict([app({ domain: "*.merqify.com" })]).ok).toBe(true);
  });

  it("a wildcard does not reach two labels down", () => {
    expect(entryCoversHost("*.com", HOST)).toBe(false);
  });

  it("a path-scoped host/admin app fails", () => {
    const v = verdict([app({ domain: `${HOST}/admin` })]);
    expect(v.ok).toBe(false);
    expect(v.reasons).toEqual([`no Access application covers ${HOST}`]);
  });

  it("an app on another host fails", () => {
    expect(verdict([app({ domain: "aheed.merqify.com" })]).ok).toBe(false);
  });

  it("a non-self-hosted app does not count", () => {
    expect(verdict([app({ type: "saas" })]).ok).toBe(false);
  });

  it("reads destinations and self_hosted_domains, ignoring case and scheme", () => {
    expect(
      verdict([
        app({
          domain: "other.example",
          destinations: [{ type: "public", uri: `https://${HOST.toUpperCase()}` }],
        }),
      ]).ok,
    ).toBe(true);
    expect(verdict([app({ domain: "other.example", self_hosted_domains: [HOST] })]).ok).toBe(true);
  });

  it("reads hosts from the docs wrangler.toml shape", () => {
    expect(
      parseDocsRoutePatterns(`[[routes]]\npattern = "${HOST}"\ncustom_domain = true\n`),
    ).toEqual([HOST]);
    expect(parseDocsRoutePatterns('name = "x"\n')).toEqual([]);
  });
});

describe("policies that would let everyone in", () => {
  it("a bypass policy fails", () => {
    const v = verdict([
      app({ policies: [ALLOW, { name: "open", decision: "bypass", include: [] }] }),
    ]);
    expect(v.ok).toBe(false);
    expect(v.reasons[0]).toContain("bypass");
  });

  it("an allow + everyone policy fails", () => {
    expect(
      policyProblem(
        app({ policies: [{ name: "all", decision: "allow", include: [{ everyone: {} }] }] }),
      ),
    ).toContain("allows everyone");
  });

  it("an app with only a deny policy fails", () => {
    expect(
      policyProblem(
        app({ policies: [{ name: "no", decision: "deny", include: [{ everyone: {} }] }] }),
      ),
    ).toBe("it has no allow policy");
  });

  it("a second, permissive app on the same host fails the host", () => {
    const open = app({
      name: "open",
      policies: [{ decision: "allow", include: [{ everyone: {} }] }],
    });
    expect(verdict([app({}), open]).ok).toBe(false);
  });
});

describe("listing Access applications", () => {
  it("follows pagination: an app on page 2 is seen", async () => {
    const pages = [
      {
        success: true,
        result: [app({ name: "other", domain: "x.merqify.com" })],
        result_info: { page: 1, total_pages: 2 },
      },
      { success: true, result: [app({})], result_info: { page: 2, total_pages: 2 } },
    ];
    const seen: string[] = [];
    const apps = await fetchAccessApps("acct", "tok", async (url) => {
      seen.push(url);
      return jsonResponse(200, pages[seen.length - 1]);
    });
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acct/access/apps?page=1&per_page=100",
    );
    expect(verdict(apps).ok).toBe(true);
  });

  it("a 403 names the missing permission", async () => {
    await expect(
      fetchAccessApps("acct", "tok", async () => jsonResponse(403, { success: false })),
    ).rejects.toThrow("Access: Apps and Policies Read");
  });

  it("success: false fails closed", async () => {
    await expect(
      fetchAccessApps("acct", "tok", async () =>
        jsonResponse(200, { success: false, errors: [{ message: "nope" }] }),
      ),
    ).rejects.toThrow("nope");
  });
});

describe("signed-out probes after the deploy", () => {
  it("a 302 to x.cloudflareaccess.com passes", () => {
    expect(classifyProbe(302, "https://x.cloudflareaccess.com/cdn-cgi/access/login/docs")).toBe(
      "pass",
    );
  });

  it("a 302 to any other host is not a pass", () => {
    expect(classifyProbe(302, "https://evil.example/cloudflareaccess.com")).toBe("retry");
  });

  it("a 200 fails without retry", async () => {
    let calls = 0;
    const result = await probeUrl(
      `https://${HOST}/`,
      async () => {
        calls++;
        return new Response("<h1>docs</h1>", { status: 200 });
      },
      async () => {},
    );
    expect(result.verdict).toBe("public");
    expect(calls).toBe(1);
  });

  it("a network error is retried, then fails", async () => {
    let calls = 0;
    const result = await probeUrl(
      `https://${HOST}/`,
      async () => {
        calls++;
        throw new Error("ECONNREFUSED");
      },
      async () => {},
      6,
      0,
    );
    expect(result.verdict).toBe("retry");
    expect(calls).toBe(6);
  });
});

describe("the deploy workflow and the docs Worker config", () => {
  it("runs --pre after the root npm ci and before wrangler deploy, and --post after it", () => {
    const lines = readFileSync(".github/workflows/deploy-docs-internal.yml", "utf8").split(/\r?\n/);
    const at = (needle: string) => lines.findIndex((l) => l.includes(needle));
    const npmCi = at("run: npm ci");
    const pre = at("verify-docs-access.ts --pre");
    const deploy = at("wrangler deploy");
    const post = at("verify-docs-access.ts --post");
    expect(npmCi).toBeGreaterThanOrEqual(0);
    expect(pre).toBeGreaterThan(npmCi);
    expect(deploy).toBeGreaterThan(pre);
    expect(post).toBeGreaterThan(deploy);
  });

  it("keeps workers_dev = false on the docs Worker", () => {
    expect(readFileSync("kms/site-internal/wrangler.toml", "utf8")).toMatch(
      /^workers_dev = false$/m,
    );
  });
});
