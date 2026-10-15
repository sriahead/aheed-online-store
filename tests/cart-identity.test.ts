import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #1080 R5–R9 — the guest cart cookie's vendor-neutral rename, with a compatibility window that
 * keeps every guest's basket: reads fall back to the legacy name, and the next cart mutation
 * re-issues the SAME token under the new name and deletes the legacy cookie.
 */

const store = new Map<string, string>();
const jar = {
  get: vi.fn((name: string) => (store.has(name) ? { value: store.get(name)! } : undefined)),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => jar),
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("@/lib/auth", () => ({
  getAuth: vi.fn(async () => ({ api: { getSession: vi.fn(async () => null) } })),
}));

import {
  CART_COOKIE,
  clearGuestToken,
  getCartIdentity,
  issueGuestToken,
} from "@/lib/cart-identity";

const EXPECTED_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: 2592000,
};

beforeEach(() => {
  store.clear();
  jar.get.mockClear();
  jar.set.mockClear();
  jar.delete.mockClear();
});

describe("CART_COOKIE (#1080 R5)", () => {
  it("is the vendor-neutral name", () => {
    expect(CART_COOKIE).toBe("store_cart");
  });
});

describe("getCartIdentity (#1080 R6)", () => {
  it("reads the new cookie", async () => {
    store.set("store_cart", "NEW");
    expect((await getCartIdentity()).guestToken).toBe("NEW");
  });

  it("falls back to the legacy cookie", async () => {
    store.set("aheed_cart", "OLD");
    expect((await getCartIdentity()).guestToken).toBe("OLD");
  });

  it("is null with neither", async () => {
    expect((await getCartIdentity()).guestToken).toBeNull();
  });
});

describe("issueGuestToken (#1080 R7, R8)", () => {
  it("R7: moves a legacy token to the new name, unchanged, and deletes the legacy cookie", async () => {
    store.set("aheed_cart", "T");
    expect(await issueGuestToken()).toBe("T");
    expect(jar.set).toHaveBeenCalledTimes(1);
    const [name, value, options] = jar.set.mock.calls[0];
    expect(name).toBe("store_cart");
    expect(value).toBe("T");
    expect(options).toEqual(EXPECTED_OPTIONS);
    expect(options).not.toHaveProperty("domain");
    expect(jar.delete).toHaveBeenCalledWith("aheed_cart");
  });

  it("R8: returns an existing new-name token and touches nothing", async () => {
    store.set("store_cart", "N");
    store.set("aheed_cart", "OLD");
    expect(await issueGuestToken()).toBe("N");
    expect(jar.set).not.toHaveBeenCalled();
    expect(jar.delete).not.toHaveBeenCalled();
  });

  it("R8: with neither, sets only the new name to a fresh token", async () => {
    const token = await issueGuestToken();
    expect(token).toMatch(/^[0-9a-f-]{36}$/);
    expect(jar.set).toHaveBeenCalledTimes(1);
    expect(jar.set).toHaveBeenCalledWith("store_cart", token, EXPECTED_OPTIONS);
    expect(jar.delete).not.toHaveBeenCalled();
  });
});

describe("clearGuestToken (#1080 R9)", () => {
  it("deletes both names", async () => {
    await clearGuestToken();
    expect(jar.delete).toHaveBeenCalledWith("store_cart");
    expect(jar.delete).toHaveBeenCalledWith("aheed_cart");
  });
});
