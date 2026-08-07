import type { ReactNode } from "react";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-poppins",
});

export const metadata = {
  title: "Aheed Food Centre — Leicester Cultural Groceries",
  description:
    "Halal meat, fresh produce, and cultural groceries in Leicester, with local delivery.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // No width/padding constraint here — the storefront layout owns the header and
  // each page owns its own width container. (This body used to force max-w-2xl,
  // which silently constrained every page since P2a.)
  return (
    <html lang="en" className={poppins.variable}>
      <body className="leading-relaxed">{children}</body>
    </html>
  );
}
