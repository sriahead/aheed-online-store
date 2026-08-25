"use client";

import { useRef, useState, useTransition } from "react";
import { ImageUp } from "lucide-react";
import { requestBundleImageUpload, attachBundleImage } from "@/features/admin/bundle-image";
import {
  IMAGE_CONTENT_TYPE,
  IMAGE_QUALITY,
  MAX_IMAGE_EDGE_PX,
  fitWithinEdge,
} from "@/lib/product-image";

/**
 * Bundle image uploader (P8.5c, #347) — the same resize/re-encode → presign →
 * PUT → attach shape as `CampaignBannerUploader.tsx` (P8.5e), scoped to a
 * bundle. R32 asks for this reuse of `lib/product-image.ts`'s constants
 * explicitly rather than a shared abstraction none of the three uploaders needs
 * yet.
 *
 * DELIBERATELY NO "Auto-Generate" BUTTON. The campaign uploader has one, but the
 * AI banner route builds its prompt from a campaign's headline; wiring an
 * equivalent for bundles would need its own route and its own prompt decision,
 * which is outside this slice's requirements (#365 already tracks the
 * admin-editable-prompt question).
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

export function BundleImageUploader({
  bundleId,
  imageUrl,
  existingAltText,
}: {
  bundleId: string;
  imageUrl: string | null;
  existingAltText: string | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [altText, setAltText] = useState(existingAltText ?? "");
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

      const ticket = await requestBundleImageUpload(bundleId, blob.size);
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

      const attached = await attachBundleImage(bundleId, ticket.value.key, altText.trim());
      if (!attached.ok) {
        setError(attached.error);
        return;
      }

      setUploaded(URL.createObjectURL(blob));
    });
  }

  const displayUrl = uploaded || imageUrl;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-black/10 bg-surface-muted p-5">
      <div>
        <h2 className="text-sm font-bold text-primary">Bundle photo</h2>
        <p className="mt-0.5 text-xs text-primary/60">
          Optional — a bundle with no photo shows a plain card, not a broken image.
        </p>
      </div>

      {displayUrl && (
        <div className="relative h-32 w-full max-w-xs overflow-hidden rounded-lg border border-black/10 bg-white">
          <img src={displayUrl} alt={altText || ""} className="h-full w-full object-cover" />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="bundle-alt" className="text-xs font-medium text-primary/70">
          Photo description (alt text)
        </label>
        <input
          id="bundle-alt"
          type="text"
          value={altText}
          onChange={(event) => setAltText(event.target.value)}
          placeholder="e.g. A box of fresh halal lamb, chicken and beef mince"
          className="rounded-xl border border-black/15 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />

        <label htmlFor="bundle-upload" className="mt-2 text-xs font-medium text-primary/70">
          {displayUrl ? "Replace photo" : "Upload photo"}
        </label>
        <p className="text-xs text-primary/60">
          Resized to {MAX_IMAGE_EDGE_PX}px and converted to WebP before uploading.
        </p>
        <div className="flex items-center gap-3">
          <input
            id="bundle-upload"
            ref={fileRef}
            type="file"
            accept="image/*"
            disabled={pending}
            className="file:mr-4 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-primary/90 disabled:opacity-50"
          />
          <button
            type="button"
            disabled={pending}
            onClick={upload}
            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-bold text-primary hover:bg-black/5 disabled:opacity-50"
          >
            <ImageUp className="h-4 w-4" aria-hidden />
            {pending ? "Uploading…" : "Upload"}
          </button>
        </div>

        {error && (
          <p role="alert" className="text-sm font-bold text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
