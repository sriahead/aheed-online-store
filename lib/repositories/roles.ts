// Type-only: a value import of "@prisma/client/wasm" is unresolvable under vitest
// (see tests/orders.test.ts), and this file needs nothing from it at runtime.
import type { Prisma } from "@prisma/client/wasm";
import { getPrisma, getPrismaWs } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import { requireVendorRole } from "@/lib/auth-rbac";

export type VendorRoleAction = "STAFF" | "ADMIN" | null; // null means demote to USER

export async function getVendorTeam() {
  const vendorId = await getCurrentVendorId();
  const prisma = getPrisma();

  const members = await prisma.vendorMembership.findMany({
    where: { vendorId },
    include: {
      user: {
        select: { id: true, name: true, email: true, role: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return members.map((m) => ({
    id: m.userId,
    name: m.user.name,
    email: m.user.email,
    platformRole: m.user.role,
    vendorRole: m.role,
    createdAt: m.createdAt,
  }));
}

export async function setVendorRole(targetEmail: string, newRole: VendorRoleAction) {
  const vendorId = await getCurrentVendorId();
  const auth = await requireVendorRole("ADMIN");

  if (!auth.ok) {
    throw new Error("Unauthorized");
  }

  // Validate hierarchy rules
  if (newRole === "ADMIN" && auth.via !== "platform-admin") {
    throw new Error("Forbidden: Only a platform-admin can grant the Store Admin role.");
  }

  const prisma = getPrisma();
  const targetUser = await prisma.user.findUnique({ where: { email: targetEmail } });
  if (!targetUser) {
    throw new Error("User not found with that email address.");
  }

  // Look up old role
  const existingMembership = await prisma.vendorMembership.findUnique({
    where: { userId_vendorId: { userId: targetUser.id, vendorId } },
  });
  const oldRole = existingMembership?.role ?? null;

  if (oldRole === newRole) {
    throw new Error(`User is already assigned the role: ${newRole ?? "USER"}`);
  }

  // Prevent Store Admin from modifying a platform-admin's privileges
  if (targetUser.role === "ADMIN" && auth.via !== "platform-admin") {
    throw new Error("Forbidden: Cannot modify a platform-admin's privileges.");
  }

  const isSelfDemotion =
    targetUser.id === auth.user.id && newRole !== "ADMIN" && auth.via === "ADMIN";

  // Serializable so the last-admin count check and the write it guards are read+acted-on
  // as one unit — two concurrent self-demotions both reading "2 admins left" and both
  // proceeding would leave the vendor with zero. Postgres aborts the loser with a
  // serialization failure instead, matching every other last-one-standing guard in this
  // codebase (stock in P3b, points in P5a, discount usage in P5b), which use an atomic
  // compare-and-set `updateMany` instead — not available here since the guard depends on
  // an aggregate over other rows, not a counter column on the row being written.
  await getPrismaWs().$transaction(
    async (tx) => {
      if (isSelfDemotion) {
        const adminCount = await tx.vendorMembership.count({
          where: { vendorId, role: "ADMIN" },
        });
        if (adminCount <= 1) {
          throw new Error("Forbidden: Cannot demote the last remaining Store Admin.");
        }
      }

      if (newRole) {
        await tx.vendorMembership.upsert({
          where: { userId_vendorId: { userId: targetUser.id, vendorId } },
          create: { userId: targetUser.id, vendorId, role: newRole },
          update: { role: newRole },
        });
      } else {
        // Demote completely
        await tx.vendorMembership.deleteMany({
          where: { userId: targetUser.id, vendorId },
        });
      }

      // Audit log
      await tx.vendorRoleAuditLog.create({
        data: {
          vendorId,
          userId: targetUser.id,
          actorId: auth.user.id,
          oldRole,
          newRole,
        },
      });
    },
    { isolationLevel: "Serializable" satisfies Prisma.TransactionIsolationLevel },
  );
}
