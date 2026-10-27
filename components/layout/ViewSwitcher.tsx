"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { IconName } from "@/components/icons/registry";
import { Icon } from "@/components/icons/Icon";
import { Icon3D, type Icon3DName } from "@/components/icons/Icon3D";

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

  const views: { id: string; label: string; icon: IconName; icon3d: Icon3DName }[] = [
    { id: "shopper", label: "Shopper View", icon: "shopping-bag", icon3d: "view-shopper" },
    { id: "staff", label: "Staff View", icon: "store", icon3d: "view-staff" },
  ];
  if (canSeeAdmin) {
    views.push({ id: "admin", label: "Admin View", icon: "shield", icon3d: "view-admin" });
  }

  const activeOption = views.find((v) => v.id === activeView) || views[0];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isPending}
        className="flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-primary/20"
      >
        <Icon3D
          name={activeOption.icon3d}
          size={18}
          className="-my-0.5"
          animated={false}
          decorative
        />
        <span className="hidden sm:inline">{activeOption.label}</span>
        <Icon
          name="chevron-down"
          className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-48 overflow-hidden rounded-xl border border-black/10 bg-white p-1 shadow-lg z-50">
          {views.map((view) => {
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
                <Icon3D
                  name={view.icon3d}
                  size={20}
                  className="-my-0.5"
                  animated={false}
                  decorative
                />
                {view.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
