import type { ReactNode } from "react";
import { Footer, Layout, Navbar } from "nextra-theme-docs";
import { Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import "nextra-theme-docs/style.css";

const platformName = process.env.NEXT_PUBLIC_PLATFORM_NAME || process.env.PLATFORM_NAME || "Platform";

export const metadata = {
  title: { default: `${platformName} KMS — Internal`, template: `%s — ${platformName} KMS` },
  description: `${platformName} internal knowledge base — architecture, user guides, runbooks, and specifications.`,
  robots: { index: false, follow: false }, // internal only — never indexed, even if Access is misconfigured
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          navbar={<Navbar logo={<b>{platformName} KMS</b>} />}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/sriahead/aheed-online-store"
          footer={<Footer>{platformName} KMS — Internal — not for public distribution.</Footer>}
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}
