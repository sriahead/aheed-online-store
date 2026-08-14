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
        select: { id: true, name: true, email: true, role: true }
      }
    },
    orderBy: { createdAt: "asc" }
  });
  
  return members.map(m => ({
    id: m.userId,
    name: m.user.name,
    email: m.user.email,
    platformRole: m.user.role,
    vendorRole: m.role,
    createdAt: m.createdAt
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
    where: { userId_vendorId: { userId: targetUser.id, vendorId } }
  });
  const oldRole = existingMembership?.role ?? null;

  if (oldRole === newRole) {
    throw new Error(`User is already assigned the role: ${newRole ?? "USER"}`);
  }

  // Prevent self-lockout
  if (targetUser.id === auth.user.id && newRole !== "ADMIN") {
    if (auth.via === "ADMIN") {
      const adminCount = await prisma.vendorMembership.count({
        where: { vendorId, role: "ADMIN" }
      });
      if (adminCount <= 1) {
        throw new Error("Forbidden: Cannot demote the last remaining Store Admin.");
      }
    }
  }

  // Prevent Store Admin from modifying a platform-admin's privileges
  if (targetUser.role === "ADMIN" && auth.via !== "platform-admin") {
    throw new Error("Forbidden: Cannot modify a platform-admin's privileges.");
  }

  await getPrismaWs().$transaction(async (tx) => {
    if (newRole) {
      await tx.vendorMembership.upsert({
        where: { userId_vendorId: { userId: targetUser.id, vendorId } },
        create: { userId: targetUser.id, vendorId, role: newRole },
        update: { role: newRole }
      });
    } else {
      // Demote completely
      await tx.vendorMembership.deleteMany({
        where: { userId: targetUser.id, vendorId }
      });
    }

    // Audit log
    await tx.vendorRoleAuditLog.create({
      data: {
        vendorId,
        userId: targetUser.id,
        actorId: auth.user.id,
        oldRole,
        newRole
      }
    });
  });
}
