"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

export function BackfillImagesButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleBackfill = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/jobs/backfill-images", { method: "POST" });
      const data = await res.json() as any;
      alert(data.message + (data.processed ? ` (${data.processed} generated)` : ""));
      router.refresh();
    } catch (err) {
      alert("Failed to start backfill");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleBackfill}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-2xl bg-action px-4 py-2.5 text-sm font-bold text-white transition hover:bg-action-hover disabled:opacity-50"
    >
      <Sparkles className="h-4 w-4" aria-hidden />
      {loading ? "Generating..." : "Auto-fill Missing Images"}
    </button>
  );
}