import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getCurrentVendorIdOrNull } from "@/lib/tenant";

// force-dynamic: the Header reads the session (getAuth → getPrisma), which only
// works in the Workers runtime — next build's Node-based static prerender can't
// load @prisma/client/wasm. Same guard as every DB-touching route here.
export const dynamic = "force-dynamic";

// Renders the shared Header above every storefront page. Deliberately does NOT
// wrap children in its own <main> — each page renders its own, and nesting
// <main> is invalid.
//
// ADR-004 slice 3b: gate the tenant here. A request host with no resolvable vendor
// is redirected to /coming-soon before any storefront page renders or queries — so a
// page never runs on an unmatched host (getCurrentVendorId() would throw downstream).
export default async function StorefrontLayout({ children }: { children: ReactNode }) {
  if (!(await getCurrentVendorIdOrNull())) {
    redirect("/coming-soon");
  }
  return (
    <>
      <Header />
      {children}
    </>
  );
}
