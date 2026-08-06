import type { ReactNode } from "react";
import { Footer, Layout, Navbar } from "nextra-theme-docs";
import { Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import "nextra-theme-docs/style.css";

export const metadata = {
  title: { default: "Aheed KMS — Internal", template: "%s — Aheed KMS" },
  description: "Internal knowledge base — architecture, ADRs, runbooks, and prompts.",
  robots: { index: false, follow: false }, // internal only — never indexed, even if Access is misconfigured
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          navbar={<Navbar logo={<b>Aheed KMS</b>} />}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/sriahead/aheed-online-store"
          footer={<Footer>Internal — not for public distribution.</Footer>}
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}
