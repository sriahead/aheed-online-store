import type { ReactNode } from "react";
import { AccountNav } from "@/components/account/AccountNav";
import { getCurrentVendorProfile } from "@/lib/vendor-service";

export const dynamic = "force-dynamic";

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const profile = await getCurrentVendorProfile();
  return (
    <div className="flex min-h-full flex-col">
      <AccountNav loyaltyEnabled={profile?.loyaltyEnabled ?? false} />
      <div className="flex-1">{children}</div>
    </div>
  );
}
