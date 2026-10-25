import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { evaluateVendorReadiness } from "@/lib/vendor-readiness-service";
import { OnboardingReadinessDashboard } from "@/components/staff/OnboardingReadinessDashboard";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { PageContainer } from "@/components/layout/PageContainer";

export const dynamic = "force-dynamic";

export default async function OnboardingReadinessPage() {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Store admins only"
        message="You're signed in, but your account doesn't have permission to access the vendor onboarding readiness dashboard."
      />
    );
  }

  const report = await evaluateVendorReadiness(auth.vendorId);

  return (
    <PageContainer width="standard">
      <OnboardingReadinessDashboard report={report} />
    </PageContainer>
  );
}
