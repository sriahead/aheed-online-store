import { afterEach, describe, expect, it, vi } from "vitest";
import { normaliseCustomNote, productAcceptsNote, CUSTOM_NOTE_MAX_LENGTH } from "@/lib/custom-note";
import { resolveMerge, sumLinesByProduct } from "@/lib/cart-rules";
import { escapeHtml } from "@/lib/html-escape";
import { estimatedPaidChargeCents, formatUsdCents } from "@/lib/ai-budget-message";
import { MAX_AI_DAILY_BUDGET_NEURONS, parseAiBudget } from "@/lib/ai-budget-form";

/**
 * #1135 / #1028 / #1029 — the pure rules behind custom item notes and the AI plan mode. Each is the
 * single implementation its surfaces share, so testing it here covers every caller's decision.
 */

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => {
    throw new Error("not in a Worker request context");
  },
}));

const product = (own: boolean, category: boolean | null, parent: boolean | null) => ({
  allowsCustomNote: own,
  category:
    category === null
      ? null
      : {
          allowsCustomNote: category,
          parent: parent === null ? null : { allowsCustomNote: parent },
        },
});

describe("productAcceptsNote (R3)", () => {
  it("accepts on the product's own tick", () => {
    expect(productAcceptsNote(product(true, false, null))).toBe(true);
  });
  it("accepts on the category's tick", () => {
    expect(productAcceptsNote(product(false, true, null))).toBe(true);
  });
  it("accepts on the parent category's tick (a product in a sub-category)", () => {
    expect(productAcceptsNote(product(false, false, true))).toBe(true);
  });
  it("refuses when nothing is ticked", () => {
    expect(productAcceptsNote(product(false, false, false))).toBe(false);
    expect(productAcceptsNote(product(false, null, null))).toBe(false);
  });
});

describe("normaliseCustomNote (R4)", () => {
  it("trims surrounding spaces", () => {
    expect(normaliseCustomNote("  curry cut  ")).toBe("curry cut");
  });
  it("folds newlines and whitespace runs into one space", () => {
    expect(normaliseCustomNote("a\n\nb")).toBe("a b");
    expect(normaliseCustomNote("a \t  b")).toBe("a b");
  });
  it("removes control characters", () => {
    expect(normaliseCustomNote("a\u0007b\u0000c")).toBe("abc");
  });
  it("caps a long note at 200 characters", () => {
    expect(CUSTOM_NOTE_MAX_LENGTH).toBe(200);
    expect(normaliseCustomNote("a".repeat(250))).toHaveLength(200);
  });
  it("returns null for a blank or non-string note", () => {
    expect(normaliseCustomNote("   ")).toBeNull();
    expect(normaliseCustomNote("")).toBeNull();
    expect(normaliseCustomNote(undefined)).toBeNull();
    expect(normaliseCustomNote(42)).toBeNull();
  });
});

describe("resolveMerge keeps notes (R11)", () => {
  const stock = () => 99;
  const saved = [{ productId: "p1", quantity: 1, customNote: "saved note" }];

  it("KEEP_SAVED keeps the saved lines' notes", () => {
    expect(resolveMerge("KEEP_SAVED", saved, [{ productId: "p1", quantity: 2 }], stock)).toEqual(
      saved,
    );
  });
  it("KEEP_NEW keeps the guest lines' notes", () => {
    const guest = [{ productId: "p1", quantity: 2, customNote: "guest note" }];
    expect(resolveMerge("KEEP_NEW", saved, guest, stock)).toEqual(guest);
  });
  it("COMBINE uses the guest line's note when it has one", () => {
    const guest = [{ productId: "p1", quantity: 2, customNote: "guest note" }];
    expect(resolveMerge("COMBINE", saved, guest, stock)).toEqual([
      { productId: "p1", quantity: 3, customNote: "guest note" },
    ]);
  });
  it("COMBINE keeps the saved line's note when the guest line has none", () => {
    const guest = [{ productId: "p1", quantity: 2, customNote: null }];
    expect(resolveMerge("COMBINE", saved, guest, stock)).toEqual([
      { productId: "p1", quantity: 3, customNote: "saved note" },
    ]);
  });
  it("COMBINE of note-free lines keeps the old shape (no customNote key)", () => {
    expect(
      resolveMerge(
        "COMBINE",
        [{ productId: "p1", quantity: 1 }],
        [{ productId: "p1", quantity: 1 }],
        stock,
      ),
    ).toEqual([{ productId: "p1", quantity: 2 }]);
  });
  it("sumLinesByProduct keeps the last non-empty note", () => {
    expect(
      sumLinesByProduct([
        { productId: "p1", quantity: 1, customNote: "first" },
        { productId: "p1", quantity: 1 },
      ]),
    ).toEqual([{ productId: "p1", quantity: 2, customNote: "first" }]);
  });
});

