import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getVendorTeam } from "@/lib/roles-service";
import { AssignRoleForm } from "@/components/staff/team/AssignRoleForm";
import { PanelRefusal } from "@/components/staff/PanelRefusal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Team & Access" };

export default async function TeamPage() {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Admin only"
        message="This area is restricted to store admins. You do not have permission to view or manage team access."
      />
    );
  }

  const team = await getVendorTeam();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-primary">Team & Access</h1>

      <div className="mb-10 rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-primary">Grant Access</h2>
        <p className="mb-4 text-sm text-primary/80">
          Search for an existing registered customer by email to upgrade them to Staff or Admin.
        </p>
        <AssignRoleForm currentAuthVia={auth.via} />
      </div>

      <h2 className="mb-4 text-lg font-semibold text-primary">Current Members</h2>
      <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white shadow-sm">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-[#f5f5f0] text-primary">
            <tr>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Store Role</th>
              <th className="px-4 py-3 font-semibold">Platform Role</th>
              <th className="px-4 py-3 font-semibold">Added</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10">
            {team.map((member) => (
              <tr key={member.id} className="hover:bg-black/5">
                <td className="px-4 py-3 text-primary">{member.name}</td>
                <td className="px-4 py-3 text-primary/80">{member.email}</td>
                <td className="px-4 py-3 font-medium text-action">{member.vendorRole}</td>
                <td className="px-4 py-3 text-primary/60">
                  {member.platformRole === "ADMIN" ? (
                    <span className="rounded bg-black/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      Platform Admin
                    </span>
                  ) : (
                    "User"
                  )}
                </td>
                <td className="px-4 py-3 text-primary/60">
                  {new Date(member.createdAt).toLocaleDateString("en-GB")}
                </td>
              </tr>
            ))}
            {team.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-primary/60">
                  No staff members found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
