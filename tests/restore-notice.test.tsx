// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import {
  MAX_RESTORE_ENTRIES,
  MAX_RESTORE_NAME_LENGTH,
  buildRestoreNoticeUrl,
  parseRestoreNotice,
  type RestoredLine,
} from "@/lib/restore-notice";
import { restoredLines } from "@/lib/restore-lines";
import { RestoreNotice } from "@/components/cart/RestoreNotice";

afterEach(cleanup);

/**
 * #957 (R17, R18, R20, R21) — the reorder / cancelled-order notice: its URL format both ways, the
 * line mapping the two actions share, and the copy `/cart` shows.
 */

const params = (url: string) => {
  const search = new URL(url, "http://x").searchParams;
  return {
    restored: search.get("restored") ?? undefined,
    of: search.get("of") ?? undefined,
    lines: search.get("lines") ?? undefined,
  };
};

const line = (
  name: string,
  kind: RestoredLine["kind"],
  added: number,
  requested: number,
): RestoredLine => ({ name, kind, added, requested });

describe("buildRestoreNoticeUrl", () => {
  it("is exactly /cart when every line went in in full", () => {
    expect(buildRestoreNoticeUrl("reorder", [line("A", "added", 2, 2)])).toBe("/cart");
    expect(buildRestoreNoticeUrl("cancelled", [])).toBe("/cart");
  });

  it("encodes only the short lines, with n counting every line", () => {
    const url = buildRestoreNoticeUrl("reorder", [
      line("Alpha", "unavailable", 0, 2),
      line("Beta", "partial", 1, 3),
      line("Gamma", "at_limit", 0, 1),
      line("Delta", "added", 4, 4),
    ]);
    expect(url.startsWith("/cart?")).toBe(true);
    expect(params(url)).toEqual({
      restored: "reorder",
      of: "4",
      lines: "u~0~2~Alpha|p~1~3~Beta|h~0~1~Gamma",
    });
  });

  it("replaces | in a name with /, and round-trips a name containing ~", () => {
    const url = buildRestoreNoticeUrl("cancelled", [
      line("Salt | Pepper", "unavailable", 0, 1),
      line("A~B", "partial", 1, 2),
    ]);
    expect(parseRestoreNotice(params(url))).toEqual({
      source: "cancelled",
      of: 2,
      entries: [
        { kind: "u", added: 0, requested: 1, name: "Salt / Pepper" },
        { kind: "p", added: 1, requested: 2, name: "A~B" },
      ],
    });
  });
});

describe("parseRestoreNotice", () => {
  it("returns nothing for an unknown or missing source", () => {
    expect(parseRestoreNotice({ restored: "bogus", lines: "u~0~1~X" })).toBeNull();
    expect(parseRestoreNotice({ lines: "u~0~1~X" })).toBeNull();
  });

  it("returns nothing when no entry is valid", () => {
    expect(parseRestoreNotice({ restored: "reorder", lines: "" })).toBeNull();
    expect(parseRestoreNotice({ restored: "reorder" })).toBeNull();
  });

  it("drops malformed entries and keeps the rest", () => {
    const notice = parseRestoreNotice({
      restored: "reorder",
      of: "9",
      lines: [
        "x~0~1~Bad kind",
        "u~a~1~Bad count",
        "u~0~-1~Negative",
        "u~0~1.5~Fraction",
        "u~0~1~   ",
        "u~0~1",
        "p~0~3~Partial with none added",
        "p~3~3~Partial with all added",
        "u~0~1~Kept",
        "p~1~2~Also kept",
      ].join("|"),
    });
    expect(notice?.entries.map((e) => e.name)).toEqual(["Kept", "Also kept"]);
    expect(notice?.of).toBe(9);
  });

  it("keeps the first 50 entries and cuts names at 120 characters", () => {
    const long = "N".repeat(200);
    const lines = Array.from({ length: 60 }, (_, i) => `u~0~1~${i}-${long}`).join("|");
    const notice = parseRestoreNotice({ restored: "reorder", of: "60", lines });
    expect(notice?.entries).toHaveLength(MAX_RESTORE_ENTRIES);
    expect(notice?.entries[0].name).toHaveLength(MAX_RESTORE_NAME_LENGTH);
    expect(notice?.entries[0].name.startsWith("0-")).toBe(true);
  });

  it.each([undefined, "", "abc", "1.5", "1"])("uses n = k when of is %s", (of) => {
    const notice = parseRestoreNotice({ restored: "reorder", of, lines: "u~0~1~A|u~0~1~B" });
    expect(notice?.of).toBe(2);
  });
});

describe("restoredLines", () => {
  it("adds the live lines, names them from the order, and reports deleted ones as unavailable", async () => {
    const addItems = vi.fn(async (lines: { productId: string; quantity: number }[]) =>
      lines.map((l) =>
        l.productId === "b"
          ? { productId: "b", requested: l.quantity, added: 1, kind: "partial" as const }
          : {
              productId: l.productId,
              requested: l.quantity,
              added: l.quantity,
              kind: "added" as const,
            },
      ),
    );
    const result = await restoredLines(
      [
        { productId: "a", productName: "Alpha", quantity: 1 },
        { productId: "b", productName: "Beta", quantity: 3 },
        { productId: null, productName: "Gone", quantity: 2 },
      ],
      addItems,
    );

    expect(addItems).toHaveBeenCalledWith([
      { productId: "a", quantity: 1 },
      { productId: "b", quantity: 3 },
    ]);
    expect(result).toEqual([
      { name: "Alpha", requested: 1, added: 1, kind: "added" },
      { name: "Beta", requested: 3, added: 1, kind: "partial" },
      { name: "Gone", requested: 2, added: 0, kind: "unavailable" },
    ]);
  });

  it("does not call the bulk add when every product was deleted", async () => {
    const addItems = vi.fn();
    const result = await restoredLines(
      [{ productId: null, productName: "Gone", quantity: 1 }],
      addItems,
    );
    expect(addItems).not.toHaveBeenCalled();
    expect(result).toEqual([{ name: "Gone", requested: 1, added: 0, kind: "unavailable" }]);
  });
});

describe("RestoreNotice", () => {
  const texts = () =>
    [...document.querySelectorAll("[data-restore-notice] p, [data-restore-notice] li")].map(
      (el) => el.textContent,
    );

  it("renders the reorder copy, with the trailing line when k < n", () => {
    render(
      <RestoreNotice
        notice={{
          source: "reorder",
          of: 3,
          entries: [
            { kind: "u", added: 0, requested: 2, name: "Alpha" },
            { kind: "p", added: 1, requested: 3, name: "Beta" },
          ],
        }}
      />,
    );
    const el = document.querySelector("[data-restore-notice]")!;
    expect(el.getAttribute("role")).toBe("status");
    expect(texts()).toEqual([
      "2 of 3 items from your past order couldn't be added in full:",
      "Alpha: not available right now",
      "Beta: only 1 of 3 added, limited stock",
      "Everything else is in your cart.",
    ]);
  });

  it("renders the cancelled copy, singular, with no trailing line when k = n", () => {
    render(
      <RestoreNotice
        notice={{
          source: "cancelled",
          of: 1,
          entries: [{ kind: "h", added: 0, requested: 1, name: "Gamma" }],
        }}
      />,
    );
    expect(texts()).toEqual([
      "1 of 1 item from your cancelled order couldn't be put back in full:",
      "Gamma: none added, your cart already holds all we have in stock",
    ]);
  });
});
