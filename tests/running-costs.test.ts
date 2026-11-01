import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  RUNNING_COST_ITEMS,
  buildCostReport,
  formatCostStatus,
  type CostItem,
} from "@/lib/running-costs";

/**
 * #1295 R1-R8: the registry's invariants and the exact numbers `buildCostReport` produces. The
 * owner will rely on these figures, so every expected value is pinned, not just "a number".
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NOW = new Date("2026-10-27T12:00:00Z");

function item(overrides: Partial<CostItem> & { id: string }): CostItem {
  return {
    name: overrides.id,
    provider: "Test",
    category: "hosting",
    group: "platform-fixed",
    reviewEvery: "month",
    role: null,
    plan: "Test",
    costStatus: "actual",
    basis: "owner-stated",
    asOf: "2026-10-27",
    amountCents: 0,
    period: "month",
    currency: "USD",
    renewsOn: null,
    autoRenew: null,
    priceChange: null,
    limits: null,
    usage: null,
    note: null,
    ...overrides,
  };
}

function find(id: string): CostItem {
  const found = RUNNING_COST_ITEMS.find((entry) => entry.id === id);
  if (!found) throw new Error(`no registry item ${id}`);
  return found;
}

/** Every R2 invariant for one item, as a list of failures (empty when it holds). */
function invariantFailures(entry: CostItem): string[] {
  const failures: string[] = [];
  if (
    entry.amountCents !== null &&
    !(Number.isInteger(entry.amountCents) && entry.amountCents >= 0)
  ) {
    failures.push("amountCents is not a non-negative integer");
  }
  if ((entry.amountCents === null) !== (entry.period === null)) {
    failures.push("period and amountCents are not null together");
  }
  if (entry.currency !== "USD") failures.push("currency is not USD");
  const dates = [
    entry.asOf,
    entry.renewsOn,
    entry.priceChange?.effectiveOn ?? null,
    entry.limits?.retrievedOn ?? null,
  ];
  for (const date of dates)
    if (date !== null && !DATE.test(date)) failures.push(`bad date ${date}`);
  if (entry.priceChange) {
    if (entry.period !== "year") failures.push("priceChange on a non-year item");
    if (!(Number.isInteger(entry.priceChange.toCents) && entry.priceChange.toCents > 0)) {
      failures.push("priceChange.toCents is not a positive integer");
    }
    if (entry.renewsOn && entry.priceChange.effectiveOn > entry.renewsOn) {
      failures.push("priceChange takes effect after the renewal");
    }
  }
  if (entry.costStatus === "actual" && entry.basis === "not-confirmed") {
    failures.push("actual item with an unconfirmed basis");
  }
  // #1309 R1
  const quarterly = entry.period === "year" || entry.basis === "open-licence";
  if (entry.reviewEvery !== (quarterly ? "quarter" : "month")) {
    failures.push("reviewEvery does not follow the period/basis rule");
  }
  if (entry.basis === "open-licence" && (entry.amountCents !== 0 || entry.limits === null)) {
    failures.push("open-licence item is not free or has no licence link");
  }
  return failures;
}

