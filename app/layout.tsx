import type { ReactNode } from "react";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-poppins",
});

export const metadata = {
  title: "Aheed Food Centre — Walking Skeleton",
  description: "End-to-end smoke test: Cloudflare Workers + Neon + Prisma.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className="mx-auto max-w-2xl p-8 leading-relaxed">{children}</body>
    </html>
  );
}
