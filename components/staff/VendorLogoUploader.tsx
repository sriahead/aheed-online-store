"use client";

import { useRef, useState, useTransition } from "react";
import { ImageUp } from "lucide-react";
import { requestLogoUpload, attachVendorLogo } from "@/features/admin/storefront";
import {
  IMAGE_CONTENT_TYPE,
  IMAGE_QUALITY,
  MAX_IMAGE_EDGE_PX,
  fitWithinEdge,
} from "@/lib/product-image";

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

export function VendorLogoUploader({ currentLogoUrl }: { currentLogoUrl: string | null }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose an image first.");
      return;
    }

    setError(null);
    setUploaded(null);

    startTransition(async () => {
      let blob: Blob;
      try {
        blob = await toWebp(file);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "That image couldn't be read.");
        return;
      }

      const ticket = await requestLogoUpload(blob.size);
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
        setError("The upload was rejected by storage (\).");
        return;
      }

      const attached = await attachVendorLogo(ticket.value.key);
      if (!attached.ok) {
        setError(attached.error);
        return;
      }

      setUploaded(URL.createObjectURL(blob));
    });
  }

  const displayUrl = uploaded || currentLogoUrl;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-black/10 bg-black/5 p-4">
      <h3 className="font-bold text-black">Vendor Logo</h3>
      {displayUrl && (
        <div className="relative h-32 w-32 overflow-hidden rounded-lg border border-black/10 bg-white">
          <img
            src={displayUrl}
            alt="Vendor Logo"
            className="h-full w-full object-contain"
          />
        </div>
      )}
      
      <div className="flex flex-col gap-2">
        <label className="text-sm font-bold text-black/60">Replace Logo</label>
        <p className="text-sm text-black/60">
          New image — resized to {MAX_IMAGE_EDGE_PX}px and converted to WebP before uploading to save space.
        </p>
        <div className="flex items-center gap-3">
          <input
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
            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-bold text-black hover:bg-black/5 disabled:opacity-50"
          >
            <ImageUp className="h-4 w-4" />
            {pending ? "Uploading…" : "Upload image"}
          </button>
        </div>
        {error && <p className="text-sm font-bold text-red-600">{error}</p>}
      </div>
    </div>
  );
}

