"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ShoppingBag, Store, Shield } from "lucide-react";

export interface ViewSwitcherProps {
  canSeeAdmin: boolean;
  currentTier: "staff" | "admin";
  isPortal: boolean;
}

export function ViewSwitcher({ canSeeAdmin, currentTier, isPortal }: ViewSwitcherProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeView = !isPortal ? "shopper" : currentTier;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (view: "shopper" | "staff" | "admin") => {
    setIsOpen(false);
    startTransition(() => {
      if (view === "shopper") {
        router.push("/");
      } else {
        document.cookie = `admin-tier=${view}; path=/; max-age=31536000`;
        if (
          view === "staff" &&
          window.location.pathname.match(
            /^\/staff\/(products|categories|loyalty|discounts|customers|team|reports)/,
          )
        ) {
          router.push("/staff");
        } else {
          if (!isPortal) {
            router.push("/staff");
          } else {
            router.refresh();
          }
        }
      }
    });
  };

  const views = [
    { id: "shopper", label: "Shopper View", icon: ShoppingBag },
    { id: "staff", label: "Staff View", icon: Store },
  ];
  if (canSeeAdmin) {
    views.push({ id: "admin", label: "Admin View", icon: Shield });
  }

  const activeOption = views.find((v) => v.id === activeView) || views[0];
  const ActiveIcon = activeOption.icon;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isPending}
        className="flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-primary/20"
      >
        <ActiveIcon className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{activeOption.label}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-48 overflow-hidden rounded-xl border border-black/10 bg-white p-1 shadow-lg z-50">
          {views.map((view) => {
            const Icon = view.icon;
            const isSelected = activeView === view.id;
            return (
              <button
                key={view.id}
                onClick={() => handleSelect(view.id as any)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  isSelected
                    ? "bg-primary/5 font-bold text-primary"
                    : "font-medium text-black/70 hover:bg-black/5"
                }`}
              >
                <Icon className="h-4 w-4" />
                {view.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
