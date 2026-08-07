import type { ReactNode } from "react";
import { Header } from "@/components/layout/Header";

// force-dynamic: the Header reads the session (getAuth → getPrisma), which only
// works in the Workers runtime — next build's Node-based static prerender can't
// load @prisma/client/wasm. Same guard as every DB-touching route here.
export const dynamic = "force-dynamic";

// Renders the shared Header above every storefront page. Deliberately does NOT
// wrap children in its own <main> — each page renders its own, and nesting
// <main> is invalid.
export default function StorefrontLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      {children}
    </>
  );
}
