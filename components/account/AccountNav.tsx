"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  User,
  ClipboardList,
  Bookmark,
  Sparkles,
  MessageSquareQuote,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

function NavLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
}) {
  const pathname = usePathname();
  const isActive =
    href === "/account" || href === "/feedback"
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 border-b-2 px-1 pb-3 pt-4 text-sm font-bold transition-colors whitespace-nowrap ${
        isActive
          ? "border-primary text-primary"
          : "border-transparent text-black/60 hover:border-black/20 hover:text-black/80"
      }`}
    >
      <Icon className="h-4 w-4" aria-hidden />
      {label}
    </Link>
  );
}

/**
 * The persistent shopper account navigation tab bar.
 *
 * Visually and structurally matches Staff View / Store Admin's `PanelNav.tsx`
 * (max-w-5xl, horizontal scroll with smooth nudge buttons, identical typography,
 * border indicators, and spacing).
 */
export function AccountNav() {
  const trackRef = useRef<HTMLDivElement>(null);

  const nudge = (direction: 1 | -1) =>
    trackRef.current?.scrollBy({ left: direction * 260, behavior: "smooth" });

  return (
    <nav
      aria-label="Shopper account navigation"
      className="bg-white border-b border-black/10 shadow-sm w-full"
    >
      <div className="mx-auto flex w-full max-w-5xl items-center px-4 relative group">
        <button
          type="button"
          aria-label="Scroll left"
          onClick={() => nudge(-1)}
          className="absolute left-0 sm:-left-3 z-10 hidden sm:flex h-7 w-7 items-center justify-center rounded-full border border-black/10 bg-white text-black/60 shadow hover:bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>

        <div
          ref={trackRef}
          className="no-scrollbar flex w-full gap-6 overflow-x-auto scroll-smooth"
        >
          <NavLink href="/account" icon={User} label="Overview" />
          <NavLink href="/account/orders" icon={ClipboardList} label="Orders" />
          <NavLink href="/account/lists" icon={Bookmark} label="Lists" />
          <NavLink href="/account/loyalty" icon={Sparkles} label="Loyalty & Rewards" />
          <NavLink href="/feedback" icon={MessageSquareQuote} label="Feedback" />
          <NavLink href="/account/data" icon={ShieldCheck} label="Data rights" />
        </div>

        <button
          type="button"
          aria-label="Scroll right"
          onClick={() => nudge(1)}
          className="absolute right-0 sm:-right-3 z-10 hidden sm:flex h-7 w-7 items-center justify-center rounded-full border border-black/10 bg-white text-black/60 shadow hover:bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </nav>
  );
}
