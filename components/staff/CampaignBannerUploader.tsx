"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, Sparkles } from "lucide-react";
import { requestCampaignImageUpload, attachCampaignImage } from "@/features/admin/campaign-image";
import {
  IMAGE_CONTENT_TYPE,
  IMAGE_QUALITY,
  MAX_IMAGE_EDGE_PX,
  fitWithinEdge,
} from "@/lib/product-image";

/**
 * Campaign banner uploader (P8.5e, #356) — a near-exact copy of
 * `VendorLogoUploader.tsx`'s shape (resize/re-encode to WebP client-side,
 * presign, PUT, attach), scoped to one department's category instead of the
 * vendor. R18 asks for this reuse explicitly rather than a shared abstraction
 * neither component needs yet.
 */
async function toWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const { width, height } = fitWithinEdge(bitmap.width, bitmap.height, MAX_IMAGE_EDGE_PX);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser can't process images.");
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, IMAGE_CONTENT_TYPE, IMAGE_QUALITY),
    );
    if (!blob) throw new Error("This browser can't produce WebP images.");
    return blob;
  } finally {
    bitmap.close();
  }
}

export function CampaignBannerUploader({
  categoryId,
  currentImageUrl,
  currentAltText,
  hasCampaign,
}: {
  categoryId: string;
  currentImageUrl: string | null;
  currentAltText: string;
  /** No campaign row yet — save the headline first (see setCampaignImage). */
  hasCampaign: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [altText, setAltText] = useState(currentAltText);
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [generating, setGenerating] = useState(false);
  const router = useRouter();

  /**
   * P8.5f — the AI half of this panel, copying `ProductImageManager`'s
   * fetch → `router.refresh()` shape. The route takes only the categoryId: it
   * builds the prompt and the storage key server-side from the saved campaign,
   * so nothing here can steer either.
   */
  async function autoGenerate() {
    setError(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/campaign-images/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ categoryId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to generate a banner.");

      // Drop any locally-previewed upload so the refreshed server value shows.
      setUploaded(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setGenerating(false);
    }
  }

  function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose an image first.");
      return;
    }
    if (altText.trim() === "") {
      setError("Describe the photo (alt text) first.");
      return;
    }

    setError(null);

    startTransition(async () => {
      let blob: Blob;
      try {
        blob = await toWebp(file);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "That image couldn't be read.");
        return;
      }

      const ticket = await requestCampaignImageUpload(categoryId, blob.size);
      if (!ticket.ok) {
        setError(ticket.error);
        return;
      }

      const put = await fetch(ticket.value.url, {
        method: "PUT",
        headers: { "Content-Type": IMAGE_CONTENT_TYPE },
        body: blob,
      });
      if (!put.ok) {
        setError("The upload was rejected by storage.");
        return;
      }

      const attached = await attachCampaignImage(categoryId, ticket.value.key, altText.trim());
      if (!attached.ok) {
        setError(attached.error);
        return;
      }

      setUploaded(URL.createObjectURL(blob));
    });
  }

  const displayUrl = uploaded || currentImageUrl;

  if (!hasCampaign) {
    return (
      <div className="rounded-xl border border-black/10 bg-black/5 p-4 text-sm text-black/60">
        Save the headline below first — a banner photo attaches to an existing campaign.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-black/10 bg-black/5 p-4">
      <h3 className="font-bold text-black">Banner photo</h3>
      {displayUrl && (
        <div className="relative h-32 w-full max-w-xs overflow-hidden rounded-lg border border-black/10 bg-white">
          <img src={displayUrl} alt={altText || ""} className="h-full w-full object-cover" />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="banner-alt" className="text-sm font-bold text-black/60">
          Photo description (alt text)
        </label>
        <input
          id="banner-alt"
          type="text"
          value={altText}
          onChange={(event) => setAltText(event.target.value)}
          placeholder="e.g. Fresh halal lamb cuts on a butcher's counter"
          className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />

        <label htmlFor="banner-upload" className="mt-2 text-sm font-bold text-black/60">
          {displayUrl ? "Replace photo" : "Upload photo"}
        </label>
        <p className="text-sm text-black/60">
          Resized to {MAX_IMAGE_EDGE_PX}px and converted to WebP before uploading.
        </p>
        <div className="flex items-center gap-3">
          <input
            id="banner-upload"
            ref={fileRef}
            type="file"
            accept="image/*"
            disabled={pending}
            className="file:mr-4 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-primary/90 disabled:opacity-50"
          />
          <button
            type="button"
            disabled={pending || generating}
            onClick={upload}
            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-bold text-black hover:bg-black/5 disabled:opacity-50"
          >
            <ImageUp className="h-4 w-4" />
            {pending ? "Uploading…" : "Upload"}
          </button>
        </div>

        <div className="mt-2 border-t border-black/10 pt-3">
          <p className="mb-2 text-sm text-black/60">
            No photo to hand? Generate one from this campaign&apos;s headline.
          </p>
          <button
            type="button"
            disabled={pending || generating}
            onClick={autoGenerate}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" aria-hidden />
            {generating ? "Generating…" : "Auto-Generate"}
          </button>
        </div>

        {error && <p className="text-sm font-bold text-red-600">{error}</p>}
      </div>
    </div>
  );
}
