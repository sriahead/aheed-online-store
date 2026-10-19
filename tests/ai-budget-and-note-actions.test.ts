import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #1029 (R35) — only a platform admin may change a vendor's AI budget, and the server action is the
 * control, not the page hiding the form. #1135 (R8) — the basket's set-note action type-checks its
 * client input before the repository sees it.
 */

const requireVendorRole = vi.fn();
const setAiDailyBudgetForVendor = vi.fn(async () => {});
const setNote = vi.fn(async () => ({ ok: true, customNote: "x" }));

vi.mock("@/lib/auth-rbac", () => ({ requireVendorRole }));
vi.mock("@/lib/ai-usage-service", () => ({ setAiDailyBudgetForVendor }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/cart-service", () => ({ getCartRepository: () => ({ setNote }) }));
vi.mock("@/lib/cart-identity", () => ({
  getCartIdentity: async () => ({ userId: "u1", guestToken: null }),
}));
vi.mock("@/features/cart/shared", () => ({
  clearStaleGuestCookie: vi.fn(async () => {}),
  revalidateCartSurfaces: vi.fn(async () => {}),
  scopedToUser: (identity: unknown) => identity,
}));

const { saveAiBudget } = await import("@/features/admin/ai-budget");
const { setCartItemNote } = await import("@/features/cart/set-note");

const form = (value: string) => {
  const data = new FormData();
  data.set("aiDailyNeuronBudget", value);
  return data;
};
const initial = { error: null, saved: false };

beforeEach(() => {
  requireVendorRole.mockReset();
  setAiDailyBudgetForVendor.mockClear();
  setNote.mockClear();
});

describe("saveAiBudget (R35)", () => {
  it("refuses a store admin without writing", async () => {
    requireVendorRole.mockResolvedValue({ ok: true, via: "ADMIN", vendorId: "v1" });
    const state = await saveAiBudget(initial, form("5000"));
    expect(state.saved).toBe(false);
    expect(state.error).toMatch(/platform admin/i);
    expect(setAiDailyBudgetForVendor).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller without writing", async () => {
    requireVendorRole.mockResolvedValue({ ok: false, status: 401, reason: "unauthenticated" });
    expect((await saveAiBudget(initial, form("5000"))).saved).toBe(false);
    expect(setAiDailyBudgetForVendor).not.toHaveBeenCalled();
  });

  it("refuses a non-integer without writing", async () => {
    requireVendorRole.mockResolvedValue({ ok: true, via: "platform-admin", vendorId: "v1" });
    expect((await saveAiBudget(initial, form("12.5"))).error).toBeTruthy();
    expect(setAiDailyBudgetForVendor).not.toHaveBeenCalled();
  });

  it("refuses an out-of-range value without writing", async () => {
    requireVendorRole.mockResolvedValue({ ok: true, via: "platform-admin", vendorId: "v1" });
    expect((await saveAiBudget(initial, form("1000001"))).error).toBeTruthy();
    expect(setAiDailyBudgetForVendor).not.toHaveBeenCalled();
  });

  it("writes a valid budget for the session's own vendor", async () => {
    requireVendorRole.mockResolvedValue({ ok: true, via: "platform-admin", vendorId: "v1" });
    expect(await saveAiBudget(initial, form("5000"))).toEqual({ error: null, saved: true });
    expect(setAiDailyBudgetForVendor).toHaveBeenCalledExactlyOnceWith("v1", 5000);
  });
});

describe("setCartItemNote (R8)", () => {
  it("passes a string note to the repository", async () => {
    await setCartItemNote("p1", "curry cut");
    expect(setNote).toHaveBeenCalledExactlyOnceWith(
      { userId: "u1", guestToken: null },
      "p1",
      "curry cut",
    );
  });

  it("refuses non-string input without reaching the repository", async () => {
    expect(await setCartItemNote("p1", 42)).toEqual({ ok: false, reason: "NOT_IN_CART" });
    expect(await setCartItemNote(null, "x")).toEqual({ ok: false, reason: "NOT_IN_CART" });
    expect(setNote).not.toHaveBeenCalled();
  });
});

describe('"use server" modules export only async functions (CLAUDE.md)', () => {
  it.each(["features/admin/ai-budget.ts", "features/cart/set-note.ts"])("%s", (file) => {
    const source = readFileSync(join(__dirname, "..", file), "utf8");
    expect(source.startsWith('"use server";')).toBe(true);
    const exports = source.match(/^export\s+(?!type\b)(\w+(?:\s+\w+)?)/gm) ?? [];
    expect(exports.length).toBeGreaterThan(0);
    for (const line of exports) expect(line).toMatch(/^export\s+async\s+function$/);
  });
});
