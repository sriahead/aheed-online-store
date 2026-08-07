import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { LogoutButton } from "@/features/auth/components/LogoutButton";

export const dynamic = "force-dynamic";

export const metadata = { title: "Your account — Aheed Food Centre" };

// Account shell: any authenticated user (Customer/Staff/Admin) can view their
// own account. Not role-gated — see lib/auth-rbac.ts's requireRole() for
// routes that need a *specific* role, which this isn't.
export default async function AccountPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const { name, email, role } = session.user as { name: string; email: string; role?: string };

  return (
    <main className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-semibold text-primary">Your account</h1>
      <div className="mb-6 rounded-md border border-black/10 bg-surface-muted p-5">
        <p>
          <strong>Name:</strong> {name}
        </p>
        <p>
          <strong>Email:</strong> {email}
        </p>
        <p>
          <strong>Role:</strong> {role ?? "CUSTOMER"}
        </p>
      </div>
      <LogoutButton />
    </main>
  );
}
