import { describe, it, expect } from "vitest";
import { TELEGRAM_QUICK_LINKS, TELEGRAM_RUNBOOK_HREF } from "@/lib/client-setup/telegram-links";

/**
 * The Client Setup "Order alerts" card's Telegram quick links. The two properties that matter:
 * every external link is an official Telegram domain, and no link can ever carry a bot token
 * (a `/bot<token>/` path is what `getUpdates` URLs look like).
 */

const OFFICIAL = /^https:\/\/(t\.me|telegram\.org|web\.telegram\.org|core\.telegram\.org)\//;

describe("Telegram quick links", () => {
  it("has at least one link, each with a label and a hint", () => {
    expect(TELEGRAM_QUICK_LINKS.length).toBeGreaterThan(0);
    for (const link of TELEGRAM_QUICK_LINKS) {
      expect(link.label.trim()).not.toBe("");
      expect(link.hint.trim()).not.toBe("");
    }
  });

  it("links externally only to official Telegram domains", () => {
    for (const link of TELEGRAM_QUICK_LINKS) {
      if (link.href.startsWith("/")) continue;
      expect(link.href).toMatch(OFFICIAL);
    }
  });

  it("never contains a bot token path", () => {
    for (const link of TELEGRAM_QUICK_LINKS) {
      expect(link.href).not.toMatch(/\/bot\d+:/);
      expect(link.href).not.toMatch(/api\.telegram\.org\/bot/);
    }
  });

  it("opens the platform admin guide in the in-app runbook", () => {
    expect(TELEGRAM_RUNBOOK_HREF).toMatch(
      /^\/staff\/runbook\?doc=docs\/platform-admin-guide\/platform-admin-guide\.md/,
    );
    expect(TELEGRAM_QUICK_LINKS.some((l) => l.href === TELEGRAM_RUNBOOK_HREF)).toBe(true);
  });

  it("has unique hrefs (they are React keys)", () => {
    const hrefs = TELEGRAM_QUICK_LINKS.map((l) => l.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