describe("escapeHtml (R17)", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<script>alert(1)</script> & "x" 'y'`)).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot; &#39;y&#39;",
    );
  });
});

describe("estimatedPaidChargeCents (R33)", () => {
  it("is 0 at or under the 10,000-neuron allowance", () => {
    expect(estimatedPaidChargeCents(0)).toBe(0);
    expect(estimatedPaidChargeCents(10_000)).toBe(0);
    expect(formatUsdCents(estimatedPaidChargeCents(10_000))).toBe("$0.00");
  });
  it("charges 1,000 over as ceil(1.1) = 2 cents", () => {
    expect(estimatedPaidChargeCents(11_000)).toBe(2);
    expect(formatUsdCents(2)).toBe("$0.02");
  });
  it("charges 12,345 over as ceil(13.5795) = 14 cents", () => {
    expect(estimatedPaidChargeCents(22_345)).toBe(14);
    expect(formatUsdCents(14)).toBe("$0.14");
  });
  it("formats dollars above one", () => {
    expect(formatUsdCents(1234)).toBe("$12.34");
  });
});

describe("parseAiBudget (R35)", () => {
  it("accepts an integer from 0 to the maximum", () => {
    expect(parseAiBudget("0")).toEqual({ ok: true, value: 0 });
    expect(parseAiBudget(" 5,000 ")).toEqual({ ok: true, value: 5000 });
    expect(parseAiBudget(String(MAX_AI_DAILY_BUDGET_NEURONS))).toEqual({
      ok: true,
      value: 1_000_000,
    });
  });
  it("refuses a non-integer, a negative, a blank and an out-of-range value", () => {
    expect(parseAiBudget("12.5").ok).toBe(false);
    expect(parseAiBudget("-1").ok).toBe(false);
    expect(parseAiBudget("").ok).toBe(false);
    expect(parseAiBudget(null).ok).toBe(false);
    expect(parseAiBudget("1000001").ok).toBe(false);
  });
});

describe("WORKERS_AI_PLAN (R25)", () => {
  const original = process.env.WORKERS_AI_PLAN;
  afterEach(() => {
    if (original === undefined) delete process.env.WORKERS_AI_PLAN;
    else process.env.WORKERS_AI_PLAN = original;
  });

  async function plan(value: string | undefined) {
    if (value === undefined) delete process.env.WORKERS_AI_PLAN;
    else process.env.WORKERS_AI_PLAN = value;
    const { getAiEnv } = await import("@/lib/config");
    return getAiEnv().WORKERS_AI_PLAN;
  }

  it("reads paid", async () => {
    expect(await plan("paid")).toBe("paid");
  });
  it("reads free", async () => {
    expect(await plan("free")).toBe("free");
  });
  it("defaults to free when unset or empty", async () => {
    expect(await plan(undefined)).toBe("free");
    expect(await plan("")).toBe("free");
  });
  it("resolves a typo to free, never to paid", async () => {
    expect(await plan("PAID-typo")).toBe("free");
  });
});

describe("restoredLines carries notes into the bulk add (order again, R13)", () => {
  it("passes each live line's note to addItems, and omits the key when there is none", async () => {
    const { restoredLines } = await import("@/lib/restore-lines");
    const addItems = vi.fn(async (lines: { productId: string; quantity: number }[]) =>
      lines.map((line) => ({
        productId: line.productId,
        requested: line.quantity,
        added: line.quantity,
        kind: "added" as const,
      })),
    );
    await restoredLines(
      [
        { productId: "p1", productName: "Goat", quantity: 2, customNote: "curry cut" },
        { productId: "p2", productName: "Rice", quantity: 1, customNote: null },
      ],
      addItems,
    );
    expect(addItems).toHaveBeenCalledWith([
      { productId: "p1", quantity: 2, customNote: "curry cut" },
      { productId: "p2", quantity: 1 },
    ]);
  });
});
