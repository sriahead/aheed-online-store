import { describe, it, expect, vi, beforeEach } from "vitest";

const requireVendorRole = vi.fn();
const findFirstUser = vi.fn();
const findUniqueMembership = vi.fn();
const txCount = vi.fn();
const txUpsert = vi.fn();
const txDeleteMany = vi.fn();
const txAuditCreate = vi.fn();
const txUserCount = vi.fn();
const txUserCreate = vi.fn();
const txUserUpdate = vi.fn();
const transaction = vi.fn(async (fn: (tx: unknown) => unknown, options?: unknown) => {
  transaction.mock.calls.at(-1); // keep options observable via mock.calls
  return fn({
    vendorMembership: { count: txCount, upsert: txUpsert, deleteMany: txDeleteMany },
    vendorRoleAuditLog: { create: txAuditCreate },
    user: { count: txUserCount, create: txUserCreate, update: txUserUpdate },
  });
});

vi.mock("@/lib/tenant", () => ({ getCurrentVendorId: vi.fn(async () => "vendor-1") }));
vi.mock("@/lib/auth-rbac", () => ({ requireVendorRole }));
vi.mock("@/lib/db", () => ({
  getPrisma: () => ({
    // #1482: the lookup is case-insensitive, so it is a findFirst, not a findUnique.
    user: { findFirst: findFirstUser },
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
    findFirstUser.mockResolvedValue(TARGET_USER);
    findUniqueMembership.mockResolvedValue(null); // no existing membership -> oldRole null
    txUserCount.mockResolvedValue(2); // two platform admins unless a test says otherwise
    txUserCreate.mockImplementation(async ({ data }: { data: { id: string } }) => data);
  });

  it("platform-admin upgrading USER to ADMIN -> pass", async () => {
    requireVendorRole.mockResolvedValue(PLATFORM_ADMIN_AUTH);
    const { setVendorRole } = await import("@/lib/roles-service");

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
    const { setVendorRole } = await import("@/lib/roles-service");

    await expect(setVendorRole("target@example.com", "STAFF")).resolves.toBeUndefined();
    expect(txUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ role: "STAFF" }) }),
    );
  });

  it("ADMIN (store admin) upgrading USER to ADMIN -> fail", async () => {
    requireVendorRole.mockResolvedValue(STORE_ADMIN_AUTH);
    const { setVendorRole } = await import("@/lib/roles-service");

    await expect(setVendorRole("target@example.com", "ADMIN")).rejects.toThrow(
      /platform-admin can grant/i,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it("STAFF upgrading USER to STAFF -> fail (requireVendorRole never grants STAFF entry)", async () => {
    requireVendorRole.mockResolvedValue(FORBIDDEN_AUTH);
    const { setVendorRole } = await import("@/lib/roles-service");

    await expect(setVendorRole("target@example.com", "STAFF")).rejects.toThrow(/unauthorized/i);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("blocks a store admin from modifying a platform-admin's privileges", async () => {
    requireVendorRole.mockResolvedValue(STORE_ADMIN_AUTH);
    findFirstUser.mockResolvedValue({ ...TARGET_USER, role: "ADMIN" });
    const { setVendorRole } = await import("@/lib/roles-service");

    await expect(setVendorRole("target@example.com", "STAFF")).rejects.toThrow(
      /cannot modify a platform-admin/i,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it("refuses a redundant assignment of the role the user already has", async () => {
    requireVendorRole.mockResolvedValue(STORE_ADMIN_AUTH);
    findUniqueMembership.mockResolvedValue({ role: "STAFF" });
    const { setVendorRole } = await import("@/lib/roles-service");

    await expect(setVendorRole("target@example.com", "STAFF")).rejects.toThrow(/already assigned/i);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("writes the membership change and the audit log inside the same transaction", async () => {
    requireVendorRole.mockResolvedValue(STORE_ADMIN_AUTH);
    const { setVendorRole } = await import("@/lib/roles-service");

    await setVendorRole("target@example.com", "STAFF");

    expect(transaction).toHaveBeenCalledTimes(1);
    // Both writes ran against the tx client the same $transaction call handed back,
    // not the outer getPrisma() client — that's what makes them atomic.
    expect(txUpsert).toHaveBeenCalledTimes(1);
    expect(txAuditCreate).toHaveBeenCalledTimes(1);
  });

  it("runs the write at Serializable isolation", async () => {
    requireVendorRole.mockResolvedValue(STORE_ADMIN_AUTH);
    const { setVendorRole } = await import("@/lib/roles-service");

    await setVendorRole("target@example.com", "STAFF");

    const [, options] = transaction.mock.calls[0] as [unknown, { isolationLevel?: string }];
    expect(options?.isolationLevel).toBe("Serializable");
  });

  it("never runs the self-lockout count when the actor and target are different people", async () => {
    // STORE_ADMIN_AUTH's actor id ("actor-1") differs from TARGET_USER's id ("target-1").
    requireVendorRole.mockResolvedValue(STORE_ADMIN_AUTH);
    const { setVendorRole } = await import("@/lib/roles-service");

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
    findFirstUser.mockResolvedValue({ ...TARGET_USER, id: "target-1" });
    findUniqueMembership.mockResolvedValue({ role: "ADMIN" });
    txCount.mockResolvedValue(1);

    const { setVendorRole } = await import("@/lib/roles-service");

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
    findFirstUser.mockResolvedValue({ ...TARGET_USER, id: "target-1" });
    findUniqueMembership.mockResolvedValue({ role: "ADMIN" });
    txCount.mockResolvedValue(2);

    const { setVendorRole } = await import("@/lib/roles-service");

    await expect(setVendorRole("target@example.com", null)).resolves.toBeUndefined();
    expect(txDeleteMany).toHaveBeenCalledTimes(1);
  });

  it("does not apply the self-lockout count to a platform-admin acting on themselves", async () => {
    const selfAuth = {
      ...PLATFORM_ADMIN_AUTH,
      user: { ...PLATFORM_ADMIN_AUTH.user, id: "target-1" },
    };
    requireVendorRole.mockResolvedValue(selfAuth);
    findFirstUser.mockResolvedValue({ ...TARGET_USER, id: "target-1", role: "ADMIN" });
    findUniqueMembership.mockResolvedValue({ role: "ADMIN" });

    const { setVendorRole } = await import("@/lib/roles-service");

    // Platform-admin transcends vendors regardless of this vendor's VendorMembership
    // count, so the guard (scoped to `auth.via === "ADMIN"`) must not fire here.
    await expect(setVendorRole("target@example.com", null)).resolves.toBeUndefined();
    expect(txCount).not.toHaveBeenCalled();
    // #1482 R22: the platform-admin count runs instead (two remain here, so it passes).
    expect(txUserCount).toHaveBeenCalledWith({ where: { role: "ADMIN" } });
  });
});

/**
 * #1482 — Team & Access provisioning and Platform Admin grants
 * (`specs/2026-11-10-pr1481-enquiries-team-access-retro/`, R17, R18, R21–R24).
 */
describe("setVendorRole — #1482 Platform Admin and provisioning", () => {
  const PLATFORM_TARGET = { ...TARGET_USER, role: "ADMIN" };

  beforeEach(() => {
    vi.clearAllMocks();
    findFirstUser.mockResolvedValue(TARGET_USER);
    findUniqueMembership.mockResolvedValue(null);
    txUserCount.mockResolvedValue(2);
    txUserCreate.mockImplementation(async ({ data }: { data: { id: string } }) => data);
  });

  it("R17: finds a mixed-case, padded email case-insensitively", async () => {
    requireVendorRole.mockResolvedValue(STORE_ADMIN_AUTH);
    const { setVendorRole } = await import("@/lib/roles-service");

    await setVendorRole("  Target@Example.COM ", "STAFF");
    expect(findFirstUser).toHaveBeenCalledWith({
      where: { email: { equals: "target@example.com", mode: "insensitive" } },
    });
  });

  it("R18: store admin granting PLATFORM_ADMIN -> Forbidden, no transaction", async () => {
    requireVendorRole.mockResolvedValue(STORE_ADMIN_AUTH);
    const { setVendorRole } = await import("@/lib/roles-service");

    await expect(setVendorRole("target@example.com", "PLATFORM_ADMIN")).rejects.toThrow(
      /only a platform-admin can grant the platform admin role/i,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it("R21: granting PLATFORM_ADMIN sets User.role ADMIN, an ADMIN membership and one audit row, Serializable", async () => {
    requireVendorRole.mockResolvedValue(PLATFORM_ADMIN_AUTH);
    const { setVendorRole } = await import("@/lib/roles-service");

    await setVendorRole("target@example.com", "PLATFORM_ADMIN");
    expect(txUserUpdate).toHaveBeenCalledWith({
      where: { id: "target-1" },
      data: { role: "ADMIN" },
    });
    expect(txUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ role: "ADMIN" }) }),
    );
    expect(txAuditCreate).toHaveBeenCalledTimes(1);
    expect(txAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ oldRole: null, newRole: "PLATFORM_ADMIN" }),
      }),
    );
    expect(transaction.mock.calls.at(-1)?.[1]).toEqual(
      expect.objectContaining({ isolationLevel: "Serializable" }),
    );
  });

  it("R21: assigning STAFF to a platform admin sets User.role CUSTOMER and audits oldRole PLATFORM_ADMIN", async () => {
    requireVendorRole.mockResolvedValue(PLATFORM_ADMIN_AUTH);
    findFirstUser.mockResolvedValue(PLATFORM_TARGET);
    const { setVendorRole } = await import("@/lib/roles-service");

    await setVendorRole("target@example.com", "STAFF");
    expect(txUserUpdate).toHaveBeenCalledWith({
      where: { id: "target-1" },
      data: { role: "CUSTOMER" },
    });
    expect(txAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ oldRole: "PLATFORM_ADMIN", newRole: "STAFF" }),
      }),
    );
  });

  it("R22: refuses a platform admin's self-demotion when they are the last one", async () => {
    requireVendorRole.mockResolvedValue({
      ...PLATFORM_ADMIN_AUTH,
      user: { ...PLATFORM_ADMIN_AUTH.user, id: "target-1" },
    });
    findFirstUser.mockResolvedValue(PLATFORM_TARGET);
    txUserCount.mockResolvedValue(1);
    const { setVendorRole } = await import("@/lib/roles-service");

    await expect(setVendorRole("target@example.com", null)).rejects.toThrow(
      /last remaining platform admin/i,
    );
    expect(txUserUpdate).not.toHaveBeenCalled();
    expect(txDeleteMany).not.toHaveBeenCalled();
    expect(txAuditCreate).not.toHaveBeenCalled();
  });

  it("R22: refuses demoting ANOTHER platform admin when they are the last one", async () => {
    requireVendorRole.mockResolvedValue(PLATFORM_ADMIN_AUTH); // actor-1 vs target-1: different people
    findFirstUser.mockResolvedValue(PLATFORM_TARGET);
    txUserCount.mockResolvedValue(1);
    const { setVendorRole } = await import("@/lib/roles-service");

    await expect(setVendorRole("target@example.com", "ADMIN")).rejects.toThrow(
      /last remaining platform admin/i,
    );
    expect(txUserUpdate).not.toHaveBeenCalled();
    expect(txUpsert).not.toHaveBeenCalled();
  });

  it("R22: allows demoting another platform admin when another remains, without the store-admin count", async () => {
    requireVendorRole.mockResolvedValue(PLATFORM_ADMIN_AUTH);
    findFirstUser.mockResolvedValue(PLATFORM_TARGET);
    txUserCount.mockResolvedValue(2);
    const { setVendorRole } = await import("@/lib/roles-service");

    await expect(setVendorRole("target@example.com", null)).resolves.toBeUndefined();
    expect(txCount).not.toHaveBeenCalled();
    expect(txDeleteMany).toHaveBeenCalledTimes(1);
  });

  it("R23: granting STAFF to an unknown email provisions a pre-verified CUSTOMER account in the same transaction", async () => {
    requireVendorRole.mockResolvedValue(STORE_ADMIN_AUTH);
    findFirstUser.mockResolvedValue(null);
    const { setVendorRole } = await import("@/lib/roles-service");

    await setVendorRole(" New.Person@Example.com", "STAFF");
    expect(txUserCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "new.person@example.com",
        name: "New Person",
        emailVerified: true,
        role: "CUSTOMER",
      }),
    });
    const createdId = txUserCreate.mock.calls[0][0].data.id;
    expect(txUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { userId: createdId, vendorId: "vendor-1", role: "STAFF" },
      }),
    );
    expect(txAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: createdId }) }),
    );
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("R23: revoking an unknown email -> User not found, no transaction", async () => {
    requireVendorRole.mockResolvedValue(STORE_ADMIN_AUTH);
    findFirstUser.mockResolvedValue(null);
    const { setVendorRole } = await import("@/lib/roles-service");

    await expect(setVendorRole("nobody@example.com", null)).rejects.toThrow(/user not found/i);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("R24: granting PLATFORM_ADMIN to an unknown email is refused, no transaction", async () => {
    requireVendorRole.mockResolvedValue(PLATFORM_ADMIN_AUTH);
    findFirstUser.mockResolvedValue(null);
    const { setVendorRole } = await import("@/lib/roles-service");

    await expect(setVendorRole("nobody@example.com", "PLATFORM_ADMIN")).rejects.toThrow(
      /sign up first/i,
    );
    expect(transaction).not.toHaveBeenCalled();
    expect(txUserCreate).not.toHaveBeenCalled();
  });
});
