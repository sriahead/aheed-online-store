// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #1295 R10-R14: the platform-admin running-costs page. Auth and the one live read are mocked; the
 * registry is the real one unless a test swaps it, and the clock is pinned so the "needs attention"
 * list and the totals are exact.
 */

const PAGE = "app/(admin)/staff/platform/costs/page.tsx";

const requireVendorRole = vi.fn();
const getPlatformAiNeuronsToday = vi.fn();
const redirect = vi.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`);
});

vi.mock("@/lib/auth-rbac", () => ({ requireVendorRole }));
vi.mock("@/lib/ai-usage-service", () => ({ getPlatformAiNeuronsToday }));
vi.mock("next/navigation", () => ({ redirect }));
// #1309: the review panel's actions reach the database and the network; the page test needs neither.
vi.mock("@/app/(admin)/staff/platform/costs/actions", () => ({
  refreshCostsAction: vi.fn(),
  refreshRecommendationsAction: vi.fn(),
}));

const platformAdmin = { ok: true, via: "platform-admin", vendorId: "v1" };

async function renderPage() {
  const { default: Page } = await import("@/app/(admin)/staff/platform/costs/page");
  const view = render(await Page());
  return view.container;
}

function text(container: HTMLElement, selector: string): string {
  const element = container.querySelector(selector);
  if (!element) throw new Error(`nothing matches ${selector}`);
  return element.textContent ?? "";
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
  requireVendorRole.mockReset();
  requireVendorRole.mockResolvedValue(platformAdmin);
  getPlatformAiNeuronsToday.mockReset();
  getPlatformAiNeuronsToday.mockResolvedValue({ plan: "free", neurons: 4200 });
  redirect.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.doUnmock("@/lib/running-costs");
  vi.doUnmock("@/lib/pricing/competitors");
  vi.doUnmock("@/lib/pricing/assumptions");
  vi.doUnmock("@/lib/pricing/business-models");
});

describe("access (R11)", () => {
  const SECRETS = ["$70.46", "data-costs-item", "domain-nocaped"];

  it("renders the report for a platform admin", async () => {
    const container = await renderPage();
    expect(container.querySelectorAll("[data-costs-item]").length).toBe(17);
  });

  it("refuses a vendor ADMIN who is not a platform admin, with no registry value in the output", async () => {
    requireVendorRole.mockResolvedValue({ ok: true, via: "ADMIN", vendorId: "v1" });
    const container = await renderPage();
    expect(container.textContent).toContain("Platform admin only");
    for (const secret of SECRETS) expect(container.innerHTML).not.toContain(secret);
    expect(getPlatformAiNeuronsToday).not.toHaveBeenCalled();
  });

  it("refuses a 403 result the same way", async () => {
    requireVendorRole.mockResolvedValue({ ok: false, status: 403, reason: "forbidden" });
    const container = await renderPage();
    expect(container.textContent).toContain("Platform admin only");
    for (const secret of SECRETS) expect(container.innerHTML).not.toContain(secret);
  });

  it("redirects a signed-out caller to /login", async () => {
    requireVendorRole.mockResolvedValue({ ok: false, status: 401, reason: "unauthenticated" });
    await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("is dynamic, titled, wide, and imports no database client", () => {
    const source = readFileSync(PAGE, "utf8");
    expect(source).toMatch(/dynamic = "force-dynamic"/);
    expect(source).toContain('title: "Costs, Pricing & Business Model"');
    expect(source).toContain('width="wide"');
    expect(source).toContain('requireVendorRole("ADMIN")');
    expect(source).not.toMatch(/@\/lib\/db|@prisma/);
    expect(source).not.toMatch(/\bfetch\(/);
  });
});

describe("Workers AI usage row (R10)", () => {
  it("shows neurons against the allowance on the Free plan", async () => {
    const row = text(await renderPage(), '[data-costs-usage="workers-ai"]');
    expect(row).toContain("4,200");
    expect(row).toContain("10,000");
    expect(row).toContain("Free");
    expect(row).not.toContain("Estimated charge");
  });

  it("adds an estimated charge on the Paid plan", async () => {
    getPlatformAiNeuronsToday.mockResolvedValue({ plan: "paid", neurons: 12000 });
    const row = text(await renderPage(), '[data-costs-usage="workers-ai"]');
    expect(row).toContain("Paid");
    expect(row).toContain("12,000");
    expect(row).toContain("$0.03");
  });

  it("says unavailable, never zero, when the read fails", async () => {
    getPlatformAiNeuronsToday.mockRejectedValue(new Error("db down"));
    const row = text(await renderPage(), '[data-costs-usage="workers-ai"]');
    expect(row).toContain("Usage unavailable");
    expect(row).not.toMatch(/\d/);
  });

  it("every other row says usage is not monitored", async () => {
    const container = await renderPage();
    const others = [...container.querySelectorAll("[data-costs-item]")].filter(
      (card) => card.getAttribute("data-costs-item") !== "workers-ai",
    );
    expect(others.length).toBe(16);
    for (const card of others) {
      expect(
        card.querySelector("[data-costs-usage]")?.textContent,
        card.getAttribute("data-costs-item") ?? "",
      ).toBe("Usage not monitored");
    }
  });
});

describe("report content (R12)", () => {
  it("shows the six pinned totals", async () => {
    const container = await renderPage();
    const total = (name: string) => text(container, `[data-costs-total="${name}"]`);
    expect(total("current-monthly")).toBe("$5.87");
    expect(total("current-annual")).toBe("$70.46");
    expect(total("planned-monthly")).toBe("$7.19");
    expect(total("planned-annual")).toBe("$86.22");
    expect(total("renewal-monthly")).toBe("$7.30");
    expect(total("renewal-annual")).toBe("$87.64");
  });

  it("lists the three attention entries, the one renewal and the currency note", async () => {
    const container = await renderPage();
    const attention = [...container.querySelectorAll("[data-costs-attention] li")];
    expect(attention.length).toBe(3);
    const joined = attention.map((entry) => entry.textContent).join(" ");
    expect(joined).toContain("nocaped.com");
    expect(joined).toContain("merqify.com");
    const renewals = container.querySelectorAll("[data-costs-renewals] li");
    expect(renewals.length).toBe(1);
    expect(renewals[0].textContent).toContain("2027-08-15");
    expect(renewals[0].textContent).toContain("$11.17");
    const note = text(container, '[data-costs="currency-note"]');
    expect(note).toContain("US dollars");
    expect(note).toContain("pounds");
  });
});

describe("zero state (R13)", () => {
  it("is absent for the real registry", async () => {
    const container = await renderPage();
    expect(container.querySelector('[data-costs="zero-notice"]')).toBeNull();
  });

  it("says nothing is billed when every item is free, and still lists each item", async () => {
    vi.doMock("@/lib/running-costs", async (importOriginal) => {
      const real = await importOriginal<typeof import("@/lib/running-costs")>();
      return {
        ...real,
        RUNNING_COST_ITEMS: real.RUNNING_COST_ITEMS.filter((item) => item.amountCents === 0),
      };
    });
    const container = await renderPage();
    expect(text(container, '[data-costs="zero-notice"]')).toBe("Nothing is currently billed.");
    expect(container.querySelectorAll("[data-costs-item]").length).toBe(8);
    expect(text(container, '[data-costs-total="planned-annual"]')).toBe("$0.00");
  });
});

describe("each item row (R14)", () => {
  async function card(id: string): Promise<string> {
    return text(await renderPage(), `[data-costs-item="${id}"]`);
  }

  it("labels the status", async () => {
    const container = await renderPage();
    const status = (id: string) => text(container, `[data-costs-item="${id}"] [data-costs-status]`);
    expect(status("cloudflare-workers")).toBe("Actual");
    expect(status("domain-merqify")).toBe("Planned");
    expect(status("workers-ai")).toBe("Estimate");
    expect(status("stripe")).toBe("Unverified");
  });

  it("shows the monthly Workers cost", async () => {
    expect(await card("cloudflare-workers")).toContain("$5.00/month");
  });

  it("shows nocaped.com's cost, auto-renew warning and price change", async () => {
    const body = await card("domain-nocaped");
    expect(body).toContain("$10.46/year");
    expect(body).toContain("Auto-renew off");
    expect(body).toContain("$11.17");
    expect(body).toContain("2026-11-01");
    expect(body).toContain("2027-08-15");
  });

  it("marks planned domains as not yet registered", async () => {
    expect(await card("domain-merqify")).toContain("Not yet registered");
    expect(await card("domain-aheedfoodcentre")).toContain("Not yet registered");
  });

  it("says Not priced for an item with no amount", async () => {
    expect(await card("stripe")).toContain("Not priced");
  });

  it("shows recorded limits with their source and the unconfirmed label", async () => {
    const body = await card("cloudflare-r2");
    expect(body).toContain("developers.cloudflare.com");
    expect(body).toContain("2026-10-27");
    expect(body).toContain("Not confirmed by the owner");
    expect(body).toContain("10 GB-month");
  });

  it("says limits are not recorded when there are none", async () => {
    expect(await card("github")).toContain("Limits not recorded");
  });
});

// ---------------------------------------------------------------------------------------------
// #1309 R23, R25 and #1313 R26-R33: the dashboard sections.
// ---------------------------------------------------------------------------------------------

const BUILD_DAY = new Date("2026-10-28T12:00:00Z");

async function analysisNow() {
  const { analyseV2, COMMITTED } = await import("@/lib/pricing/committed");
  return { analysis: analyseV2(COMMITTED, new Date()), COMMITTED };
}

async function money(value: number | null) {
  const { pence } = await import("@/components/staff/PricingDashboardSections");
  return pence(value);
}

describe("heading, advisory banner and print (#1309 R25, #1313 R26)", () => {
  it("titles the page and states that it is advisory, excludes VAT and assumes Connect", async () => {
    const container = await renderPage();
    expect(text(container, "h1")).toBe("Costs, Pricing & Business Model");
    const banner = text(container, '[data-costs="advisory"]');
    expect(banner).toMatch(/advisory/);
    expect(banner).toMatch(/not traded/);
    expect(banner).toMatch(/changes live prices/);
    expect(banner).toMatch(/excluding VAT/);
    expect(banner).toMatch(/Stripe Connect[\s\S]*planning assumption/);
  });

  it("offers Print / Save as PDF and hides controls when printing", async () => {
    const container = await renderPage();
    const print = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Print / Save as PDF",
    );
    expect(print?.className).toContain("print:hidden");
    expect(container.querySelector('[data-costs="review-panel"]')?.className).toContain(
      "print:hidden",
    );
    for (const link of container.querySelectorAll("[data-csv-link]")) {
      expect(link.className).toContain("print:hidden");
    }
    expect(readFileSync("components/staff/PanelNav.tsx", "utf8")).toContain("print:hidden");
  });
});

describe("sections (R26)", () => {
  it("renders the nine sections in order, each with date, stale count and CSV", async () => {
    vi.setSystemTime(BUILD_DAY);
    const container = await renderPage();
    const sections = [...container.querySelectorAll("[data-section]")].map((s) =>
      s.getAttribute("data-section"),
    );
    expect(sections).toEqual([
      "costs",
      "production",
      "competitors",
      "models",
      "what-if",
      "add-ons",
      "risks",
      "recommendation",
      "review",
    ]);
    const expected: Record<string, [string, string]> = {
      costs: ["costs", "2026-10-27"],
      production: ["production", "2026-10-28"],
      competitors: ["competitors", "2026-10-27"],
      models: ["models", "2026-10-28"],
      "add-ons": ["add-ons", "2026-10-28"],
      risks: ["risks", "2026-10-28"],
      recommendation: ["models", "2026-10-28"],
    };
    for (const [section, [csv, date]] of Object.entries(expected)) {
      const el = container.querySelector(`[data-section="${section}"]`)!;
      expect(el.querySelector("[data-section-updated]")?.textContent, section).toBe(
        `Last updated ${date}`,
      );
      expect(
        el.querySelector("[data-section-stale]")?.getAttribute("data-section-stale"),
        section,
      ).toBe("0");
      expect(el.querySelector("[data-csv-link]")?.getAttribute("href"), section).toBe(
        `/staff/platform/costs/export?section=${csv}`,
      );
    }
    for (const section of ["what-if", "review"]) {
      expect(
        container.querySelector(`[data-section="${section}"] [data-section-updated]`),
      ).toBeNull();
    }
  });
});

describe("costs section unchanged (R27)", () => {
  it("groups the items with their group totals", async () => {
    const container = await renderPage();
    expect(container.querySelectorAll("[data-costs-item]").length).toBe(17);
    expect(text(container, '[data-cost-group-total="platform-fixed"]')).toContain("$5.87/month");
    expect(text(container, '[data-cost-group-total="platform-fixed"]')).toContain("$70.46/year");
    expect(text(container, '[data-cost-group-total="dev-tools"]')).toContain("$0.00/month");
    const ids = [...container.querySelectorAll("[data-owner-to-confirm]")].map((li) =>
      li.getAttribute("data-owner-to-confirm"),
    );
    expect(ids.sort()).toEqual(["claude", "gemini-pro", "stripe"]);
    const card = container.querySelector('[data-costs-item="open-food-facts"]')!;
    expect(card.textContent).toContain("Free (open licence)");
  });
});

describe("production section (R28)", () => {
  it("renders the cost grid, partner time, first limits, start-up costs, Connect and drivers", async () => {
    vi.setSystemTime(BUILD_DAY);
    const container = await renderPage();
    const { analysis, COMMITTED } = await analysisNow();
    expect(container.querySelectorAll("[data-production-cell]").length).toBe(18);
    const first = analysis.grid.find(
      (g) =>
        g.modelId === COMMITTED.models[0].id &&
        g.shops === 10 &&
        g.ordersPerShop === 500 &&
        g.basketPence === 2500,
    )!.evaluation.cost;
    expect(text(container, '[data-production-cell="10-500"]')).toContain(
      await money(first.currentFixedPence! + first.driversPence! + first.connectPence),
    );
    expect(container.querySelectorAll("[data-partner-time]").length).toBe(6);
    expect(text(container, '[data-partner-time="10"]')).toContain(
      await money(first.partnerTimePence),
    );
    expect(container.querySelectorAll("[data-first-limit]").length).toBe(3);
    expect(text(container, '[data-first-limit="2000"]')).toMatch(/at \d+ shops?/);
    expect(text(container, '[data-costs="startup"]')).toContain(await money(analysis.startupPence));
    expect(container.querySelectorAll("[data-connect-option]").length).toBe(2);
    expect(
      container.querySelector(
        '[data-connect-option="stripe-pricing"] [data-costs="connect-modelled"]',
      ),
    ).not.toBeNull();
    expect(text(container, '[data-connect-option="stripe-pricing"]')).toContain("No platform fees");
    expect(container.querySelectorAll("[data-cost-driver]").length).toBe(COMMITTED.drivers.length);
    expect(text(container, '[data-cost-driver="accountant"]')).toContain("Estimate");
    expect(
      container.querySelector(
        '[data-cost-driver="neon-production"] a[href="https://neon.com/pricing"]',
      ),
    ).not.toBeNull();
  });
});

describe("competitors section (R33)", () => {
  it("keeps one element per competitor and drops the v1 comparison table", async () => {
    const container = await renderPage();
    expect(container.querySelectorAll("[data-competitor]").length).toBe(10);
    expect(text(container, '[data-competitor="wix"]')).toContain("Pricing page could not be read");
    expect(container.querySelector('[data-costs="comparison"]')).toBeNull();
    expect(
      container.querySelector('[data-section="competitors"] [data-comparison-row]'),
    ).toBeNull();
  });
});

describe("models section (R29)", () => {
  it("shows every model's reference figures equal to analyseV2", async () => {
    vi.setSystemTime(BUILD_DAY);
    const container = await renderPage();
    const { analysis } = await analysisNow();
    expect(container.querySelectorAll("[data-model]").length).toBe(4);
    for (const m of analysis.models) {
      const el = (fig: string) =>
        text(container, `[data-model="${m.modelId}"] [data-model-figure="${fig}"]`);
      expect(el("shop-pays")).toBe(await money(m.reference.shopPays.totalPence));
      expect(el("revenue")).toBe(await money(m.reference.revenuePence));
      expect(el("cost")).toBe(await money(m.reference.cost.totalPence));
      expect(el("margin")).toBe(await money(m.reference.marginPence));
      expect(el("margin-per-shop")).toBe(await money(m.reference.marginPerShopPence));
      expect(el("pay-target")).toBe("Enter a pay target in What if");
    }
    expect(text(container, '[data-costs="card-fee-note"]')).toBe(
      "Includes the shop's own card fees (1.5% + 20p per order, UK cards)",
    );
  });

  it("compares every model and comparator, with the £15 and £40 tables closed", async () => {
    vi.setSystemTime(BUILD_DAY);
    const container = await renderPage();
    const { analysis } = await analysisNow();
    const block = container.querySelector("[data-comparison]")!;
    expect(block.querySelectorAll("table").length).toBe(3);
    const details = block.querySelectorAll("details");
    expect(details.length).toBe(2);
    for (const d of details) expect(d.hasAttribute("open")).toBe(false);
    for (const row of analysis.comparisons) {
      const cell = text(
        container,
        `[data-comparison-cell="${row.comparatorId}-${row.ordersPerShop}-${row.basketPence}"]`,
      );
      expect(cell).toContain(await money(row.monthlyPence));
      if (row.setupPence) expect(cell).toContain("one-off");
    }
    for (const g of analysis.grid.filter((x) => x.shops === analysis.referenceScenario.shops)) {
      const cell = text(
        container,
        `[data-comparison-cell="${g.modelId}-${g.ordersPerShop}-${g.basketPence}"]`,
      );
      expect(cell).toBe(await money(g.evaluation.shopPays.totalPence));
    }
  });
});

describe("what-if section (R30)", () => {
  it("renders the panel with its not-saved sentence and committed defaults", async () => {
    vi.setSystemTime(BUILD_DAY);
    const container = await renderPage();
    const section = container.querySelector('[data-section="what-if"]')!;
    expect(section.textContent).toContain("These figures are not saved");
    const input = (id: string) =>
      (section.querySelector(`[data-what-if-input="${id}"]`) as HTMLInputElement).value;
    expect(input("ratePence")).toBe("25");
    expect(input("payTargetPence")).toBe("");
    expect(input("increaseBps")).toBe("");
  });
});

describe("add-ons section (R31)", () => {
  it("renders every add-on with its class, packaging and launch label", async () => {
    vi.setSystemTime(BUILD_DAY);
    const container = await renderPage();
    const { COMMITTED } = await analysisNow();
    expect(container.querySelectorAll("[data-add-on]").length).toBe(12);
    for (const a of COMMITTED.addOns) {
      const el = container.querySelector(`[data-add-on="${a.id}"]`)!;
      expect(el.querySelector(`[data-add-on-class="${a.marginClass}"]`), a.id).not.toBeNull();
      expect(el.textContent).toContain(
        a.marginClass === "cheap-high-margin"
          ? "Cheap to run, high margin"
          : "Usage-heavy: priced to cover use",
      );
      expect(el.textContent).toContain(
        a.packaging === "separate" ? "Sold separately" : "Included in",
      );
      expect(el.querySelector("[data-add-on-launch]") !== null, a.id).toBe(
        COMMITTED.recommendation.launchAddOnIds.includes(a.id),
      );
      if (!a.available) expect(el.textContent).toContain("Not available yet");
    }
  });
});

describe("risks and recommendation sections (R32)", () => {
  it("renders every risk and the recommendation with its founding offer and three metrics", async () => {
    vi.setSystemTime(BUILD_DAY);
    const container = await renderPage();
    const { COMMITTED } = await analysisNow();
    expect(container.querySelectorAll("[data-risk]").length).toBe(COMMITTED.risks.length);
    expect(text(container, '[data-risk="vat-registration-threshold"]')).toContain("£90,000");
    expect(container.querySelectorAll("[data-track]").length).toBe(3);
    const offer = text(container, "[data-founding-offer]");
    expect(offer).toContain(COMMITTED.recommendation.foundingOffer.startsOn);
    expect(offer).toContain(COMMITTED.recommendation.foundingOffer.reviewOn);
    expect(offer).toContain(COMMITTED.recommendation.foundingOffer.reviewClause);
    expect(container.querySelectorAll("[data-launch-add-on]").length).toBe(
      COMMITTED.recommendation.launchAddOnIds.length,
    );
    expect(container.querySelector('[data-costs="recommendation-disagrees"]')).toBeNull();
    expect(container.querySelector('[data-costs="recommendation-overdue"]')).toBeNull();
  });

  it("warns when the recommendation is overdue", async () => {
    vi.setSystemTime(new Date("2027-02-01T12:00:00Z"));
    const container = await renderPage();
    expect(container.querySelector('[data-costs="recommendation-overdue"]')).not.toBeNull();
  });

  it("warns when the numbers no longer support the recommended model", async () => {
    vi.setSystemTime(BUILD_DAY);
    vi.doMock("@/lib/pricing/business-models", async (importOriginal) => {
      const real = await importOriginal<typeof import("@/lib/pricing/business-models")>();
      return {
        ...real,
        RECOMMENDATION: { ...real.RECOMMENDATION, modelId: "allowance-per-order" as const },
      };
    });
    const container = await renderPage();
    expect(container.querySelector('[data-costs="recommendation-disagrees"]')).not.toBeNull();
  });
});

describe("review panel (#1309 R23)", () => {
  it("renders both buttons, the last analysis date and the not-saved sentence", async () => {
    vi.setSystemTime(BUILD_DAY);
    const container = await renderPage();
    const panel = container.querySelector('[data-costs="review-panel"]')!;
    const labels = [...panel.querySelectorAll("button")].map((b) => b.textContent);
    expect(labels).toEqual(["Refresh Costs", "Refresh Recommendations"]);
    expect(panel.textContent).toContain("Last analysis: 2026-10-28");
    expect(panel.textContent).toContain(
      "Suggestions are not saved. Accept one by updating the registry in a pull request.",
    );
  });
});
