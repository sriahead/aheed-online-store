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
});

describe("access (R11)", () => {
  const SECRETS = ["$70.46", "data-costs-item", "domain-nocaped"];

  it("renders the report for a platform admin", async () => {
    const container = await renderPage();
    expect(container.querySelectorAll("[data-costs-item]").length).toBe(11);
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
    expect(source).toContain('title: "Running Costs"');
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
    expect(others.length).toBe(10);
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
    expect(container.querySelectorAll("[data-costs-item]").length).toBe(4);
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
