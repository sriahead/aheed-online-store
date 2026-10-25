import { describe, it, expect, vi, beforeEach } from "vitest";

const getSession = vi.fn();

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ api: { getSession } }),
}));
vi.mock("@/lib/tenant", () => ({ getCurrentVendorId: vi.fn(async () => "vendor-1") }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ vendorMembership: { findUnique: vi.fn() } }) }));

describe("requirePlatformAdmin (#1269)", () => {
  beforeEach(() => {
    getSession.mockReset();
  });

  it("denies an unauthenticated request with 401, not a silent pass", async () => {
    getSession.mockResolvedValue(null);
    const { requirePlatformAdmin } = await import("@/lib/auth-rbac");

    const result = await requirePlatformAdmin();

    expect(result).toEqual({ ok: false, status: 401, reason: "unauthenticated" });
  });

  it("denies a CUSTOMER user with 403, even if they are a vendor admin", async () => {
    getSession.mockResolvedValue({
      user: {
        id: "cust-1",
        email: "storeadmin@example.com",
        name: "Store Admin",
        role: "CUSTOMER",
      },
    });
    const { requirePlatformAdmin } = await import("@/lib/auth-rbac");

    const result = await requirePlatformAdmin();

    expect(result).toEqual({ ok: false, status: 403, reason: "forbidden" });
  });

  it("denies a STAFF user with 403", async () => {
    getSession.mockResolvedValue({
      user: { id: "staff-1", email: "staff@example.com", name: "Staff Member", role: "STAFF" },
    });
    const { requirePlatformAdmin } = await import("@/lib/auth-rbac");

    const result = await requirePlatformAdmin();

    expect(result).toEqual({ ok: false, status: 403, reason: "forbidden" });
  });

  it("allows a global ADMIN user through platform admin check", async () => {
    getSession.mockResolvedValue({
      user: {
        id: "admin-1",
        email: "platformadmin@example.com",
        name: "Platform Admin",
        role: "ADMIN",
      },
    });
    const { requirePlatformAdmin } = await import("@/lib/auth-rbac");

    const result = await requirePlatformAdmin();

    expect(result).toEqual({
      ok: true,
      user: {
        id: "admin-1",
        email: "platformadmin@example.com",
        name: "Platform Admin",
        role: "ADMIN",
      },
    });
  });
});