describe("lib/running-costs.ts is pure (R1)", () => {
  const source = readFileSync("lib/running-costs.ts", "utf8");

  it("has no directive and imports nothing from react, next, the database or prisma", () => {
    expect(source.split("\n")[0]).not.toMatch(/use (client|server)/);
    expect(source).not.toMatch(
      /^import[^;]*from "(react|next\/|@\/lib\/db|@\/lib\/config|@prisma\/)/m,
    );
    expect(source).not.toMatch(/\bfetch\(/);
  });

  it("exports the registry, the report builder and the status formatter", () => {
    expect(Array.isArray(RUNNING_COST_ITEMS)).toBe(true);
    expect(typeof buildCostReport).toBe("function");
    expect(formatCostStatus("actual")).toBe("Actual");
    expect(formatCostStatus("planned")).toBe("Planned");
    expect(formatCostStatus("estimate")).toBe("Estimate");
    expect(formatCostStatus("unverified")).toBe("Unverified");
  });
});

describe("registry invariants (R2)", () => {
  it("every item satisfies them and ids are unique", () => {
    for (const entry of RUNNING_COST_ITEMS) {
      expect(invariantFailures(entry), entry.id).toEqual([]);
    }
    const ids = RUNNING_COST_ITEMS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("the checker can fail: it flags a fractional amount and a bad date", () => {
    expect(invariantFailures(item({ id: "x", amountCents: 12.5 }))).toContain(
      "amountCents is not a non-negative integer",
    );
    expect(invariantFailures(item({ id: "x", asOf: "27/10/2026" }))).toContain(
      "bad date 27/10/2026",
    );
    expect(invariantFailures(item({ id: "x", amountCents: null, period: "month" }))).toContain(
      "period and amountCents are not null together",
    );
    expect(
      invariantFailures(
        item({
          id: "x",
          period: "month",
          amountCents: 100,
          priceChange: { toCents: 200, effectiveOn: "2026-11-01", note: "" },
        }),
      ),
    ).toContain("priceChange on a non-year item");
    expect(invariantFailures(item({ id: "x", period: "year", reviewEvery: "month" }))).toContain(
      "reviewEvery does not follow the period/basis rule",
    );
    expect(
      invariantFailures(item({ id: "x", basis: "open-licence", reviewEvery: "quarter" })),
    ).toContain("open-licence item is not free or has no licence link");
  });
});

describe("registry content (R3)", () => {
  it("holds exactly the 17 agreed items (#1309 R3)", () => {
    expect(RUNNING_COST_ITEMS.map((entry) => entry.id).sort()).toEqual(
      [
        "cloudflare-access",
        "cloudflare-email",
        "cloudflare-r2",
        "cloudflare-workers",
        "domain-aheedfoodcentre",
        "domain-merqify",
        "domain-nocaped",
        "github",
        "neon",
        "stripe",
        "workers-ai",
        "postcode-reference",
        "os-opendata",
        "iconify-icons",
        "open-food-facts",
        "claude",
        "gemini-pro",
      ].sort(),
    );
  });

  it("puts each item in its group (#1309 R2, R3)", () => {
    const groups: Record<string, string> = {
      "cloudflare-workers": "platform-fixed",
      "domain-nocaped": "platform-fixed",
      "domain-merqify": "platform-fixed",
      "domain-aheedfoodcentre": "platform-fixed",
      neon: "platform-fixed",
      "cloudflare-r2": "platform-usage",
      "workers-ai": "platform-usage",
      stripe: "platform-usage",
      "cloudflare-email": "platform-usage",
      "cloudflare-access": "dev-tools",
      github: "dev-tools",
      "postcode-reference": "platform-fixed",
      "os-opendata": "platform-fixed",
      "iconify-icons": "platform-fixed",
      "open-food-facts": "platform-fixed",
      claude: "dev-tools",
      "gemini-pro": "dev-tools",
    };
    for (const [id, group] of Object.entries(groups)) expect(find(id).group, id).toBe(group);
    expect(find("workers-ai").note).toMatch(/image generation/i);
    expect(find("postcode-reference").note).toContain("uk-location-reference");
  });

  it("the six new rows have the specified status, basis and amount (#1309 R3)", () => {
    const expected: Record<string, unknown[]> = {
      "postcode-reference": ["actual", "owner-stated", 0, "month"],
      "os-opendata": ["actual", "open-licence", 0, "month"],
      "iconify-icons": ["actual", "open-licence", 0, "month"],
      "open-food-facts": ["actual", "open-licence", 0, "month"],
      claude: ["unverified", "not-confirmed", null, null],
      "gemini-pro": ["unverified", "not-confirmed", null, null],
    };
    for (const [id, want] of Object.entries(expected)) {
      const got = find(id);
      expect([got.costStatus, got.basis, got.amountCents, got.period], id).toEqual(want);
    }
  });

  it("matches the specified status, basis, amount, renewal and price change", () => {
    const rise = { toCents: 1117, effectiveOn: "2026-11-01" };
    const expected: Record<string, unknown[]> = {
      "cloudflare-workers": ["actual", "owner-stated", 500, "month", null, null, null],
      "domain-nocaped": ["actual", "provider-dashboard", 1046, "year", "2027-08-15", false, rise],
      "domain-merqify": ["planned", "provider-pricing-page", 1046, "year", null, null, rise],
      "domain-aheedfoodcentre": ["planned", "provider-pricing-page", 530, "year", null, null, null],
      neon: ["actual", "owner-stated", 0, "month", null, null, null],
      "cloudflare-r2": ["actual", "owner-stated", 0, "month", null, null, null],
      "cloudflare-access": ["actual", "owner-stated", 0, "month", null, null, null],
      github: ["actual", "owner-stated", 0, "month", null, null, null],
      "workers-ai": ["estimate", "provider-pricing-page", null, null, null, null, null],
      stripe: ["unverified", "not-confirmed", null, null, null, null, null],
      "cloudflare-email": ["estimate", "provider-pricing-page", null, null, null, null, null],
    };
    for (const [id, want] of Object.entries(expected)) {
      const got = find(id);
      const priceChange = got.priceChange
        ? { toCents: got.priceChange.toCents, effectiveOn: got.priceChange.effectiveOn }
        : null;
      expect(
        [
          got.costStatus,
          got.basis,
          got.amountCents,
          got.period,
          got.renewsOn,
          got.autoRenew,
          priceChange,
        ],
        id,
      ).toEqual(want);
    }
  });

  it("carries the roles, the Neon production note and the Verisign notes", () => {
    expect(find("domain-nocaped").role).toBe("dev and staging");
    expect(find("domain-merqify").role).toBe("main platform domain");
    expect(find("domain-aheedfoodcentre").role).toBe("client domain");
    expect(find("neon").note).toContain("#1289");
    expect(find("domain-nocaped").priceChange?.note).toContain("Verisign");
    expect(find("domain-merqify").priceChange?.note).toContain("Verisign");
    expect(find("workers-ai").usage).toBe("workers-ai");
  });
});

describe("provider limits are sourced and unconfirmed (R4)", () => {
  it("every recorded limit has an https source, an allowance and no owner confirmation yet", () => {
    for (const entry of RUNNING_COST_ITEMS) {
      if (entry.limits === null) continue;
      expect(entry.limits.sourceUrl, entry.id).toMatch(/^https:\/\//);
      expect(entry.limits.allowance.length, entry.id).toBeGreaterThan(0);
      expect(typeof entry.limits.confirmedByOwner, entry.id).toBe("boolean");
      expect(entry.limits.confirmedByOwner, entry.id).toBe(false);
    }
  });
});

describe("buildCostReport totals (R5)", () => {
  it("gives the pinned figures for the real registry", () => {
    const report = buildCostReport(RUNNING_COST_ITEMS, NOW);
    expect(report.current).toEqual({ annualCents: 7046, monthlyCents: 587 });
    expect(report.withPlanned).toEqual({ annualCents: 8622, monthlyCents: 719 });
    expect(report.atRenewal).toEqual({ annualCents: 8764, monthlyCents: 730 });
  });

  it("a planned item changes withPlanned but not current", () => {
    const report = buildCostReport(
      [
        item({ id: "a", amountCents: 1000, period: "year" }),
        item({ id: "b", costStatus: "planned", amountCents: 500, period: "year" }),
      ],
      NOW,
    );
    expect(report.current.annualCents).toBe(1000);
    expect(report.withPlanned.annualCents).toBe(1500);
  });

  it("an estimate or unverified item with no amount is in no total", () => {
    const report = buildCostReport(
      [
        item({ id: "a", amountCents: 1000, period: "year" }),
        item({ id: "b", costStatus: "estimate", amountCents: null, period: null }),
        item({ id: "c", costStatus: "unverified", amountCents: null, period: null }),
      ],
      NOW,
    );
    expect(report.current.annualCents).toBe(1000);
    expect(report.withPlanned.annualCents).toBe(1000);
    expect(report.atRenewal.annualCents).toBe(1000);
  });

  it("a monthly item contributes twelve times its amount to the annual figure", () => {
    const report = buildCostReport([item({ id: "a", amountCents: 500, period: "month" })], NOW);
    expect(report.current).toEqual({ annualCents: 6000, monthlyCents: 500 });
  });
});

describe("buildCostReport attention (R6)", () => {
  const pairs = (now: Date) =>
    buildCostReport(RUNNING_COST_ITEMS, now)
      .attention.map((entry) => `${entry.id}:${entry.kind}`)
      .sort();

  it("on 2026-10-27 lists auto-renew off and the two imminent .com price changes", () => {
    expect(pairs(NOW)).toEqual(
      [
        "domain-nocaped:auto-renew-off",
        "domain-nocaped:price-change-soon",
        "domain-merqify:price-change-soon",
      ].sort(),
    );
  });

  it("on 2027-07-20 lists the renewal and no price change (it has taken effect)", () => {
    expect(pairs(new Date("2027-07-20T00:00:00Z"))).toEqual(
      ["domain-nocaped:auto-renew-off", "domain-nocaped:renewal-soon"].sort(),
    );
  });

  it("includes a renewal exactly 60 days out, not 61, and not yesterday", () => {
    const kinds = (renewsOn: string) =>
      buildCostReport([item({ id: "a", renewsOn })], NOW).attention.map((entry) => entry.kind);
    expect(kinds("2026-12-26")).toEqual(["renewal-soon"]);
    expect(kinds("2026-12-27")).toEqual([]);
    expect(kinds("2026-10-26")).toEqual([]);
    expect(kinds("2026-10-27")).toEqual(["renewal-soon"]);
  });

  it("an unknown auto-renew produces nothing", () => {
    expect(buildCostReport([item({ id: "a", autoRenew: null })], NOW).attention).toEqual([]);
  });
});

describe("buildCostReport renewals (R7)", () => {
  it("lists the one dated renewal at its renewal price", () => {
    expect(buildCostReport(RUNNING_COST_ITEMS, NOW).renewals).toEqual([
      { id: "domain-nocaped", renewsOn: "2027-08-15", amountCents: 1117 },
    ]);
  });

  it("is sorted by date and uses the item's own amount when there is no price change", () => {
    const report = buildCostReport(
      [
        item({ id: "late", amountCents: 900, period: "year", renewsOn: "2028-01-01" }),
        item({ id: "early", amountCents: 700, period: "year", renewsOn: "2027-01-01" }),
      ],
      NOW,
    );
    expect(report.renewals).toEqual([
      { id: "early", renewsOn: "2027-01-01", amountCents: 700 },
      { id: "late", renewsOn: "2028-01-01", amountCents: 900 },
    ]);
  });
});

describe("buildCostReport unpriced and zero (R8)", () => {
  it("lists the five items with no fixed amount", () => {
    expect(buildCostReport(RUNNING_COST_ITEMS, NOW).unpriced.sort()).toEqual(
      ["cloudflare-email", "stripe", "workers-ai", "claude", "gemini-pro"].sort(),
    );
  });

  it("a registry of only free items totals zero", () => {
    const report = buildCostReport([item({ id: "a" }), item({ id: "b" })], NOW);
    expect(report.current.annualCents).toBe(0);
    expect(report.unpriced).toEqual([]);
  });
});

describe("buildCostReport groups, staleness and owner confirmations (#1309 R4)", () => {
  it("totals each group with the current rule", () => {
    expect(buildCostReport(RUNNING_COST_ITEMS, NOW).byGroup).toEqual({
      "platform-fixed": { annualCents: 7046, monthlyCents: 587 },
      "platform-usage": { annualCents: 0, monthlyCents: 0 },
      "dev-tools": { annualCents: 0, monthlyCents: 0 },
    });
  });

  it("nothing is stale on 2026-10-27; on 2026-12-01 exactly the monthly items are", () => {
    expect(buildCostReport(RUNNING_COST_ITEMS, NOW).stale).toEqual([]);
    const monthly = RUNNING_COST_ITEMS.filter((i) => i.reviewEvery === "month").map((i) => i.id);
    expect(
      buildCostReport(RUNNING_COST_ITEMS, new Date("2026-12-01T00:00:00Z")).stale.sort(),
    ).toEqual(monthly.sort());
  });

  it("an item 31 days old is not stale and 32 days old is", () => {
    const stale = (asOf: string) => buildCostReport([item({ id: "a", asOf })], NOW).stale;
    expect(stale("2026-09-26")).toEqual([]);
    expect(stale("2026-09-25")).toEqual(["a"]);
  });

  it("lists the unverified items for the owner to confirm", () => {
    expect(buildCostReport(RUNNING_COST_ITEMS, NOW).ownerToConfirm.sort()).toEqual(
      ["stripe", "claude", "gemini-pro"].sort(),
    );
  });
});
