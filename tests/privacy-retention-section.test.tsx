// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

/**
 * #1041 / #1107 R16–R20 — `/privacy` section 5 discloses every record holding a hashed network
 * address, with retention rendered from `lib/data-retention.ts`.
 *
 * WHAT IT PROVES. The exact wording (R16–R19), and that the figures come from the shared constants
 * rather than literals (R20: the last suite mocks the constants and sees the text move). It cannot
 * prove the sweeps delete on time — they are probabilistic, which is why the copy says "due for
 * deletion" and "routine clean-up" rather than "deleted after".
 */

vi.mock("@/lib/vendor-service", () => ({
  getCurrentVendorProfile: vi.fn(async () => ({ name: "Some Vendor" })),
}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/auth-rbac", () => ({ getUserId: vi.fn() }));

const squash = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();

async function sectionFive(): Promise<HTMLElement> {
  const { default: PrivacyPage } = await import("@/app/(storefront)/privacy/page");
  const { container } = render(await PrivacyPage());
  const heading = [...container.querySelectorAll("h2")].find(
    (h) => h.textContent === "5. How Long We Keep Your Data",
  );
  if (!heading?.parentElement) throw new Error("no section 5 rendered");
  return heading.parentElement;
}

const paragraphLedBy = (section: HTMLElement, lead: string) => {
  const p = [...section.querySelectorAll("p")].find(
    (el) => el.querySelector("strong")?.textContent === lead,
  );
  if (!p) throw new Error(`no paragraph led by "${lead}"`);
  return squash(p.textContent);
};

afterEach(() => {
  cleanup();
  vi.doUnmock("@/lib/data-retention");
  vi.resetModules();
});

describe("privacy page section 5 — hashed-IP records (#1041)", () => {
  it("R16: the Searches paragraph is the approved text, lead in bold", async () => {
    expect(paragraphLedBy(await sectionFive(), "Searches.")).toBe(
      "Searches. When you search the shop, we record what you searched for and how many results it found, together with a scrambled (hashed) form of your network address, so the shop can see what shoppers look for and cannot find. This record is not linked to your name or your account. It becomes due for deletion after 90 days and is removed by routine clean-up after that.",
    );
  });

  it("R17: the abuse-protection paragraph is the approved text, lead in bold", async () => {
    expect(paragraphLedBy(await sectionFive(), "Records that protect the shop from abuse.")).toBe(
      "Records that protect the shop from abuse. When you sign in, create an account or reset a password, look up an order, enter a discount code we do not recognise, send feedback, or paste a shopping list for the shop to match, we briefly record that it happened, together with a scrambled (hashed) form of your network address, so that repeated attempts can be slowed down. These records are not linked to your name or your account. Each becomes due for deletion after one hour and is removed by routine clean-up after that.",
    );
  });

  it("R18: the help-assistant paragraph keeps its opening and ends with the aligned wording", async () => {
    const text = paragraphLedBy(await sectionFive(), "The help assistant.");
    expect(text).toMatch(
      /^The help assistant\. If a store offers a help assistant and you use it, we record the topic you chose/,
    );
    expect(
      text.endsWith(
        "This record is not linked to your name or your account. It becomes due for deletion after 90 days and is removed by routine clean-up after that.",
      ),
    ).toBe(true);
  });

  it("R19: the feedback paragraph names the hashed address kept with it", async () => {
    const text = paragraphLedBy(await sectionFive(), "Feedback you leave about the shop.");
    expect(
      text.endsWith(
        "We also keep a scrambled (hashed) form of your network address with your feedback, used only to investigate abuse, and it is removed with your feedback.",
      ),
    ).toBe(true);
  });
});

describe("privacy page section 5 — figures come from lib/data-retention.ts (R20)", () => {
  it("renders whatever the constants say", async () => {
    vi.resetModules();
    vi.doMock("@/lib/data-retention", () => ({
      SEARCH_QUERY_LOG_RETENTION_DAYS: 30,
      ASSISTANT_CONVERSATION_RETENTION_DAYS: 45,
      ATTEMPT_RECORD_RETENTION_HOURS: 2,
    }));
    const section = await sectionFive();
    expect(paragraphLedBy(section, "Searches.")).toContain("due for deletion after 30 days");
    expect(paragraphLedBy(section, "The help assistant.")).toContain(
      "due for deletion after 45 days",
    );
    expect(paragraphLedBy(section, "Records that protect the shop from abuse.")).toContain(
      "due for deletion after 2 hours",
    );
  });
});
