"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function TierToggle({
  initialTier,
  canSeeAdmin,
}: {
  initialTier: "staff" | "admin";
  canSeeAdmin: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tier, setTier] = useState(initialTier);

  if (!canSeeAdmin) return null;

  const handleToggle = (newTier: "staff" | "admin") => {
    setTier(newTier);
    document.cookie = `admin-tier=${newTier}; path=/; max-age=31536000`;
    startTransition(() => {
      if (
        newTier === "staff" &&
        window.location.pathname.match(/^\/staff\/(products|categories|loyalty|discounts)/)
      ) {
        router.push("/staff");
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div className="flex items-center rounded-full bg-black/5 p-1 border border-black/5">
      <button
        onClick={() => handleToggle("staff")}
        className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
          tier === "staff"
            ? "bg-yellow-400 text-black shadow-sm"
            : "text-black/60 hover:text-black"
        }`}
        disabled={isPending}
      >
        Staff Tier (Shop-floor)
      </button>
      <button
        onClick={() => handleToggle("admin")}
        className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
          tier === "admin"
            ? "bg-white text-black shadow-sm"
            : "text-black/60 hover:text-black"
        }`}
        disabled={isPending}
      >
        Admin Tier (Full CRUD)
      </button>
    </div>
  );
}
