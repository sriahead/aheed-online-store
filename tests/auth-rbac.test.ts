import { describe, it, expect, vi, beforeEach } from "vitest";

const getSession = vi.fn();

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ api: { getSession } }),
}));
// lib/auth-rbac now imports lib/db + lib/tenant at module load (for requireVendorRole);
// mock them so importing the module doesn't pull in @prisma/client/wasm. requireRole itself
// uses neither.
vi.mock("@/lib/tenant", () => ({ getCurrentVendorId: vi.fn(async () => "vendor-1") }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ vendorMembership: { findUnique: vi.fn() } }) }));

// Proves requireRole() never silently passes: no session -> 401, wrong role -> 403.
describe("requireRole", () => {
  beforeEach(() => {
    getSession.mockReset();
  });

  it("denies an unauthenticated request with 401, not a silent pass", async () => {
    getSession.mockResolvedValue(null);
    const { requireRole } = await import("@/lib/auth-rbac");

    const result = await requireRole("ADMIN");

    expect(result).toEqual({ ok: false, status: 401, reason: "unauthenticated" });
  });

  it("denies a STAFF session an ADMIN-gated check", async () => {
    getSession.mockResolvedValue({
      user: { id: "1", email: "staff@example.com", name: "Staff", role: "STAFF" },
    });
    const { requireRole } = await import("@/lib/auth-rbac");

    const result = await requireRole("ADMIN");

    expect(result).toEqual({ ok: false, status: 403, reason: "forbidden" });
  });

  it("allows an ADMIN session through an ADMIN-gated check", async () => {
    getSession.mockResolvedValue({
      user: { id: "2", email: "admin@example.com", name: "Admin", role: "ADMIN" },
    });
    const { requireRole } = await import("@/lib/auth-rbac");

    const result = await requireRole("ADMIN");

    expect(result).toEqual({
      ok: true,
      user: { id: "2", email: "admin@example.com", name: "Admin", role: "ADMIN" },
    });
  });

  it("allows any of several accepted roles", async () => {
    getSession.mockResolvedValue({
      user: { id: "3", email: "staff@example.com", name: "Staff", role: "STAFF" },
    });
    const { requireRole } = await import("@/lib/auth-rbac");

    const result = await requireRole("STAFF", "ADMIN");

    expect(result.ok).toBe(true);
  });
});
