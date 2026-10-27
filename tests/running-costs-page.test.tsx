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
// #1309 R23, R25, R28-R33: the dashboard sections.
// ---------------------------------------------------------------------------------------------

async function analysisNow() {
  const { analyse, COMMITTED } = await import("@/lib/pricing/committed");
  return analyse(COMMITTED, new Date());
}

describe("heading, advisory banner and print (R25, R28)", () => {
  it("titles the page and states that it is advisory", async () => {
    const container = await renderPage();
    expect(text(container, "h1")).toBe("Costs, Pricing & Business Model");
    const banner = text(container, '[data-costs="advisory"]');
    expect(banner).toMatch(/advisory/);
    expect(banner).toMatch(/not traded/);
    expect(banner).toMatch(/changes live prices/);
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

describe("sections (R29)", () => {
  it("renders the six sections in order, each of the first five with date, stale count and CSV", async () => {
    const container = await renderPage();
    const sections = [...container.querySelectorAll("[data-section]")].map((s) =>
      s.getAttribute("data-section"),
    );
    expect(sections).toEqual([
      "costs",
      "competitors",
      "pricing",
      "profitability",
      "models",
      "review",
    ]);
    const csv: Record<string, string> = {
      costs: "costs",
      competitors: "competitors",
      pricing: "plans",
      profitability: "scenarios",
      models: "models",
    };
    for (const [section, file] of Object.entries(csv)) {
      const el = container.querySelector(`[data-section="${section}"]`)!;
      expect(el.querySelector("[data-section-updated]")?.textContent, section).toBe(
        "Last updated 2026-10-27",
      );
      expect(el.querySelector("[data-section-stale]")?.getAttribute("data-section-stale")).toBe(
        "0",
      );
      expect(el.querySelector("[data-csv-link]")?.getAttribute("href")).toBe(
        `/staff/platform/costs/export?section=${file}`,
      );
    }
  });
});

describe("costs section (R30)", () => {
  it("groups the items with their group totals", async () => {
    const container = await renderPage();
    expect(container.textContent).toContain("Platform running costs (fixed)");
    expect(container.textContent).toContain("Platform running costs (usage-based)");
    expect(container.textContent).toContain("Development tools");
    expect(text(container, '[data-cost-group-total="platform-fixed"]')).toContain("$5.87/month");
    expect(text(container, '[data-cost-group-total="platform-fixed"]')).toContain("$70.46/year");
    expect(text(container, '[data-cost-group-total="dev-tools"]')).toContain("$0.00/month");
    expect(
      container.querySelectorAll('[data-cost-group="dev-tools"] [data-costs-item]').length,
    ).toBe(4);
  });

  it("lists the four owner-to-confirm items", async () => {
    const container = await renderPage();
    const ids = [...container.querySelectorAll("[data-owner-to-confirm]")].map((li) =>
      li.getAttribute("data-owner-to-confirm"),
    );
    expect(ids.sort()).toEqual(["claude", "cloudflare-email", "gemini-pro", "stripe"]);
  });

  it("shows an open-licence item as free with a licence link", async () => {
    const container = await renderPage();
    const card = container.querySelector('[data-costs-item="open-food-facts"]')!;
    expect(card.textContent).toContain("Free (open licence)");
    expect(
      card.querySelector('a[href="https://world.openfoodfacts.org/terms-of-use"]'),
    ).not.toBeNull();
  });
});

describe("competitors section (R31)", () => {
  it("renders one element per competitor with sources, and no figures for unread ones", async () => {
    const container = await renderPage();
    expect(container.querySelectorAll("[data-competitor]").length).toBe(10);
    const shopify = container.querySelector('[data-competitor="shopify"]')!;
    expect(shopify.textContent).toContain("£25.00");
    expect(shopify.textContent).toContain("2%");
    expect(shopify.querySelector('a[href="https://www.shopify.com/uk/pricing"]')).not.toBeNull();
    expect(shopify.textContent).toContain("2026-10-27");
    expect(text(container, '[data-competitor="just-eat"]')).toContain(
      "Not published by the provider",
    );
    expect(text(container, '[data-competitor="wix"]')).toContain("Pricing page could not be read");
    for (const id of ["just-eat", "wix", "deliveroo", "snappy-shopper"]) {
      const body = text(container, `[data-competitor="${id}"]`);
      expect(body, id).not.toMatch(/[£$]\d|\d%/);
    }
  });

  it("compares every proposed plan with every published competitor plan", async () => {
    const container = await renderPage();
    const { PROPOSED_PLANS } = await import("@/lib/pricing/proposed-plans");
    const { COMPETITORS } = await import("@/lib/pricing/competitors");
    const published = COMPETITORS.flatMap((c) => c.plans).length;
    expect(container.querySelectorAll("[data-comparison-row]").length).toBe(
      PROPOSED_PLANS.length * published,
    );
  });
});

describe("pricing and profitability sections (R32)", () => {
  it("labels each proposed plan a proposal and shows its VAT note", async () => {
    const container = await renderPage();
    const plans = container.querySelectorAll("[data-plan]");
    expect(plans.length).toBe(4);
    for (const plan of plans) {
      expect(plan.textContent).toContain("Proposal");
      expect(plan.textContent).toContain("exclude VAT");
    }
  });

  it("every break-even and scenario figure equals buildPricingAnalysis", async () => {
    const container = await renderPage();
    const analysis = await analysisNow();
    const { formatMoney, gbp, formatBps } = await import("@/lib/pricing/money");
    const fx = text(container, '[data-costs="fx"]');
    expect(fx).toContain(formatMoney(gbp(analysis.costPence!)));
    expect(fx).toContain("bankofengland.co.uk");
    for (const s of analysis.scenarios) {
      const row = text(container, `[data-scenario="${s.planId}-${s.vendors}"]`);
      expect(row).toContain(formatMoney(gbp(s.revenuePence)));
      expect(row).toContain(formatMoney(gbp(s.profitPence!)));
      expect(row).toContain(s.marginBps === null ? "n/a" : formatBps(s.marginBps));
    }
    for (const p of analysis.plans) {
      const row = text(container, `[data-break-even="${p.planId}"]`);
      if (p.breakEvenVendors !== null) expect(row).toContain(`${p.breakEvenVendors} vendor`);
      if (p.breakEvenGmvPence !== null) {
        expect(row).toContain(formatMoney(gbp(p.breakEvenGmvPence)));
      }
    }
    expect(container.textContent).toContain("At zero sales");
    expect(container.textContent).toContain("Excludes the per-order card fee");
    expect(text(container, '[data-break-even="freemium"]')).toContain(
      "Commission does not cover card fees",
    );
    expect(container.querySelector('[data-ranking="vendors"]')).not.toBeNull();
    expect(container.querySelector('[data-ranking="gmv"]')).not.toBeNull();
  });

  it("says GBP figures are unavailable with no exchange rate", async () => {
    vi.doMock("@/lib/pricing/assumptions", async (importOriginal) => {
      const real = await importOriginal<typeof import("@/lib/pricing/assumptions")>();
      return {
        ...real,
        ASSUMPTIONS: real.ASSUMPTIONS.map((a) =>
          a.id === "usd-cents-per-gbp"
            ? { ...a, value: null, basis: "missing" as const, sourceUrl: null }
            : a,
        ),
      };
    });
    const container = await renderPage();
    expect(text(container, '[data-costs="fx"]')).toBe("No exchange rate: GBP figures unavailable");
    expect(text(container, '[data-break-even="subscription"]')).toContain("No exchange rate");
  });
});

describe("business models section (R33)", () => {
  it("renders six models, marks the recommendation, and shows Not modelled where there is no plan", async () => {
    const container = await renderPage();
    expect(container.querySelectorAll("[data-model]").length).toBe(6);
    expect(
      container.querySelector('[data-model="hybrid"] [data-costs="recommended"]'),
    ).not.toBeNull();
    expect(text(container, '[data-model="transaction-fee"]')).toContain("Not modelled");
    expect(text(container, '[data-model="usage-based"]')).toContain("Not modelled");
    expect(text(container, '[data-model="hybrid"]')).toContain("2027-01-27");
    expect(container.querySelector('[data-costs="recommendation-disagrees"]')).toBeNull();
    expect(container.querySelector('[data-costs="recommendation-overdue"]')).toBeNull();
  });

  it("warns when the recommendation is overdue", async () => {
    vi.setSystemTime(new Date("2027-02-01T12:00:00Z"));
    const container = await renderPage();
    expect(container.querySelector('[data-costs="recommendation-overdue"]')).not.toBeNull();
  });

  it("warns when the numbers no longer put the recommended plan first", async () => {
    vi.doMock("@/lib/pricing/business-models", async (importOriginal) => {
      const real = await importOriginal<typeof import("@/lib/pricing/business-models")>();
      return { ...real, RECOMMENDATION: { ...real.RECOMMENDATION, modelId: "subscription" } };
    });
    const container = await renderPage();
    expect(container.querySelector('[data-costs="recommendation-disagrees"]')).not.toBeNull();
  });
});

describe("review panel (R23)", () => {
  it("renders both buttons, the last analysis date and the not-saved sentence", async () => {
    const container = await renderPage();
    const panel = container.querySelector('[data-costs="review-panel"]')!;
    const labels = [...panel.querySelectorAll("button")].map((b) => b.textContent);
    expect(labels).toEqual(["Refresh Costs", "Refresh Recommendations"]);
    expect(panel.textContent).toContain("Last analysis: 2026-10-27");
    expect(panel.textContent).toContain(
      "Suggestions are not saved. Accept one by updating the registry in a pull request.",
    );
  });
});
