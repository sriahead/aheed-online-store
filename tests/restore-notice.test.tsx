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

/**
 * #1088 (R11, R11a, R12) — the "shop your list" source and the skipped-line kind.
 *
 * The three cases above are #957's and must keep passing byte-for-byte: this slice adds a source
 * and a kind to a shipped notice rather than changing one, and the reorder/cancel copy is what a
 * regression here would quietly rewrite.
 */
describe("the list source and the skipped kind (#1088)", () => {
  it("R11: encodes a skipped line as s~0~q~name, with of counting every submitted line", () => {
    const url = buildRestoreNoticeUrl("list", [
      line("Milk", "added", 2, 2),
      line("Apple juice", "skipped", 0, 3),
    ]);
    expect(params(url)).toEqual({
      restored: "list",
      of: "2",
      lines: "s~0~3~Apple juice",
    });
  });

  it("R11: round-trips a list notice", () => {
    expect(parseRestoreNotice({ restored: "list", of: "3", lines: "s~0~2~Apple juice" })).toEqual({
      source: "list",
      of: 3,
      entries: [{ kind: "s", added: 0, requested: 2, name: "Apple juice" }],
    });
  });

  it("R11: rejects a skipped entry that claims something was added", () => {
    // A skipped line never reached the cart, so a non-zero `added` is a contradiction — the same
    // shape of invariant the `p` kind already enforces.
    expect(parseRestoreNotice({ restored: "list", lines: "s~1~2~Apple juice" })).toBeNull();
    expect(parseRestoreNotice({ restored: "list", lines: "s~0~0~Apple juice" })).toBeNull();
  });

  it("R11: a skipped line and a short add can share one notice", () => {
    const url = buildRestoreNoticeUrl("list", [
      line("Milk", "partial", 1, 2),
      line("Apple juice", "skipped", 0, 3),
    ]);
    expect(params(url).lines).toBe("p~1~2~Milk|s~0~3~Apple juice");
  });

  it("R11a: the skipped kind is the notice's own, not the cart layer's", async () => {
    // `restoredLines` reports a line with no product id under the kind its caller names, so the
    // shop-list path can say "skipped" where reorder says "unavailable" — without BulkAddKind
    // growing a member for something that never reached the cart.
    const addItems = vi.fn();
    expect(
      await restoredLines(
        [{ productId: null, productName: "Apple juice", quantity: 3 }],
        addItems,
        "skipped",
      ),
    ).toEqual([{ name: "Apple juice", requested: 3, added: 0, kind: "skipped" }]);
    expect(addItems).not.toHaveBeenCalled();
  });

  it("R11a: the default stays 'unavailable', so #957's two callers are unaffected", async () => {
    expect(
      await restoredLines([{ productId: null, productName: "Gone", quantity: 1 }], vi.fn()),
    ).toEqual([{ name: "Gone", requested: 1, added: 0, kind: "unavailable" }]);
  });

  it("R12: renders the list copy and the skipped-line text", () => {
    render(
      <RestoreNotice
        notice={{
          source: "list",
          of: 3,
          entries: [{ kind: "s", added: 0, requested: 2, name: "Apple juice" }],
        }}
      />,
    );
    expect(
      [...document.querySelectorAll("[data-restore-notice] p, [data-restore-notice] li")].map(
        (el) => el.textContent,
      ),
    ).toEqual([
      "1 of 3 items from your list couldn't be added in full:",
      "Apple juice: not added, no product chosen",
      "Everything else is in your cart.",
    ]);
  });
});

describe("the unmatched kind (#1090)", () => {
  it("R7: encodes an unmatched line as m~0~q~name", () => {
    const url = buildRestoreNoticeUrl("list", [line("Ghost item", "unmatched", 0, 3)]);
    expect(params(url)).toEqual({ restored: "list", of: "1", lines: "m~0~3~Ghost item" });
  });

  it("R7: round-trips an unmatched entry", () => {
    expect(parseRestoreNotice({ restored: "list", of: "3", lines: "m~0~3~Ghost item" })).toEqual({
      source: "list",
      of: 3,
      entries: [{ kind: "m", added: 0, requested: 3, name: "Ghost item" }],
    });
  });

  it("R7: rejects an unmatched entry that claims something was added, or asked for nothing", () => {
    expect(parseRestoreNotice({ restored: "list", lines: "m~1~3~Ghost item" })).toBeNull();
    expect(parseRestoreNotice({ restored: "list", lines: "m~0~0~Ghost item" })).toBeNull();
  });

  it("R8: an id-less item's own kind wins over missingKind, and one without falls back to it", async () => {
    const addItems = vi.fn();
    expect(
      await restoredLines(
        [
          { productId: null, productName: "A", quantity: 1, kind: "unmatched" },
          { productId: null, productName: "B", quantity: 1 },
        ],
        addItems,
        "skipped",
      ),
    ).toEqual([
      { name: "A", requested: 1, added: 0, kind: "unmatched" },
      { name: "B", requested: 1, added: 0, kind: "skipped" },
    ]);
    expect(addItems).not.toHaveBeenCalled();
  });

  it("R9: renders the unmatched-line text", () => {
    render(
      <RestoreNotice
        notice={{
          source: "list",
          of: 3,
          entries: [{ kind: "m", added: 0, requested: 3, name: "Ghost item" }],
        }}
      />,
    );
    expect(document.querySelector("[data-restore-notice] li")?.textContent).toBe(
      "Ghost item: not added, no match in this shop",
    );
  });
});
