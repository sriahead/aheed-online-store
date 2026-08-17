import { describe, it, expect, vi, beforeEach } from "vitest";

const requireVendorRole = vi.fn();
const findUniqueUser = vi.fn();
const findUniqueMembership = vi.fn();
const txCount = vi.fn();
const txUpsert = vi.fn();
const txDeleteMany = vi.fn();
const txAuditCreate = vi.fn();
const transaction = vi.fn(async (fn: (tx: unknown) => unknown, options?: unknown) => {
  transaction.mock.calls.at(-1); // keep options observable via mock.calls
  return fn({
    vendorMembership: { count: txCount, upsert: txUpsert, deleteMany: txDeleteMany },
    vendorRoleAuditLog: { create: txAuditCreate },
  });
});

vi.mock("@/lib/tenant", () => ({ getCurrentVendorId: vi.fn(async () => "vendor-1") }));
vi.mock("@/lib/auth-rbac", () => ({ requireVendorRole }));
vi.mock("@/lib/db", () => ({
  getPrisma: () => ({
    user: { findUnique: findUniqueUser },
    vendorMembership: { findUnique: findUniqueMembership },
  }),
  getPrismaWs: () => ({ $transaction: transaction }),
}));

const PLATFORM_ADMIN_AUTH = {
  ok: true as const,
  user: { id: "actor-1", email: "actor@example.com", name: "Actor" },
  vendorId: "vendor-1",
  via: "platform-admin" as const,
};

const STORE_ADMIN_AUTH = {
  ok: true as const,
  user: { id: "actor-1", email: "actor@example.com", name: "Actor" },
  vendorId: "vendor-1",
  via: "ADMIN" as const,
};

const FORBIDDEN_AUTH = { ok: false as const, status: 403 as const, reason: "forbidden" as const };

const TARGET_USER = { id: "target-1", email: "target@example.com", role: "CUSTOMER" };

/**
 * P6.7 (#186) — the role-transition matrix `validation.md` §3 asks for, plus the
 * self-lockout race fixed alongside these tests (see roles.ts's Serializable comment).
 */
