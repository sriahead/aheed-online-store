import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Aheed Food Centre — Walking Skeleton",
  description: "End-to-end smoke test: Cloudflare Workers + Neon + Prisma.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
