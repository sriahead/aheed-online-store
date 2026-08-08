import { describe, it, expect, vi, beforeEach } from "vitest";

const getSession = vi.fn();
const findUnique = vi.fn();

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/auth", () => ({ getAuth: () => ({ api: { getSession } }) }));
vi.mock("@/lib/tenant", () => ({ getCurrentVendorId: vi.fn(async () => "vendor-1") }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ vendorMembership: { findUnique } }) }));

// ADR-004 slice 3a: platform ADMIN transcends vendors; otherwise a VendorMembership for
// the current vendor with a matching role is required.
describe("requireVendorRole", () => {
  beforeEach(() => {
    getSession.mockReset();
    findUnique.mockReset();
  });

  it("denies an unauthenticated request with 401", async () => {
    getSession.mockResolvedValue(null);
    const { requireVendorRole } = await import("@/lib/auth-rbac");

    expect(await requireVendorRole("ADMIN")).toEqual({
      ok: false,
      status: 401,
      reason: "unauthenticated",
    });
  });

  it("allows a platform ADMIN without needing a membership", async () => {
    getSession.mockResolvedValue({
      user: { id: "1", email: "admin@example.com", name: "Admin", role: "ADMIN" },
    });
    const { requireVendorRole } = await import("@/lib/auth-rbac");

    const r = await requireVendorRole("ADMIN");

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.via).toBe("platform-admin");
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("allows a member whose vendor role is accepted", async () => {
    getSession.mockResolvedValue({
      user: { id: "2", email: "staff@example.com", name: "Staff", role: "CUSTOMER" },
    });
    findUnique.mockResolvedValue({ role: "STAFF" });
    const { requireVendorRole } = await import("@/lib/auth-rbac");

    const r = await requireVendorRole("STAFF", "ADMIN");

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.via).toBe("STAFF");
  });

  it("denies (403) a member whose vendor role is not accepted", async () => {
    getSession.mockResolvedValue({
      user: { id: "3", email: "staff@example.com", name: "Staff", role: "CUSTOMER" },
    });
    findUnique.mockResolvedValue({ role: "STAFF" });
    const { requireVendorRole } = await import("@/lib/auth-rbac");

    expect(await requireVendorRole("ADMIN")).toEqual({
      ok: false,
      status: 403,
      reason: "forbidden",
    });
  });

  it("denies (403) an authenticated non-member", async () => {
    getSession.mockResolvedValue({
      user: { id: "4", email: "customer@example.com", name: "Customer", role: "CUSTOMER" },
    });
    findUnique.mockResolvedValue(null);
    const { requireVendorRole } = await import("@/lib/auth-rbac");

    expect(await requireVendorRole("STAFF", "ADMIN")).toEqual({
      ok: false,
      status: 403,
      reason: "forbidden",
    });
  });
});