describe("setVendorRole — role-transition matrix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUniqueUser.mockResolvedValue(TARGET_USER);
    findUniqueMembership.mockResolvedValue(null); // no existing membership -> oldRole null
  });

  it("platform-admin upgrading USER to ADMIN -> pass", async () => {
    requireVendorRole.mockResolvedValue(PLATFORM_ADMIN_AUTH);
    const { setVendorRole } = await import("@/lib/repositories/roles");

    await expect(setVendorRole("target@example.com", "ADMIN")).resolves.toBeUndefined();
    expect(txUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ role: "ADMIN" }) }),
    );
    expect(txAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ oldRole: null, newRole: "ADMIN", actorId: "actor-1" }),
      }),
    );
  });

  it("ADMIN (store admin) upgrading USER to STAFF -> pass", async () => {
    requireVendorRole.mockResolvedValue(STORE_ADMIN_AUTH);
    const { setVendorRole } = await import("@/lib/repositories/roles");

    await expect(setVendorRole("target@example.com", "STAFF")).resolves.toBeUndefined();
    expect(txUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ role: "STAFF" }) }),
    );
  });

  it("ADMIN (store admin) upgrading USER to ADMIN -> fail", async () => {
    requireVendorRole.mockResolvedValue(STORE_ADMIN_AUTH);
    const { setVendorRole } = await import("@/lib/repositories/roles");

    await expect(setVendorRole("target@example.com", "ADMIN")).rejects.toThrow(
      /platform-admin can grant/i,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it("STAFF upgrading USER to STAFF -> fail (requireVendorRole never grants STAFF entry)", async () => {
    requireVendorRole.mockResolvedValue(FORBIDDEN_AUTH);
    const { setVendorRole } = await import("@/lib/repositories/roles");

    await expect(setVendorRole("target@example.com", "STAFF")).rejects.toThrow(/unauthorized/i);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("blocks a store admin from modifying a platform-admin's privileges", async () => {
    requireVendorRole.mockResolvedValue(STORE_ADMIN_AUTH);
    findUniqueUser.mockResolvedValue({ ...TARGET_USER, role: "ADMIN" });
    const { setVendorRole } = await import("@/lib/repositories/roles");

    await expect(setVendorRole("target@example.com", "STAFF")).rejects.toThrow(
      /cannot modify a platform-admin/i,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it("refuses a redundant assignment of the role the user already has", async () => {
    requireVendorRole.mockResolvedValue(STORE_ADMIN_AUTH);
    findUniqueMembership.mockResolvedValue({ role: "STAFF" });
    const { setVendorRole } = await import("@/lib/repositories/roles");

    await expect(setVendorRole("target@example.com", "STAFF")).rejects.toThrow(/already assigned/i);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("writes the membership change and the audit log inside the same transaction", async () => {
    requireVendorRole.mockResolvedValue(STORE_ADMIN_AUTH);
    const { setVendorRole } = await import("@/lib/repositories/roles");

    await setVendorRole("target@example.com", "STAFF");

    expect(transaction).toHaveBeenCalledTimes(1);
    // Both writes ran against the tx client the same $transaction call handed back,
    // not the outer getPrisma() client — that's what makes them atomic.
    expect(txUpsert).toHaveBeenCalledTimes(1);
    expect(txAuditCreate).toHaveBeenCalledTimes(1);
  });

  it("runs the write at Serializable isolation", async () => {
    requireVendorRole.mockResolvedValue(STORE_ADMIN_AUTH);
    const { setVendorRole } = await import("@/lib/repositories/roles");

    await setVendorRole("target@example.com", "STAFF");

    const [, options] = transaction.mock.calls[0] as [unknown, { isolationLevel?: string }];
    expect(options?.isolationLevel).toBe("Serializable");
  });

  it("never runs the self-lockout count when the actor and target are different people", async () => {
    // STORE_ADMIN_AUTH's actor id ("actor-1") differs from TARGET_USER's id ("target-1").
    requireVendorRole.mockResolvedValue(STORE_ADMIN_AUTH);
    const { setVendorRole } = await import("@/lib/repositories/roles");

    await setVendorRole("target@example.com", "STAFF");
    expect(txCount).not.toHaveBeenCalled();
    expect(txDeleteMany).not.toHaveBeenCalled();
  });
});

describe("setVendorRole — self-lockout guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks a store admin from demoting themselves when they are the last admin", async () => {
    const selfAuth = { ...STORE_ADMIN_AUTH, user: { ...STORE_ADMIN_AUTH.user, id: "target-1" } };
    requireVendorRole.mockResolvedValue(selfAuth);
    findUniqueUser.mockResolvedValue({ ...TARGET_USER, id: "target-1" });
    findUniqueMembership.mockResolvedValue({ role: "ADMIN" });
    txCount.mockResolvedValue(1);

    const { setVendorRole } = await import("@/lib/repositories/roles");

    await expect(setVendorRole("target@example.com", null)).rejects.toThrow(
      /cannot demote the last remaining store admin/i,
    );
    // The count happened inside the transaction, not before it — this is the guard
    // against the two-concurrent-self-demotions race, not just a check-then-act.
    expect(txCount).toHaveBeenCalledWith({ where: { vendorId: "vendor-1", role: "ADMIN" } });
    expect(txDeleteMany).not.toHaveBeenCalled();
    expect(txAuditCreate).not.toHaveBeenCalled();
  });

  it("allows a store admin to demote themselves when another admin remains", async () => {
    const selfAuth = { ...STORE_ADMIN_AUTH, user: { ...STORE_ADMIN_AUTH.user, id: "target-1" } };
    requireVendorRole.mockResolvedValue(selfAuth);
    findUniqueUser.mockResolvedValue({ ...TARGET_USER, id: "target-1" });
    findUniqueMembership.mockResolvedValue({ role: "ADMIN" });
    txCount.mockResolvedValue(2);

    const { setVendorRole } = await import("@/lib/repositories/roles");

    await expect(setVendorRole("target@example.com", null)).resolves.toBeUndefined();
    expect(txDeleteMany).toHaveBeenCalledTimes(1);
  });

  it("does not apply the self-lockout count to a platform-admin acting on themselves", async () => {
    const selfAuth = {
      ...PLATFORM_ADMIN_AUTH,
      user: { ...PLATFORM_ADMIN_AUTH.user, id: "target-1" },
    };
    requireVendorRole.mockResolvedValue(selfAuth);
    findUniqueUser.mockResolvedValue({ ...TARGET_USER, id: "target-1", role: "ADMIN" });
    findUniqueMembership.mockResolvedValue({ role: "ADMIN" });

    const { setVendorRole } = await import("@/lib/repositories/roles");

    // Platform-admin transcends vendors regardless of this vendor's VendorMembership
    // count, so the guard (scoped to `auth.via === "ADMIN"`) must not fire here.
    await expect(setVendorRole("target@example.com", null)).resolves.toBeUndefined();
    expect(txCount).not.toHaveBeenCalled();
  });
});
