import type { ReactNode } from "react";
import { AccountNav } from "@/components/account/AccountNav";

export const dynamic = "force-dynamic";

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <AccountNav />
      <div className="flex-1">{children}</div>
    </div>
  );
}
